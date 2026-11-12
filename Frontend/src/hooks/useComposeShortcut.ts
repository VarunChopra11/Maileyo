import { useEffect } from "react";

export interface UseComposeShortcutOptions {
  enabled?: boolean;
  onTrigger: () => void;
}

/**
 * Global keyboard shortcut hook that listens for 'c' or 'C' keydown events.
 * Safely ignores events when focus is inside text input elements, textareas,
 * select dropdowns, or contenteditable regions.
 * Also strictly guards against modifier keys (Ctrl+C, Cmd+C, Alt+C).
 */
export function useComposeShortcut({
  enabled = true,
  onTrigger,
}: UseComposeShortcutOptions): void {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // 1. Guard against modifier keys: Ctrl+C (copy), Cmd+C (mac copy), Alt+C
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      // 2. Only respond to key 'c' or 'C'
      if (event.key !== "c" && event.key !== "C") {
        return;
      }

      // 3. Inspect target element to protect input fields and editors
      const target = event.target as HTMLElement | null;
      if (target) {
        const tagName = target.tagName ? target.tagName.toLowerCase() : "";

        // Form elements
        if (tagName === "input" || tagName === "textarea" || tagName === "select") {
          return;
        }

        // Direct contentEditable
        if (target.isContentEditable) {
          return;
        }

        // Nested inside editable regions or form elements
        if (
          target.closest?.("[contenteditable='true']") ||
          target.closest?.("input, textarea, select")
        ) {
          return;
        }
      }

      // 4. Prevent default browser scroll/action and trigger compose
      event.preventDefault();
      onTrigger();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [enabled, onTrigger]);
}

export default useComposeShortcut;
