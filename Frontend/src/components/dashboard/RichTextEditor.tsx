import React, { useRef, useEffect, useState, useCallback } from "react";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Link as LinkIcon,
  RemoveFormatting,
} from "lucide-react";
import { sanitizeHtml } from "@/lib/sanitizer";
import { cn } from "@/lib/utils";

export interface RichTextEditorProps {
  valueHtml: string;
  onChange: (html: string, plainText: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  onSendShortcut?: () => void;
}

interface FormatButton {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  command: string;
  arg?: string;
}

export function RichTextEditor({
  valueHtml,
  onChange,
  placeholder = "Write your email message here...",
  className,
  disabled = false,
  onSendShortcut,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastEmittedHtmlRef = useRef<string>(valueHtml || "");
  const [isEmpty, setIsEmpty] = useState<boolean>(!valueHtml || valueHtml.trim() === "");
  const [activeFormats, setActiveFormats] = useState<Record<string, boolean>>({});

  // Query formatting states for toolbar button active highlights
  const updateActiveFormats = useCallback(() => {
    if (typeof document === "undefined" || disabled) return;
    try {
      setActiveFormats({
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
        strikethrough: document.queryCommandState("strikeThrough"),
        unorderedList: document.queryCommandState("insertUnorderedList"),
        orderedList: document.queryCommandState("insertOrderedList"),
      });
    } catch {
      // QueryCommandState may throw in certain edge environments
    }
  }, [disabled]);

  // Synchronize incoming external HTML (e.g. on reply/forward or initial draft load)
  useEffect(() => {
    if (!editorRef.current) return;
    if (valueHtml !== lastEmittedHtmlRef.current && valueHtml !== editorRef.current.innerHTML) {
      editorRef.current.innerHTML = valueHtml || "";
      lastEmittedHtmlRef.current = valueHtml || "";
      const text = editorRef.current.innerText || editorRef.current.textContent || "";
      setIsEmpty(!text.trim() && (!valueHtml || valueHtml.trim() === ""));
    }
  }, [valueHtml]);

  // Handle user input inside contenteditable
  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    const rawHtml = editorRef.current.innerHTML;
    const rawText = editorRef.current.innerText || editorRef.current.textContent || "";

    const isEffectivelyBlank =
      rawText.trim() === "" &&
      (rawHtml.trim() === "" ||
        rawHtml.trim() === "<br>" ||
        rawHtml.trim() === "<div><br></div>" ||
        rawHtml.trim() === "<p><br></p>");

    const finalHtml = isEffectivelyBlank ? "" : rawHtml;
    const finalText = isEffectivelyBlank ? "" : rawText;

    setIsEmpty(isEffectivelyBlank);
    lastEmittedHtmlRef.current = finalHtml;
    onChange(finalHtml, finalText);
    updateActiveFormats();
  }, [onChange, updateActiveFormats]);

  // Execute standard formatting commands without losing contenteditable selection
  const executeCommand = (command: string, arg: string | undefined = undefined) => {
    if (disabled || !editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(command, false, arg);
    handleInput();
  };

  // Safe hyperlink insertion with protocol validation
  const handleInsertLink = () => {
    if (disabled || !editorRef.current) return;
    const rawUrl = window.prompt("Enter link URL (e.g. https://example.com):", "https://");
    if (!rawUrl || !rawUrl.trim()) return;

    let targetUrl = rawUrl.trim();
    // Neutralize dangerous pseudo-protocols
    if (/^(?:javascript|data|vbscript):/i.test(targetUrl)) {
      alert("Invalid or unsafe link protocol.");
      return;
    }
    // Prepend https:// if no protocol provided or if input is localhost:PORT
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(targetUrl) || /^localhost(?::\d+)?(?:\/|$)/i.test(targetUrl)) {
      targetUrl = `https://${targetUrl}`;
    }

    editorRef.current.focus();
    document.execCommand("createLink", false, targetUrl);

    // Ensure inserted links open safely in new tab
    const anchors = editorRef.current.querySelectorAll("a");
    anchors.forEach((a) => {
      if (a.href === targetUrl || a.getAttribute("href") === targetUrl) {
        a.setAttribute("target", "_blank");
        a.setAttribute("rel", "noopener noreferrer");
      }
    });

    handleInput();
  };

  // Sanitize pasted rich HTML to neutralize XSS payloads immediately
  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const html = e.clipboardData.getData("text/html");
    const text = e.clipboardData.getData("text/plain");

    if (html) {
      const cleanHtml = sanitizeHtml(html);
      document.execCommand("insertHTML", false, cleanHtml);
    } else if (text) {
      document.execCommand("insertText", false, text);
    }
    handleInput();
  };

  // Keydown handler: send shortcut (Cmd/Ctrl+Enter)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      onSendShortcut?.();
    }
  };

  const toolbarButtons: FormatButton[] = [
    { id: "bold", label: "Bold (Ctrl+B)", icon: Bold, command: "bold" },
    { id: "italic", label: "Italic (Ctrl+I)", icon: Italic, command: "italic" },
    { id: "underline", label: "Underline (Ctrl+U)", icon: Underline, command: "underline" },
    { id: "strikethrough", label: "Strikethrough", icon: Strikethrough, command: "strikeThrough" },
  ];

  return (
    <div className={cn("flex flex-col flex-1 min-h-0 bg-white dark:bg-gray-900", className)}>
      {/* Formatting Toolbar */}
      <div
        role="toolbar"
        aria-label="Rich text formatting"
        className="flex items-center gap-0.5 px-3 py-1.5 border-b border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-850/70 shrink-0 select-none overflow-x-auto"
      >
        {toolbarButtons.map((btn) => {
          const Icon = btn.icon;
          const isActive = activeFormats[btn.id] || false;
          return (
            <button
              key={btn.id}
              type="button"
              tabIndex={-1}
              title={btn.label}
              aria-label={btn.label}
              disabled={disabled}
              onMouseDown={(e) => e.preventDefault()} // Keeps editor focus & selection
              onClick={() => executeCommand(btn.command)}
              className={cn(
                "p-1.5 rounded-md transition-colors text-xs flex items-center justify-center",
                isActive
                  ? "bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 font-semibold shadow-2xs"
                  : "text-gray-600 dark:text-gray-300 hover:bg-gray-200/70 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100"
              )}
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          );
        })}

        {/* Separator */}
        <div className="w-[1px] h-4 bg-gray-200 dark:bg-gray-700 mx-1 shrink-0" />

        {/* Bulleted List */}
        <button
          type="button"
          tabIndex={-1}
          title="Bulleted List"
          aria-label="Bulleted List"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => executeCommand("insertUnorderedList")}
          className={cn(
            "p-1.5 rounded-md transition-colors text-xs flex items-center justify-center",
            activeFormats.unorderedList
              ? "bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 font-semibold shadow-2xs"
              : "text-gray-600 dark:text-gray-300 hover:bg-gray-200/70 dark:hover:bg-gray-800"
          )}
        >
          <List className="w-3.5 h-3.5" />
        </button>

        {/* Numbered List */}
        <button
          type="button"
          tabIndex={-1}
          title="Numbered List"
          aria-label="Numbered List"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => executeCommand("insertOrderedList")}
          className={cn(
            "p-1.5 rounded-md transition-colors text-xs flex items-center justify-center",
            activeFormats.orderedList
              ? "bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 font-semibold shadow-2xs"
              : "text-gray-600 dark:text-gray-300 hover:bg-gray-200/70 dark:hover:bg-gray-800"
          )}
        >
          <ListOrdered className="w-3.5 h-3.5" />
        </button>

        {/* Separator */}
        <div className="w-[1px] h-4 bg-gray-200 dark:bg-gray-700 mx-1 shrink-0" />

        {/* Link Insertion */}
        <button
          type="button"
          tabIndex={-1}
          title="Insert Link"
          aria-label="Insert Link"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleInsertLink}
          className="p-1.5 rounded-md transition-colors text-xs flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-200/70 dark:hover:bg-gray-800"
        >
          <LinkIcon className="w-3.5 h-3.5" />
        </button>

        {/* Clear Formatting */}
        <button
          type="button"
          tabIndex={-1}
          title="Clear Formatting"
          aria-label="Clear Formatting"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => executeCommand("removeFormat")}
          className="p-1.5 rounded-md transition-colors text-xs flex items-center justify-center text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 ml-auto"
        >
          <RemoveFormatting className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Editable Area Container */}
      <div
        className="relative flex-1 flex flex-col p-4 min-h-0 overflow-y-auto cursor-text"
        onClick={() => editorRef.current?.focus()}
      >
        {/* Visual Placeholder Overlay */}
        {isEmpty && (
          <div className="absolute top-4 left-4 text-sm text-gray-400 dark:text-gray-500 pointer-events-none select-none">
            {placeholder}
          </div>
        )}

        {/* ContentEditable Div */}
        <div
          ref={editorRef}
          contentEditable={!disabled}
          role="textbox"
          aria-multiline="true"
          aria-label="Email message body"
          onInput={handleInput}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          onKeyUp={updateActiveFormats}
          onMouseUp={updateActiveFormats}
          className={cn(
            "flex-1 w-full outline-hidden text-sm leading-relaxed text-gray-900 dark:text-gray-100 min-h-[140px] focus:outline-none",
            "[&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2",
            "[&_a]:text-indigo-600 [&_a]:dark:text-indigo-400 [&_a]:underline",
            "[&_blockquote]:border-l-2 [&_blockquote]:border-gray-300 [&_blockquote]:dark:border-gray-700 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-gray-500",
            "[&_div.gmail_quote]:mt-3 [&_div.gmail_quote]:border-l-2 [&_div.gmail_quote]:border-indigo-200 [&_div.gmail_quote]:dark:border-indigo-800 [&_div.gmail_quote]:pl-3 [&_div.gmail_quote]:text-xs [&_div.gmail_quote]:text-gray-500"
          )}
        />
      </div>
    </div>
  );
}

export default RichTextEditor;
