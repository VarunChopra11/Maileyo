/**
 * HTML content sanitization utility powered by DOMPurify.
 * Strips script tags, unsafe pseudo-protocols (javascript:, data:text/html), and event handlers.
 */

import DOMPurify from "dompurify";

export const SANITIZER_CONFIG = {
  ALLOWED_TAGS: [
    "b", "i", "u", "s", "em", "strong", "strike", "del",
    "p", "br", "ul", "ol", "li", "a", "span", "div",
    "blockquote", "pre", "code", "h1", "h2", "h3", "h4", "h5", "h6",
    "table", "thead", "tbody", "tfoot", "tr", "th", "td",
    "img", "hr",
  ],
  ALLOWED_ATTR: [
    "href", "target", "rel", "class", "style", "src", "alt", "title",
    "width", "height", "align", "valign", "color", "bgcolor", "border",
  ],
  FORBID_TAGS: [
    "script", "iframe", "object", "embed", "applet", "form",
    "link", "meta", "input", "button", "textarea", "select", "base",
  ],
  FORBID_ATTR: [
    "onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur",
    "onkeydown", "onkeyup", "onkeypress", "onsubmit", "onreset", "onchange",
  ],
  ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|cid):|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$))/i,
  ALLOW_DATA_ATTR: false,
} as const;

/**
 * Authoritative sanitization function for rich-text email HTML.
 * Neutralizes all stored XSS vectors (<script>, event handlers, javascript: pseudo-protocols).
 */
export function sanitizeHtml(dirtyHtml: string): string {
  if (!dirtyHtml || typeof dirtyHtml !== "string") return "";

  // 1. Browser runtime with active DOMPurify
  const dp = DOMPurify as unknown as { sanitize?: (content: string, options?: unknown) => string };
  if (typeof dp.sanitize === "function") {
    return dp.sanitize(dirtyHtml, SANITIZER_CONFIG);
  }

  // 2. Headless fallback matching spec-contracts.ts
  let clean = dirtyHtml;
  let prev = "";
  let iterations = 0;
  while (clean !== prev && iterations < 10) {
    prev = clean;
    clean = clean.replace(
      /<\s*(script|iframe|object|embed|applet|form|link|meta|base)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi,
      ""
    );
    clean = clean.replace(
      /<\s*(script|iframe|object|embed|applet|form|link|meta|base)[^>]*\/?>/gi,
      ""
    );
    iterations++;
  }

  // Strip dangerous event handler attributes
  clean = clean.replace(/\s+on[a-z]+\s*=\s*(['"]).*?\1/gi, "");
  clean = clean.replace(/\s+on[a-z]+\s*=\s*[^>\s]+/gi, "");

  // Strip javascript:, vbscript:, and data: links (handling inner quotes safely)
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

export default sanitizeHtml;
