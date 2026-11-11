import unittest
import base64
from api.v1.services.email_services.mime_parser import MimeParser


class TestMimeParser(unittest.TestCase):
    def test_single_part_html(self):
        html_content = "<html><body><h1>Hello World</h1><p>Test single-part</p></body></html>"
        b64_data = base64.urlsafe_b64encode(html_content.encode("utf-8")).decode()
        
        mock_msg = {
            "id": "msg_001",
            "threadId": "thread_001",
            "payload": {
                "mimeType": "text/html",
                "headers": [
                    {"name": "Subject", "value": "Single Part HTML"},
                    {"name": "From", "value": "alice@example.com"},
                    {"name": "To", "value": "bob@example.com"},
                    {"name": "Content-Type", "value": "text/html; charset=utf-8"}
                ],
                "body": {
                    "data": b64_data,
                    "size": len(html_content)
                }
            }
        }

        parsed = MimeParser.parse_gmail_message(mock_msg)
        self.assertEqual(parsed["id"], "msg_001")
        self.assertEqual(parsed["subject"], "Single Part HTML")
        self.assertIn("Hello World", parsed["body_html"])
        self.assertIn("Test single-part", parsed["clean_body_html"])

    def test_nested_multipart_and_cid_rewriting(self):
        html_content = '<div><p>See attached logo:</p><img src="cid:logo_123" /></div>'
        plain_content = "See attached logo: [logo_123]"
        
        b64_html = base64.urlsafe_b64encode(html_content.encode("utf-8")).decode()
        b64_plain = base64.urlsafe_b64encode(plain_content.encode("utf-8")).decode()

        mock_msg = {
            "id": "msg_002",
            "threadId": "thread_002",
            "payload": {
                "mimeType": "multipart/mixed",
                "headers": [
                    {"name": "Subject", "value": "Nested Multipart with CID"},
                    {"name": "From", "value": "charlie@example.com"},
                    {"name": "To", "value": "bob@example.com"}
                ],
                "parts": [
                    {
                        "mimeType": "multipart/related",
                        "parts": [
                            {
                                "mimeType": "multipart/alternative",
                                "parts": [
                                    {
                                        "mimeType": "text/plain",
                                        "body": {"data": b64_plain}
                                    },
                                    {
                                        "mimeType": "text/html",
                                        "body": {"data": b64_html}
                                    }
                                ]
                            },
                            {
                                "mimeType": "image/png",
                                "filename": "logo.png",
                                "headers": [
                                    {"name": "Content-ID", "value": "<logo_123>"},
                                    {"name": "Content-Disposition", "value": "inline; filename=\"logo.png\""}
                                ],
                                "body": {
                                    "attachmentId": "att_logo_123",
                                    "size": 1024
                                }
                            }
                        ]
                    },
                    {
                        "mimeType": "application/pdf",
                        "filename": "invoice.pdf",
                        "headers": [
                            {"name": "Content-Disposition", "value": "attachment; filename=\"invoice.pdf\""}
                        ],
                        "body": {
                            "attachmentId": "att_pdf_999",
                            "size": 50000
                        }
                    }
                ]
            }
        }

        parsed = MimeParser.parse_gmail_message(mock_msg)
        self.assertEqual(parsed["id"], "msg_002")
        self.assertIn("See attached logo:", parsed["body_html"])
        # Check that CID was rewritten to authenticated proxy URL
        self.assertIn('/api/v1/emails/msg_002/attachments/att_logo_123/inline', parsed["body_html"])
        # Check regular attachments
        self.assertEqual(len(parsed["attachments"]), 1)
        self.assertEqual(parsed["attachments"][0]["filename"], "invoice.pdf")
        self.assertEqual(parsed["attachments"][0]["attachment_id"], "att_pdf_999")
        # Check inline attachments
        self.assertEqual(len(parsed["inline_attachments"]), 1)
        self.assertEqual(parsed["inline_attachments"][0]["content_id"], "logo_123")

    def test_quote_partitioning(self):
        plain_with_quote = (
            "Sounds great, let's proceed.\n\n"
            "On Mon, Sep 1, 2026 at 10:00 AM, Alice <alice@example.com> wrote:\n"
            "> Shall we sign the agreement?\n"
            "> Let me know."
        )
        clean_p, quoted_p = MimeParser.partition_plain_text(plain_with_quote)
        self.assertEqual(clean_p, "Sounds great, let's proceed.")
        self.assertIn("Shall we sign the agreement?", quoted_p)

        html_with_quote = (
            "<div>Approved!</div>"
            '<div class="gmail_quote">On Mon, Sep 1, 2026 Alice wrote:<blockquote>Original text</blockquote></div>'
        )
        clean_h, quoted_h = MimeParser.partition_html(html_with_quote)
        self.assertIn("Approved!", clean_h)
        self.assertIn("gmail_quote", quoted_h)
        self.assertIn("Original text", quoted_h)

    def test_international_charset_handling(self):
        # ISO-8859-1 encoded string with special characters like café
        text = "Rendez-vous au café à 15h"
        iso_bytes = text.encode("iso-8859-1")
        b64_iso = base64.b64encode(iso_bytes).decode("ascii")

        decoded = MimeParser.decode_base64_data(b64_iso, charset="iso-8859-1")
        self.assertEqual(decoded, text)


if __name__ == "__main__":
    unittest.main()
