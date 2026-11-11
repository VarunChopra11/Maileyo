from fastapi import APIRouter, HTTPException, status, Request, Response, Depends
from typing import Optional
import logging
import base64
from datetime import datetime

from api.v1.schemas.emails import (
    FetchEmailsResponse, FetchEmailsByContactRequest,
    SendEmailRequest, SendEmailResponse, EmailFolder,
    DownloadAttachmentResponse, MarkAsReadRequest
)
from api.v1.services.email_services.gmail_service import GmailService
from api.v1.utils.tokens import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/emails", tags=["emails"])

# Initialize Gmail service
gmail_service = GmailService()


@router.get("/fetch", response_model=FetchEmailsResponse)
async def fetch_emails(
    request: Request,
    folder: EmailFolder = EmailFolder.INBOX_PRIMARY,
    max_results: int = 10,
    page_token: Optional[str] = None,
    query: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    try:
        if max_results < 1 or max_results > 100:    
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="max_results must be between 1 and 100"
            )
        
        result = await gmail_service.fetch_messages(
            user_id=current_user["google_id"],
            folder=folder,
            max_results=max_results,
            page_token=page_token,
            query=query
        )
        
        return FetchEmailsResponse(
            emails=result["emails"],
            next_page_token=result["next_page_token"],
            result_size_estimate=result["result_size_estimate"],
            total_count=result["total_count"]
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching emails: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch emails"
        )


@router.post("/fetch-by-contact", response_model=FetchEmailsResponse)
async def fetch_emails_by_contact(
    request: Request,
    contact_request: FetchEmailsByContactRequest,
    current_user: dict = Depends(get_current_user)
):
    try:
        if contact_request.max_results < 1 or contact_request.max_results > 100:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="max_results must be between 1 and 100"
            )
        
        result = await gmail_service.fetch_emails_by_contact(
            user_id=current_user["google_id"],
            email_address=contact_request.email_address,
            max_results=contact_request.max_results,
            page_token=contact_request.page_token
        )
        
        return FetchEmailsResponse(
            emails=result["emails"],
            next_page_token=result["next_page_token"],
            result_size_estimate=result["result_size_estimate"],
            total_count=result["total_count"]
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching emails by contact: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch emails by contact"
        )


@router.post("/send", response_model=SendEmailResponse)
async def send_email(
    request: Request,
    email_request: SendEmailRequest,
    current_user: dict = Depends(get_current_user)
):
    try:
        if not email_request.to:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="At least one recipient is required"
            )
        
        if not email_request.body_plain and not email_request.body_html:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Either plain text or HTML body is required"
            )
        
        result = await gmail_service.send_email(
            user_id=current_user["google_id"],
            to=email_request.to,
            subject=email_request.subject,
            body_plain=email_request.body_plain,
            body_html=email_request.body_html,
            cc=email_request.cc,
            bcc=email_request.bcc,
            thread_id=email_request.thread_id,
            in_reply_to=email_request.in_reply_to,
            references=email_request.references,
            attachments=email_request.attachments
        )
        
        return SendEmailResponse(
            message_id=result["id"],
            thread_id=result.get("threadId", ""),
            status="sent",
            sent_at=datetime.now()
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending email: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send email"
        )


@router.post("/mark-as-read")
async def mark_as_read(
    mark_request: MarkAsReadRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Explicit endpoint to mark specific messages as read when viewed by the user.
    """
    try:
        if not mark_request.message_ids:
            return {"status": "success", "marked_read_count": 0}

        await gmail_service.mark_messages_as_read(
            user_id=current_user["google_id"],
            message_ids=mark_request.message_ids
        )
        return {"status": "success", "marked_read_count": len(mark_request.message_ids)}
    except Exception as e:
        logger.error(f"Error marking messages as read: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to mark messages as read"
        )


@router.get("/attachments/{message_id}/{attachment_id}", response_model=DownloadAttachmentResponse)
async def download_attachment(
    message_id: str,
    attachment_id: str,
    file_name: str = "attachment",
    mime_type: str = "application/octet-stream",
    current_user: dict = Depends(get_current_user),
):
    """
    Download an email attachment by message ID and attachment ID.
    """
    try:
        result = await gmail_service.download_attachment(
            user_id=current_user["google_id"],
            message_id=message_id,
            attachment_id=attachment_id,
            file_name=file_name,
            mime_type=mime_type
        )
        
        return DownloadAttachmentResponse(
            filename=result["filename"],
            mime_type=result["mime_type"],
            size=result["size"],
            data=result["data"]  # base64 encoded
        )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error downloading attachment: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to download attachment"
        )


@router.get("/{message_id}/attachments/{attachment_id}/inline")
@router.get("/attachments/{message_id}/{attachment_id}/inline")
async def get_inline_attachment(
    message_id: str,
    attachment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Secure authenticated image proxy for inline CID images.
    """
    try:
        result = await gmail_service.download_attachment(
            user_id=current_user["google_id"],
            message_id=message_id,
            attachment_id=attachment_id,
        )
        raw_b64 = result.get("data", "")
        clean_b64 = raw_b64.replace("-", "+").replace("_", "/").strip()
        pad = len(clean_b64) % 4
        if pad:
            clean_b64 += "=" * (4 - pad)
        file_bytes = base64.b64decode(clean_b64)
        mime_type = result.get("mime_type", "image/png")
        return Response(
            content=file_bytes,
            media_type=mime_type,
            headers={"Cache-Control": "private, max-age=86400"}
        )
    except Exception as e:
        logger.error(f"Error fetching inline attachment: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load inline image"
        )

