/**
 * Specification Contracts and Authoritative Algorithms
 * Directly derived from PROJECT.md, ORIGINAL_REQUEST.md, and Backend FastAPI schemas.
 */

import DOMPurify from "dompurify";

export const SIDEBAR_CONSTRAINTS = {
  MIN_WIDTH: 260,
  MAX_WIDTH: 500,
  DEFAULT_WIDTH: 320,
  STORAGE_KEY: "maileyo_contacts_panel_width",
} as const;

export const ATTACHMENT_CONSTRAINTS = {
  MAX_TOTAL_BYTES: 20 * 1024 * 1024, // 20 MB = 20,971,520 bytes
} as const;

export const VIEWPORT_BREAKPOINTS = {
  MOBILE_MAX: 639,
  TABLET_MIN: 640,
  TABLET_MD: 768,
  DESKTOP_MIN: 768,
} as const;

/**
 * Standard RFC 5322 dot-atom compatible email validation regular expression.
 * Disallows leading/trailing/consecutive dots in local-part and domain.
 */
export const RFC5322_EMAIL_REGEX =
  /^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export function clampSidebarWidth(width: number): number {
  if (typeof width !== "number" || isNaN(width)) {
    return SIDEBAR_CONSTRAINTS.DEFAULT_WIDTH;
  }
  return Math.max(
    SIDEBAR_CONSTRAINTS.MIN_WIDTH,
    Math.min(SIDEBAR_CONSTRAINTS.MAX_WIDTH, Math.round(width))
  );
}

export function loadSavedSidebarWidth(storage: {
  getItem(key: string): string | null;
}): number {
  try {
    const raw = storage.getItem(SIDEBAR_CONSTRAINTS.STORAGE_KEY);
    if (!raw) return SIDEBAR_CONSTRAINTS.DEFAULT_WIDTH;
    const parsed = parseInt(raw, 10);
    if (isNaN(parsed)) return SIDEBAR_CONSTRAINTS.DEFAULT_WIDTH;
    return clampSidebarWidth(parsed);
  } catch {
    return SIDEBAR_CONSTRAINTS.DEFAULT_WIDTH;
  }
}

export function validateEmail(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  const trimmed = email.trim();
  if (trimmed.length > 254) return false;
  return RFC5322_EMAIL_REGEX.test(trimmed);
}

export function tokenizeRecipients(raw: string): string[] {
  if (!raw || typeof raw !== "string") return [];
  // Split on comma, semicolon, space, tab, newline
  const tokens = raw
    .split(/[\s,;\n\r\t]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  // Return unique tokens while preserving insertion order
  const unique = new Set<string>();
  const result: string[] = [];
  for (const token of tokens) {
    if (!unique.has(token.toLowerCase())) {
      unique.add(token.toLowerCase());
      result.push(token);
    }
  }
  return result;
}

export function validateTotalAttachmentSize(
  files: Array<{ size: number }>
): { valid: boolean; totalBytes: number; error?: string } {
  const totalBytes = files.reduce((sum, f) => sum + (f.size || 0), 0);
  if (totalBytes > ATTACHMENT_CONSTRAINTS.MAX_TOTAL_BYTES) {
    const mb = (totalBytes / (1024 * 1024)).toFixed(1);
    const maxMb = ATTACHMENT_CONSTRAINTS.MAX_TOTAL_BYTES / (1024 * 1024);
    return {
      valid: false,
      totalBytes,
      error: `Total attachments size (${mb} MB) exceeds maximum allowed limit of ${maxMb} MB.`,
    };
  }
  return { valid: true, totalBytes };
}

export function sanitizeHtmlContent(dirtyHtml: string): string {
  if (!dirtyHtml || typeof dirtyHtml !== "string") return "";

  // If running in browser environment with DOMPurify.sanitize available:
  const dp = DOMPurify as unknown as { sanitize?: (content: string, options?: unknown) => string };
  if (typeof dp.sanitize === "function") {
    return dp.sanitize(dirtyHtml, {
      ALLOWED_TAGS: [
        "b", "i", "u", "s", "em", "strong", "p", "br", "ul", "ol", "li",
        "a", "span", "div", "blockquote", "pre", "code", "h1", "h2", "h3",
        "h4", "table", "thead", "tbody", "tr", "th", "td", "img"
      ],
      ALLOWED_ATTR: ["href", "target", "rel", "class", "style", "src", "alt"],
      FORBID_TAGS: ["script", "iframe", "object", "embed", "applet", "form", "link", "meta"],
      FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur"],
    });
  }

  // Headless pure DOMPurify-conforming sanitization algorithm:
  // 1. Strip forbidden elements: script, iframe, object, embed, applet, form, link, meta
  let clean = dirtyHtml.replace(/<\s*(script|iframe|object|embed|applet|form|link|meta)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
  clean = clean.replace(/<\s*(script|iframe|object|embed|applet|form|link|meta)[^>]*\/?>/gi, "");

  // 2. Strip dangerous event handler attributes
  clean = clean.replace(/\s+on[a-z]+\s*=\s*(['"]).*?\1/gi, "");
  clean = clean.replace(/\s+on[a-z]+\s*=\s*[^>\s]+/gi, "");

  // 3. Strip javascript:, vbscript:, and data: links (handling inner quotes safely)
  clean = clean.replace(
    /href\s*=\s*(['"])\s*(?:javascript:|vbscript:|data:(?:text\/html|application\/javascript|image\/svg\+xml))[^>]*?\1/gi,
    'href="#"'
  );
  clean = clean.replace(
    /href\s*=\s*(?:javascript:|vbscript:|data:(?:text\/html|application\/javascript|image\/svg\+xml))[^\s>]*/gi,
    'href="#"'
  );

  return clean;
}

export interface ComposeDraftState {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  bodyHtml: string;
  bodyPlain: string;
  attachments: Array<{ filename: string; size: number; mimeType: string; content?: string }>;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
  replyMode: "new" | "reply" | "forward";
}

export function createBlankDraft(): ComposeDraftState {
  return {
    to: [],
    cc: [],
    bcc: [],
    subject: "",
    bodyHtml: "",
    bodyPlain: "",
    attachments: [],
    replyMode: "new",
  };
}

export function createReplyDraft(originalMessage: {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  bodyPlain?: string;
  bodyHtml?: string;
  inReplyTo?: string;
  references?: string;
}): ComposeDraftState {
  const subject = originalMessage.subject.startsWith("Re:")
    ? originalMessage.subject
    : `Re: ${originalMessage.subject}`;

  const quotedText = originalMessage.bodyPlain
    ? `\n\n--- On ${new Date().toISOString()}, ${originalMessage.from} wrote:\n> ${originalMessage.bodyPlain.replace(/\n/g, "\n> ")}`
    : "";

  const quotedHtml = originalMessage.bodyHtml
    ? `<br><br><blockquote>--- Original Message ---<br>From: ${originalMessage.from}<br>${originalMessage.bodyHtml}</blockquote>`
    : "";

  const references = originalMessage.references
    ? `${originalMessage.references} <${originalMessage.id}>`
    : `<${originalMessage.id}>`;

  return {
    to: [originalMessage.from],
    cc: [],
    bcc: [],
    subject,
    bodyPlain: quotedText,
    bodyHtml: quotedHtml,
    attachments: [],
    threadId: originalMessage.threadId,
    inReplyTo: `<${originalMessage.id}>`,
    references,
    replyMode: "reply",
  };
}

export function createForwardDraft(originalMessage: {
  id: string;
  subject: string;
  bodyPlain?: string;
  bodyHtml?: string;
  from: string;
}): ComposeDraftState {
  const subject = originalMessage.subject.startsWith("Fwd:")
    ? originalMessage.subject
    : `Fwd: ${originalMessage.subject}`;

  const quotedText = `\n\n---------- Forwarded message ---------\nFrom: ${originalMessage.from}\n\n${originalMessage.bodyPlain || ""}`;
  const quotedHtml = `<br><br><div class="gmail_quote"><div>---------- Forwarded message ---------</div><div>From: ${originalMessage.from}</div><br>${originalMessage.bodyHtml || ""}</div>`;

  return {
    to: [],
    cc: [],
    bcc: [],
    subject,
    bodyPlain: quotedText,
    bodyHtml: quotedHtml,
    attachments: [],
    replyMode: "forward",
  };
}

export function evaluateMasterDetailView(
  viewportWidth: number,
  selectedContactId: string | null
): "contact-list" | "chat-area" | "split" {
  if (viewportWidth >= VIEWPORT_BREAKPOINTS.TABLET_MD) {
    return "split";
  }
  return selectedContactId ? "chat-area" : "contact-list";
}
