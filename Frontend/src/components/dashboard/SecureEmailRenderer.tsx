import React, { useEffect, useRef, useState, useMemo } from 'react';
import DOMPurify from 'dompurify';
import { ChevronDown, MoreHorizontal } from 'lucide-react';

interface SecureEmailRendererProps {
  html?: string;
  plainText?: string;
  quotedHtml?: string;
  quotedText?: string;
  isCurrentUser?: boolean;
  className?: string;
}

// Custom Shadow DOM container component
function ShadowContent({
  html,
  isCurrentUser,
}: {
  html: string;
  isCurrentUser?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const shadowRootRef = useRef<ShadowRoot | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    if (!shadowRootRef.current) {
      // Check if shadowRoot already exists on host
      shadowRootRef.current =
        containerRef.current.shadowRoot ||
        containerRef.current.attachShadow({ mode: 'open' });
    }

    const linkColor = isCurrentUser ? '#bfdbfe' : '#2563eb';
    const textColor = isCurrentUser ? '#ffffff' : 'inherit';

    const styles = `
      :host {
        display: block;
        width: 100%;
        color: ${textColor};
        font-family: inherit;
        font-size: 0.9375rem;
        line-height: 1.6;
        word-break: break-word;
        overflow-wrap: anywhere;
      }
      * {
        box-sizing: border-box;
      }
      img {
        max-width: 100% !important;
        height: auto !important;
        border-radius: 4px;
        display: inline-block;
      }
      a {
        color: ${linkColor};
        text-decoration: underline;
        word-break: break-all;
      }
      a:hover {
        opacity: 0.85;
      }
      table {
        border-collapse: collapse;
        max-width: 100% !important;
        overflow-x: auto;
        display: block;
        margin: 8px 0;
      }
      th, td {
        padding: 6px 8px;
        border: 1px solid rgba(128, 128, 128, 0.2);
      }
      pre, code {
        white-space: pre-wrap;
        word-break: break-all;
        font-family: monospace;
        font-size: 0.85em;
        background: rgba(0, 0, 0, 0.06);
        padding: 2px 4px;
        border-radius: 4px;
      }
      blockquote {
        border-left: 3px solid rgba(128, 128, 128, 0.35);
        margin: 8px 0;
        padding-left: 10px;
        opacity: 0.85;
      }
      p {
        margin: 0 0 0.6em 0;
      }
      p:last-child {
        margin-bottom: 0;
      }
      h1, h2, h3, h4, h5, h6 {
        margin: 0.8em 0 0.4em 0;
        line-height: 1.3;
      }
      ul, ol {
        margin: 0.4em 0 0.8em 1.2em;
        padding: 0;
      }
    `;

    // Ensure links open in new tab securely
    const contentWrapper = document.createElement('div');
    contentWrapper.innerHTML = html;
    const links = contentWrapper.querySelectorAll('a');
    links.forEach((a) => {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    });

    if (shadowRootRef.current) {
      shadowRootRef.current.innerHTML = `
        <style>${styles}</style>
        <div class="email-body-content">${contentWrapper.innerHTML}</div>
      `;
    }
  }, [html, isCurrentUser]);

  return <div ref={containerRef} className="secure-shadow-host w-full" />;
}

export const SecureEmailRenderer: React.FC<SecureEmailRendererProps> = ({
  html,
  plainText,
  quotedHtml,
  quotedText,
  isCurrentUser = false,
  className = '',
}) => {
  const [showQuoted, setShowQuoted] = useState(false);

  // Sanitizer options strictly mitigating Stored XSS
  const sanitizeOptions = useMemo(
    () => ({
      ALLOWED_TAGS: [
        'a', 'b', 'blockquote', 'br', 'caption', 'cite', 'code', 'col', 'colgroup',
        'dd', 'div', 'dl', 'dt', 'em', 'font', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'hr', 'i', 'img', 'li', 'ol', 'p', 'pre', 'q', 'small', 'span', 'strike',
        'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead',
        'tr', 'u', 'ul', 'center', 'wbr'
      ],
      ALLOWED_ATTR: [
        'align', 'alt', 'bgcolor', 'border', 'cellpadding', 'cellspacing', 'class',
        'color', 'colspan', 'dir', 'height', 'href', 'id', 'name', 'rowspan',
        'size', 'src', 'style', 'title', 'valign', 'width', 'target', 'rel'
      ],
      ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
      FORBID_TAGS: ['script', 'object', 'embed', 'iframe', 'form', 'input', 'button', 'link', 'meta', 'applet'],
      FORBID_ATTR: [
        'onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur',
        'onkeydown', 'onkeyup', 'onkeypress', 'onsubmit', 'onreset', 'onchange'
      ],
      ALLOW_DATA_ATTR: false,
    }),
    []
  );

  // Partition inline quote if not already separated
  const { cleanHtml, extractedQuotedHtml } = useMemo(() => {
    if (!html) return { cleanHtml: '', extractedQuotedHtml: quotedHtml || '' };

    if (quotedHtml) {
      return { cleanHtml: html, extractedQuotedHtml: quotedHtml };
    }

    // Detect quote containers
    const quoteRegex = /(<div[^>]*class=["\'][^"\']*gmail_quote[^"\']*["\'][\s\S]*?<\/div>|<blockquote[\s\S]*?<\/blockquote>|<div[^>]*id=["\'](?:appendonsend|divRplyFwdMsg|isReplyContent)["\'][\s\S]*?<\/div>)/i;
    const match = html.match(quoteRegex);

    if (match && match.index !== undefined) {
      const clean = html.substring(0, match.index) + html.substring(match.index + match[0].length);
      const quoted = match[0];
      return { cleanHtml: clean.trim() || html, extractedQuotedHtml: quoted };
    }

    return { cleanHtml: html, extractedQuotedHtml: '' };
  }, [html, quotedHtml]);

  // Sanitize both parts
  const sanitizedCleanHtml = useMemo(() => {
    if (!cleanHtml) return '';
    return DOMPurify.sanitize(cleanHtml, sanitizeOptions);
  }, [cleanHtml, sanitizeOptions]);

  const sanitizedQuotedHtml = useMemo(() => {
    if (!extractedQuotedHtml) return '';
    return DOMPurify.sanitize(extractedQuotedHtml, sanitizeOptions);
  }, [extractedQuotedHtml, sanitizeOptions]);

  const hasQuotedContent = Boolean(
    sanitizedQuotedHtml || quotedText || (plainText && plainText.includes('On ') && plainText.includes('wrote:'))
  );

  // Fallback to plain text if no HTML
  if (!sanitizedCleanHtml && !html) {
    if (!plainText) {
      return <span className="text-gray-400 italic text-sm">[No content available]</span>;
    }

    // Partition plain text if needed
    const quoteDividerIdx = plainText.search(/^On\s+[\s\S]+?wrote:\s*$/im);
    const mainText = quoteDividerIdx > -1 ? plainText.slice(0, quoteDividerIdx).trim() : plainText;
    const tailQuote = quoteDividerIdx > -1 ? plainText.slice(quoteDividerIdx).trim() : (quotedText || '');

    return (
      <div className={`space-y-2 ${className}`}>
        <div className="whitespace-pre-wrap break-words">{mainText}</div>
        {tailQuote && (
          <div className="mt-2 pt-2 border-t border-black/10 dark:border-white/10">
            <button
              onClick={() => setShowQuoted(!showQuoted)}
              className={`inline-flex items-center gap-1.5 text-xs font-medium py-1 px-2 rounded-md transition-colors ${
                isCurrentUser
                  ? 'text-blue-100 hover:bg-blue-600/40'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
              <span>{showQuoted ? 'Hide trimmed content' : 'Show trimmed content...'}</span>
            </button>
            {showQuoted && (
              <div className="mt-2 pl-3 border-l-2 border-gray-300 dark:border-gray-600 text-xs opacity-80 whitespace-pre-wrap break-words">
                {tailQuote}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`secure-email-renderer w-full ${className}`}>
      {/* Primary Clean Body inside isolated Shadow DOM boundary */}
      <ShadowContent html={sanitizedCleanHtml} isCurrentUser={isCurrentUser} />

      {/* Collapsible Quoted Content Accordion */}
      {hasQuotedContent && (
        <div className="mt-2 pt-2 border-t border-black/10 dark:border-white/10">
          <button
            type="button"
            onClick={() => setShowQuoted(!showQuoted)}
            className={`inline-flex items-center gap-1.5 text-xs font-medium py-1 px-2.5 rounded-md transition-all ${
              isCurrentUser
                ? 'text-blue-100 hover:bg-white/10'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-200/60 dark:hover:bg-gray-800'
            }`}
          >
            {showQuoted ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <MoreHorizontal className="w-3.5 h-3.5" />
            )}
            <span>{showQuoted ? 'Hide trimmed content' : 'Show trimmed content...'}</span>
          </button>

          {showQuoted && (
            <div className="mt-2 pl-3 border-l-2 border-indigo-300/40 dark:border-indigo-600/40 opacity-85 text-xs overflow-hidden">
              {sanitizedQuotedHtml ? (
                <ShadowContent html={sanitizedQuotedHtml} isCurrentUser={isCurrentUser} />
              ) : (
                <div className="whitespace-pre-wrap break-words text-xs">{quotedText}</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SecureEmailRenderer;
