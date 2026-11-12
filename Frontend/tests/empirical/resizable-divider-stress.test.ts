/**
 * Empirical Stress Test Harness & Adversarial Challenge Suite
 * Focus: ResizableDivider Drag Mechanics, Direction Reversals, Pointer Capture,
 * Window Blur, Double-Click Disambiguation, and Keyboard Navigation.
 *
 * Authored by: Challenger 2 (Empirical Testing: Drag Mechanics & Divider Interactions)
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  MIN_CONTACTS_WIDTH,
  MAX_CONTACTS_WIDTH,
  DEFAULT_CONTACTS_WIDTH,
  clampContactsWidth,
} from "../../src/lib/sidebarPersistence.ts";
import { MockLocalStorage } from "../harness/dom-harness.ts";

/**
 * High-fidelity empirical simulation harness replicating the exact state machine,
 * refs, boundary re-anchoring, event listeners, and cursor lifecycle of ResizableDivider.tsx.
 */
class ResizableDividerSimulationHarness {
  public effectiveWidth: number;
  public minWidth: number;
  public maxWidth: number;
  public defaultWidth: number;
  public disabled: boolean;

  // Internal refs matching ResizableDivider.tsx
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
  public windowListeners: Map<string, Array<(e: { pointerId?: number }) => void>> = new Map();

  // Callbacks
  public resizeEvents: number[] = [];
  public resizeEndEvents: number[] = [];
  public resetEvents: number = 0;
  public storage: MockLocalStorage;

  constructor(options: {
    initialWidth?: number;
    minWidth?: number;
    maxWidth?: number;
    defaultWidth?: number;
    disabled?: boolean;
    storage?: MockLocalStorage;
  } = {}) {
    this.minWidth = options.minWidth ?? MIN_CONTACTS_WIDTH;
    this.maxWidth = options.maxWidth ?? MAX_CONTACTS_WIDTH;
    this.defaultWidth = options.defaultWidth ?? DEFAULT_CONTACTS_WIDTH;
    this.effectiveWidth = options.initialWidth ?? this.defaultWidth;
    this.latestWidth = this.effectiveWidth;
    this.disabled = options.disabled ?? false;
    this.storage = options.storage ?? new MockLocalStorage();
  }

  // Window listener management replicating useEffect([isDragging, ...]) in ResizableDivider.tsx
  private attachWindowListeners() {
    this.bodyCursor = "col-resize";
    this.bodyUserSelect = "none";
    this.bodyWebkitUserSelect = "none";

    this.windowListeners.set("pointermove", [(e) => this.handlePointerMove(e)]);
    this.windowListeners.set("pointerup", [(e) => this.handlePointerEnd(e)]);
    this.windowListeners.set("pointercancel", [(e) => this.handlePointerEnd(e)]);
    this.windowListeners.set("blur", [() => this.handleWindowBlur()]);
  }

  private detachWindowListeners() {
    this.bodyCursor = "";
    this.bodyUserSelect = "";
    this.bodyWebkitUserSelect = "";
    this.windowListeners.clear();
    this.rafPending = false;
  }

  public setPointerCapture(pointerId: number) {
    this.capturedPointerId = pointerId;
  }

  public releasePointerCapture(pointerId: number) {
    if (this.capturedPointerId === pointerId) {
      this.capturedPointerId = null;
    }
  }

  public hasPointerCapture(pointerId: number): boolean {
    return this.capturedPointerId === pointerId;
  }

  // Pointer down handler (lines 87-108 in ResizableDivider.tsx)
  public handlePointerDown(e: { button: number; pointerId: number; clientX: number }) {
    if (this.disabled || e.button !== 0) return;

    this.activePointerId = e.pointerId;
    this.startX = e.clientX;
    this.startWidth = this.effectiveWidth;
    this.latestWidth = this.effectiveWidth;
    this.isDragActive = true;

    this.setPointerCapture(e.pointerId);
    this.isDragging = true;
    this.attachWindowListeners();
  }

  // Pointer move handler (lines 123-151 in ResizableDivider.tsx)
  public handlePointerMove(e: { pointerId: number; clientX: number }) {
    if (!this.isDragActive) return;
    if (this.activePointerId !== null && e.pointerId !== this.activePointerId) {
      return;
    }

    const deltaX = e.clientX - this.startX;
    const targetWidth = this.startWidth + deltaX;
    const clampedWidth = Math.min(Math.max(Math.round(targetWidth), this.minWidth), this.maxWidth);

    // Boundary re-anchoring logic verbatim from ResizableDivider.tsx:134-140
    if (targetWidth < this.minWidth) {
      this.startX = e.clientX;
      this.startWidth = this.minWidth;
    } else if (targetWidth > this.maxWidth) {
      this.startX = e.clientX;
      this.startWidth = this.maxWidth;
    }

    this.latestWidth = clampedWidth;

    // Simulate RAF throttle
    this.effectiveWidth = clampedWidth;
    this.resizeEvents.push(clampedWidth);
  }

  // Pointer end handler (lines 153-186 in ResizableDivider.tsx)
  public handlePointerEnd(e: { pointerId: number }) {
    if (this.activePointerId !== null && e.pointerId !== this.activePointerId) {
      return;
    }

    if (this.capturedPointerId !== null) {
      this.releasePointerCapture(this.capturedPointerId);
    }

    this.isDragActive = false;
    this.activePointerId = null;
    this.isDragging = false;
    this.detachWindowListeners();

    const finalWidth = clampContactsWidth(this.latestWidth);
    this.effectiveWidth = finalWidth;
    this.resizeEvents.push(finalWidth);
    this.resizeEndEvents.push(finalWidth);
    this.storage.setItem("maileyo_contacts_panel_width", finalWidth.toString());
  }

  // Window blur handler verbatim from ResizableDivider.tsx:188-192
  // Note: in DOM PointerEvent specification, new PointerEvent("pointerup") defaults pointerId to 0.
  public handleWindowBlur(simulatedEvent: { pointerId: number } = { pointerId: 0 }) {
    if (this.isDragActive) {
      this.handlePointerEnd(simulatedEvent);
    }
  }

  // Double click handler (lines 221-232 in ResizableDivider.tsx)
  public handleDoubleClick() {
    if (this.disabled) return;
    this.resetEvents++;
    this.effectiveWidth = this.defaultWidth;
    this.latestWidth = this.defaultWidth;
    this.resizeEvents.push(this.defaultWidth);
    this.resizeEndEvents.push(this.defaultWidth);
    this.storage.setItem("maileyo_contacts_panel_width", this.defaultWidth.toString());
  }

  // Keyboard navigation handler (lines 235-263 in ResizableDivider.tsx)
  public handleKeyDown(e: { key: string; shiftKey?: boolean }): boolean {
    if (this.disabled) return false;
    const step = e.shiftKey ? 50 : 10;
    let nextWidth: number | null = null;

    if (e.key === "ArrowLeft") {
      nextWidth = Math.max(this.minWidth, this.effectiveWidth - step);
    } else if (e.key === "ArrowRight") {
      nextWidth = Math.min(this.maxWidth, this.effectiveWidth + step);
    } else if (e.key === "Home") {
      nextWidth = this.minWidth;
    } else if (e.key === "End") {
      nextWidth = this.maxWidth;
    } else if (e.key === "Enter") {
      this.handleDoubleClick();
      return true;
    }

    if (nextWidth !== null) {
      const clamped = clampContactsWidth(nextWidth);
      this.effectiveWidth = clamped;
      this.latestWidth = clamped;
      this.resizeEvents.push(clamped);
      this.resizeEndEvents.push(clamped);
      this.storage.setItem("maileyo_contacts_panel_width", clamped.toString());
      return true;
    }
    return false;
  }
}

// ============================================================================
// SUITE 1: Drag Mechanics, Direction Reversals & Boundary Re-anchoring
// ============================================================================

test("Suite 1: Rapid direction reversals under high-frequency stress never violate boundaries", () => {
  const harness = new ResizableDividerSimulationHarness({ initialWidth: 320 });
  harness.handlePointerDown({ button: 0, pointerId: 1, clientX: 320 });

  let currentX = 320;
  // Simulate 1,000 rapid direction reversals back and forth across boundaries
  for (let i = 0; i < 1000; i++) {
    const delta = (i % 2 === 0 ? 1 : -1) * (15 + (i % 80));
    currentX += delta;
    harness.handlePointerMove({ pointerId: 1, clientX: currentX });

    assert.ok(
      harness.effectiveWidth >= MIN_CONTACTS_WIDTH,
      `Width ${harness.effectiveWidth} must never underflow ${MIN_CONTACTS_WIDTH} at step ${i}`
    );
    assert.ok(
      harness.effectiveWidth <= MAX_CONTACTS_WIDTH,
      `Width ${harness.effectiveWidth} must never overflow ${MAX_CONTACTS_WIDTH} at step ${i}`
    );
  }

  harness.handlePointerEnd({ pointerId: 1 });
  assert.strictEqual(harness.isDragging, false);
  assert.strictEqual(harness.bodyCursor, "");
});

test("Suite 1: Dead-zone elimination at lower boundary (immediate reversal from minWidth)", () => {
  const harness = new ResizableDividerSimulationHarness({ initialWidth: 320 });
  harness.handlePointerDown({ button: 0, pointerId: 1, clientX: 320 });

  // Drag far past minimum boundary (e.g., -600px into negative space)
  harness.handlePointerMove({ pointerId: 1, clientX: -280 });
  assert.strictEqual(harness.effectiveWidth, 260);

  // Reversal: moving right by just +5px must immediately increase width to 265 without dead-zone delay
  harness.handlePointerMove({ pointerId: 1, clientX: -275 });
  assert.strictEqual(
    harness.effectiveWidth,
    265,
    "Reversing direction right by 5px after overshoot must immediately yield 265px"
  );

  harness.handlePointerEnd({ pointerId: 1 });
  assert.strictEqual(harness.effectiveWidth, 265);
});

test("Suite 1: Dead-zone elimination at upper boundary (immediate reversal from maxWidth)", () => {
  const harness = new ResizableDividerSimulationHarness({ initialWidth: 320 });
  harness.handlePointerDown({ button: 0, pointerId: 1, clientX: 320 });

  // Drag far past maximum boundary (+1500px)
  harness.handlePointerMove({ pointerId: 1, clientX: 1820 });
  assert.strictEqual(harness.effectiveWidth, 500);

  // Reversal: moving left by just -10px must immediately decrease width to 490 without dead-zone delay
  harness.handlePointerMove({ pointerId: 1, clientX: 1810 });
  assert.strictEqual(
    harness.effectiveWidth,
    490,
    "Reversing direction left by 10px after overshoot must immediately yield 490px"
  );

  harness.handlePointerEnd({ pointerId: 1 });
  assert.strictEqual(harness.effectiveWidth, 490);
});

test("Suite 1: Non-left-click mouse buttons (right click, middle click) do not initiate drag", () => {
  const harness = new ResizableDividerSimulationHarness({ initialWidth: 320 });

  // Right-click (button 2)
  harness.handlePointerDown({ button: 2, pointerId: 1, clientX: 320 });
  assert.strictEqual(harness.isDragging, false, "Right click must not start drag");
  assert.strictEqual(harness.bodyCursor, "");

  // Middle-click (button 1)
  harness.handlePointerDown({ button: 1, pointerId: 1, clientX: 320 });
  assert.strictEqual(harness.isDragging, false, "Middle click must not start drag");
});

test("Suite 1: Disabled divider rejects all pointer interactions", () => {
  const harness = new ResizableDividerSimulationHarness({ initialWidth: 320, disabled: true });
  harness.handlePointerDown({ button: 0, pointerId: 1, clientX: 320 });
  assert.strictEqual(harness.isDragging, false, "Disabled divider must reject pointerdown");
  assert.strictEqual(harness.bodyCursor, "");
});

// ============================================================================
// SUITE 2: Multi-Pointer Isolation & Pointer Capture
// ============================================================================

test("Suite 2: Multi-pointer isolation: secondary pointers cannot hijack active drag", () => {
  const harness = new ResizableDividerSimulationHarness({ initialWidth: 320 });

  // Primary pointer down (mouse / primary touch, pointerId: 1)
  harness.handlePointerDown({ button: 0, pointerId: 1, clientX: 320 });
  assert.strictEqual(harness.isDragging, true);
  assert.strictEqual(harness.capturedPointerId, 1);

  // Secondary pointer move (pointerId: 2) with radical coordinate change
  harness.handlePointerMove({ pointerId: 2, clientX: 999 });
  assert.strictEqual(harness.effectiveWidth, 320, "Secondary pointer move must be ignored");

  // Secondary pointer up (pointerId: 2) must NOT end drag
  harness.handlePointerEnd({ pointerId: 2 });
  assert.strictEqual(harness.isDragging, true, "Secondary pointer up must not terminate drag");
  assert.strictEqual(harness.bodyCursor, "col-resize", "Body cursor must remain locked during primary drag");

  // Primary pointer continues dragging
  harness.handlePointerMove({ pointerId: 1, clientX: 380 });
  assert.strictEqual(harness.effectiveWidth, 380);

  // Primary pointer finishes drag
  harness.handlePointerEnd({ pointerId: 1 });
  assert.strictEqual(harness.isDragging, false);
  assert.strictEqual(harness.capturedPointerId, null, "Pointer capture must be released on drag end");
  assert.strictEqual(harness.bodyCursor, "");
});

// ============================================================================
// SUITE 3: Pointer Cancellation & Lifecycle Cleanup
// ============================================================================

test("Suite 3: pointercancel terminates drag and cleanly restores document body cursor", () => {
  const harness = new ResizableDividerSimulationHarness({ initialWidth: 320 });
  harness.handlePointerDown({ button: 0, pointerId: 1, clientX: 320 });
  harness.handlePointerMove({ pointerId: 1, clientX: 400 });

  assert.strictEqual(harness.isDragging, true);
  assert.strictEqual(harness.bodyCursor, "col-resize");
  assert.strictEqual(harness.bodyUserSelect, "none");

  // Browser cancels pointer (e.g. OS gesture takeover)
  const cancelHandler = harness.windowListeners.get("pointercancel")?.[0];
  assert.ok(cancelHandler, "pointercancel listener must be registered");
  cancelHandler({ pointerId: 1 });

  assert.strictEqual(harness.isDragging, false, "pointercancel must terminate drag");
  assert.strictEqual(harness.bodyCursor, "", "Body cursor must be restored to default");
  assert.strictEqual(harness.bodyUserSelect, "", "User select must be restored");
  assert.strictEqual(harness.effectiveWidth, 400, "Final width must be committed on cancel");
  assert.strictEqual(harness.storage.getItem("maileyo_contacts_panel_width"), "400");
});

// ============================================================================
// SUITE 4: Window Blur Failure Mode (Empirical Bug Demonstration)
// ============================================================================

test("Suite 4 [VULNERABILITY REPRODUCTION]: Window blur with default PointerEvent fails when activePointerId is non-zero", () => {
  const harness = new ResizableDividerSimulationHarness({ initialWidth: 320 });

  // In all modern browsers (Chrome, Firefox, Safari, Edge), mouse pointerId is 1 (or >= 1 for touch)
  const mousePointerId = 1;
  harness.handlePointerDown({ button: 0, pointerId: mousePointerId, clientX: 320 });
  harness.handlePointerMove({ pointerId: mousePointerId, clientX: 360 });

  assert.strictEqual(harness.isDragging, true);
  assert.strictEqual(harness.bodyCursor, "col-resize");

  // Window loses focus while dragging (e.g. Alt-Tab, OS alert)
  // In ResizableDivider.tsx lines 188-192:
  //   const handleWindowBlur = () => {
  //     if (isDragActiveRef.current) {
  //       handlePointerEnd(new PointerEvent("pointerup"));
  //     }
  //   };
  // In W3C DOM spec, new PointerEvent("pointerup").pointerId defaults to 0.
  // In handlePointerEnd (line 154):
  //   if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) return;
  // Here activePointerIdRef.current === 1, but e.pointerId === 0.
  // The guard triggers early return, aborting cleanup!

  const blurHandler = harness.windowListeners.get("blur")?.[0];
  assert.ok(blurHandler, "blur listener must be registered");

  // Trigger blur with the exact synthetic event produced by ResizableDivider.tsx
  harness.handleWindowBlur({ pointerId: 0 });

  // EMPIRICAL BUG DEMONSTRATION:
  // Because pointerId was 0, it did NOT match activePointerId (1)
  assert.strictEqual(
    harness.isDragging,
    true,
    "BUG CONFIRMED: Dragging remains stuck because e.pointerId (0) !== activePointerId (1)"
  );
  assert.strictEqual(
    harness.bodyCursor,
    "col-resize",
    "BUG CONFIRMED: Body cursor remains stuck at 'col-resize' after window blur"
  );

  // Now verify that if the event had the matching pointerId or was handled properly, cleanup succeeds:
  harness.handleWindowBlur({ pointerId: mousePointerId });
  assert.strictEqual(harness.isDragging, false, "With matching pointerId, drag ends cleanly");
  assert.strictEqual(harness.bodyCursor, "", "Body cursor is properly cleaned up");
});

// ============================================================================
// SUITE 5: Double-Click vs Drag Disambiguation
// ============================================================================

test("Suite 5: Double-click resets custom width back to 320px default and updates storage", () => {
  const storage = new MockLocalStorage();
  const harness = new ResizableDividerSimulationHarness({ initialWidth: 460, storage });

  harness.handleDoubleClick();
  assert.strictEqual(harness.effectiveWidth, 320);
  assert.strictEqual(harness.resetEvents, 1);
  assert.strictEqual(storage.getItem("maileyo_contacts_panel_width"), "320");
});

test("Suite 5: Single click and drag does not trigger reset event", () => {
  const harness = new ResizableDividerSimulationHarness({ initialWidth: 320 });
  harness.handlePointerDown({ button: 0, pointerId: 1, clientX: 320 });
  harness.handlePointerMove({ pointerId: 1, clientX: 410 });
  harness.handlePointerEnd({ pointerId: 1 });

  assert.strictEqual(harness.effectiveWidth, 410);
  assert.strictEqual(harness.resetEvents, 0, "Dragging must not trigger double-click reset");
});

// ============================================================================
// SUITE 6: Keyboard Navigation & ARIA Compliance
// ============================================================================

test("Suite 6: Arrow keys adjust width in 10px increments, Shift+Arrow in 50px increments", () => {
  const harness = new ResizableDividerSimulationHarness({ initialWidth: 320 });

  // ArrowLeft (-10px)
  harness.handleKeyDown({ key: "ArrowLeft" });
  assert.strictEqual(harness.effectiveWidth, 310);

  // Shift + ArrowLeft (-50px)
  harness.handleKeyDown({ key: "ArrowLeft", shiftKey: true });
  assert.strictEqual(harness.effectiveWidth, 260);

  // ArrowLeft at boundary does not underflow below 260
  harness.handleKeyDown({ key: "ArrowLeft" });
  assert.strictEqual(harness.effectiveWidth, 260);

  // ArrowRight (+10px)
  harness.handleKeyDown({ key: "ArrowRight" });
  assert.strictEqual(harness.effectiveWidth, 270);

  // Shift + ArrowRight (+50px)
  harness.handleKeyDown({ key: "ArrowRight", shiftKey: true });
  assert.strictEqual(harness.effectiveWidth, 320);
});

test("Suite 6: Home and End keys jump to minimum (260px) and maximum (500px) boundaries", () => {
  const harness = new ResizableDividerSimulationHarness({ initialWidth: 350 });

  // End key jumps to 500
  harness.handleKeyDown({ key: "End" });
  assert.strictEqual(harness.effectiveWidth, 500);

  // ArrowRight at max boundary does not overflow above 500
  harness.handleKeyDown({ key: "ArrowRight" });
  assert.strictEqual(harness.effectiveWidth, 500);

  // Home key jumps to 260
  harness.handleKeyDown({ key: "Home" });
  assert.strictEqual(harness.effectiveWidth, 260);
});

test("Suite 6: Enter key resets width to default 320px", () => {
  const harness = new ResizableDividerSimulationHarness({ initialWidth: 480 });

  harness.handleKeyDown({ key: "Enter" });
  assert.strictEqual(harness.effectiveWidth, 320);
  assert.strictEqual(harness.storage.getItem("maileyo_contacts_panel_width"), "320");
});

test("Suite 6: Disabled divider rejects keyboard navigation", () => {
  const harness = new ResizableDividerSimulationHarness({ initialWidth: 320, disabled: true });

  const handled = harness.handleKeyDown({ key: "ArrowLeft" });
  assert.strictEqual(handled, false);
  assert.strictEqual(harness.effectiveWidth, 320);
});

// ============================================================================
// SUITE 7: I/O Isolation & Storage Persistence
// ============================================================================

test("Suite 7: Zero storage writes during active movement, exactly one write on drag completion", () => {
  const storage = new MockLocalStorage();
  const harness = new ResizableDividerSimulationHarness({ initialWidth: 320, storage });

  let setItemCalls = 0;
  const originalSetItem = storage.setItem.bind(storage);
  storage.setItem = (k: string, v: string) => {
    setItemCalls++;
    originalSetItem(k, v);
  };

  harness.handlePointerDown({ button: 0, pointerId: 1, clientX: 320 });

  // Dispatch 100 move events
  for (let i = 0; i < 100; i++) {
    harness.handlePointerMove({ pointerId: 1, clientX: 320 + i });
  }

  // During drag, zero localStorage writes must occur (I/O isolation)
  assert.strictEqual(
    setItemCalls,
    0,
    "During continuous drag movement, localStorage.setItem must NEVER be called"
  );

  // Release drag
  harness.handlePointerEnd({ pointerId: 1 });

  // Exactly one write upon completion
  assert.strictEqual(
    setItemCalls,
    1,
    "Exactly one localStorage write must occur when drag terminates"
  );
  assert.strictEqual(storage.getItem("maileyo_contacts_panel_width"), "419");
});
