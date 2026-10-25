
import { EmailMessage } from "@/types/email";
import { Paperclip, Download, Clock } from "lucide-react";
import { emailService } from "@/services/emailService";
import { toast } from "sonner";
import { SecureEmailRenderer } from "./SecureEmailRenderer";

interface MessageBubbleProps {
  message: EmailMessage;
  isCurrentUser: boolean;
}

function MessageBubble({ message, isCurrentUser }: MessageBubbleProps) {

  const formatTimestamp = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleString([], { 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true
      });
    } catch {
      return "";
    }
  };

  const downloadAttachment = async (attachment: any) => {
    try {
      if (!message.id || !attachment.attachmentId) {
        toast.error("Attachment info missing");
        return;
      }
      // Call backend API to get base64 data
      const result = await emailService.downloadAttachmentByApi(
        message.id,
        attachment.attachmentId,
        attachment.filename,
        attachment.mimeType || "application/octet-stream"
      );

      // Robust URL-safe base64 normalization and padding fix
      let base64 = (result.data || "").replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
      const pad = base64.length % 4;
      if (pad) {
        base64 += '='.repeat(4 - pad);
      }

      const byteCharacters = atob(base64);
      const byteNumbers = new Uint8Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }

      const blob = new Blob([byteNumbers], { type: result.mime_type || "application/octet-stream" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
        document.body.removeChild(link);
      }, 200);
      toast.success("Attachment downloaded");
    } catch (error: any) {
      console.error("Failed to download attachment:", error);
      toast.error("Failed to download attachment");
    }
  };

  return (
    <div className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`max-w-[75%] md:max-w-[70%] ${isCurrentUser ? 'order-2' : 'order-1'}`}>
        {/* Message bubble */}
        <div
          className={`rounded-2xl px-5 py-3.5 shadow-md ${
            isCurrentUser
              ? 'bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-br-sm'
              : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-bl-sm border border-gray-200/80 dark:border-gray-700/80'
          }`}
        >
          {/* Subject */}
          {message.subject && (
            <div className={`font-semibold mb-2 text-sm ${
              isCurrentUser ? 'text-blue-100' : 'text-gray-700 dark:text-gray-300'
            }`}>
              {message.subject}
            </div>
          )}

          {/* Secure Message Content */}
          <div className="text-base leading-relaxed">
            <SecureEmailRenderer
              html={message.cleanBodyHtml || message.bodyHtml}
              plainText={message.cleanBodyPlain || message.bodyPlain}
              quotedHtml={message.quotedHtml}
              quotedText={message.quotedText}
              isCurrentUser={isCurrentUser}
            />
          </div>

          {/* Attachments */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600 space-y-2">
              {message.attachments.map((attachment, index) => (
                <div
                  key={index}
                  className={`flex items-center justify-between p-2 rounded-xl ${
                    isCurrentUser
                      ? 'bg-blue-500/20 text-blue-100'
                      : 'bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <div className="flex items-center space-x-2 flex-1">
                    <Paperclip className="w-4 h-4" />
                    <div>
                      <p className="text-xs font-medium truncate max-w-[200px]">
                        {attachment.filename}
                      </p>
                      <p className={`text-xs ${
                        isCurrentUser ? 'text-blue-200' : 'text-gray-500 dark:text-gray-400'
                      }`}>
                        {attachment.size ? `${Math.round(attachment.size / 1024)} KB` : 'Unknown size'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => downloadAttachment(attachment)}
                    className={`p-1 rounded hover:bg-opacity-20 transition-colors ${
                      isCurrentUser
                        ? 'hover:bg-white text-blue-100'
                        : 'hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Timestamp */}
          <div className={`flex items-center mt-2 pt-2 text-xs ${
            isCurrentUser 
              ? 'text-blue-100 justify-end' 
              : 'text-gray-500 dark:text-gray-400 justify-start'
          }`}>
            <Clock className="w-3 h-3 mr-1" />
            {formatTimestamp(message.timestamp)}
          </div>
        </div>


      </div>
    </div>
  );
}

export default MessageBubble;