import React, { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_CONTACTS_WIDTH,
  MIN_CONTACTS_WIDTH,
  MAX_CONTACTS_WIDTH,
} from "@/lib/sidebarPersistence";

export interface ResizableDividerProps {
  /** Current sidebar width in pixels */
  width?: number;
  /** Alias for width */
  currentWidth?: number;
  /** Callback fired continuously during drag with clamped width */
  onResize: (newWidth: number) => void;
  /** Callback fired once dragging ends, suitable for localStorage persistence */
  onResizeEnd?: (finalWidth: number) => void;
  /** Callback fired on double click or Enter key to reset width */
  onReset?: () => void;
  /** Minimum allowable sidebar width (default: 260) */
  minWidth?: number;
  /** Maximum allowable sidebar width (default: 500) */
  maxWidth?: number;
  /** Default width to reset to on double-click (default: 320) */
  defaultWidth?: number;
  /** Controlled dragging state (optional) */
  isDragging?: boolean;
  /** Callback notifying parent when dragging starts or ends */
  onDraggingChange?: (isDragging: boolean) => void;
  /** Additional CSS class names */
  className?: string;
  /** Disable resizing interactions */
  disabled?: boolean;
}

export const ResizableDivider: React.FC<ResizableDividerProps> = ({
  width,
  currentWidth,
  onResize,
  onResizeEnd,
  onReset,
  minWidth = MIN_CONTACTS_WIDTH,
  maxWidth = MAX_CONTACTS_WIDTH,
  defaultWidth = DEFAULT_CONTACTS_WIDTH,
  isDragging: controlledIsDragging,
  onDraggingChange,
  className,
  disabled = false,
}) => {
  const effectiveWidth = currentWidth ?? width ?? defaultWidth;

  const [internalIsDragging, setInternalIsDragging] = useState(false);
  const isDragging = controlledIsDragging ?? internalIsDragging;

  const setIsDragging = useCallback(
    (dragging: boolean) => {
      setInternalIsDragging(dragging);
      onDraggingChange?.(dragging);
    },
    [onDraggingChange]
  );

  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(effectiveWidth);
  const activePointerIdRef = useRef<number | null>(null);
  const dividerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const latestWidthRef = useRef<number>(effectiveWidth);
  const isDragActiveRef = useRef<boolean>(false);

  // Synchronize latest width ref
  useEffect(() => {
    latestWidthRef.current = effectiveWidth;
  }, [effectiveWidth]);

  // Clean up RAF on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || e.button !== 0) return;
    e.preventDefault();

    const pointerId = e.pointerId;
    activePointerIdRef.current = pointerId;
    startXRef.current = e.clientX;
    startWidthRef.current = effectiveWidth;
    latestWidthRef.current = effectiveWidth;
    isDragActiveRef.current = true;

    // Pointer capture prevents drag loss over Shadow DOM or iframes
    if (typeof e.currentTarget.setPointerCapture === "function") {
      try {
        e.currentTarget.setPointerCapture(pointerId);
      } catch {
        // Safe fallback in environments lacking setPointerCapture (e.g. JSDOM)
      }
    }

    setIsDragging(true);
  };

  // Window listeners, global cursor locking, user-select suppression, and RAF throttling
  useEffect(() => {
    if (!isDragging) return;

    // Cache original styles for clean restoration
    const originalCursor = document.body.style.cursor;
    const originalUserSelect = document.body.style.userSelect;
    const originalWebkitUserSelect = (document.body.style as { webkitUserSelect?: string }).webkitUserSelect;

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    (document.body.style as { webkitUserSelect?: string }).webkitUserSelect = "none";

    const handlePointerMove = (e: PointerEvent) => {
      if (!isDragActiveRef.current) return;
      if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) {
        return;
      }

      const deltaX = e.clientX - startXRef.current;
      const targetWidth = startWidthRef.current + deltaX;
      const clampedWidth = Math.min(Math.max(Math.round(targetWidth), minWidth), maxWidth);

      // Boundary re-anchoring: eliminates dead-zone direction reversal lag
      if (targetWidth < minWidth) {
        startXRef.current = e.clientX;
        startWidthRef.current = minWidth;
      } else if (targetWidth > maxWidth) {
        startXRef.current = e.clientX;
        startWidthRef.current = maxWidth;
      }

      latestWidthRef.current = clampedWidth;

      // Throttle layout update to animation frame (60fps/120fps)
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(() => {
          onResize(latestWidthRef.current);
          rafRef.current = null;
        });
      }
    };

    const handlePointerEnd = (e?: PointerEvent) => {
      // Multi-pointer isolation: ignore release events from secondary pointers
      if (
        e &&
        activePointerIdRef.current !== null &&
        e.pointerId !== activePointerIdRef.current
      ) {
        return;
      }

      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      // Release pointer capture
      if (
        dividerRef.current &&
        typeof dividerRef.current.releasePointerCapture === "function" &&
        activePointerIdRef.current !== null
      ) {
        try {
          if (dividerRef.current.hasPointerCapture(activePointerIdRef.current)) {
            dividerRef.current.releasePointerCapture(activePointerIdRef.current);
          }
        } catch {
          // Graceful fallback
        }
      }

      isDragActiveRef.current = false;
      activePointerIdRef.current = null;
      setIsDragging(false);

      // Commit final clamped width respecting minWidth / maxWidth props
      const finalWidth = Math.min(
        Math.max(Math.round(latestWidthRef.current), minWidth),
        maxWidth
      );
      onResize(finalWidth);
      onResizeEnd?.(finalWidth);
    };

    const handleWindowBlur = () => {
      if (isDragActiveRef.current) {
        const activeId = activePointerIdRef.current ?? 0;
        try {
          handlePointerEnd(
            new PointerEvent("pointerup", {
              pointerId: activeId,
            })
          );
        } catch {
          // Fallback if PointerEvent constructor is not available in mock/older environments
          handlePointerEnd();
        }
      }
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      document.body.style.cursor = originalCursor;
      document.body.style.userSelect = originalUserSelect;
      if (originalWebkitUserSelect !== undefined) {
        (document.body.style as { webkitUserSelect?: string }).webkitUserSelect = originalWebkitUserSelect;
      } else {
        document.body.style.removeProperty("-webkit-user-select");
      }

      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
      window.removeEventListener("blur", handleWindowBlur);

      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isDragging, minWidth, maxWidth, onResize, onResizeEnd, setIsDragging]);

  // Double-click reset to default width (320px)
  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;

    if (onReset) {
      onReset();
    } else {
      onResize(defaultWidth);
      onResizeEnd?.(defaultWidth);
    }
  };

  // Keyboard navigation for W3C ARIA accessibility
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const step = e.shiftKey ? 50 : 10;
    let nextWidth: number | null = null;

    if (e.key === "ArrowLeft") {
      nextWidth = Math.max(minWidth, effectiveWidth - step);
    } else if (e.key === "ArrowRight") {
      nextWidth = Math.min(maxWidth, effectiveWidth + step);
    } else if (e.key === "Home") {
      nextWidth = minWidth;
    } else if (e.key === "End") {
      nextWidth = maxWidth;
    } else if (e.key === "Enter") {
      if (onReset) {
        e.preventDefault();
        onReset();
        return;
      }
      nextWidth = defaultWidth;
    }

    if (nextWidth !== null) {
      e.preventDefault();
      const clamped = Math.min(
        Math.max(Math.round(nextWidth), minWidth),
        maxWidth
      );
      onResize(clamped);
      onResizeEnd?.(clamped);
    }
  };

  return (
    <div
      ref={dividerRef}
      role="separator"
      tabIndex={disabled ? -1 : 0}
      aria-orientation="vertical"
      aria-label="Resize contacts sidebar"
      aria-valuenow={effectiveWidth}
      aria-valuemin={minWidth}
      aria-valuemax={maxWidth}
      onPointerDown={handlePointerDown}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        // Layout: 12px hit box cleanly replacing gap-3 gutter between cards
        "relative hidden md:flex items-center justify-center shrink-0",
        "w-3 h-full cursor-col-resize select-none touch-none",
        // Focus accessibility ring
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-xs",
        // Hover group
        "group transition-colors duration-150 z-20",
        isDragging && "cursor-col-resize",
        disabled && "cursor-default pointer-events-none opacity-50",
        className
      )}
    >
      {/* Full-height subtle hairline indicator */}
      <div
        className={cn(
          "absolute inset-y-2 w-px transition-colors duration-150 pointer-events-none",
          isDragging
            ? "bg-blue-500/80 dark:bg-blue-400/80"
            : "bg-transparent group-hover:bg-gray-300 dark:group-hover:bg-gray-700 group-focus-visible:bg-blue-400"
        )}
      />

      {/* Center grab pill handle */}
      <div
        className={cn(
          "relative z-10 rounded-full transition-all duration-150 ease-out pointer-events-none",
          // Default: subtle 24px pill
          "h-6 w-1 bg-gray-300 dark:bg-gray-600",
          // Hover: expands and illuminates
          "group-hover:h-8 group-hover:w-1.5 group-hover:bg-blue-500 dark:group-hover:bg-blue-400",
          "group-focus-visible:h-8 group-focus-visible:w-1.5 group-focus-visible:bg-blue-500",
          // Dragging: prominent 40px pill
          isDragging &&
            "h-10 w-1.5 bg-blue-600 dark:bg-blue-400 shadow-xs ring-2 ring-blue-400/30"
        )}
      />
    </div>
  );
};

export default ResizableDivider;
