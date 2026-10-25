import { useState, useRef, useEffect } from "react";
import { EmailContact, EmailMessage, SendEmailRequest } from "@/types/email";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Send, Paperclip, X, Bold, Italic, Underline } from "lucide-react";
import { emailService } from "@/services/emailService";
import { toast } from "sonner";

interface ComposeMessageProps {
  selectedContact: EmailContact;
  onMessageSent: (message: EmailMessage) => void;
  activeThreadId?: string | null;
  activeThreadSubject?: string;
  latestMessageInThread?: EmailMessage | null;
  onClearThread?: () => void;
}

function ComposeMessage({
  selectedContact,
  onMessageSent,
  activeThreadId,
  activeThreadSubject,
  latestMessageInThread,
  onClearThread,
}: ComposeMessageProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isRichText, setIsRichText] = useState(false);
  const [sending, setSending] = useState(false);
  const [replyMode, setReplyMode] = useState<"thread" | "new">(activeThreadId ? "thread" : "new");
  const [formData, setFormData] = useState({
    to: selectedContact.email,
    cc: "",
    bcc: "",
    subject: "",
    body: ""
  });
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Synchronize reply mode and subject when active thread changes
  useEffect(() => {
    if (activeThreadId) {
      setReplyMode("thread");
      const normalizedSub = activeThreadSubject
        ? (activeThreadSubject.toLowerCase().startsWith("re:") ? activeThreadSubject : `Re: ${activeThreadSubject}`)
        : "Re: Conversation";
      setFormData(prev => ({
        ...prev,
        to: selectedContact.email,
        subject: normalizedSub
      }));
    } else {
      setReplyMode("new");
      setFormData(prev => ({
        ...prev,
        to: selectedContact.email,
        subject: ""
      }));
    }
  }, [activeThreadId, activeThreadSubject, selectedContact.email]);


  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      const newFiles = Array.from(files);
      setAttachments(prev => [...prev, ...newFiles]);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
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
      
      const newBody = formData.body.substring(0, start) + formattedText + formData.body.substring(end);
      handleInputChange("body", newBody);
    }
  };

  // Helper: detect if string is HTML
  const isHtml = (str: string) => /<[a-z][\s\S]*>/i.test(str);

  const handleSend = async () => {
    if (!formData.body.trim()) {
      toast.error("Please enter a message");
      return;
    }

    try {
      setSending(true);
      const isReplying = replyMode === "thread" && Boolean(activeThreadId);

      // Build email data according to backend schema
      const emailData: SendEmailRequest = {
        to: formData.to.split(",").map(email => email.trim()).filter(Boolean),
        subject: formData.subject || (isReplying ? (activeThreadSubject || "Re: Conversation") : "No Subject"),
        body_plain: isHtml(formData.body) ? undefined : formData.body,
        body_html: isHtml(formData.body) ? formData.body : undefined,
        thread_id: isReplying ? (activeThreadId || undefined) : undefined,
        in_reply_to: isReplying && latestMessageInThread ? latestMessageInThread.id : undefined,
        references: isReplying && latestMessageInThread ? latestMessageInThread.id : undefined,
      };
      if (formData.cc.trim()) {
        emailData.cc = formData.cc.split(",").map(email => email.trim()).filter(Boolean);
      }
      if (formData.bcc.trim()) {
        emailData.bcc = formData.bcc.split(",").map(email => email.trim()).filter(Boolean);
      }
          // Attachments: convert to { filename, content (base64), mimeType }
      if (attachments.length > 0) {
        emailData.attachments = await Promise.all(
          attachments.map(
            (file) => new Promise<{ filename: string; content: string; mimeType: string }>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                // Remove base64 header if present
                let content = reader.result as string;
                   let base64Content = content;
                   if (content.startsWith("data:")) {
                     const commaIndex = content.indexOf(",");
                     base64Content = content.substring(commaIndex + 1);
                }
                resolve({
                  filename: file.name,
                    content: base64Content,
                  mimeType: file.type
                });
              };
              reader.onerror = reject;
              reader.readAsDataURL(file);
            })
          )
        );
      }
      const response = await emailService.sendEmail(emailData);
      // If backend returns error, throw
      if (!response || response.error) {
        throw new Error(response?.error || "Unknown error");
      }
      // UI message object
      const newMessage: EmailMessage = {
        id: response.message_id || `temp-${Date.now()}`,
        threadId: response.thread_id || (activeThreadId || `temp-thread-${Date.now()}`),
        from: "me",
        to: emailData.to,
        cc: emailData.cc,
        subject: emailData.subject,
        bodyPlain: emailData.body_plain,
        bodyHtml: emailData.body_html,
        timestamp: response.sent_at || new Date().toISOString(),
        attachments: attachments.map(file => ({
          filename: file.name,
          mimeType: file.type,
          size: file.size
        })),
        isSent: true,
        labels: ["SENT"]
      };
      onMessageSent(newMessage);
      setFormData(prev => ({
        ...prev,
        to: selectedContact.email,
        body: ""
      }));
      setAttachments([]);
      setIsExpanded(false);
      toast.success(isReplying ? "Reply sent in thread!" : "Email sent successfully!");
    } catch (error) {
      toast.error("Failed to send email");
    } finally {
      setSending(false);
    }
  };

  // --- UI ---
  return (
  <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4">
      <div className="max-w-4xl mx-auto space-y-3">
        {/* Thread status & switcher toggle */}
        {activeThreadId ? (
          <div className="flex items-center justify-between px-3 py-2 bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50 rounded-xl text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0" />
              <span className="font-semibold text-indigo-900 dark:text-indigo-200 truncate">
                {replyMode === "thread"
                  ? `Replying in thread: "${activeThreadSubject || 'Current Conversation'}"`
                  : `Starting a new thread with ${selectedContact.name}`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                if (replyMode === "thread") {
                  setReplyMode("new");
                  setFormData(prev => ({ ...prev, subject: "" }));
                  onClearThread?.();
                } else {
                  setReplyMode("thread");
                  const normalizedSub = activeThreadSubject
                    ? (activeThreadSubject.toLowerCase().startsWith("re:") ? activeThreadSubject : `Re: ${activeThreadSubject}`)
                    : "Re: Conversation";
                  setFormData(prev => ({ ...prev, subject: normalizedSub }));
                }
              }}
              className="px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-white dark:bg-gray-800 border border-indigo-200 dark:border-indigo-700 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 rounded-lg transition-colors shadow-xs ml-2 flex-shrink-0"
            >
              {replyMode === "thread" ? "Start new thread" : "Reply in thread"}
            </button>
          </div>
        ) : null}

      {/* Compose form */}
        {/* Rich Text & Expand/Collapse buttons now here */}
        <div className="flex items-center justify-end gap-2 mb-2">
          <button
            onClick={() => setIsRichText(!isRichText)}
            className={`px-2 py-1 text-xs rounded transition-colors border ${isRichText ? "bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-indigo-900 dark:text-indigo-200 dark:border-indigo-700" : "text-gray-500 border-gray-200 hover:text-indigo-700 hover:border-indigo-400 dark:text-gray-400 dark:border-gray-700 dark:hover:text-indigo-200"}`}
            title="Toggle rich text"
          >
            Rich Text
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="px-2 py-1 text-xs rounded border text-gray-500 border-gray-200 hover:text-indigo-700 hover:border-indigo-400 dark:text-gray-400 dark:border-gray-700 dark:hover:text-indigo-200"
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? "Collapse" : "Expand"}
          </button>
        </div>
        {/* To & Subject fields side by side with labels */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div className="flex flex-col">
            <label htmlFor="to-field" className="text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">To:</label>
            <Input
              id="to-field"
              type="email"
              value={formData.to}
              onChange={(e) => handleInputChange("to", e.target.value)}
              className="text-sm bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 focus:border-indigo-400 focus:ring-indigo-200"
              placeholder="Enter recipient email(s)"
            />
          </div>
          <div className="flex flex-col">
            <label htmlFor="subject-field" className="text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">Subject:</label>
            <Input
              id="subject-field"
              value={formData.subject}
              onChange={(e) => handleInputChange("subject", e.target.value)}
              className="text-sm bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 focus:border-indigo-400 focus:ring-indigo-200"
              placeholder="Enter subject"
            />
          </div>
        </div>

        {/* Cc & Bcc fields (only when expanded) */}
        {isExpanded && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="flex flex-col">
              <label htmlFor="cc-field" className="text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">Cc:</label>
              <Input
                id="cc-field"
                type="email"
                value={formData.cc}
                onChange={(e) => handleInputChange("cc", e.target.value)}
                className="text-sm bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 focus:border-indigo-400 focus:ring-indigo-200"
                placeholder="Enter Cc email(s)"
              />
            </div>
            <div className="flex flex-col">
              <label htmlFor="bcc-field" className="text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">Bcc:</label>
              <Input
                id="bcc-field"
                type="email"
                value={formData.bcc}
                onChange={(e) => handleInputChange("bcc", e.target.value)}
                className="text-sm bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 focus:border-indigo-400 focus:ring-indigo-200"
                placeholder="Enter Bcc email(s)"
              />
            </div>
          </div>
        )}

        {/* Formatting tools */}
        {isRichText && (
          <div className="flex items-center gap-2 py-1 border-b border-gray-200 dark:border-gray-600 mb-2">
            <button
              onClick={() => applyFormatting("bold")}
              className="p-1 rounded hover:bg-indigo-100 dark:hover:bg-indigo-900 text-gray-600 dark:text-gray-400"
              title="Bold"
            >
              <Bold className="w-4 h-4" />
            </button>
            <button
              onClick={() => applyFormatting("italic")}
              className="p-1 rounded hover:bg-indigo-100 dark:hover:bg-indigo-900 text-gray-600 dark:text-gray-400"
              title="Italic"
            >
              <Italic className="w-4 h-4" />
            </button>
            <button
              onClick={() => applyFormatting("underline")}
              className="p-1 rounded hover:bg-indigo-100 dark:hover:bg-indigo-900 text-gray-600 dark:text-gray-400"
              title="Underline"
            >
              <Underline className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Message body */}
        <div className="relative">
          <Textarea
            ref={textareaRef}
            placeholder="Type your message..."
            value={formData.body}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleInputChange("body", e.target.value)}
            className="min-h-[120px] resize-none text-sm bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 focus:border-indigo-400 focus:ring-indigo-200 shadow-sm"
            rows={5}
          />
        </div>

        {/* Attachments */}
        {attachments.length > 0 && (
          <div className="space-y-1">
            {attachments.map((file, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-2 bg-indigo-50 dark:bg-gray-800 rounded text-sm border border-indigo-100 dark:border-gray-700"
              >
                <div className="flex items-center gap-2">
                  <Paperclip className="w-4 h-4 text-indigo-400" />
                  <span className="text-gray-800 dark:text-gray-200 font-medium">{file.name}</span>
                  <span className="text-gray-500 dark:text-gray-400">({formatFileSize(file.size)})</span>
                </div>
                <button
                  onClick={() => removeAttachment(index)}
                  className="text-red-500 hover:text-red-700"
                  title="Remove attachment"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              multiple
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2 text-indigo-500 hover:text-indigo-700 dark:text-indigo-300 dark:hover:text-indigo-100 hover:bg-indigo-100 dark:hover:bg-indigo-900 rounded transition-colors"
              title="Attach file"
            >
              <Paperclip className="w-4 h-4" />
            </button>
          </div>
          <Button
            onClick={handleSend}
            disabled={sending || !formData.body.trim()}
            size="sm"
            className="flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-indigo-700 hover:from-indigo-600 hover:to-indigo-800 text-white shadow-md px-4 py-2 rounded"
          >
            {sending ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Sending...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>Send</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ComposeMessage;