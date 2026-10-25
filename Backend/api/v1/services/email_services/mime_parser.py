import re
import base64
import email
from email import policy
from email.message import EmailMessage
from typing import Dict, Any, List, Optional, Tuple


class MimeParser:
    """
    Robust RFC 5322 MIME Normalization Engine.
    Handles recursive multipart traversal, international charsets,
    Content-ID (CID) inline image resolution to proxy endpoints,
    and partitions clean content from quoted thread history/signatures.
    """

    # Quote header regex patterns for plain text
    QUOTE_PATTERNS = [
        re.compile(r"(?m)^On\s+[\s\S]+?wrote:\s*$", re.IGNORECASE),
        re.compile(r"(?m)^-{3,}\s*(?:Original Message|Forwarded Message)\s*-{3,}", re.IGNORECASE),
        re.compile(r"(?m)^From:\s+.+?\n(?:Sent|Date):\s+.+?\nTo:\s+", re.IGNORECASE),
        re.compile(r"(?m)^_{10,}\s*$", re.IGNORECASE),
        re.compile(r"(?m)^--\s*$", re.IGNORECASE),  # RFC signature delimiter
    ]

    # HTML quote container tags/attributes
    HTML_QUOTE_SELECTORS = [
        re.compile(r'(<div[^>]*class=["\'][^"\']*gmail_quote[^"\']*["\'][\s\S]*?</div>)', re.IGNORECASE),
        re.compile(r'(<blockquote[^>]*class=["\'][^"\']*gmail_quote[^"\']*["\'][\s\S]*?</blockquote>)', re.IGNORECASE),
        re.compile(r'(<div[^>]*id=["\'](?:appendonsend|divRplyFwdMsg|isReplyContent)["\'][\s\S]*?</div>)', re.IGNORECASE),
        re.compile(r'(<div[^>]*class=["\'][^"\']*yahoo_quoted[^"\']*["\'][\s\S]*?</div>)', re.IGNORECASE),
        re.compile(r'(<blockquote[\s\S]*?</blockquote>)', re.IGNORECASE),
    ]

    @classmethod
    def decode_base64_data(cls, data_str: str, charset: Optional[str] = None) -> str:
        """
        Safely decode base64 / base64url data with charset fallback handling.
        Never crashes on malformed padding or unknown multi-byte characters.
        """
        if not data_str:
            return ""

        # Normalize URL-safe characters and whitespace
        clean_str = data_str.replace("-", "+").replace("_", "/").strip()
        # Add necessary padding
        pad_len = len(clean_str) % 4
        if pad_len > 0:
            clean_str += "=" * (4 - pad_len)

        try:
            raw_bytes = base64.b64decode(clean_str)
        except Exception:
            try:
                raw_bytes = base64.urlsafe_b64decode(clean_str)
            except Exception:
                return data_str

        # Charset resolution with graceful fallback
        charsets_to_try = []
        if charset:
            charsets_to_try.append(charset.lower().strip('"\' '))
        charsets_to_try.extend(["utf-8", "windows-1252", "iso-8859-1", "latin1"])

        for cs in charsets_to_try:
            try:
                return raw_bytes.decode(cs)
            except (UnicodeDecodeError, LookupError):
                continue

        # Final resilient fallback using replacement character
        return raw_bytes.decode("utf-8", errors="replace")

    @classmethod
    def extract_charset_from_content_type(cls, content_type: str) -> Optional[str]:
        if not content_type:
            return None
        match = re.search(r'charset=([^\s;]+)', content_type, re.IGNORECASE)
        if match:
            return match.group(1).strip('"\' ')
        return None

    @classmethod
    def extract_header(cls, headers: List[Dict[str, str]], name: str) -> str:
        for h in headers:
            if h.get("name", "").lower() == name.lower():
                return h.get("value", "")
        return ""

    @classmethod
    def partition_plain_text(cls, text: str) -> Tuple[str, str]:
        """
        Partition plain text into (clean_body, quoted_content).
        """
        if not text:
            return "", ""

        earliest_pos = len(text)
        found = False

        for pattern in cls.QUOTE_PATTERNS:
            match = pattern.search(text)
            if match and match.start() < earliest_pos:
                earliest_pos = match.start()
                found = True

        if found and earliest_pos < len(text):
            clean = text[:earliest_pos].rstrip()
            quoted = text[earliest_pos:].strip()
            return clean, quoted

        return text.strip(), ""

    @classmethod
    def partition_html(cls, html: str) -> Tuple[str, str]:
        """
        Partition HTML into (clean_body_html, quoted_content_html).
        Detects Gmail quote containers, Outlook reply blocks, blockquotes, etc.
        """
        if not html:
            return "", ""

        for pattern in cls.HTML_QUOTE_SELECTORS:
            match = pattern.search(html)
            if match:
                quote_start = match.start()
                quote_end = match.end()
                clean_html = (html[:quote_start] + html[quote_end:]).strip()
                quoted_html = match.group(0).strip()
                return clean_html, quoted_html

        # Fallback: Check if plain-text quote pattern exists inside HTML
        plain_quote_match = re.search(
            r'(?:<br\s*/?>|\n)?(?:\s*On\s+[\s\S]+?wrote:\s*)(?:<br\s*/?>|\n)?',
            html,
            re.IGNORECASE
        )
        if plain_quote_match:
            start_pos = plain_quote_match.start()
            clean_html = html[:start_pos].strip()
            quoted_html = html[start_pos:].strip()
            return clean_html, quoted_html

        return html, ""

    @classmethod
    def resolve_cids_in_html(
        cls,
        html: str,
        message_id: str,
        cid_attachment_map: Dict[str, str]
    ) -> str:
        """
        Replace cid:Content-ID references with secure authenticated proxy URLs.
        E.g. src="cid:img_01" -> src="/api/v1/emails/{message_id}/attachments/{attachment_id}/inline"
        """
        if not html or not cid_attachment_map:
            return html

        for clean_cid, attachment_id in cid_attachment_map.items():
            proxy_url = f"/api/v1/emails/{message_id}/attachments/{attachment_id}/inline"
            
            # Replace cid:clean_cid and cid:<clean_cid> in href and src
            patterns = [
                rf'(?i)(src|href)=["\']cid:\s*<?{re.escape(clean_cid)}>?(["\'])',
                rf'(?i)(src|href)=cid:\s*<?{re.escape(clean_cid)}>?'
            ]
            for p in patterns:
                html = re.sub(p, rf'\1="{proxy_url}"', html)

        return html

    @classmethod
    def parse_gmail_message(cls, message: Dict[str, Any]) -> Dict[str, Any]:
        """
        Parse a full Gmail API message object, traversing nested MIME structures.
        Resolves plain text, HTML, CIDs, attachments, and partitions quotes.
        """
        message_id = message.get("id", "")
        thread_id = message.get("threadId", "")
        payload = message.get("payload", {})
        headers = payload.get("headers", [])

        # Extract top-level RFC headers
        subject = cls.extract_header(headers, "Subject")
        from_header = cls.extract_header(headers, "From")
        to_header = cls.extract_header(headers, "To")
        cc_header = cls.extract_header(headers, "Cc")
        bcc_header = cls.extract_header(headers, "Bcc")
        date_header = cls.extract_header(headers, "Date")
        in_reply_to = cls.extract_header(headers, "In-Reply-To")
        references = cls.extract_header(headers, "References")
        message_id_header = cls.extract_header(headers, "Message-ID")

        html_parts: List[str] = []
        plain_parts: List[str] = []
        attachments: List[Dict[str, Any]] = []
        inline_attachments: List[Dict[str, Any]] = []
        cid_map: Dict[str, str] = {}  # clean_cid -> attachment_id

        def walk_part(part: Dict[str, Any]):
            mime_type = part.get("mimeType", "").lower()
            filename = part.get("filename", "")
            part_headers = part.get("headers", [])
            body = part.get("body", {})
            attachment_id = body.get("attachmentId")
            body_data = body.get("data")
            body_size = body.get("size", 0)

            # Check for Content-ID
            content_id = cls.extract_header(part_headers, "Content-ID")
            content_disposition = cls.extract_header(part_headers, "Content-Disposition").lower()
            content_type_header = cls.extract_header(part_headers, "Content-Type")
            charset = cls.extract_charset_from_content_type(content_type_header)

            clean_cid = content_id.strip("<> \t\r\n") if content_id else ""

            # Check if this part is an inline attachment
            if clean_cid and attachment_id:
                cid_map[clean_cid] = attachment_id
                inline_attachments.append({
                    "content_id": clean_cid,
                    "attachment_id": attachment_id,
                    "filename": filename or clean_cid,
                    "mime_type": mime_type,
                    "size": body_size
                })

            # Check if regular attachment
            if filename and attachment_id and "attachment" in content_disposition:
                attachments.append({
                    "filename": filename,
                    "attachment_id": attachment_id,
                    "mime_type": mime_type,
                    "size": body_size
                })
            elif filename and attachment_id and not clean_cid:
                attachments.append({
                    "filename": filename,
                    "attachment_id": attachment_id,
                    "mime_type": mime_type,
                    "size": body_size
                })

            # Extract content if body data is present
            if body_data:
                decoded_text = cls.decode_base64_data(body_data, charset)
                if mime_type == "text/html":
                    html_parts.append(decoded_text)
                elif mime_type == "text/plain":
                    plain_parts.append(decoded_text)

            # Recursive traversal of nested parts
            subparts = part.get("parts", [])
            for subpart in subparts:
                walk_part(subpart)

        # Walk payload or top-level body
        if payload.get("parts"):
            for part in payload["parts"]:
                walk_part(part)
        elif payload.get("body", {}).get("data"):
            # Single-part email
            top_mime = payload.get("mimeType", "").lower()
            top_headers = payload.get("headers", [])
            ct = cls.extract_header(top_headers, "Content-Type")
            charset = cls.extract_charset_from_content_type(ct)
            decoded = cls.decode_base64_data(payload["body"]["data"], charset)

            if top_mime == "text/html" or "html" in top_mime:
                html_parts.append(decoded)
            else:
                plain_parts.append(decoded)

        # Assemble best available HTML and Plain text
        raw_html = "\n".join(html_parts) if html_parts else ""
        raw_plain = "\n".join(plain_parts) if plain_parts else ""

        # Resolve CIDs in HTML
        if raw_html and cid_map:
            raw_html = cls.resolve_cids_in_html(raw_html, message_id, cid_map)

        # Partition HTML
        clean_html, quoted_html = cls.partition_html(raw_html) if raw_html else ("", "")

        # Partition Plain text
        clean_plain, quoted_plain = cls.partition_plain_text(raw_plain) if raw_plain else ("", "")

        # Return standardized DTO
        return {
            "id": message_id,
            "thread_id": thread_id,
            "subject": subject,
            "from": from_header,
            "to": to_header,
            "cc": cc_header,
            "bcc": bcc_header,
            "date": date_header,
            "in_reply_to": in_reply_to,
            "references": references,
            "message_id_header": message_id_header,
            "body_html": raw_html,
            "body_plain": raw_plain,
            "clean_body_html": clean_html,
            "quoted_body_html": quoted_html,
            "clean_body_plain": clean_plain,
            "quoted_body_plain": quoted_plain,
            "attachments": attachments,
            "inline_attachments": inline_attachments,
        }

    @classmethod
    def parse_raw_mime(cls, raw_bytes: bytes, message_id: str = "") -> Dict[str, Any]:
        """
        Parse raw RFC 5322 byte payload using Python's email library with default policy.
        """
        msg = email.message_from_bytes(raw_bytes, policy=policy.default)
        html_parts = []
        plain_parts = []
        attachments = []
        inline_attachments = []
        cid_map: Dict[str, str] = {}

        idx = 0
        for part in msg.walk():
            if part.is_multipart():
                continue

            content_type = part.get_content_type()
            filename = part.get_filename()
            content_id = part.get("Content-ID", "")
            clean_cid = content_id.strip("<> \t\r\n") if content_id else ""
            idx += 1
            att_id = str(idx)

            if clean_cid:
                cid_map[clean_cid] = att_id
                inline_attachments.append({
                    "content_id": clean_cid,
                    "attachment_id": att_id,
                    "filename": filename or clean_cid,
                    "mime_type": content_type
                })

            if filename and not clean_cid:
                attachments.append({
                    "filename": filename,
                    "attachment_id": att_id,
                    "mime_type": content_type
                })

            try:
                content = part.get_content()
                if content_type == "text/html":
                    html_parts.append(str(content))
                elif content_type == "text/plain":
                    plain_parts.append(str(content))
            except Exception:
                payload_bytes = part.get_payload(decode=True)
                if payload_bytes:
                    decoded = cls.decode_base64_data(base64.b64encode(payload_bytes).decode(), part.get_content_charset())
                    if content_type == "text/html":
                        html_parts.append(decoded)
                    elif content_type == "text/plain":
                        plain_parts.append(decoded)

        raw_html = "\n".join(html_parts) if html_parts else ""
        raw_plain = "\n".join(plain_parts) if plain_parts else ""

        if raw_html and cid_map:
            raw_html = cls.resolve_cids_in_html(raw_html, message_id, cid_map)

        clean_html, quoted_html = cls.partition_html(raw_html)
        clean_plain, quoted_plain = cls.partition_plain_text(raw_plain)

        return {
            "id": message_id,
            "subject": msg.get("Subject", ""),
            "from": msg.get("From", ""),
            "to": msg.get("To", ""),
            "date": msg.get("Date", ""),
            "body_html": raw_html,
            "body_plain": raw_plain,
            "clean_body_html": clean_html,
            "quoted_body_html": quoted_html,
            "clean_body_plain": clean_plain,
            "quoted_body_plain": quoted_plain,
            "attachments": attachments,
            "inline_attachments": inline_attachments,
        }
