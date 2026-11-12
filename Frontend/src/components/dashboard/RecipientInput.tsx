import React, { useState, useRef, useEffect, useCallback, useId } from "react";
import { X, AlertCircle, User } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EmailContact } from "@/types/email";
import {
  validateEmail,
  tokenizeRecipients,
  filterAutocomplete,
} from "@/lib/recipientUtils";

export interface RecipientInputProps {
  label: string;
  value: string[];
  onChange: (recipients: string[]) => void;
  contacts?: EmailContact[];
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  className?: string;
  rightControls?: React.ReactNode;
}

export function RecipientInput({
  label,
  value = [],
  onChange,
  contacts = [],
  placeholder = "Recipients (e.g. user@example.com)",
  autoFocus = false,
  disabled = false,
  className,
  rightControls,
}: RecipientInputProps) {
  const [inputValue, setInputValue] = useState<string>("");
  const [isFocused, setIsFocused] = useState<boolean>(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listboxId = useId();

  // Filter contacts excluding already-added addresses
  const existingSet = new Set(value.map((v) => v.toLowerCase()));
  const filteredSuggestions = filterAutocomplete(inputValue, contacts).filter(
    (c) => !existingSet.has(c.email.toLowerCase())
  );

  // Auto-focus support
  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
    }
  }, [autoFocus]);

  // Adjust highlighted index and dropdown open state when suggestions change
  useEffect(() => {
    setHighlightedIndex(0);
    if (inputValue.trim().length > 0 && filteredSuggestions.length > 0 && isFocused) {
      setIsDropdownOpen(true);
    } else {
      setIsDropdownOpen(false);
    }
  }, [inputValue, filteredSuggestions.length, isFocused]);

  // Clean up blur timer on unmount
  useEffect(() => {
    return () => {
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    };
  }, []);

  const commitTokens = useCallback(
    (raw: string) => {
      const newTokens = tokenizeRecipients(raw);
      if (newTokens.length === 0) return;

      const currentUnique = new Set(value.map((v) => v.toLowerCase()));
      const toAdd: string[] = [];

      for (const token of newTokens) {
        const lower = token.toLowerCase();
        if (!currentUnique.has(lower)) {
          currentUnique.add(lower);
          toAdd.push(token);
        }
      }

      if (toAdd.length > 0) {
        onChange([...value, ...toAdd]);
      }
      setInputValue("");
      setIsDropdownOpen(false);
    },
    [value, onChange]
  );

  const removeChip = useCallback(
    (indexToRemove: number) => {
      onChange(value.filter((_, idx) => idx !== indexToRemove));
      inputRef.current?.focus();
    },
    [value, onChange]
  );

  const selectContact = useCallback(
    (contact: EmailContact) => {
      commitTokens(contact.email);
      setInputValue("");
      setIsDropdownOpen(false);
      inputRef.current?.focus();
    },
    [commitTokens]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Dropdown Navigation
    if (isDropdownOpen && filteredSuggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev + 1) % filteredSuggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex(
          (prev) => (prev - 1 + filteredSuggestions.length) % filteredSuggestions.length
        );
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        selectContact(filteredSuggestions[highlightedIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setIsDropdownOpen(false);
        return;
      }
    }

    // Standard Chip Creation Triggers
    if (e.key === "Enter" || e.key === "Tab") {
      if (inputValue.trim().length > 0) {
        e.preventDefault();
        commitTokens(inputValue);
      }
      return;
    }

    if (e.key === "," || e.key === " ") {
      if (inputValue.trim().length > 0) {
        e.preventDefault();
        commitTokens(inputValue);
      } else if (e.key === ",") {
        e.preventDefault();
      }
      return;
    }

    // Chip Deletion Trigger: Backspace on empty input
    if (e.key === "Backspace" && inputValue === "" && value.length > 0) {
      e.preventDefault();
      removeChip(value.length - 1);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text");
    if (!pasted) return;

    // If paste contains multiple addresses or delimiters
    if (/[\s,;\n\r\t]/.test(pasted) || pasted.includes("@")) {
      e.preventDefault();
      commitTokens(pasted);
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    if (inputValue.trim().length > 0) {
      commitTokens(inputValue);
    }
    // Delay closing dropdown so click on suggestion can register
    blurTimerRef.current = setTimeout(() => {
      setIsDropdownOpen(false);
    }, 150);
  };

  const handleFocus = () => {
    setIsFocused(true);
    if (inputValue.trim().length > 0 && filteredSuggestions.length > 0) {
      setIsDropdownOpen(true);
    }
  };

  return (
    <div
      ref={containerRef}
      onClick={() => inputRef.current?.focus()}
      className={cn(
        "relative flex items-center flex-wrap gap-1.5 px-4 py-1.5 min-h-[40px] border-b border-gray-100 dark:border-gray-800/60 bg-transparent cursor-text select-none",
        isFocused && "bg-gray-50/30 dark:bg-gray-800/20",
        disabled && "opacity-60 cursor-not-allowed pointer-events-none",
        className
      )}
    >
      {/* Field Label */}
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-10 shrink-0 select-none">
        {label}
      </span>

      {/* Chips Container */}
      <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
        {value.map((email, idx) => {
          const isValid = validateEmail(email);
          return (
            <div
              key={`${email}-${idx}`}
              className={cn(
                "inline-flex items-center gap-1 pl-2.5 pr-1.5 py-0.5 rounded-full text-xs font-medium max-w-full truncate select-none transition-colors",
                isValid
                  ? "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700"
                  : "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border border-red-300 dark:border-red-800"
              )}
              title={isValid ? email : `Invalid email address: ${email}`}
            >
              {!isValid && (
                <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" aria-hidden="true" />
              )}
              <span className="truncate max-w-[200px] sm:max-w-[280px]">{email}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeChip(idx);
                }}
                className={cn(
                  "p-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors focus:outline-none focus:ring-1 focus:ring-indigo-500",
                  !isValid && "text-red-600 dark:text-red-400 hover:bg-red-200/50"
                )}
                aria-label={`Remove recipient ${email}`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}

        {/* Inline Input Field */}
        <div className="relative flex-1 min-w-[120px]">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onFocus={handleFocus}
            onBlur={handleBlur}
            disabled={disabled}
            placeholder={value.length === 0 ? placeholder : ""}
            aria-autocomplete="list"
            aria-expanded={isDropdownOpen}
            aria-controls={isDropdownOpen ? listboxId : undefined}
            className="w-full bg-transparent border-0 p-0 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none h-7"
          />

          {/* Autocomplete Dropdown Listbox */}
          {isDropdownOpen && filteredSuggestions.length > 0 && (
            <div
              ref={dropdownRef}
              id={listboxId}
              role="listbox"
              className="absolute left-0 top-full mt-1.5 w-72 max-w-[calc(100vw-2rem)] max-h-56 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 py-1"
            >
              <div className="px-3 py-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Contacts
              </div>
              {filteredSuggestions.map((contact, idx) => {
                const isSelected = idx === highlightedIndex;
                return (
                  <div
                    key={contact.id || contact.email}
                    role="option"
                    aria-selected={isSelected}
                    onMouseDown={(e) => {
                      e.preventDefault(); // Prevents input blur
                      selectContact(contact);
                    }}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={cn(
                      "px-3 py-2 flex items-center gap-2.5 cursor-pointer text-xs transition-colors",
                      isSelected
                        ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-900 dark:text-indigo-200"
                        : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    )}
                  >
                    <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-[10px] shrink-0">
                      {contact.name ? contact.name.charAt(0).toUpperCase() : <User className="w-3 h-3" />}
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="font-medium truncate">{contact.name || contact.email}</span>
                      {contact.name && (
                        <span className="text-[11px] text-gray-400 dark:text-gray-500 truncate">
                          {contact.email}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right Action Controls Slot (Cc / Bcc toggle buttons or Close row 'X') */}
      {rightControls && (
        <div className="flex items-center gap-1 shrink-0 ml-auto pl-1" onClick={(e) => e.stopPropagation()}>
          {rightControls}
        </div>
      )}
    </div>
  );
}

export default RecipientInput;
