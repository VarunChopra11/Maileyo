import { useEffect, useCallback, useRef, useState, useMemo } from "react";
import { EmailContact, EmailMessage, EmailAttachment } from "@/types/email";
import MessageBubble from "./MessageBubble";
import ComposeMessage from "./ComposeMessage";
import { emailService } from "@/services/emailService";
import { useCompose } from "@/context/ComposeContext";
import { toast } from "sonner";
import {
  Loader2,
  Layers,
  ArrowLeft,
  ChevronDown,
  Check,
  Plus,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface ChatAreaProps {
  selectedContact: EmailContact | null;
  messages: EmailMessage[];
  loading: boolean;
  pageToken: string;
  onMessagesUpdate: (messages: EmailMessage[], pageToken: string) => void;
  onLoadingChange: (loading: boolean) => void;
  onMessageSent: (message: EmailMessage) => void;
  onCompose?: () => void;
  onBackToContacts?: () => void;
  onBack?: () => void;
}

interface EmailHeader {
  name: string;
  value: string;
}

interface EmailBody {
  data?: string;
  size?: number;
  attachmentId?: string;
}

interface EmailPart {
  mimeType: string;
  body?: EmailBody;
  filename?: string;
  parts?: EmailPart[];
}

interface EmailPayload {
  headers?: EmailHeader[];
  body?: EmailBody;
  parts?: EmailPart[];
}

interface ParsedAttachment {
  filename: string;
  mime_type?: string;
  mimeType?: string;
  size: number;
  attachment_id?: string;
  attachmentId?: string;
  content?: string;
}

interface ParsedContent {
  id: string;
  thread_id: string;
  subject: string;
  from: string;
  to: string;
  cc?: string;
  body_html: string;
  body_plain: string;
  clean_body_html: string;
  quoted_body_html: string;
  clean_body_plain: string;
  quoted_body_plain: string;
  attachments: ParsedAttachment[];
  inline_attachments: ParsedAttachment[];
}

interface RawEmail {
  id: string;
  threadId: string;
  payload?: EmailPayload;
  internalDate: string;
  labelIds?: string[];
  parsed_content?: ParsedContent;
}

export interface ThreadGroup {
  threadId: string;
  subject: string;
  latestTimestamp: string;
  labels: string[];
  unread: boolean;
  messages: EmailMessage[];
}

// Pure static helper functions declared at module level for stable hook references
const decodeBase64UrlSafe = (str: string): string => {
  if (!str) return "";
  try {
    let base64 = str.replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
    const pad = base64.length % 4;
    if (pad) {
      base64 += "=".repeat(4 - pad);
    }
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return str;
  }
};

const extractHeader = (headers: EmailHeader[] | undefined, name: string): string => {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";
};

const extractEmail = (headers: EmailHeader[] | undefined, name: string): string => {
  const headerValue = extractHeader(headers, name);
  if (!headerValue) return "";
  const match = headerValue.match(/<(.+?)>/);
  if (match) return match[1];
  if (headerValue.includes("@")) return headerValue.trim();
  return headerValue;
};

const extractEmails = (headers: EmailHeader[] | undefined, name: string): string[] => {
  const headerValue = extractHeader(headers, name);
  if (!headerValue) return [];
  return headerValue
    .split(",")
    .map((email) => {
      const trimmed = email.trim();
      const match = trimmed.match(/<(.+?)>/);
      if (match) return match[1];
      if (trimmed.includes("@")) return trimmed;
      return null;
    })
    .filter(Boolean) as string[];
};

const extractTextContent = (payload: EmailPayload | undefined): string => {
  if (!payload) return "";
  if (payload.body?.data && (!payload.parts || payload.parts.length === 0)) {
    return decodeBase64UrlSafe(payload.body.data);
  }
  const plainParts: string[] = [];
  const walk = (parts?: EmailPart[]) => {
    if (!parts) return;
    for (const part of parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        plainParts.push(decodeBase64UrlSafe(part.body.data));
      }
      if (part.parts) walk(part.parts);
    }
  };
  walk(payload.parts);
  return plainParts.join("\n");
};

const extractHtmlContent = (payload: EmailPayload | undefined): string => {
  if (!payload) return "";
  if (payload.body?.data && (!payload.parts || payload.parts.length === 0)) {
    return decodeBase64UrlSafe(payload.body.data);
  }
  const htmlParts: string[] = [];
  const walk = (parts?: EmailPart[]) => {
    if (!parts) return;
    for (const part of parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        htmlParts.push(decodeBase64UrlSafe(part.body.data));
      }
      if (part.parts) walk(part.parts);
    }
  };
  walk(payload.parts);
  return htmlParts.join("\n");
};

const extractAttachments = (payload: EmailPayload | undefined) => {
  const attachments: EmailAttachment[] = [];
  const walk = (parts?: EmailPart[]) => {
    if (!parts) return;
    for (const part of parts) {
      if (part.filename && part.body?.attachmentId) {
        attachments.push({
          filename: part.filename,
          mimeType: part.mimeType,
          size: part.body.size ?? 0,
          attachmentId: part.body.attachmentId,
        });
      }
      if (part.parts) walk(part.parts);
    }
  };
  walk(payload?.parts);
  return attachments;
};

function ChatArea({
  selectedContact,
  messages,
  loading,
  pageToken,
  onMessagesUpdate,
  onLoadingChange,
  onMessageSent,
  onCompose,
  onBackToContacts,
  onBack,
}: ChatAreaProps) {
  const composeContext = useCompose();
  const handleCompose = onCompose || composeContext?.openCompose;
  const handleBack = onBackToContacts || onBack;

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [activeReplyThreadId, setActiveReplyThreadId] = useState<string | null>(null);
  const [composerExpanded, setComposerExpanded] = useState<boolean>(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const fetchMessages = useCallback(
    async (contact: EmailContact, loadMore = false) => {
      if (!contact) return;

      try {
        onLoadingChange(true);
        const currentPageToken = loadMore ? pageToken : "";
        const response = await emailService.fetchByContact({
          email_address: contact.email,
          max_results: 15,
          page_token: currentPageToken,
        });

        const emailsArray: RawEmail[] = response.emails || [];

        const newMessages: EmailMessage[] = emailsArray.map((email: RawEmail) => {
          const parsed = email.parsed_content;
          if (parsed) {
            return {
              id: email.id,
              threadId: email.threadId || parsed.thread_id || email.id,
              from: parsed.from || extractEmail(email.payload?.headers, "From"),
              to: parsed.to ? [parsed.to] : extractEmails(email.payload?.headers, "To"),
              cc: parsed.cc ? [parsed.cc] : extractEmails(email.payload?.headers, "Cc"),
              subject: parsed.subject || extractHeader(email.payload?.headers, "Subject") || "",
              bodyPlain: parsed.body_plain || extractTextContent(email.payload),
              bodyHtml: parsed.body_html || extractHtmlContent(email.payload),
              cleanBodyHtml: parsed.clean_body_html,
              quotedHtml: parsed.quoted_body_html,
              cleanBodyPlain: parsed.clean_body_plain,
              quotedText: parsed.quoted_body_plain,
              timestamp: new Date(parseInt(email.internalDate)).toISOString(),
              attachments:
                parsed.attachments && parsed.attachments.length > 0
                  ? parsed.attachments.map((att) => ({
                      filename: att.filename,
                      mimeType: att.mime_type || att.mimeType || "",
                      size: att.size,
                      attachmentId: att.attachment_id || att.attachmentId,
                    }))
                  : extractAttachments(email.payload),
              isSent: email.labelIds?.includes("SENT") || false,
              labels: email.labelIds || [],
            };
          }

          return {
            id: email.id,
            threadId: email.threadId || email.id,
            from: extractEmail(email.payload?.headers, "From"),
            to: extractEmails(email.payload?.headers, "To"),
            cc: extractEmails(email.payload?.headers, "Cc"),
            subject: extractHeader(email.payload?.headers, "Subject") || "",
            bodyPlain: extractTextContent(email.payload),
            bodyHtml: extractHtmlContent(email.payload),
            timestamp: new Date(parseInt(email.internalDate)).toISOString(),
            attachments: extractAttachments(email.payload),
            isSent: email.labelIds?.includes("SENT") || false,
            labels: email.labelIds || [],
          };
        });

        const existingIds = new Set(loadMore ? messages.map((m) => m.id) : []);
        const filteredNew = newMessages.filter((m) => !existingIds.has(m.id));
        const updatedMessages = loadMore ? [...messages, ...filteredNew] : newMessages;

        updatedMessages.sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        onMessagesUpdate(updatedMessages, response.next_page_token || "");

        const unreadIds = newMessages
          .filter((m) => m.labels.includes("UNREAD") && !m.isSent)
          .map((m) => m.id);

        if (unreadIds.length > 0) {
          emailService.markAsRead(unreadIds).catch((err) => {
            console.error("Failed to mark messages as read:", err);
          });
        }
      } catch (error) {
        console.error("Failed to fetch messages:", error);
        toast.error("Failed to load messages");
      } finally {
        onLoadingChange(false);
      }
    },
    [messages, pageToken, onMessagesUpdate, onLoadingChange]
  );

  useEffect(() => {
    if (selectedContact) {
      setSelectedThreadId(null);
      setActiveReplyThreadId(null);
      setComposerExpanded(false);
      fetchMessages(selectedContact);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedContact?.email]);

  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom();
    }
  }, [messages.length, selectedThreadId]);

  // Group messages into distinct Thread Container Groups
  const threadGroups: ThreadGroup[] = useMemo(() => {
    const map = new Map<string, ThreadGroup>();

    for (const msg of messages) {
      const tid = msg.threadId || msg.id;
      const existing = map.get(tid);

      if (!existing) {
        map.set(tid, {
          threadId: tid,
          subject: msg.subject || "No Subject",
          latestTimestamp: msg.timestamp,
          labels: [...msg.labels],
          unread: msg.labels.includes("UNREAD"),
          messages: [msg],
        });
      } else {
        existing.messages.push(msg);
        if (new Date(msg.timestamp).getTime() > new Date(existing.latestTimestamp).getTime()) {
          existing.latestTimestamp = msg.timestamp;
          if (msg.subject && (!existing.subject || existing.subject === "No Subject")) {
            existing.subject = msg.subject;
          }
        }
        existing.labels = Array.from(new Set([...existing.labels, ...msg.labels]));
        if (msg.labels.includes("UNREAD")) {
          existing.unread = true;
        }
      }
    }

    for (const t of map.values()) {
      t.messages.sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
    }

    return Array.from(map.values()).sort(
      (a, b) => new Date(a.latestTimestamp).getTime() - new Date(b.latestTimestamp).getTime()
    );
  }, [messages]);

  const displayedThreads = useMemo(() => {
    if (!selectedThreadId) return threadGroups;
    return threadGroups.filter((t) => t.threadId === selectedThreadId);
  }, [threadGroups, selectedThreadId]);

  const composerThread = useMemo(() => {
    const targetId = activeReplyThreadId || selectedThreadId;
    if (targetId) {
      return threadGroups.find((t) => t.threadId === targetId) || null;
    }
    return threadGroups.length > 0 ? threadGroups[threadGroups.length - 1] : null;
  }, [threadGroups, activeReplyThreadId, selectedThreadId]);

  const latestMessageInThread = useMemo(() => {
    if (!composerThread || composerThread.messages.length === 0) return null;
    return composerThread.messages[composerThread.messages.length - 1];
  }, [composerThread]);

  const formatThreadDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  const handleReplyToThread = (threadId: string) => {
    setActiveReplyThreadId(threadId);
    setComposerExpanded(true);
  };

  const handleLoadMore = () => {
    if (pageToken && !loading && selectedContact) {
      fetchMessages(selectedContact, true);
    }
  };

  if (!selectedContact) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white dark:bg-gray-900 p-6">
        <div className="text-center p-8 max-w-sm flex flex-col items-center">
          <img
            src="/LogoPNG.png"
            alt="Maileyo"
            className="w-20 h-20 mx-auto mb-5 opacity-80"
          />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
            No Conversation Selected
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">
            Choose a contact or message from the list on the left to read and reply, or start a new conversation right away.
          </p>
          <button
            type="button"
            onClick={() => handleCompose?.()}
            aria-label="Compose new email"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-medium text-sm shadow-sm hover:shadow-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 cursor-pointer group"
          >
            <Plus className="w-4 h-4 transition-transform group-hover:rotate-90 duration-200" />
            <span>Compose New Email</span>
          </button>
          <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1.5 mt-3">
            <span>Press</span>
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-2xs">C</kbd>
            <span>anywhere to compose</span>
          </p>
        </div>
      </div>
    );
  }

  const selectedThreadObj = selectedThreadId
    ? threadGroups.find((t) => t.threadId === selectedThreadId)
    : null;

  return (
    <div className="flex-1 flex flex-col bg-gray-50/60 dark:bg-gray-900/60 h-full min-h-0 overflow-hidden">
      {/* Contact Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200/80 dark:border-gray-800 px-3 sm:px-5 py-2.5 sm:py-3 flex items-center justify-between shrink-0 shadow-2xs">
        <div className="flex items-center min-w-0 gap-2 sm:gap-3">
          {/* Mobile Back Button: Visible only on <md screens */}
          <button
            type="button"
            onClick={() => handleBack?.()}
            aria-label="Back to contacts list"
            title="Back to contacts list"
            className="md:hidden inline-flex items-center justify-center -ml-1 p-2.5 min-h-[44px] min-w-[44px] rounded-xl text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5 shrink-0" />
            <span className="sr-only">Back to contacts</span>
          </button>

          <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-full flex items-center justify-center text-white font-semibold text-sm shrink-0 shadow-xs">
            {selectedContact.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
              {selectedContact.name}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {selectedContact.email}
            </p>
          </div>
        </div>

        {/* Right Header: Thread Switcher or Breadcrumb */}
        <div className="flex items-center gap-2 shrink-0">
          {selectedThreadId ? (
            <button
              type="button"
              onClick={() => {
                setSelectedThreadId(null);
                setActiveReplyThreadId(null);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors border border-gray-200/60 dark:border-gray-700/60"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>All conversations</span>
            </button>
          ) : threadGroups.length > 1 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100/80 dark:bg-gray-800/80 hover:bg-gray-200/80 dark:hover:bg-gray-750 rounded-lg transition-colors border border-gray-200/60 dark:border-gray-700/60 shadow-2xs"
                >
                  <Layers className="w-3.5 h-3.5 text-indigo-500" />
                  <span>{threadGroups.length} Conversations</span>
                  <ChevronDown className="w-3.5 h-3.5 text-gray-400 ml-0.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 max-h-80 overflow-y-auto">
                <DropdownMenuItem
                  onClick={() => {
                    setSelectedThreadId(null);
                    setActiveReplyThreadId(null);
                  }}
                  className="flex items-center justify-between text-xs py-2 font-medium cursor-pointer"
                >
                  <span>All Conversations</span>
                  <span className="text-gray-400">({messages.length} total)</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {threadGroups.map((tg) => {
                  const isCur = selectedThreadId === tg.threadId;
                  return (
                    <DropdownMenuItem
                      key={tg.threadId}
                      onClick={() => {
                        setSelectedThreadId(tg.threadId);
                        setActiveReplyThreadId(tg.threadId);
                      }}
                      className={`flex flex-col items-start gap-0.5 text-xs py-2 cursor-pointer ${
                        isCur
                          ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-semibold"
                          : ""
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="truncate max-w-[210px]">
                          {tg.subject || "No Subject"}
                        </span>
                        {isCur && <Check className="w-3 h-3 text-indigo-600 shrink-0" />}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-gray-400">
                        <span>{formatThreadDate(tg.latestTimestamp)}</span>
                        <span>·</span>
                        <span>{tg.messages.length} msg</span>
                      </div>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </header>

      {/* Filter Banner (if single thread is isolated) */}
      {selectedThreadObj && (
        <div className="bg-indigo-50/70 dark:bg-indigo-950/30 border-b border-indigo-100 dark:border-indigo-900/40 px-5 py-2 flex items-center justify-between text-xs shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-indigo-600 dark:text-indigo-400 font-medium shrink-0">Viewing thread:</span>
            <strong className="text-gray-900 dark:text-gray-100 truncate min-w-0 flex-1 max-w-full">
              {selectedThreadObj.subject}
            </strong>
          </div>
          <button
            type="button"
            onClick={() => setSelectedThreadId(null)}
            className="text-indigo-600 dark:text-indigo-400 hover:underline shrink-0 ml-3 font-medium"
          >
            Clear filter
          </button>
        </div>
      )}

      {/* Main Email Reading Stream (Full height, maximum focus) */}
      <div
        ref={messagesContainerRef}
        className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-5 space-y-6"
      >
        {loading && messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-56 space-y-3">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
            <p className="text-xs text-gray-400">Loading conversation&hellip;</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-56">
            <div className="text-center max-w-sm">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
                No messages found with this contact
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Use the composer below to start a new email conversation.
              </p>
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Load Earlier Emails */}
            {pageToken && (
              <div className="text-center pb-2">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={loading}
                  className="px-3.5 py-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-full transition-colors disabled:opacity-50 inline-flex items-center gap-1.5 border border-indigo-200 dark:border-indigo-800"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Loading earlier emails&hellip;</span>
                    </>
                  ) : (
                    <span>Load earlier emails</span>
                  )}
                </button>
              </div>
            )}

            {/* Conversation Threads */}
            {displayedThreads.map((thread) => (
              <section key={thread.threadId} className="space-y-3">
                {/* Clean, Subtle Conversation Subject Header (shown once per thread) */}
                <div className="sticky top-0 z-10 py-1.5 bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur-xs flex items-center justify-between border-b border-gray-200/60 dark:border-gray-800">
                  <div className="flex items-center gap-2 min-w-0">
                    <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider truncate">
                      {thread.subject || "No Subject"}
                    </h3>
                    {thread.messages.length > 1 && (
                      <span className="text-[10px] font-semibold text-gray-500 bg-gray-200/80 dark:bg-gray-800 px-1.5 py-0.5 rounded-full shrink-0">
                        {thread.messages.length} emails
                      </span>
                    )}
                  </div>
                  <time className="text-[11px] text-gray-400 shrink-0 ml-2">
                    {formatThreadDate(thread.latestTimestamp)}
                  </time>
                </div>

                {/* Email Messages in this thread */}
                <div className="space-y-3">
                  {thread.messages.map((message) => (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      isCurrentUser={message.isSent}
                      onReply={() =>
                        composeContext?.openReply
                          ? composeContext.openReply(message, thread.threadId)
                          : handleReplyToThread(thread.threadId)
                      }
                      onForward={() => composeContext?.openForward(message)}
                    />
                  ))}
                </div>
              </section>
            ))}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Context-Aware Collapsible / Expandable Composer */}
      <ComposeMessage
        selectedContact={selectedContact}
        onMessageSent={onMessageSent}
        activeThreadId={composerThread?.threadId}
        activeThreadSubject={composerThread?.subject}
        latestMessageInThread={latestMessageInThread}
        onClearThread={() => {
          setActiveReplyThreadId(null);
          setSelectedThreadId(null);
        }}
        externalExpanded={composerExpanded}
        onToggleExpand={setComposerExpanded}
      />
    </div>
  );
}

export default ChatArea;
