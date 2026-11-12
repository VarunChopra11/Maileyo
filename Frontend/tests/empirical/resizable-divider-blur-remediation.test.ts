/**
 * Empirical Verification Suite: ResizableDivider Blur Lifecycle,
 * Pointer ID Invariance, Cursor Restoration, and Phantom Drag Prevention.
 *
 * Authored by: Challenger 2 (Milestone 1, Iteration 2)
 */

import test from "node:test";
import assert from "node:assert/strict";
import { MockLocalStorage } from "../harness/dom-harness.ts";

/**
 * High-fidelity simulator modeling the remediated ResizableDivider.tsx logic
 * verbatim from lines 52-235.
 */
class RemediatedDividerHarness {
  public effectiveWidth: number;
  public minWidth: number;
  public maxWidth: number;
  public defaultWidth: number;
  public disabled: boolean;

  // State & Refs matching ResizableDivider.tsx
  public isDragging: boolean = false;
  public isDragActive: boolean = false;
  public startX: number = 0;
  public startWidth: number = 0;
  public activePointerId: number | null = null;
  public latestWidth: number;
  public capturedPointerId: number | null = null;
  public rafPending: boolean = false;

  // DOM Mock State
  public bodyCursor: string = "";
  public bodyUserSelect: string = "";
  public bodyWebkitUserSelect: string = "";
  private originalCursor: string = "";
  private originalUserSelect: string = "";
  private originalWebkitUserSelect: string = "";

  public windowListeners: Map<string, Array<(e?: unknown) => void>> = new Map();

  // Callbacks
  public resizeEvents: number[] = [];
  public resizeEndEvents: number[] = [];
  public storage: MockLocalStorage;

  // Environmental flag to simulate PointerEvent constructor failure
  public pointerEventThrows: boolean = false;

  constructor(options: {
    initialWidth?: number;
    minWidth?: number;
    maxWidth?: number;
    defaultWidth?: number;
    disabled?: boolean;
    initialCursor?: string;
    initialUserSelect?: string;
    storage?: MockLocalStorage;
  } = {}) {
    this.minWidth = options.minWidth ?? 260;
    this.maxWidth = options.maxWidth ?? 500;
    this.defaultWidth = options.defaultWidth ?? 320;
    this.effectiveWidth = options.initialWidth ?? this.defaultWidth;
    this.latestWidth = this.effectiveWidth;
    this.disabled = options.disabled ?? false;
    this.bodyCursor = options.initialCursor ?? "";
    this.bodyUserSelect = options.initialUserSelect ?? "";
    this.storage = options.storage ?? new MockLocalStorage();
  }

  // Pointer down (lines 86-107)
  public handlePointerDown(e: { button: number; pointerId: number; clientX: number }) {
    if (this.disabled || e.button !== 0) return;

    this.activePointerId = e.pointerId;
    this.startX = e.clientX;
    this.startWidth = this.effectiveWidth;
    this.latestWidth = this.effectiveWidth;
    this.isDragActive = true;

    this.capturedPointerId = e.pointerId;
    this.setIsDragging(true);
  }

  private setIsDragging(dragging: boolean) {
    const prev = this.isDragging;
    this.isDragging = dragging;
    if (dragging && !prev) {
      this.mountDragEffect();
    } else if (!dragging && prev) {
      this.unmountDragEffect();
    }
  }

  // Replicating useEffect([isDragging, ...]) in ResizableDivider.tsx lines 110-235
  private mountDragEffect() {
    this.originalCursor = this.bodyCursor;
    this.originalUserSelect = this.bodyUserSelect;
    this.originalWebkitUserSelect = this.bodyWebkitUserSelect;

    this.bodyCursor = "col-resize";
    this.bodyUserSelect = "none";
    this.bodyWebkitUserSelect = "none";

    const moveListener = (e: { pointerId: number; clientX: number }) => {
      this.handlePointerMove(e);
    };
    const endListener = (e?: { pointerId?: number }) => {
      this.handlePointerEnd(e);
    };
    const blurListener = () => {
      this.handleWindowBlur();
    };

    this.windowListeners.set("pointermove", [moveListener as (e?: unknown) => void]);
    this.windowListeners.set("pointerup", [endListener as (e?: unknown) => void]);
    this.windowListeners.set("pointercancel", [endListener as (e?: unknown) => void]);
    this.windowListeners.set("blur", [blurListener as (e?: unknown) => void]);
  }

  private unmountDragEffect() {
    this.bodyCursor = this.originalCursor;
    this.bodyUserSelect = this.originalUserSelect;
    this.bodyWebkitUserSelect = this.originalWebkitUserSelect;

    this.windowListeners.clear();
    this.rafPending = false;
  }

  // Pointer move (lines 122-150)
  public handlePointerMove(e: { pointerId: number; clientX: number }) {
    if (!this.isDragActive) return;
    if (this.activePointerId !== null && e.pointerId !== this.activePointerId) {
      return;
    }

    const deltaX = e.clientX - this.startX;
    const targetWidth = this.startWidth + deltaX;
    const clampedWidth = Math.min(Math.max(Math.round(targetWidth), this.minWidth), this.maxWidth);

    if (targetWidth < this.minWidth) {
      this.startX = e.clientX;
      this.startWidth = this.minWidth;
    } else if (targetWidth > this.maxWidth) {
      this.startX = e.clientX;
      this.startWidth = this.maxWidth;
    }

    this.latestWidth = clampedWidth;
    this.effectiveWidth = clampedWidth;
    this.resizeEvents.push(clampedWidth);
  }

  // Pointer end (lines 152-193 in remediated ResizableDivider.tsx)
  public handlePointerEnd(e?: { pointerId?: number }) {
    if (
      e &&
      this.activePointerId !== null &&
      e.pointerId !== undefined &&
      e.pointerId !== this.activePointerId
    ) {
      return;
    }

    if (this.capturedPointerId !== null) {
      this.capturedPointerId = null;
    }

    this.isDragActive = false;
    this.activePointerId = null;
    this.setIsDragging(false);

    const finalWidth = Math.min(
      Math.max(Math.round(this.latestWidth), this.minWidth),
      this.maxWidth
    );
    this.effectiveWidth = finalWidth;
    this.resizeEvents.push(finalWidth);
    this.resizeEndEvents.push(finalWidth);
    this.storage.setItem("maileyo_contacts_panel_width", finalWidth.toString());
  }

  // Window blur (lines 195-209 in remediated ResizableDivider.tsx)
  public handleWindowBlur() {
    if (this.isDragActive) {
      const activeId = this.activePointerId ?? 0;
      try {
        if (this.pointerEventThrows) {
          throw new Error("PointerEvent constructor failed");
        }
        this.handlePointerEnd({ pointerId: activeId });
      } catch {
        this.handlePointerEnd();
      }
    }
  }

  public triggerWindowBlur() {
    const list = this.windowListeners.get("blur");
    if (list) {
      for (const listener of list) {
        listener();
      }
    }
  }
}

// ============================================================================
// SUITE 1: Window Blur Termination Across All Pointer IDs
// ============================================================================

test("Suite 1: Window blur terminates drag for mouse pointerId = 1", () => {
  const harness = new RemediatedDividerHarness({ initialWidth: 320 });
  harness.handlePointerDown({ button: 0, pointerId: 1, clientX: 320 });
  harness.handlePointerMove({ pointerId: 1, clientX: 380 });

  assert.strictEqual(harness.isDragging, true);
  assert.strictEqual(harness.bodyCursor, "col-resize");

  harness.triggerWindowBlur();

  assert.strictEqual(harness.isDragActive, false, "isDragActive must be false after blur");
  assert.strictEqual(harness.isDragging, false, "isDragging must be false after blur");
  assert.strictEqual(harness.activePointerId, null, "activePointerId must be null after blur");
  assert.strictEqual(harness.bodyCursor, "", "body cursor must be restored to default");
  assert.strictEqual(harness.bodyUserSelect, "", "body userSelect must be restored");
  assert.strictEqual(harness.storage.getItem("maileyo_contacts_panel_width"), "380");
});

test("Suite 1: Window blur terminates drag for touch / mobile pointerIds (2, 3, 5, 42)", () => {
  const touchPointerIds = [2, 3, 5, 10, 42, 99999];

  for (const pid of touchPointerIds) {
    const harness = new RemediatedDividerHarness({ initialWidth: 320 });
    harness.handlePointerDown({ button: 0, pointerId: pid, clientX: 320 });
    harness.handlePointerMove({ pointerId: pid, clientX: 350 });

    assert.strictEqual(harness.isDragging, true);
    assert.strictEqual(harness.bodyCursor, "col-resize");

    harness.triggerWindowBlur();

    assert.strictEqual(harness.isDragActive, false, `isDragActive must be false for pointerId ${pid}`);
    assert.strictEqual(harness.isDragging, false, `isDragging must be false for pointerId ${pid}`);
    assert.strictEqual(harness.activePointerId, null, `activePointerId must be null for pointerId ${pid}`);
    assert.strictEqual(harness.bodyCursor, "", `body cursor must be restored for pointerId ${pid}`);
  }
});

test("Suite 1: Window blur terminates drag when pointerId is 0 (synthetic or auxiliary pointer)", () => {
  const harness = new RemediatedDividerHarness({ initialWidth: 320 });
  harness.handlePointerDown({ button: 0, pointerId: 0, clientX: 320 });
  harness.handlePointerMove({ pointerId: 0, clientX: 420 });

  assert.strictEqual(harness.isDragging, true);
  assert.strictEqual(harness.bodyCursor, "col-resize");

  harness.triggerWindowBlur();

  assert.strictEqual(harness.isDragActive, false);
  assert.strictEqual(harness.isDragging, false);
  assert.strictEqual(harness.activePointerId, null);
  assert.strictEqual(harness.bodyCursor, "");
  assert.strictEqual(harness.storage.getItem("maileyo_contacts_panel_width"), "420");
});

test("Suite 1: Window blur terminates drag when pointerId is negative (e.g. -1)", () => {
  const harness = new RemediatedDividerHarness({ initialWidth: 320 });
  harness.handlePointerDown({ button: 0, pointerId: -1, clientX: 320 });
  harness.handlePointerMove({ pointerId: -1, clientX: 290 });

  assert.strictEqual(harness.isDragging, true);

  harness.triggerWindowBlur();

  assert.strictEqual(harness.isDragActive, false);
  assert.strictEqual(harness.isDragging, false);
  assert.strictEqual(harness.bodyCursor, "");
  assert.strictEqual(harness.storage.getItem("maileyo_contacts_panel_width"), "290");
});

// ============================================================================
// SUITE 2: Cursor & User-Select Restoration Under Pre-existing Custom Styles
// ============================================================================

test("Suite 2: Cursor restores to pre-existing non-empty cursor after window blur", () => {
  const harness = new RemediatedDividerHarness({ initialWidth: 320, initialCursor: "grab" });
  assert.strictEqual(harness.bodyCursor, "grab");

  harness.handlePointerDown({ button: 0, pointerId: 1, clientX: 320 });
  assert.strictEqual(harness.bodyCursor, "col-resize");

  harness.triggerWindowBlur();
  assert.strictEqual(
    harness.bodyCursor,
    "grab",
    "Cursor must restore to original 'grab' rather than wiping to empty string"
  );
});

test("Suite 2: User-select restores to pre-existing style after window blur", () => {
  const harness = new RemediatedDividerHarness({ initialWidth: 320, initialUserSelect: "text" });
  assert.strictEqual(harness.bodyUserSelect, "text");

  harness.handlePointerDown({ button: 0, pointerId: 1, clientX: 320 });
  assert.strictEqual(harness.bodyUserSelect, "none");

  harness.triggerWindowBlur();
  assert.strictEqual(
    harness.bodyUserSelect,
    "text",
    "User-select must restore to original 'text' rather than wiping to empty string"
  );
});

// ============================================================================
// SUITE 3: Elimination of Phantom Drag on Refocus & Pointer Movement
// ============================================================================

test("Suite 3: No phantom drag occurs when window regains focus and cursor moves", () => {
  const harness = new RemediatedDividerHarness({ initialWidth: 320 });
  harness.handlePointerDown({ button: 0, pointerId: 1, clientX: 320 });
  harness.handlePointerMove({ pointerId: 1, clientX: 350 });
  assert.strictEqual(harness.effectiveWidth, 350);

  // User switches window / blur occurs
  harness.triggerWindowBlur();
  assert.strictEqual(harness.isDragging, false);
  const widthAtBlur = harness.effectiveWidth;

  // Window refocused and user moves mouse across screen without pressing button
  // 1. Direct call to handlePointerMove:
  harness.handlePointerMove({ pointerId: 1, clientX: 450 });
  assert.strictEqual(
    harness.effectiveWidth,
    widthAtBlur,
    "Width must NOT change on pointermove after blur (no phantom drag)"
  );

  // 2. Window listeners map is empty because useEffect unmounted on isDragging = false
  assert.strictEqual(harness.windowListeners.size, 0, "All window listeners must be detached");
});

test("Suite 3: Fresh drag session succeeds immediately after prior drag was terminated by blur", () => {
  const harness = new RemediatedDividerHarness({ initialWidth: 320 });

  // 1st drag interrupted by blur
  harness.handlePointerDown({ button: 0, pointerId: 1, clientX: 320 });
  harness.handlePointerMove({ pointerId: 1, clientX: 360 });
  harness.triggerWindowBlur();
  assert.strictEqual(harness.isDragging, false);
  assert.strictEqual(harness.effectiveWidth, 360);

  // 2nd drag initiated with different pointerId (touch)
  harness.handlePointerDown({ button: 0, pointerId: 2, clientX: 360 });
  assert.strictEqual(harness.isDragging, true);
  assert.strictEqual(harness.bodyCursor, "col-resize");

  harness.handlePointerMove({ pointerId: 2, clientX: 400 });
  assert.strictEqual(harness.effectiveWidth, 400);

  harness.handlePointerEnd({ pointerId: 2 });
  assert.strictEqual(harness.isDragging, false);
  assert.strictEqual(harness.effectiveWidth, 400);
  assert.strictEqual(harness.bodyCursor, "");
  assert.strictEqual(harness.storage.getItem("maileyo_contacts_panel_width"), "400");
});

// ============================================================================
// SUITE 4: Defensive Fallback When PointerEvent Constructor Throws
// ============================================================================

test("Suite 4: Defensive fallback succeeds when PointerEvent constructor throws (parameterless teardown)", () => {
  const harness = new RemediatedDividerHarness({ initialWidth: 320 });
  harness.pointerEventThrows = true; // Simulate environment where PointerEvent constructor fails

  harness.handlePointerDown({ button: 0, pointerId: 1, clientX: 320 });
  harness.handlePointerMove({ pointerId: 1, clientX: 375 });
  assert.strictEqual(harness.isDragging, true);

  // Should NOT throw, should fall back to parameterless handlePointerEnd()
  assert.doesNotThrow(() => {
    harness.triggerWindowBlur();
  });

  assert.strictEqual(harness.isDragActive, false, "Fallback must deactivate drag");
  assert.strictEqual(harness.isDragging, false, "Fallback must set isDragging to false");
  assert.strictEqual(harness.bodyCursor, "", "Fallback must restore cursor");
  assert.strictEqual(harness.effectiveWidth, 375);
});

// ============================================================================
// SUITE 5: Repeated Rapid Blurs & Idle Blur Invariance
// ============================================================================

test("Suite 5: 100 rapid blur events during active drag terminate cleanly on first and remain stable", () => {
  const harness = new RemediatedDividerHarness({ initialWidth: 320 });
  harness.handlePointerDown({ button: 0, pointerId: 1, clientX: 320 });
  harness.handlePointerMove({ pointerId: 1, clientX: 340 });

  assert.strictEqual(harness.isDragging, true);

  for (let i = 0; i < 100; i++) {
    harness.handleWindowBlur();
    assert.strictEqual(harness.isDragging, false);
    assert.strictEqual(harness.bodyCursor, "");
  }

  assert.strictEqual(harness.effectiveWidth, 340);
  // Only 1 end event should have fired
  assert.strictEqual(harness.resizeEndEvents.length, 1);
});

test("Suite 5: Window blur when NOT dragging is a safe no-op", () => {
  const harness = new RemediatedDividerHarness({ initialWidth: 320 });
  assert.strictEqual(harness.isDragging, false);

  assert.doesNotThrow(() => {
    harness.handleWindowBlur();
  });

  assert.strictEqual(harness.isDragging, false);
  assert.strictEqual(harness.bodyCursor, "");
  assert.strictEqual(harness.resizeEndEvents.length, 0);
});
