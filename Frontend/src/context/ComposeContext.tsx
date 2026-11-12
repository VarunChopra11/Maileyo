/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import {
  type ComposeDraft,
  type ComposeContextType,
  type EmailMessage,
  DEFAULT_COMPOSE_DRAFT,
  extractCleanEmail,
  formatReplySubject,
  formatForwardSubject,
} from "@/types/email";
import { useComposeShortcut } from "@/hooks/useComposeShortcut";

export {
  DEFAULT_COMPOSE_DRAFT,
  extractCleanEmail,
  formatReplySubject,
  formatForwardSubject,
};

export const defaultComposeContext: ComposeContextType = Object.freeze({
  isOpen: false,
  isMinimized: false,
  isMaximized: false,
  draft: DEFAULT_COMPOSE_DRAFT,
  openCompose: () => {},
  openReply: () => {},
  openForward: () => {},
  closeCompose: () => {},
  minimizeCompose: () => {},
  maximizeCompose: () => {},
  restoreCompose: () => {},
  updateDraft: () => {},
  clearDraft: () => {},
});

const ComposeContext = createContext<ComposeContextType>(defaultComposeContext);

export interface ComposeProviderProps {
  children: ReactNode;
  initialDraft?: Partial<ComposeDraft>;
  enableShortcut?: boolean;
}

export function ComposeProvider({
  children,
  initialDraft,
  enableShortcut = true,
}: ComposeProviderProps) {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [isMaximized, setIsMaximized] = useState<boolean>(false);
  const [draft, setDraft] = useState<ComposeDraft>(() => ({
    ...DEFAULT_COMPOSE_DRAFT,
    ...initialDraft,
  }));

  const openCompose = useCallback((initial?: Partial<ComposeDraft>) => {
    if (initial) {
      setDraft((prev) => ({
        ...DEFAULT_COMPOSE_DRAFT,
        ...prev,
        ...initial,
      }));
    } else {
      setDraft((prev) => {
        // If draft already has content, preserve it
        if (
          prev.bodyHtml ||
          prev.bodyPlain ||
          prev.to.length > 0 ||
          prev.subject ||
          prev.attachments.length > 0
        ) {
          return prev;
        }
        return DEFAULT_COMPOSE_DRAFT;
      });
    }
    setIsOpen(true);
    setIsMinimized(false);
  }, []);

  const openReply = useCallback((message: EmailMessage, threadId?: string) => {
    const replyRecipient = message.isSent
      ? message.to && message.to.length > 0
        ? message.to
        : []
      : [extractCleanEmail(message.from)].filter(Boolean);

    setDraft({
      ...DEFAULT_COMPOSE_DRAFT,
      to: replyRecipient,
      subject: formatReplySubject(message.subject),
      threadId: threadId || message.threadId || message.id,
      inReplyTo: message.id,
      references: message.id,
      replyMode: "reply",
    });
    setIsOpen(true);
    setIsMinimized(false);
    setIsMaximized(false);
  }, []);

  const openForward = useCallback((message: EmailMessage) => {
    const dateStr = message.timestamp
      ? new Date(message.timestamp).toLocaleString()
      : "";

    const originalContent =
      message.cleanBodyHtml ||
      message.bodyHtml ||
      message.cleanBodyPlain ||
      message.bodyPlain ||
      "";

    const fwdBodyHtml = `
      <br><br>
      <div class="gmail_quote">
        <div>---------- Forwarded message ---------</div>
        <div><b>From:</b> ${message.from || "Unknown"}</div>
        <div><b>Date:</b> ${dateStr}</div>
        <div><b>Subject:</b> ${message.subject || "(no subject)"}</div>
        <div><b>To:</b> ${(message.to || []).join(", ")}</div>
        <br>
        <div>${originalContent}</div>
      </div>
    `.trim();

    const fwdBodyPlain = `

---------- Forwarded message ---------
From: ${message.from || "Unknown"}
Date: ${dateStr}
Subject: ${message.subject || "(no subject)"}
To: ${(message.to || []).join(", ")}

${message.cleanBodyPlain || message.bodyPlain || ""}
    `.trim();

    setDraft({
      ...DEFAULT_COMPOSE_DRAFT,
      to: [],
      subject: formatForwardSubject(message.subject),
      bodyHtml: fwdBodyHtml,
      bodyPlain: fwdBodyPlain,
      replyMode: "forward",
    });
    setIsOpen(true);
    setIsMinimized(false);
    setIsMaximized(false);
  }, []);

  const closeCompose = useCallback(() => {
    setIsOpen(false);
    setIsMinimized(false);
    setIsMaximized(false);
  }, []);

  const minimizeCompose = useCallback(() => {
    setIsMinimized((prev) => !prev);
    setIsMaximized(false);
  }, []);

  const maximizeCompose = useCallback(() => {
    setIsMaximized((prev) => !prev);
    setIsMinimized(false);
  }, []);

  const restoreCompose = useCallback(() => {
    setIsMinimized(false);
    setIsMaximized(false);
  }, []);

  const updateDraft = useCallback((updates: Partial<ComposeDraft>) => {
    setDraft((prev) => ({
      ...prev,
      ...updates,
    }));
  }, []);

  const clearDraft = useCallback(() => {
    setDraft(DEFAULT_COMPOSE_DRAFT);
  }, []);

  const handleShortcutTrigger = useCallback(() => {
    setIsOpen(true);
    setIsMinimized(false);
  }, []);

  useComposeShortcut({
    enabled: enableShortcut,
    onTrigger: handleShortcutTrigger,
  });

  const value = useMemo<ComposeContextType>(
    () => ({
      isOpen,
      isMinimized,
      isMaximized,
      draft,
      openCompose,
      openReply,
      openForward,
      closeCompose,
      minimizeCompose,
      maximizeCompose,
      restoreCompose,
      updateDraft,
      clearDraft,
    }),
    [
      isOpen,
      isMinimized,
      isMaximized,
      draft,
      openCompose,
      openReply,
      openForward,
      closeCompose,
      minimizeCompose,
      maximizeCompose,
      restoreCompose,
      updateDraft,
      clearDraft,
    ]
  );

  return (
    <ComposeContext.Provider value={value}>
      {children}
    </ComposeContext.Provider>
  );
}

export const useCompose = (): ComposeContextType => {
  return useContext(ComposeContext);
};
