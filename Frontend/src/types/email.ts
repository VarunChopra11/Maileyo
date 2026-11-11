// Email types with improved interface definitions

export type SidebarFolder = 
  | "Primary+Sent"
  | "Inbox:Primary" 
  | "Primary"
  | "Inbox:Social"
  | "Social"
  | "Inbox:Promotions"
  | "Promotions"
  | "Starred"
  | "Sent"
  | "Spam"
  | "Drafts"
  | "Trash";

export interface EmailContact {
  id: string;
  name: string;
  email: string;
  lastMessage: string;
  timestamp: string;
  labels: string[];
  unread: boolean;
  unreadCount?: number;
  snippet: string;
}


export interface EmailAttachment {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId?: string;
  content?: string;
}

export interface EmailMessage {
  id: string;
  threadId: string;
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyPlain?: string;
  bodyHtml?: string;
  cleanBodyHtml?: string;
  quotedHtml?: string;
  cleanBodyPlain?: string;
  quotedText?: string;
  timestamp: string;
  attachments?: EmailAttachment[];
  isSent: boolean;
  labels: string[];
}

export interface SendEmailRequest {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body_plain?: string;
  body_html?: string;
  thread_id?: string;
  in_reply_to?: string;
  references?: string;
  attachments?: {
    filename: string;
    content: string;
    mimeType: string;
  }[];
}

export interface SendEmailResponse {
  success: boolean;
  message_id: string;
  thread_id: string;
  sent_at: string;
  error?: string;
}

export interface FetchContactRequest {
  email_address: string;
  max_results?: number;
  page_token?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Gmail API specific types
export interface GmailHeader {
  name: string;
  value: string;
}

export interface GmailMessagePart {
  mimeType: string;
  filename?: string;
  body?: {
    data?: string;
    size?: number;
    attachmentId?: string;
  };
  parts?: GmailMessagePart[];
}

export interface GmailPayload {
  headers?: GmailHeader[];
  body?: {
    data?: string;
    size?: number;
  };
  parts?: GmailMessagePart[];
}

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  payload?: GmailPayload;
  sizeEstimate?: number;
  historyId?: string;
  internalDate: string;
}