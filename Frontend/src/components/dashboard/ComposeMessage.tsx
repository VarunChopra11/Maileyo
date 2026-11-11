import { useState, useRef, useEffect, useCallback } from "react";
import { EmailContact, EmailMessage, SendEmailRequest } from "@/types/email";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Send,
  Paperclip,
  X,
  Bold,
  Italic,
  Underline,
  CornerUpLeft,
  ChevronDown,
  Plus,
  Trash2,
} from "lucide-react";
import { emailService } from "@/services/emailService";
import { toast } from "sonner";

interface ComposeMessageProps {
  selectedContact: EmailContact;
  onMessageSent: (message: EmailMessage) => void;
  activeThreadId?: string | null;
  activeThreadSubject?: string;
  latestMessageInThread?: EmailMessage | null;
  onClearThread?: () => void;
  externalExpanded?: boolean;
  onToggleExpand?: (expanded: boolean) => void;
}

function ComposeMessage({
  selectedContact,
  onMessageSent,
  activeThreadId,
  activeThreadSubject,
  latestMessageInThread,
  onClearThread,
  externalExpanded,
  onToggleExpand,
}: ComposeMessageProps) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = externalExpanded !== undefined ? externalExpanded : internalExpanded;

  const setIsExpanded = (val: boolean) => {
    setInternalExpanded(val);
    onToggleExpand?.(val);
  };

  const [isRichText, setIsRichText] = useState(false);
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [showSubjectEdit, setShowSubjectEdit] = useState(false);
  const [sending, setSending] = useState(false);
  const [replyMode, setReplyMode] = useState<"thread" | "new">(
    activeThreadId ? "thread" : "new"
  );
  const [formData, setFormData] = useState({
    to: selectedContact.email,
    cc: "",
    bcc: "",
    subject: "",
    body: "",
  });
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);

  // Synchronize reply mode and subject when active thread or contact changes
  useEffect(() => {
    if (activeThreadId) {
      setReplyMode("thread");
      const normalizedSub = activeThreadSubject
        ? activeThreadSubject.toLowerCase().startsWith("re:")
          ? activeThreadSubject
          : `Re: ${activeThreadSubject}`
        : "Re: Conversation";
      setFormData((prev) => ({
        ...prev,
        to: selectedContact.email,
        subject: normalizedSub,
      }));
    } else {
      setReplyMode("new");
      setFormData((prev) => ({
        ...prev,
        to: selectedContact.email,
        subject: "",
      }));
    }
  }, [activeThreadId, activeThreadSubject, selectedContact.email]);

  const expand = useCallback(() => {
    setIsExpanded(true);
    setTimeout(() => textareaRef.current?.focus(), 80);
  }, []);

  const collapse = useCallback(() => {
    setIsExpanded(false);
  }, []);

  const discard = () => {
    setFormData((prev) => ({
      ...prev,
      body: "",
      cc: "",
      bcc: "",
    }));
    setAttachments([]);
    setShowCcBcc(false);
    setShowSubjectEdit(false);
    collapse();
  };

  // Keyboard shortcut listener: 'R' to reply when not focused in input/textarea
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === "input" || activeTag === "textarea" || (document.activeElement as HTMLElement)?.isContentEditable) {
        if (e.key === "Escape" && isExpanded && !formData.body.trim() && attachments.length === 0) {
          collapse();
        }
        return;
      }

      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        expand();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isExpanded, formData.body, attachments.length, expand, collapse]);

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      const newFiles = Array.from(files);
      setAttachments((prev) => [...prev, ...newFiles]);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
    return Math.round(bytes / (1024 * 1024)) + " MB";
  };

  const applyFormatting = (format: string) => {
    const textarea = textareaRef.current;
    if (!textarea || !isRichText) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = formData.body.substring(start, end);

    if (selectedText) {
      let formattedText = "";
      switch (format) {
        case "bold":
          formattedText = `<strong>${selectedText}</strong>`;
          break;
        case "italic":
          formattedText = `<em>${selectedText}</em>`;
          break;
        case "underline":
          formattedText = `<u>${selectedText}</u>`;
          break;
        default:
          formattedText = selectedText;
      }

      const newBody =
        formData.body.substring(0, start) +
        formattedText +
        formData.body.substring(end);
      handleInputChange("body", newBody);
    }
  };

  const isHtml = (str: string) => /<[a-z][\s\S]*>/i.test(str);

  const handleSend = async () => {
    if (!formData.body.trim()) {
      toast.error("Please enter a message");
      return;
    }

    try {
      setSending(true);
      const isReplying = replyMode === "thread" && Boolean(activeThreadId);

      const emailData: SendEmailRequest = {
        to: formData.to
          .split(",")
          .map((email) => email.trim())
          .filter(Boolean),
        subject:
          formData.subject ||
          (isReplying ? activeThreadSubject || "Re: Conversation" : "No Subject"),
        body_plain: isHtml(formData.body) ? undefined : formData.body,
        body_html: isHtml(formData.body) ? formData.body : undefined,
        thread_id: isReplying ? activeThreadId || undefined : undefined,
        in_reply_to:
          isReplying && latestMessageInThread ? latestMessageInThread.id : undefined,
        references:
          isReplying && latestMessageInThread ? latestMessageInThread.id : undefined,
      };

      if (formData.cc.trim()) {
        emailData.cc = formData.cc
          .split(",")
          .map((email) => email.trim())
          .filter(Boolean);
      }
      if (formData.bcc.trim()) {
        emailData.bcc = formData.bcc
          .split(",")
          .map((email) => email.trim())
          .filter(Boolean);
      }

      if (attachments.length > 0) {
        emailData.attachments = await Promise.all(
          attachments.map(
            (file) =>
              new Promise<{ filename: string; content: string; mimeType: string }>(
                (resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () => {
                    let content = reader.result as string;
                    let base64Content = content;
                    if (content.startsWith("data:")) {
                      const commaIndex = content.indexOf(",");
                      base64Content = content.substring(commaIndex + 1);
                    }
                    resolve({
                      filename: file.name,
                      content: base64Content,
                      mimeType: file.type || "application/octet-stream",
                    });
                  };
                  reader.onerror = reject;
                  reader.readAsDataURL(file);
                }
              )
          )
        );
      }

      const response = await emailService.sendEmail(emailData);
      if (!response || response.error) {
        throw new Error(response?.error || "Unknown error");
      }

      const newMessage: EmailMessage = {
        id: response.message_id || `temp-${Date.now()}`,
        threadId:
          response.thread_id || (activeThreadId || `temp-thread-${Date.now()}`),
        from: "me",
        to: emailData.to,
        cc: emailData.cc,
        subject: emailData.subject,
        bodyPlain: emailData.body_plain,
        bodyHtml: emailData.body_html,
        timestamp: response.sent_at || new Date().toISOString(),
        attachments: attachments.map((file) => ({
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
        })),
        isSent: true,
        labels: ["SENT"],
      };

      onMessageSent(newMessage);
      setFormData((prev) => ({
        ...prev,
        to: selectedContact.email,
        body: "",
      }));
      setAttachments([]);
      setShowCcBcc(false);
      collapse();
      toast.success(isReplying ? "Reply sent in thread" : "Email sent successfully");
    } catch (error) {
      toast.error("Failed to send email");
    } finally {
      setSending(false);
    }
  };

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Send on Cmd+Enter or Ctrl+Enter
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  };

  // --- COLLAPSED STATE (Default: Sleek Minimal Bar) ---
  if (!isExpanded) {
    return (
      <div className="bg-white dark:bg-gray-900 border-t border-gray-200/80 dark:border-gray-800 px-4 py-2.5 shrink-0">
        <div className="max-w-4xl mx-auto flex items-center gap-2">
          {/* Main interactive reply trigger */}
          <button
            type="button"
            onClick={expand}
            className="flex-1 flex items-center gap-2.5 px-3.5 py-2 text-xs sm:text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/80 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg border border-gray-200/70 dark:border-gray-700/60 transition-all text-left shadow-2xs group"
          >
            <CornerUpLeft className="w-4 h-4 text-indigo-500 group-hover:-translate-x-0.5 transition-transform" />
            <span className="truncate">
              Reply to {selectedContact.name || selectedContact.email}&hellip;
            </span>
            <kbd className="hidden sm:inline-flex items-center gap-0.5 ml-auto text-[10px] font-semibold text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-700 px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-600">
              R
            </kbd>
          </button>

          {/* New Thread Action */}
          <button
            type="button"
            onClick={() => {
              setReplyMode("new");
              setFormData((prev) => ({ ...prev, subject: "" }));
              onClearThread?.();
              expand();
            }}
            className="px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors flex items-center gap-1.5 shrink-0 border border-transparent hover:border-gray-200 dark:hover:border-gray-700"
            title="Start a new email thread with this contact"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">New Thread</span>
          </button>
        </div>
      </div>
    );
  }

  // --- EXPANDED STATE (On Demand) ---
  const isReplying = replyMode === "thread" && Boolean(activeThreadId);

  return (
    <div
      ref={composerRef}
      className="bg-white dark:bg-gray-900 border-t border-gray-200/90 dark:border-gray-800 px-4 py-3.5 shadow-lg shrink-0 transition-all duration-200 animate-in fade-in slide-in-from-bottom-2"
    >
      <div className="max-w-4xl mx-auto space-y-3">
        {/* Top Control Bar */}
        <div className="flex items-center justify-between pb-1 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
            <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">
              {isReplying
                ? `Replying in thread: "${activeThreadSubject || "Conversation"}"`
                : `New thread with ${selectedContact.name || selectedContact.email}`}
            </span>
            <button
              type="button"
              onClick={() => {
                if (replyMode === "thread") {
                  setReplyMode("new");
                  setFormData((prev) => ({ ...prev, subject: "" }));
                  onClearThread?.();
                } else {
                  setReplyMode("thread");
                  const normalizedSub = activeThreadSubject
                    ? activeThreadSubject.toLowerCase().startsWith("re:")
                      ? activeThreadSubject
                      : `Re: ${activeThreadSubject}`
                    : "Re: Conversation";
                  setFormData((prev) => ({ ...prev, subject: normalizedSub }));
                }
              }}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline shrink-0 ml-2 font-medium"
            >
              {replyMode === "thread" ? "Start new thread instead" : "Reply in thread instead"}
            </button>
          </div>

          <div className="flex items-center gap-1 shrink-0 ml-3">
            {/* Rich Text Toggle */}
            <button
              type="button"
              onClick={() => setIsRichText(!isRichText)}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                isRichText
                  ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 font-semibold"
                  : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}
            >
              Rich Text
            </button>

            {/* Collapse/Minimize */}
            <button
              type="button"
              onClick={collapse}
              className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
              title="Minimize (Esc)"
            >
              <ChevronDown className="w-4 h-4" />
            </button>

            {/* Discard */}
            <button
              type="button"
              onClick={discard}
              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded transition-colors"
              title="Discard draft"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Compact Recipient & Subject Header */}
        {isReplying && !showSubjectEdit ? (
          <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/50 px-3 py-1.5 rounded-lg border border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2 truncate">
              <span className="text-gray-400 font-medium">To:</span>
              <span className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                {formData.to}
              </span>
              <span className="text-gray-400">·</span>
              <span className="text-gray-500 truncate">{formData.subject}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-2">
              {!showCcBcc && (
                <button
                  type="button"
                  onClick={() => setShowCcBcc(true)}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  Cc/Bcc
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowSubjectEdit(true)}
                className="text-xs text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:underline"
              >
                Edit
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="flex items-center gap-2">
              <label
                htmlFor="compose-to"
                className="text-xs font-medium text-gray-500 dark:text-gray-400 w-8 shrink-0"
              >
                To
              </label>
              <Input
                id="compose-to"
                type="email"
                value={formData.to}
                onChange={(e) => handleInputChange("to", e.target.value)}
                className="text-xs sm:text-sm h-8 bg-gray-50/60 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700 focus-visible:ring-1 focus-visible:ring-indigo-500"
                placeholder="Recipient email"
              />
            </div>
            <div className="flex items-center gap-2">
              <label
                htmlFor="compose-subject"
                className="text-xs font-medium text-gray-500 dark:text-gray-400 w-8 shrink-0"
              >
                Subj
              </label>
              <Input
                id="compose-subject"
                value={formData.subject}
                onChange={(e) => handleInputChange("subject", e.target.value)}
                className="text-xs sm:text-sm h-8 bg-gray-50/60 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700 focus-visible:ring-1 focus-visible:ring-indigo-500"
                placeholder="Email subject"
              />
            </div>
          </div>
        )}

        {/* Optional Cc / Bcc Fields */}
        {showCcBcc && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
            <div className="flex items-center gap-2">
              <label
                htmlFor="compose-cc"
                className="text-xs font-medium text-gray-500 dark:text-gray-400 w-8 shrink-0"
              >
                Cc
              </label>
              <Input
                id="compose-cc"
                type="email"
                value={formData.cc}
                onChange={(e) => handleInputChange("cc", e.target.value)}
                className="text-xs sm:text-sm h-8 bg-gray-50/60 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700 focus-visible:ring-1 focus-visible:ring-indigo-500"
                placeholder="Cc email(s)"
              />
            </div>
            <div className="flex items-center gap-2">
              <label
                htmlFor="compose-bcc"
                className="text-xs font-medium text-gray-500 dark:text-gray-400 w-8 shrink-0"
              >
                Bcc
              </label>
              <Input
                id="compose-bcc"
                type="email"
                value={formData.bcc}
                onChange={(e) => handleInputChange("bcc", e.target.value)}
                className="text-xs sm:text-sm h-8 bg-gray-50/60 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700 focus-visible:ring-1 focus-visible:ring-indigo-500"
                placeholder="Bcc email(s)"
              />
            </div>
          </div>
        )}

        {/* Rich text formatting bar */}
        {isRichText && (
          <div className="flex items-center gap-1 py-1 px-1 bg-gray-50 dark:bg-gray-800/50 rounded border border-gray-200/60 dark:border-gray-700/60">
            <button
              type="button"
              onClick={() => applyFormatting("bold")}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
              title="Bold"
            >
              <Bold className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => applyFormatting("italic")}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
              title="Italic"
            >
              <Italic className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => applyFormatting("underline")}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
              title="Underline"
            >
              <Underline className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Main Textarea */}
        <Textarea
          ref={textareaRef}
          placeholder="Write your message here... (Cmd+Enter to send)"
          value={formData.body}
          onChange={(e) => handleInputChange("body", e.target.value)}
          onKeyDown={handleTextareaKeyDown}
          className="min-h-[130px] resize-y text-sm bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 focus-visible:ring-1 focus-visible:ring-indigo-500 leading-relaxed"
          rows={5}
        />

        {/* Attachments preview */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {attachments.map((file, index) => (
              <div
                key={index}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 dark:bg-gray-800 rounded-lg text-xs"
              >
                <Paperclip className="w-3.5 h-3.5 text-gray-400" />
                <span className="font-medium text-gray-700 dark:text-gray-200 max-w-[150px] truncate">
                  {file.name}
                </span>
                <span className="text-gray-400 text-[11px]">
                  ({formatFileSize(file.size)})
                </span>
                <button
                  type="button"
                  onClick={() => removeAttachment(index)}
                  className="text-gray-400 hover:text-red-500 ml-1 p-0.5 rounded transition-colors"
                  title="Remove attachment"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Bottom Actions Toolbar */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              multiple
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors border border-gray-200/80 dark:border-gray-700/80 shadow-2xs"
              title="Attach files"
            >
              <Paperclip className="w-3.5 h-3.5" />
              <span>Attach</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={collapse}
              className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
            >
              Cancel
            </button>

            <Button
              type="button"
              onClick={handleSend}
              disabled={sending || !formData.body.trim()}
              size="sm"
              className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-4 py-2 rounded-lg shadow-sm transition-all disabled:opacity-50"
            >
              {sending ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Sending...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Send</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ComposeMessage;
