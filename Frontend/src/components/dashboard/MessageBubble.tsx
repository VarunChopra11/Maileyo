import React from "react";
import { EmailMessage, EmailAttachment } from "@/types/email";
import { Paperclip, Download, CornerUpLeft, CornerUpRight } from "lucide-react";
import { emailService } from "@/services/emailService";
import { useCompose } from "@/context/ComposeContext";
import { toast } from "sonner";
import { SecureEmailRenderer } from "./SecureEmailRenderer";

interface MessageBubbleProps {
  message: EmailMessage;
  isCurrentUser: boolean;
  onReply?: () => void;
  onForward?: () => void;
}

function MessageBubble({ message, isCurrentUser, onReply, onForward }: MessageBubbleProps) {
  const { openReply, openForward } = useCompose();

  const handleReplyClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onReply) {
      onReply();
    } else {
      openReply(message, message.threadId);
    }
  };

  const handleForwardClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onForward) {
      onForward();
    } else {
      openForward(message);
    }
  };

  const formatFullDate = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleString([], {
        month: "short",
        day: "numeric",
        year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return "";
    }
  };

  const downloadAttachment = async (attachment: EmailAttachment) => {
    try {
      if (!message.id || !attachment.attachmentId) {
        toast.error("Attachment info missing");
        return;
      }
      const result = await emailService.downloadAttachmentByApi(
        message.id,
        attachment.attachmentId,
        attachment.filename,
        attachment.mimeType || "application/octet-stream"
      );

      let base64 = (result.data || "").replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
      const pad = base64.length % 4;
      if (pad) {
        base64 += "=".repeat(4 - pad);
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
    } catch (error: unknown) {
      console.error("Failed to download attachment:", error);
      toast.error("Failed to download attachment");
    }
  };

  const senderInitial = isCurrentUser
    ? "Y"
    : (message.from ? message.from.charAt(0).toUpperCase() : "U");

  return (
    <article className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200/70 dark:border-gray-800 shadow-xs mb-3.5 overflow-hidden transition-all hover:border-gray-300 dark:hover:border-gray-700">
      {/* Email Header Bar */}
      <div className="px-5 py-3.5 flex items-center justify-between border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-850/50">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0 shadow-xs ${
              isCurrentUser
                ? "bg-gradient-to-br from-indigo-500 to-indigo-600"
                : "bg-gradient-to-br from-blue-500 to-cyan-600"
            }`}
          >
            {senderInitial}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">
                {isCurrentUser ? "You" : (message.from || "Unknown")}
              </span>
              {isCurrentUser && (
                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                  Sent
                </span>
              )}
            </div>
            {message.to && message.to.length > 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                to {isCurrentUser ? message.to.join(", ") : "me"}
              </p>
            )}
          </div>
        </div>

        {/* Header Actions: Timestamp, Reply & Forward */}
        <div className="flex items-center gap-1.5 shrink-0 ml-4">
          <time className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap mr-1">
            {formatFullDate(message.timestamp)}
          </time>
          <button
            type="button"
            onClick={handleReplyClick}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white dark:hover:bg-gray-800 border border-transparent hover:border-gray-200 dark:hover:border-gray-700 rounded-md transition-all shadow-2xs"
            title="Reply to this message"
            aria-label="Reply to this message"
          >
            <CornerUpLeft className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Reply</span>
          </button>
          <button
            type="button"
            onClick={handleForwardClick}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white dark:hover:bg-gray-800 border border-transparent hover:border-gray-200 dark:hover:border-gray-700 rounded-md transition-all shadow-2xs"
            title="Forward this message"
            aria-label="Forward this message"
          >
            <CornerUpRight className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Forward</span>
          </button>
        </div>
      </div>

      {/* Email Body Content */}
      <div className="px-5 py-4 text-sm leading-relaxed text-gray-800 dark:text-gray-200 overflow-x-auto">
        <SecureEmailRenderer
          html={message.cleanBodyHtml || message.bodyHtml}
          plainText={message.cleanBodyPlain || message.bodyPlain}
          quotedHtml={message.quotedHtml}
          quotedText={message.quotedText}
          isCurrentUser={isCurrentUser}
        />
      </div>

      {/* Attachments Section */}
      {message.attachments && message.attachments.length > 0 && (
        <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50/40 dark:bg-gray-850/40">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
            Attachments ({message.attachments.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {message.attachments.map((attachment, index) => (
              <div
                key={index}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs shadow-2xs"
              >
                <Paperclip className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <span className="font-medium text-gray-700 dark:text-gray-200 truncate max-w-[180px]">
                  {attachment.filename}
                </span>
                <span className="text-gray-400 text-[11px]">
                  {attachment.size ? `${Math.round(attachment.size / 1024)} KB` : ""}
                </span>
                <button
                  type="button"
                  onClick={() => downloadAttachment(attachment)}
                  className="p-1 rounded text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ml-1"
                  title="Download attachment"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

export default MessageBubble;
