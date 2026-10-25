import unittest
import base64
import email
from email import policy
from api.v1.schemas.emails import SendEmailRequest


class TestSendEmail(unittest.TestCase):
    def test_send_email_request_schema(self):
        req = SendEmailRequest(
            to=["recipient@example.com"],
            subject="Re: Project Update",
            body_plain="Sounds good!",
            thread_id="thread_12345",
            in_reply_to="<msg_001@example.com>",
            references="<msg_000@example.com> <msg_001@example.com>"
        )
        self.assertEqual(req.thread_id, "thread_12345")
        self.assertEqual(req.in_reply_to, "<msg_001@example.com>")
        self.assertEqual(req.references, "<msg_000@example.com> <msg_001@example.com>")
        self.assertEqual(req.to, ["recipient@example.com"])

    def test_rfc5322_header_construction(self):
        from email.message import EmailMessage
        msg = EmailMessage()
        to = ["alice@example.com", "bob@example.com"]
        msg["To"] = ", ".join(to)
        msg["Subject"] = "Re: Status"
        msg["In-Reply-To"] = "<parent_id@domain.com>"
        msg["References"] = "<root_id@domain.com> <parent_id@domain.com>"
        msg.set_content("Confirmed.")

        raw = msg.as_bytes()
        parsed = email.message_from_bytes(raw, policy=policy.default)
        self.assertEqual(parsed["In-Reply-To"], "<parent_id@domain.com>")
        self.assertIn("<root_id@domain.com>", parsed["References"])
        self.assertEqual(parsed["To"], "alice@example.com, bob@example.com")


if __name__ == "__main__":
    unittest.main()
