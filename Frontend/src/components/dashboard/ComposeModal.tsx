import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  ChevronUp,
  Send,
  Paperclip,
  Trash2,
  Mail,
  Loader2,
  UploadCloud,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RecipientInput } from "@/components/dashboard/RecipientInput";
import { RichTextEditor } from "@/components/dashboard/RichTextEditor";
import { useCompose } from "@/context/ComposeContext";
import { emailService } from "@/services/emailService";
import { validateEmail } from "@/lib/recipientUtils";
import { sanitizeHtml } from "@/lib/sanitizer";
import {
  validateTotalAttachmentSize,
  formatFileSize,
  convertFileToBase64,
} from "@/lib/attachmentUtils";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { EmailContact, EmailMessage, SendEmailRequest } from "@/types/email";

export interface ComposeModalProps {
  onMessageSent?: (message: EmailMessage) => void;
  className?: string;
  children?: React.ReactNode;
  contacts?: EmailContact[];
}

export function ComposeModal({
  onMessageSent,
  className,
  children,
  contacts = [],
}: ComposeModalProps) {
  const {
    isOpen,
    isMinimized,
    isMaximized,
    draft,
    closeCompose,
    minimizeCompose,
    maximizeCompose,
    restoreCompose,
    updateDraft,
    clearDraft,
  } = useCompose();

  // Internal states for CC and BCC row visibility
  const [showCc, setShowCc] = useState<boolean>(false);
  const [showBcc, setShowBcc] = useState<boolean>(false);
  const [sending, setSending] = useState<boolean>(false);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef<number>(0);

  // Auto-show CC or BCC rows if pre-populated in draft
  useEffect(() => {
    if (draft.cc && draft.cc.length > 0) {
      setShowCc(true);
    }
    if (draft.bcc && draft.bcc.length > 0) {
      setShowBcc(true);
    }
  }, [draft.cc, draft.bcc]);

  const handleSubjectChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateDraft({ subject: e.target.value });
  };

  const handleFilesAddition = useCallback(
    (newFiles: File[]): boolean => {
      if (!newFiles || newFiles.length === 0) return false;
      const current = draft.attachments || [];
      const candidateBatch = [...current, ...newFiles];
      const validation = validateTotalAttachmentSize(candidateBatch);

      if (!validation.valid) {
        toast.error(validation.error || "Total attachments size exceeds 20 MB limit.");
        return false;
      }

      updateDraft({ attachments: candidateBatch });
      return true;
    },
    [draft.attachments, updateDraft]
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFilesAddition(Array.from(files));
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeAttachment = (index: number) => {
    const current = draft.attachments || [];
    updateDraft({ attachments: current.filter((_, i) => i !== index) });
  };

  // Drag-and-drop event handlers with counter state machine to prevent child flicker
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes("Files")) {
      dragCounterRef.current += 1;
      if (dragCounterRef.current === 1) {
        setIsDraggingOver(true);
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) {
      setIsDraggingOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDraggingOver(false);

    const droppedFiles = Array.from(e.dataTransfer.files || []);
    if (droppedFiles.length > 0) {
      handleFilesAddition(droppedFiles);
    }
  };

  const handleSend = async () => {
    // 1. Check for empty To field
    if (!draft.to || draft.to.length === 0) {
      toast.error("Please specify at least one recipient");
      return;
    }

    // 2. Validate all recipient chips across To, CC, and BCC
    const invalidTo = draft.to.filter((email) => !validateEmail(email));
    const invalidCc = (draft.cc || []).filter((email) => !validateEmail(email));
    const invalidBcc = (draft.bcc || []).filter((email) => !validateEmail(email));

    const allInvalid = [...invalidTo, ...invalidCc, ...invalidBcc];
    if (allInvalid.length > 0) {
      toast.error(
        `Invalid recipient email address${allInvalid.length > 1 ? "es" : ""}: ${allInvalid.slice(0, 2).join(", ")}${allInvalid.length > 2 ? "..." : ""}. Please fix or remove before sending.`
      );
      return;
    }

    // 3. Validate cumulative attachment size before sending
    if (draft.attachments && draft.attachments.length > 0) {
      const validation = validateTotalAttachmentSize(draft.attachments);
      if (!validation.valid) {
        toast.error(validation.error || "Total attachments size exceeds 20 MB limit.");
        return;
      }
    }

    try {
      setSending(true);

      // Convert attachments to pure Base64 payloads
      const preparedAttachments = await Promise.all(
        (draft.attachments || []).map((file) => convertFileToBase64(file))
      );

      // Sanitize rich HTML body to neutralize XSS vectors
      const rawHtml =
        draft.bodyHtml ||
        (draft.bodyPlain ? `<p>${draft.bodyPlain.replace(/\n/g, "<br>")}</p>` : "");
      const cleanHtml = rawHtml ? sanitizeHtml(rawHtml) : undefined;

      const payload: SendEmailRequest = {
        to: draft.to,
        subject: draft.subject.trim() || "(no subject)",
        body_plain: draft.bodyPlain || undefined,
        body_html: cleanHtml,
        cc: draft.cc && draft.cc.length > 0 ? draft.cc : undefined,
        bcc: draft.bcc && draft.bcc.length > 0 ? draft.bcc : undefined,
        thread_id: draft.threadId,
        in_reply_to: draft.inReplyTo,
        references: draft.references,
        attachments: preparedAttachments.length > 0 ? preparedAttachments : undefined,
      };

      const res = await emailService.sendEmail(payload);

      if (res.message_id || res.success) {
        toast.success("Email sent successfully!");
        if (onMessageSent && res.message_id) {
          const sentMessage: EmailMessage = {
            id: res.message_id,
            threadId: res.thread_id || draft.threadId || res.message_id,
            from: "me",
            to: draft.to,
            cc: draft.cc,
            bcc: draft.bcc,
            subject: payload.subject,
            bodyPlain: payload.body_plain,
            bodyHtml: payload.body_html,
            timestamp: new Date().toISOString(),
            isSent: true,
            labels: ["SENT"],
          };
          onMessageSent(sentMessage);
        }
        clearDraft();
        closeCompose();
      } else {
        toast.error(res.error || "Failed to send email");
      }
    } catch (err: unknown) {
      const customErr = err as {
        detail?: string;
        response?: { data?: { detail?: string } };
        message?: string;
      };
      const errorMsg =
        customErr?.detail ||
        customErr?.response?.data?.detail ||
        customErr?.message ||
        "Failed to send email";
      toast.error(errorMsg);
      // DRAFT RETENTION INVARIANT: draft is NOT cleared and modal is NOT closed on failure.
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Ctrl+Enter or Cmd+Enter to send
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
    // Escape to close if empty
    if (e.key === "Escape") {
      if (
        !draft.bodyPlain &&
        (!draft.to || draft.to.length === 0) &&
        !draft.subject.trim()
      ) {
        closeCompose();
      }
    }
  };

  // If closed, return null
  if (!isOpen) return null;

  // Title formatting
  const modalTitle =
    draft.subject.trim() ||
    (draft.replyMode === "reply"
      ? "Reply"
      : draft.replyMode === "forward"
      ? "Forward"
      : "New Message");

  // Minimized Pill State
  if (isMinimized) {
    return (
      <div
        role="region"
        aria-label="Minimized email composer"
        onClick={restoreCompose}
        className={cn(
          "fixed bottom-3 right-3 left-3 sm:left-auto sm:right-6 sm:bottom-0 z-50",
          "w-auto sm:w-[320px] h-12 sm:h-11",
          "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 sm:border-b-0",
          "rounded-xl sm:rounded-b-none sm:rounded-t-xl shadow-xl hover:shadow-2xl",
          "flex items-center justify-between px-3.5 cursor-pointer select-none",
          "transition-all duration-150 ease-out",
          className
        )}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
          <Mail className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
          <span className="text-xs sm:text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
            {modalTitle}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              restoreCompose();
            }}
            className="p-1 rounded-md text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            title="Restore composer"
            aria-label="Restore composer"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              closeCompose();
            }}
            className="p-1 rounded-md text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            title="Close composer"
            aria-label="Close composer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // Active (Normal Docked or Maximized) State
  return (
    <>
      {/* Maximized Backdrop Scrim (Desktop only) */}
      {isMaximized && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-xs z-40 hidden md:block animate-in fade-in-0 duration-150"
          onClick={restoreCompose}
          aria-hidden="true"
        />
      )}

      {/* Main Composer Modal Container with Drag-and-Drop Dropzone Handlers */}
      <div
        role="dialog"
        aria-modal={isMaximized ? "true" : "false"}
        aria-labelledby="compose-modal-title"
        onKeyDown={handleKeyDown}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "fixed z-50 bg-white dark:bg-gray-900 flex flex-col shadow-2xl relative",
          // Maximized Viewport Classes
          isMaximized
            ? [
                // Mobile: Full screen
                "inset-0 h-[100dvh] w-full rounded-none border-0",
                // Desktop: Centered overlay
                "md:inset-6 lg:inset-10 md:w-auto md:max-w-5xl md:h-[calc(100vh-3rem)] lg:h-[calc(100vh-5rem)] md:mx-auto",
                "md:rounded-2xl md:border md:border-gray-200 md:dark:border-gray-800",
                "overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150",
              ]
            : [
                // Normal Mobile: Full screen
                "inset-0 h-[100dvh] w-full rounded-none border-0",
                // Normal Desktop: Docked bottom-right
                "md:inset-auto md:bottom-0 md:right-6",
                "md:w-[560px] md:max-w-[calc(100vw-2rem)] md:h-[540px] md:max-h-[85vh]",
                "md:rounded-t-2xl md:rounded-b-none",
                "md:border md:border-b-0 md:border-gray-200/90 md:dark:border-gray-800",
                "overflow-hidden transition-[width,height,transform] duration-200 ease-out",
              ],
          className
        )}
      >
        {/* Visual Drag-and-Drop Overlay */}
        {isDraggingOver && (
          <div className="absolute inset-2 z-50 rounded-xl border-2 border-dashed border-indigo-500 bg-indigo-50/95 dark:bg-indigo-950/95 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center animate-in fade-in-0 duration-150 pointer-events-none select-none">
            <div className="w-14 h-14 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center mb-3 text-indigo-600 dark:text-indigo-400">
              <UploadCloud className="w-7 h-7" />
            </div>
            <p className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">
              Drop files here to attach
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Up to 20 MB total across all attachments
            </p>
          </div>
        )}

        {/* Header Bar */}
        <div className="h-11 px-4 py-2 bg-gray-50/90 dark:bg-gray-800/80 border-b border-gray-200/80 dark:border-gray-700/80 flex items-center justify-between select-none shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
            <Mail className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <h2
              id="compose-modal-title"
              className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate"
            >
              {modalTitle}
            </h2>
          </div>

          {/* Window Control Buttons */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Minimize */}
            <button
              type="button"
              onClick={minimizeCompose}
              className="p-1.5 rounded-md text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100 hover:bg-gray-200/60 dark:hover:bg-gray-700/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              title="Minimize"
              aria-label="Minimize composer"
            >
              <Minus className="w-4 h-4" />
            </button>

            {/* Maximize / Restore (Hidden on mobile < md) */}
            <button
              type="button"
              onClick={maximizeCompose}
              className="hidden md:inline-flex p-1.5 rounded-md text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100 hover:bg-gray-200/60 dark:hover:bg-gray-700/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              title={isMaximized ? "Exit full screen" : "Full screen"}
              aria-label={isMaximized ? "Exit full screen" : "Full screen"}
            >
              {isMaximized ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </button>

            {/* Close */}
            <button
              type="button"
              onClick={closeCompose}
              className="p-1.5 rounded-md text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              title="Close (saves draft)"
              aria-label="Close composer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body: Custom Child Slot or Built-in Composer Form */}
        {children ? (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">{children}</div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Tokenized Recipient ("To:") Row with Collapsible CC/BCC toggles */}
            <RecipientInput
              label="To"
              value={draft.to || []}
              onChange={(to) => updateDraft({ to })}
              contacts={contacts}
              placeholder="Recipients (e.g. user@example.com)"
              autoFocus={draft.replyMode === "new"}
              rightControls={
                <div className="flex items-center gap-1">
                  {!showCc && (
                    <button
                      type="button"
                      onClick={() => setShowCc(true)}
                      className="text-xs font-medium text-gray-500 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-400 px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                      Cc
                    </button>
                  )}
                  {!showBcc && (
                    <button
                      type="button"
                      onClick={() => setShowBcc(true)}
                      className="text-xs font-medium text-gray-500 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-400 px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                      Bcc
                    </button>
                  )}
                </div>
              }
            />

            {/* Collapsible CC Row */}
            {showCc && (
              <RecipientInput
                label="Cc"
                value={draft.cc || []}
                onChange={(cc) => updateDraft({ cc })}
                contacts={contacts}
                placeholder="Cc recipients"
                className="animate-in fade-in-0 duration-100"
                rightControls={
                  <button
                    type="button"
                    onClick={() => {
                      setShowCc(false);
                      updateDraft({ cc: [] });
                    }}
                    className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    aria-label="Remove Cc field"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                }
              />
            )}

            {/* Collapsible BCC Row */}
            {showBcc && (
              <RecipientInput
                label="Bcc"
                value={draft.bcc || []}
                onChange={(bcc) => updateDraft({ bcc })}
                contacts={contacts}
                placeholder="Bcc recipients"
                className="animate-in fade-in-0 duration-100"
                rightControls={
                  <button
                    type="button"
                    onClick={() => {
                      setShowBcc(false);
                      updateDraft({ bcc: [] });
                    }}
                    className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    aria-label="Remove Bcc field"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                }
              />
            )}

            {/* Subject Line with 500 Char Limit & Counter */}
            <div className="flex items-center px-4 py-2 border-b border-gray-100 dark:border-gray-800/60 shrink-0">
              <Input
                value={draft.subject}
                maxLength={500}
                onChange={handleSubjectChange}
                placeholder="Subject"
                aria-label="Email subject"
                className="flex-1 border-0 shadow-none focus-visible:ring-0 px-1 py-1 text-sm font-medium text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 h-8"
              />
              {draft.subject.length > 400 && (
                <span className="text-[10px] text-gray-400 tabular-nums">
                  {draft.subject.length}/500
                </span>
              )}
            </div>

            {/* WYSIWYG Rich-Text Editor */}
            <RichTextEditor
              valueHtml={
                draft.bodyHtml ||
                (draft.bodyPlain
                  ? `<p>${draft.bodyPlain.replace(/\n/g, "<br>")}</p>`
                  : "")
              }
              onChange={(html, plainText) => {
                updateDraft({
                  bodyHtml: html,
                  bodyPlain: plainText,
                });
              }}
              placeholder="Write your email message here..."
              onSendShortcut={handleSend}
              className="flex-1 min-h-0"
            />

            {/* Attachments Chip List with 20MB Total Summary */}
            {draft.attachments && draft.attachments.length > 0 && (
              <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-800/60 bg-gray-50/50 dark:bg-gray-800/30 flex flex-col gap-1.5 shrink-0 max-h-32 overflow-y-auto">
                <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400 select-none">
                  <span>
                    {draft.attachments.length} attachment
                    {draft.attachments.length > 1 ? "s" : ""}
                  </span>
                  <span>
                    {formatFileSize(
                      draft.attachments.reduce((sum, f) => sum + (f.size || 0), 0)
                    )}{" "}
                    of 20 MB
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {draft.attachments.map((file, idx) => (
                    <div
                      key={`${file.name}-${idx}`}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 shadow-2xs group"
                    >
                      <Paperclip className="w-3.5 h-3.5 text-gray-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors" />
                      <span
                        className="truncate max-w-[150px] sm:max-w-[200px]"
                        title={file.name}
                      >
                        {file.name}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        ({formatFileSize(file.size)})
                      </span>
                      <button
                        type="button"
                        onClick={() => removeAttachment(idx)}
                        className="ml-1 text-gray-400 hover:text-red-500 p-0.5 rounded transition-colors focus:outline-none"
                        title={`Remove attachment ${file.name}`}
                        aria-label={`Remove attachment ${file.name}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Footer Action Bar */}
            <div className="h-14 px-4 bg-gray-50/90 dark:bg-gray-800/80 border-t border-gray-200/80 dark:border-gray-700/80 flex items-center justify-between shrink-0">
              {/* Left Actions: Send & Attach */}
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  onClick={handleSend}
                  disabled={sending}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs sm:text-sm px-4 h-9 shadow-sm gap-2"
                >
                  {sending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Sending...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Send</span>
                    </>
                  )}
                </Button>

                {/* Attach File Button */}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100 h-9 px-2.5"
                  title="Attach files"
                  aria-label="Attach files"
                >
                  <Paperclip className="w-4 h-4" />
                </Button>
              </div>

              {/* Right Action: Discard */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  clearDraft();
                  closeCompose();
                }}
                className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 h-9 px-2.5"
                title="Discard draft"
                aria-label="Discard draft"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default ComposeModal;
