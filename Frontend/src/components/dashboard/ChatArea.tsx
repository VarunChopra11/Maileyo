import { useEffect, useCallback, useRef, useState, useMemo } from "react";
import { EmailContact, EmailMessage } from "@/types/email";
import MessageBubble from "./MessageBubble";
import ComposeMessage from "./ComposeMessage";
import { emailService } from "@/services/emailService";
import { toast } from "sonner";
import { Loader2, Mail, Layers, MessageSquareReply, ArrowLeft } from "lucide-react";

interface ChatAreaProps {
  selectedContact: EmailContact | null;
  messages: EmailMessage[];
  loading: boolean;
  pageToken: string;
  onMessagesUpdate: (messages: EmailMessage[], pageToken: string) => void;
  onLoadingChange: (loading: boolean) => void;
  onMessageSent: (message: EmailMessage) => void;
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
  attachments: any[];
  inline_attachments: any[];
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

function ChatArea({
  selectedContact,
  messages,
  loading,
  pageToken,
  onMessagesUpdate,
  onLoadingChange,
  onMessageSent,
}: ChatAreaProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [activeReplyThreadId, setActiveReplyThreadId] = useState<string | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Robust crash-free Base64URL decoder with TextDecoder
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

  // Recursive parts traversal supporting arbitrary nesting
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
    // Check top-level single-part HTML
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
    const attachments: any[] = [];
    const walk = (parts?: EmailPart[]) => {
      if (!parts) return;
      for (const part of parts) {
        if (part.filename && part.body?.attachmentId) {
          attachments.push({
            filename: part.filename,
            mimeType: part.mimeType,
            size: part.body.size,
            attachmentId: part.body.attachmentId,
          });
        }
        if (part.parts) walk(part.parts);
      }
    };
    walk(payload?.parts);
    return attachments;
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

        // Transform response to EmailMessage format
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
              attachments: parsed.attachments && parsed.attachments.length > 0
                ? parsed.attachments.map(att => ({
                    filename: att.filename,
                    mimeType: att.mime_type || att.mimeType,
                    size: att.size,
                    attachmentId: att.attachment_id || att.attachmentId
                  }))
                : extractAttachments(email.payload),
              isSent: email.labelIds?.includes("SENT") || false,
              labels: email.labelIds || [],
            };
          }

          // Fallback extraction
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

        // Deduplicate messages by message ID
        const existingIds = new Set(loadMore ? messages.map((m) => m.id) : []);
        const filteredNew = newMessages.filter((m) => !existingIds.has(m.id));
        const updatedMessages = loadMore ? [...messages, ...filteredNew] : newMessages;

        // Sort messages by timestamp ascending
        updatedMessages.sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        onMessagesUpdate(updatedMessages, response.next_page_token || "");

        // Explicit mark as read on view
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
      fetchMessages(selectedContact);
    }
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

    // Sort messages inside each thread chronologically
    for (const t of map.values()) {
      t.messages.sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
    }

    // Sort threads by latest message timestamp ascending
    return Array.from(map.values()).sort(
      (a, b) => new Date(a.latestTimestamp).getTime() - new Date(b.latestTimestamp).getTime()
    );
  }, [messages]);

  // Active threads to render (single thread or unified stream)
  const displayedThreads = useMemo(() => {
    if (!selectedThreadId) return threadGroups;
    return threadGroups.filter((t) => t.threadId === selectedThreadId);
  }, [threadGroups, selectedThreadId]);

  // Determine active thread for composer binding
  const composerThread = useMemo(() => {
    const targetId = activeReplyThreadId || selectedThreadId;
    if (targetId) {
      return threadGroups.find((t) => t.threadId === targetId) || null;
    }
    // Default to the latest active thread if available
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

  const handleLoadMore = () => {
    if (pageToken && !loading && selectedContact) {
      fetchMessages(selectedContact, true);
    }
  };

  if (!selectedContact) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white dark:bg-gray-900 -mt-20">
        <div className="text-center p-8">
          <img src="/LogoPNG.png" alt="Maileyo" className="w-32 h-32 mx-auto mb-4 opacity-90" />
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
            Work Effortlessly With Maileyo
          </h1>
          <p className="text-gray-500 dark:text-gray-400 max-w-sm mx-auto text-sm">
            Select a contact to view conversations and reply across threads.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-50/70 dark:bg-gray-900/70 h-full min-h-0">
      {/* Contact Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-5 py-3 flex items-center justify-between shadow-xs">
        <div className="flex items-center min-w-0">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-full flex items-center justify-center text-white font-semibold text-base shadow-sm flex-shrink-0">
            {selectedContact.name.charAt(0).toUpperCase()}
          </div>
          <div className="ml-3 min-w-0">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white truncate">
              {selectedContact.name}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {selectedContact.email}
            </p>
          </div>
        </div>

        {selectedThreadId && (
          <button
            onClick={() => {
              setSelectedThreadId(null);
              setActiveReplyThreadId(null);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Show all threads</span>
          </button>
        )}
      </div>

      {/* Thread Strip (Pill Carousel) */}
      {threadGroups.length > 0 && (
        <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-md border-b border-gray-200 dark:border-gray-700 px-4 py-2 flex items-center space-x-2 overflow-x-auto sleek-scrollbar">
          <div className="flex items-center text-xs font-medium text-gray-400 mr-1 flex-shrink-0">
            <Layers className="w-3.5 h-3.5 mr-1" />
            <span>Threads:</span>
          </div>

          <button
            type="button"
            onClick={() => {
              setSelectedThreadId(null);
              setActiveReplyThreadId(null);
            }}
            className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5 flex-shrink-0 ${
              selectedThreadId === null
                ? "bg-indigo-600 text-white shadow-xs font-semibold"
                : "bg-gray-100 dark:bg-gray-700/80 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
            }`}
          >
            <span>All Threads</span>
            <span
              className={`px-1.5 py-0.2 text-[10px] rounded-full ${
                selectedThreadId === null ? "bg-white/20 text-white" : "bg-gray-200 dark:bg-gray-600"
              }`}
            >
              {threadGroups.length}
            </span>
          </button>

          {threadGroups.map((thread) => {
            const isSelected = selectedThreadId === thread.threadId;
            return (
              <button
                key={thread.threadId}
                type="button"
                onClick={() => {
                  setSelectedThreadId(thread.threadId);
                  setActiveReplyThreadId(thread.threadId);
                }}
                className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5 flex-shrink-0 max-w-[240px] ${
                  isSelected
                    ? "bg-indigo-600 text-white shadow-xs font-semibold"
                    : "bg-gray-100 dark:bg-gray-700/80 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                }`}
              >
                {thread.unread && (
                  <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />
                )}
                <span className="truncate">{thread.subject || "No Subject"}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full flex-shrink-0 ${
                    isSelected ? "bg-white/20 text-white" : "bg-gray-200 dark:bg-gray-600"
                  }`}
                >
                  {thread.messages.length}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Messages / Thread Containers Stream */}
      <div
        ref={messagesContainerRef}
        className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 space-y-6"
      >
        {loading && messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 space-y-2">
            <Loader2 className="w-7 h-7 animate-spin text-indigo-500" />
            <p className="text-xs text-gray-400">Loading conversation history...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-48">
            <div className="text-center p-6 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-800">
              <Mail className="w-8 h-8 text-gray-400 mx-auto mb-2 opacity-60" />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                No messages found with this contact
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Compose a message below to start a thread.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Load Earlier Messages Button */}
            {pageToken && (
              <div className="text-center mb-2">
                <button
                  onClick={handleLoadMore}
                  disabled={loading}
                  className="px-4 py-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-full transition-colors border border-indigo-200/60 dark:border-indigo-800/60 disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Loading earlier emails...</span>
                    </>
                  ) : (
                    <span>Load earlier emails</span>
                  )}
                </button>
              </div>
            )}

            {/* Render Thread Container Cards */}
            {displayedThreads.map((thread) => (
              <div
                key={thread.threadId}
                className="bg-white/90 dark:bg-gray-800/90 border border-gray-200/80 dark:border-gray-700/80 rounded-2xl shadow-xs overflow-hidden transition-all"
              >
                {/* Thread Card Header */}
                <div className="bg-gray-50/80 dark:bg-gray-800/80 px-4 py-2.5 border-b border-gray-200/70 dark:border-gray-700/70 flex items-center justify-between">
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <Mail className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                      {thread.subject}
                    </h3>
                    {thread.unread && (
                      <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 rounded-full flex-shrink-0">
                        UNREAD
                      </span>
                    )}
                  </div>

                  <div className="flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-400 flex-shrink-0 ml-3">
                    <span className="hidden sm:inline">
                      {formatThreadDate(thread.latestTimestamp)}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveReplyThreadId(thread.threadId);
                        setSelectedThreadId(thread.threadId);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100/70 dark:hover:bg-indigo-950/60 rounded-lg transition-colors"
                      title="Reply inside this thread"
                    >
                      <MessageSquareReply className="w-3.5 h-3.5" />
                      <span>Reply</span>
                    </button>
                  </div>
                </div>

                {/* Message bubbles in this thread */}
                <div className="p-4 space-y-3">
                  {thread.messages.map((message) => (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      isCurrentUser={message.isSent}
                    />
                  ))}
                </div>
              </div>
            ))}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Context-Aware Threaded Composer */}
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
      />
    </div>
  );
}

export default ChatArea;