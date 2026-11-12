import axios, { AxiosRequestConfig } from "axios";
import { 
  SidebarFolder, 
  SendEmailRequest, 
  SendEmailResponse, 
  FetchContactRequest, 
} from "@/types/email";

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL;

const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

export interface EmailApiPart {
  mimeType: string;
  filename?: string;
  body?: {
    data?: string;
    size?: number;
    attachmentId?: string;
  };
  parts?: EmailApiPart[];
}

interface EmailsApiResponse {
  emails: Array<{
    id: string;
    threadId?: string;
    labelIds?: string[];
    snippet?: string;
    payload?: {
      headers?: Array<{
        name: string;
        value: string;
      }>;
      body?: {
        data?: string;
        size?: number;
      };
      parts?: EmailApiPart[];
    };
    sizeEstimate?: number;
    historyId?: string;
    internalDate: string;
  }>;
  next_page_token?: string | null;
  result_size_estimate?: number;
  total_count?: number;
}

// Define the fetch by contact response structure
interface FetchByContactResponse {
  emails: Array<{
    id: string;
    threadId: string;
    labelIds?: string[];
    snippet?: string;
    payload?: {
      headers?: Array<{
        name: string;
        value: string;
      }>;
      body?: {
        data?: string;
        size?: number;
      };
      parts?: EmailApiPart[];
    };
    sizeEstimate?: number;
    historyId?: string;
    internalDate: string;
  }>;
  next_page_token?: string | null;
  result_size_estimate?: number;
  total_count?: number;
}

class EmailService {
  private async makeRequest<T>(endpoint: string, options: AxiosRequestConfig = {}): Promise<T> {
    try {
      const response = await axiosInstance({
        url: endpoint,
        ...options,
      });
      return response.data;
    } catch (error: unknown) {
      console.error(`API request failed for ${endpoint}:`, error);
      const axiosErr = error as {
        response?: {
          status: number;
          statusText: string;
          data?: { detail?: string; error?: string; message?: string };
        };
        message?: string;
      };
      if (axiosErr.response) {
        console.error('Error response:', axiosErr.response.data);
        const detail =
          axiosErr.response.data?.detail ||
          axiosErr.response.data?.error ||
          axiosErr.response.data?.message;
        const message = detail || `API request failed: ${axiosErr.response.status} ${axiosErr.response.statusText}`;
        const enhancedError = new Error(message);
        Object.assign(enhancedError, {
          response: axiosErr.response,
          status: axiosErr.response.status,
          detail,
        });
        throw enhancedError;
      }
      throw new Error(`API request error: ${axiosErr.message || "Unknown error"}`);
    }
  }

  async fetchEmails(folder: SidebarFolder, maxResults: number = 10, pageToken?: string): Promise<EmailsApiResponse> {
    const params: Record<string, string> = {
      folder,
      max_results: maxResults.toString(),
    };

    if (pageToken) {
      params.page_token = pageToken;
    }

    return this.makeRequest<EmailsApiResponse>("/emails/fetch", {
      method: "GET",
      params,
    });
  }

  async fetchByContact(request: FetchContactRequest): Promise<FetchByContactResponse> {
    const response = await this.makeRequest<FetchByContactResponse>("/emails/fetch-by-contact", {
      method: "POST",
      data: request,
    });
    return response;
  }

  async sendEmail(emailData: SendEmailRequest): Promise<SendEmailResponse> {
    return this.makeRequest<SendEmailResponse>("/emails/send", {
      method: "POST",
      data: emailData,
    });
  }

  async markAsRead(messageIds: string[]): Promise<{ status: string; marked_read_count?: number }> {
    if (!messageIds || messageIds.length === 0) return { status: "success", marked_read_count: 0 };
    return this.makeRequest("/emails/mark-as-read", {
      method: "POST",
      data: { message_ids: messageIds },
    });
  }

  /**
   * Download attachment using backend API, returns { filename, mime_type, size, data (base64) }
   */
  async downloadAttachmentByApi(messageId: string, attachmentId: string, fileName: string, mimeType: string): Promise<{ filename: string; mime_type: string; size: number; data: string }> {

    try {
      const params = new URLSearchParams({ file_name: fileName, mime_type: mimeType });
      const url = `/emails/attachments/${messageId}/${attachmentId}?${params.toString()}`;
      const response = await axiosInstance.get(url);
      return response.data;
    } catch (error: unknown) {
      const axiosErr = error as { response?: { status: number; statusText: string }; message?: string };
      if (axiosErr.response) {
        throw new Error(`Failed to download attachment: ${axiosErr.response.status} ${axiosErr.response.statusText}`);
      }
      throw new Error(`Download error: ${axiosErr.message || "Unknown error"}`);
    }
  }
}

export const emailService = new EmailService();