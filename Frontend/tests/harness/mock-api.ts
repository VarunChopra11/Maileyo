/**
 * Mock Backend API Server for E2E Testing
 * Simulates FastAPI endpoints `/api/v1/emails/send` and `/emails/send`.
 */

import { validateEmail } from "./spec-contracts.ts";

export interface MockSendPayload {
  to: string[];
  subject: string;
  body_plain?: string;
  body_html?: string;
  cc?: string[];
  bcc?: string[];
  thread_id?: string;
  in_reply_to?: string;
  references?: string;
  attachments?: Array<{
    filename: string;
    content: string; // base64
    mimeType: string;
  }>;
}

export interface MockSendResult {
  status: number;
  data: {
    message_id?: string;
    thread_id?: string;
    status?: string;
    sent_at?: string;
    detail?: string;
  };
}

export class MockBackendApi {
  public receivedRequests: MockSendPayload[] = [];
  public forceErrorStatus: number | null = null;
  public forceErrorMessage: string | null = null;

  reset(): void {
    this.receivedRequests = [];
    this.forceErrorStatus = null;
    this.forceErrorMessage = null;
  }

  simulateFailure(statusCode: number, detailMessage: string): void {
    this.forceErrorStatus = statusCode;
    this.forceErrorMessage = detailMessage;
  }

  async sendEmail(payload: MockSendPayload): Promise<MockSendResult> {
    this.receivedRequests.push(payload);

    if (this.forceErrorStatus) {
      return {
        status: this.forceErrorStatus,
        data: {
          detail: this.forceErrorMessage || "Injected backend error",
        },
      };
    }

    // Validate request according to FastAPI SendEmailRequest schema
    if (!payload.to || !Array.isArray(payload.to) || payload.to.length === 0) {
      return {
        status: 422,
        data: { detail: "Field 'to' must contain at least one recipient email address." },
      };
    }

    for (const email of payload.to) {
      if (!validateEmail(email)) {
        return {
          status: 422,
          data: { detail: `Invalid recipient email address: '${email}'` },
        };
      }
    }

    if (payload.cc && Array.isArray(payload.cc)) {
      for (const email of payload.cc) {
        if (!validateEmail(email)) {
          return {
            status: 422,
            data: { detail: `Invalid CC email address: '${email}'` },
          };
        }
      }
    }

    if (payload.bcc && Array.isArray(payload.bcc)) {
      for (const email of payload.bcc) {
        if (!validateEmail(email)) {
          return {
            status: 422,
            data: { detail: `Invalid BCC email address: '${email}'` },
          };
        }
      }
    }

    if (!payload.subject || payload.subject.trim().length === 0) {
      return {
        status: 422,
        data: { detail: "Field 'subject' cannot be empty." },
      };
    }

    if (payload.subject.length > 500) {
      return {
        status: 422,
        data: { detail: "Subject cannot exceed 500 characters." },
      };
    }

    if (payload.attachments) {
      for (const att of payload.attachments) {
        if (!att.filename || !att.mimeType || typeof att.content !== "string") {
          return {
            status: 400,
            data: { detail: "Invalid attachment schema: filename, mimeType, and content are required." },
          };
        }
      }
    }

    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const threadId = payload.thread_id || `thread_${Date.now()}`;

    return {
      status: 200,
      data: {
        message_id: messageId,
        thread_id: threadId,
        status: "sent",
        sent_at: new Date().toISOString(),
      },
    };
  }
}
