from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum

class EmailFolder(str, Enum):
    PRIMARY_SENT = "Primary+Sent"
    INBOX_PRIMARY = "Inbox:Primary"
    INBOX_PROMOTIONS = "Inbox:Promotions"
    INBOX_SOCIAL = "Inbox:Social"
    STARRED = "Starred"
    SENT = "Sent"
    SPAM = "Spam"
    DRAFTS = "Drafts"


class EmailMetadata(BaseModel):
    id: str
    thread_id: str
    label_ids: List[str]
    snippet: str
    size_estimate: int
    history_id: str
    internal_date: str


class EmailHeaders(BaseModel):
    subject: Optional[str] = None
    from_: Optional[str] = Field(None, alias="from")
    to: Optional[str] = None
    cc: Optional[str] = None
    bcc: Optional[str] = None
    date: Optional[str] = None
    message_id: Optional[str] = None
    in_reply_to: Optional[str] = None
    references: Optional[str] = None


class EmailBody(BaseModel):
    plain_text: Optional[str] = None
    html: Optional[str] = None


class EmailAttachment(BaseModel):
    filename: str
    mime_type: str
    size: int
    attachment_id: str


class EmailData(BaseModel):
    metadata: EmailMetadata
    headers: EmailHeaders
    body: EmailBody
    attachments: List[EmailAttachment] = []


class FetchEmailsRequest(BaseModel):
    folder: EmailFolder = EmailFolder.INBOX_PRIMARY
    max_results: int = Field(10, ge=1, le=100)
    page_token: Optional[str] = None
    query: Optional[str] = None


class FetchEmailsResponse(BaseModel):
    emails: List[Dict[str, Any]]
    next_page_token: Optional[str] = None
    result_size_estimate: int
    total_count: int


class FetchEmailsByContactRequest(BaseModel):
    email_address: EmailStr
    max_results: int = Field(10, ge=1, le=100)
    page_token: Optional[str] = None


class SendEmailRequest(BaseModel):
    to: List[EmailStr]
    cc: Optional[List[EmailStr]] = None
    bcc: Optional[List[EmailStr]] = None
    subject: str = Field(..., min_length=1, max_length=500)
    body_plain: Optional[str] = None
    body_html: Optional[str] = None
    thread_id: Optional[str] = None
    in_reply_to: Optional[str] = None
    references: Optional[str] = None
    attachments: Optional[List[Dict[str, Any]]] = None  # Base64 encoded file data


class MarkAsReadRequest(BaseModel):
    message_ids: List[str]


class SendEmailResponse(BaseModel):
    message_id: str
    thread_id: str
    status: str = "sent"
    sent_at: datetime = Field(default_factory=lambda: datetime.now())


class EmailSearchQuery(BaseModel):
    query: str
    max_results: int = Field(10, ge=1, le=100)
    page_token: Optional[str] = None

class DownloadAttachmentResponse(BaseModel):
    """Response model for downloaded email attachment."""
    filename: str = Field(..., description="Original filename of the attachment")
    mime_type: str = Field(..., description="MIME type of the attachment")
    size: int = Field(..., description="Size of the attachment in bytes")
    data: str = Field(..., description="Base64 encoded attachment data")
