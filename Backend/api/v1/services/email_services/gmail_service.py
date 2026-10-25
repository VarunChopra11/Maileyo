from fastapi import BackgroundTasks
import aiohttp
import base64
import json
import re
import uuid
from typing import Optional, Dict, Any, List
import logging
from api.v1.utils.tokens import get_access_token
from api.v1.services.email_services.mime_parser import MimeParser

logger = logging.getLogger(__name__)


class GmailService:
    """Asynchronous service for interacting with the Gmail API."""

    BASE_URL: str = "https://www.googleapis.com/gmail/v1/users/me"
    BATCH_URL: str = "https://www.googleapis.com/batch/gmail/v1"

    # Folder → Gmail API query/label mapping
    FOLDER_MAP: Dict[str, Dict[str, Any]] = {
        "Primary+Sent": {
            "q": "(in:inbox category:primary) OR in:sent",
            "labelIds": []
        },
        "Inbox:Primary": {
            "q": "category:primary in:inbox",
            "labelIds": ["INBOX"]
        },
        "Inbox:Promotions": {"labelIds": ["CATEGORY_PROMOTIONS", "INBOX"]},
        "Inbox:Social": {"labelIds": ["CATEGORY_SOCIAL", "INBOX"]},
        "Starred": {"labelIds": ["STARRED"]},
        "Sent": {"labelIds": ["SENT"]},
        "Spam": {"labelIds": ["SPAM"]},
        "Drafts": {"labelIds": ["DRAFT"]},
        "AllMails": {"includeSpamTrash": True},
    }

    def __init__(self):
        """No user dependency at init - user_id is passed per request."""
        pass

    async def _get_headers(self, user_id: str) -> Dict[str, str]:
        """Retrieve a fresh access token for given user_id and return Gmail API headers."""
        access_token = await get_access_token(google_id=user_id)
        return {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }

    async def fetch_message_ids(
        self,
        user_id: str,
        folder: Optional[str] = None,
        max_results: int = 20,
        page_token: Optional[str] = None,
        query: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Fetch message IDs from Gmail by folder.
        """

        params: Dict[str, Any] = {"maxResults": max_results}

        if folder:
            if folder not in self.FOLDER_MAP:
                raise ValueError(
                    f"Unknown folder '{folder}'. Valid options: {list(self.FOLDER_MAP.keys())}"
                )
            params.update(self.FOLDER_MAP[folder])

        if page_token:
            params["pageToken"] = page_token
        if query:
            params["q"] = query

        url = f"{self.BASE_URL}/messages"
        headers = await self._get_headers(user_id)

        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers, params=params) as resp:
                if resp.status != 200:
                    raise Exception(
                        f"Gmail API Error {resp.status}: {await resp.text()}"
                    )
                return await resp.json()

    async def messages_batch_request(
        self, user_id: str, message_ids: List[str]
    ) -> List[Dict[str, Any]]:
        """
        Fetch full Gmail messages using batch request.
        """
        if not message_ids:
            return []

        headers = await self._get_headers(user_id)
        boundary = f"batch_{uuid.uuid4().hex}"

        # Construct multipart/mixed body
        body_lines = []
        for i, msg_id in enumerate(message_ids):
            content_id = i + 1
            body_lines.extend(
                [
                    f"--{boundary}",
                    "Content-Type: application/http",
                    f"Content-ID: {content_id}",
                    "",
                    f"GET /gmail/v1/users/me/messages/{msg_id}?format=full",
                    "",
                ]
            )
        body_lines.append(f"--{boundary}--")
        body = "\r\n".join(body_lines)

        batch_headers = {
            "Authorization": headers["Authorization"],
            "Content-Type": f"multipart/mixed; boundary={boundary}",
        }

        async with aiohttp.ClientSession() as session:
            async with session.post(
                self.BATCH_URL, headers=batch_headers, data=body
            ) as resp:
                if resp.status != 200:
                    raise Exception(
                        f"Gmail Batch API Error {resp.status}: {await resp.text()}"
                    )
                
                # Get the content type and extract boundary from response headers
                content_type = resp.headers.get('Content-Type', '')
                boundary_match = re.search(r'boundary=([^;]+)', content_type)
                response_boundary = boundary_match.group(1) if boundary_match else boundary
                
                raw_response = await resp.text()

        # Parse multipart response
        messages: List[Dict[str, Any]] = []
        
        parts = raw_response.split(f"--{response_boundary}")[1:-1]  # Skip first and last empty parts
        
        for part in parts:
            part = part.strip()
            if not part:
                continue
                
            if "Content-Type: application/http" not in part:
                continue
                
            http_response = part.split("\r\n\r\n", 1)[1] if "\r\n\r\n" in part else part
            response_lines = http_response.split("\r\n")
            
            status_line = response_lines[0]
            if not status_line.startswith("HTTP/1.1 200 OK"):
                raise Exception(f"Batch subrequest failed: {status_line}")
            
            header_end = None
            for i, line in enumerate(response_lines[1:], 1):
                if line.strip() == "":
                    header_end = i
                    break
                    
            if header_end is None:
                raise Exception("Invalid HTTP response format: no empty line after headers")
            
            json_body = "\r\n".join(response_lines[header_end+1:]).strip()
            
            try:
                message_data = json.loads(json_body)
                try:
                    message_data["parsed_content"] = MimeParser.parse_gmail_message(message_data)
                except Exception as pe:
                    logger.warning(f"Failed to parse MIME for message {message_data.get('id')}: {pe}")
                messages.append(message_data)
            except json.JSONDecodeError as e:
                raise Exception(f"Failed to parse JSON from batch response: {e}")

        return messages


    async def fetch_messages(
        self,
        user_id: str,
        folder: str = "Inbox:Primary",
        max_results: int = 20,
        page_token: Optional[str] = None,
        query: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Fetch full Gmail messages using message IDs (batched).
        """
        ids_response = await self.fetch_message_ids(
            user_id=user_id, folder=folder, max_results=max_results, page_token=page_token, query=query
        )

        message_ids = [m["id"] for m in ids_response.get("messages", [])]
        full_messages = await self.messages_batch_request(user_id, message_ids)

        return {
            "emails": full_messages,
            "next_page_token": ids_response.get("nextPageToken"),
            "result_size_estimate": ids_response.get("resultSizeEstimate", len(full_messages)),
            "total_count": len(full_messages),
        }
    
    async def mark_messages_as_read(self, user_id: str, message_ids: List[str]) -> None:
        """
        Mark a list of Gmail messages as read by removing the 'UNREAD' label.
        Runs in background after fetch-by-contact.
        """
        if not message_ids:
            return

        url = f"{self.BASE_URL}/messages/batchModify"
        headers = await self._get_headers(user_id)
        payload = {
            "ids": message_ids,
            "removeLabelIds": ["UNREAD"]
        }

        async with aiohttp.ClientSession() as session:
            async with session.post(url, headers=headers, json=payload) as resp:
                if resp.status not in (200, 204): 
                    text = await resp.text()
                    raise Exception(f"Gmail batchModify error {resp.status}: {text}")

    
    async def fetch_emails_by_contact(
        self,
        user_id: str,
        email_address: str,
        background_tasks: Optional[BackgroundTasks] = None,
        max_results: int = 20,
        page_token: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Fetch all emails exchanged with a specific contact/email address.
        NOTE: Aggressive auto-read marking has been removed so opening a contact
        does not prematurely mark unread messages as read in Gmail.
        """
        query = f"from:{email_address} OR to:{email_address}"

        contact_message_ids = await self.fetch_message_ids(
            user_id=user_id,
            max_results=max_results,
            page_token=page_token,
            query=query
        )
        message_ids = [m["id"] for m in contact_message_ids.get("messages", [])]

        full_messages = await self.messages_batch_request(user_id, message_ids)

        return {
            "emails": full_messages,
            "next_page_token": contact_message_ids.get("nextPageToken"),
            "result_size_estimate": contact_message_ids.get("resultSizeEstimate", len(full_messages)),
            "total_count": len(full_messages),
        }
    
    async def send_email(
            self,
            user_id: str,
            to: Any,
            subject: str,
            body_plain: Optional[str] = None,
            body_html: Optional[str] = None,
            cc: Optional[List[str]] = None,
            bcc: Optional[List[str]] = None,
            thread_id: Optional[str] = None,
            in_reply_to: Optional[str] = None,
            references: Optional[str] = None,
            attachments: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """
        Send an email using Gmail API.
        Preserves Gmail thread integrity by attaching threadId, In-Reply-To, and References.
        """
        from email.message import EmailMessage

        msg = EmailMessage()
        if isinstance(to, list):
            msg["To"] = ", ".join(to)
        else:
            msg["To"] = str(to)

        msg["Subject"] = subject
        msg["From"] = "me"
        if cc:
            msg["Cc"] = ", ".join(cc) if isinstance(cc, list) else str(cc)
        if bcc:
            msg["Bcc"] = ", ".join(bcc) if isinstance(bcc, list) else str(bcc)

        # RFC 5322 Thread Continuity Headers
        if in_reply_to:
            msg["In-Reply-To"] = in_reply_to
        if references:
            msg["References"] = references

        if body_plain:
            msg.set_content(body_plain)
        elif body_html:
            msg.set_content(body_html)

        if body_html and body_plain:
            msg.add_alternative(body_html, subtype='html')

        if attachments:
            for attachment in attachments:
                filename = attachment.get("filename", "attachment")
                data = attachment.get("content")
                mime_type = attachment.get("mimeType", "application/octet-stream")
                if data:
                    file_bytes = base64.b64decode(data)
                    maintype, _, subtype = mime_type.partition("/")
                    msg.add_attachment(file_bytes, maintype=maintype, subtype=subtype, filename=filename)

        raw_msg = msg.as_bytes()
        encoded_msg = base64.urlsafe_b64encode(raw_msg).decode()
        payload: Dict[str, Any] = {"raw": encoded_msg}
        if thread_id:
            payload["threadId"] = thread_id

        url = f"{self.BASE_URL}/messages/send"
        headers = await self._get_headers(user_id)
        async with aiohttp.ClientSession() as session:
            async with session.post(url, headers=headers, json=payload) as resp:
                if resp.status != 200:
                    raise Exception(f"Gmail Send API Error {resp.status}: {await resp.text()}")
                return await resp.json()

    async def download_attachment(
        self,
        user_id: str,
        message_id: str,
        attachment_id: str,
        file_name: str = "attachment",
        mime_type: str = "application/octet-stream"

    ) -> Dict[str, Any]:
        """
        Download an email attachment from Gmail API.
            
        Returns:
            Dict containing filename, mime_type, size, and base64 encoded data
        """
        headers = await self._get_headers(user_id)
        
        async with aiohttp.ClientSession() as session:
            attachment_url = f"{self.BASE_URL}/messages/{message_id}/attachments/{attachment_id}"
            async with session.get(attachment_url, headers=headers) as resp:
                if resp.status != 200:
                    raise Exception(f"Gmail Attachment API Error {resp.status}: {await resp.text()}")
                attachment_data = await resp.json()
        
        return {
            "filename": file_name,
            "mime_type": mime_type,
            "size": attachment_data["size"],
            "data": attachment_data["data"]  # Base64 encoded attachment data
        }