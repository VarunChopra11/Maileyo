import test from "node:test";
import assert from "node:assert/strict";
import {
  MIN_CONTACTS_WIDTH,
  MAX_CONTACTS_WIDTH,
  DEFAULT_CONTACTS_WIDTH,
  STORAGE_KEY_CONTACTS_WIDTH,
  clampContactsWidth,
  getInitialContactsWidth,
  saveContactsWidth,
} from "../sidebarPersistence.ts";

interface MockStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
  readonly store: Map<string, string>;
}

const globalObj = globalThis as unknown as { window?: unknown };

function createMockStorage(initial: Record<string, string> = {}): MockStorage {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    get store() {
      return store;
    },
  };
}

// ---------------------------------------------------------------------------
// 1. CLAMPING MATH & FLOATING POINT EXTREMES
// ---------------------------------------------------------------------------

test("Challenge 1.1: Math extremes and non-finite edge cases", () => {
  // Signed zero (-0)
  const negZero = clampContactsWidth(-0);
  assert.strictEqual(negZero, MIN_CONTACTS_WIDTH);
  assert.strictEqual(Object.is(negZero, 260), true);

  // Positive zero (+0)
  assert.strictEqual(clampContactsWidth(0), MIN_CONTACTS_WIDTH);

  // Non-finite numbers
  assert.strictEqual(clampContactsWidth(NaN), DEFAULT_CONTACTS_WIDTH);
  assert.strictEqual(clampContactsWidth(Infinity), DEFAULT_CONTACTS_WIDTH);
  assert.strictEqual(clampContactsWidth(-Infinity), DEFAULT_CONTACTS_WIDTH);

  // Extreme floats
  assert.strictEqual(clampContactsWidth(Number.MAX_VALUE), MAX_CONTACTS_WIDTH);
  assert.strictEqual(clampContactsWidth(-Number.MAX_VALUE), MIN_CONTACTS_WIDTH);
  assert.strictEqual(clampContactsWidth(Number.MIN_VALUE), MIN_CONTACTS_WIDTH);
  assert.strictEqual(clampContactsWidth(-Number.MIN_VALUE), MIN_CONTACTS_WIDTH);
  assert.strictEqual(clampContactsWidth(Number.EPSILON), MIN_CONTACTS_WIDTH);
  assert.strictEqual(clampContactsWidth(Number.MAX_SAFE_INTEGER), MAX_CONTACTS_WIDTH);
  assert.strictEqual(clampContactsWidth(Number.MIN_SAFE_INTEGER), MIN_CONTACTS_WIDTH);
});

test("Challenge 1.2: Boundary subpixel rounding precision", () => {
  // Lower boundary rounding
  assert.strictEqual(clampContactsWidth(259.49999999999994), 260); // rounds to 259 -> clamps to 260
  assert.strictEqual(clampContactsWidth(259.5), 260); // rounds to 260
  assert.strictEqual(clampContactsWidth(260.49999999999994), 260); // rounds to 260
  assert.strictEqual(clampContactsWidth(260.5), 261); // rounds to 261

  // Upper boundary rounding
  assert.strictEqual(clampContactsWidth(499.49999999999994), 499);
  assert.strictEqual(clampContactsWidth(499.5), 500);
  assert.strictEqual(clampContactsWidth(500.49999999999994), 500);
  assert.strictEqual(clampContactsWidth(500.5), 500); // rounds to 501 -> clamps to 500
  assert.strictEqual(clampContactsWidth(500.99999), 500);

  // Mid-range subpixels
  assert.strictEqual(clampContactsWidth(320.1), 320);
  assert.strictEqual(clampContactsWidth(320.49), 320);
  assert.strictEqual(clampContactsWidth(320.5), 321);
  assert.strictEqual(clampContactsWidth(320.99), 321);
});

test("Challenge 1.3: Non-number type coercion resilience", () => {
  // TypeScript bypass at runtime
  assert.strictEqual(clampContactsWidth(null as unknown as number), DEFAULT_CONTACTS_WIDTH);
  assert.strictEqual(clampContactsWidth(undefined as unknown as number), DEFAULT_CONTACTS_WIDTH);
  assert.strictEqual(clampContactsWidth("350" as unknown as number), DEFAULT_CONTACTS_WIDTH);
  assert.strictEqual(clampContactsWidth({} as unknown as number), DEFAULT_CONTACTS_WIDTH);
  assert.strictEqual(clampContactsWidth([] as unknown as number), DEFAULT_CONTACTS_WIDTH);
  assert.strictEqual(clampContactsWidth(true as unknown as number), DEFAULT_CONTACTS_WIDTH);
  assert.strictEqual(clampContactsWidth(false as unknown as number), DEFAULT_CONTACTS_WIDTH);
  assert.strictEqual(clampContactsWidth(Symbol("width") as unknown as number), DEFAULT_CONTACTS_WIDTH);
  assert.strictEqual(clampContactsWidth(100n as unknown as number), DEFAULT_CONTACTS_WIDTH);
});

// ---------------------------------------------------------------------------
// 2. LOCALSTORAGE ADVERSARIAL INPUTS & CORRUPTED STRINGS
// ---------------------------------------------------------------------------

test("Challenge 2.1: Corrupted strings in localStorage", () => {
  const originalWindow = globalObj.window;
  try {
    const corruptedValues = [
      "",
      "    ",
      "\t\n\r",
      "NaN",
      "-NaN",
      "+NaN",
      "Infinity",
      "-Infinity",
      "+Infinity",
      "undefined",
      "null",
      "true",
      "false",
      "{}",
      "{ width: 320 }",
      '{"width":320}',
      "[]",
      "[320]",
      "320px", // parseFloat extracts 320 -> clamped to 320
      "auto",
      "100%",
      "calc(100% - 20px)",
      "undefined px",
      "NaN px",
      "\x00",
      "\x00320",
      "320\x00",
      "abc",
      "foo320",
      "<script>alert(1)</script>",
      "320; DROP TABLE users;",
      "-- 320",
      "1e500", // parses as Infinity -> should fallback to 320
      "-1e500", // parses as -Infinity -> should fallback to 320
      "1e-500", // parses as 0 -> clamped to 260
      "0x150", // parses as 0 -> clamped to 260
      "0b101000000",
      "0o500",
      "۳۲۰", // Eastern Arabic numerals (not parsed by parseFloat)
      "🍕",
      "A".repeat(100_000), // Huge string memory blast
    ];

    for (const bad of corruptedValues) {
      const mock = createMockStorage({ [STORAGE_KEY_CONTACTS_WIDTH]: bad });
      globalObj.window = { localStorage: mock };

      const result = getInitialContactsWidth();
      assert.ok(
        Number.isFinite(result),
        `Result must be finite number for corrupted string "${bad.slice(0, 20)}"`
      );
      assert.ok(
        result >= MIN_CONTACTS_WIDTH && result <= MAX_CONTACTS_WIDTH,
        `Result ${result} must be within bounds [260, 500] for string "${bad.slice(0, 20)}"`
      );
    }
  } finally {
    globalObj.window = originalWindow;
  }
});

test("Challenge 2.2: Prototype pollution defense", () => {
  const originalWindow = globalObj.window;
  try {
    const proto = Object.prototype as Record<string, unknown>;
    proto[STORAGE_KEY_CONTACTS_WIDTH] = "9999";
    proto["maileyo_contacts_panel_width"] = "9999";

    const mock = createMockStorage(); // empty storage
    globalObj.window = { localStorage: mock };

    const width = getInitialContactsWidth();
    assert.strictEqual(
      width,
      DEFAULT_CONTACTS_WIDTH,
      "Prototype pollution must not affect getInitialContactsWidth when key is missing"
    );

    mock.setItem(STORAGE_KEY_CONTACTS_WIDTH, "__proto__");
    assert.strictEqual(getInitialContactsWidth(), DEFAULT_CONTACTS_WIDTH);

    mock.setItem(STORAGE_KEY_CONTACTS_WIDTH, "constructor");
    assert.strictEqual(getInitialContactsWidth(), DEFAULT_CONTACTS_WIDTH);
  } finally {
    delete (Object.prototype as Record<string, unknown>)[STORAGE_KEY_CONTACTS_WIDTH];
    delete (Object.prototype as Record<string, unknown>)["maileyo_contacts_panel_width"];
    globalObj.window = originalWindow;
  }
});

// ---------------------------------------------------------------------------
// 3. STORAGE GETTER SECURITYERROR & ENVIRONMENT CRASH CHALLENGE
// ---------------------------------------------------------------------------

test("Challenge 3.1: window.localStorage throwing on property access (Safari Private Browsing / Restricted iFrame)", () => {
  const originalWindow = globalObj.window;
  try {
    // In Safari private mode or sandboxed iframe without allow-same-origin:
    // Accessing window.localStorage property itself throws DOMException: SecurityError!
    const mockWindow: Record<string, unknown> = {};
    Object.defineProperty(mockWindow, "localStorage", {
      get() {
        throw new Error("SecurityError: Failed to read the 'localStorage' property from 'Window': Access is denied for this document.");
      },
      configurable: true,
    });
    globalObj.window = mockWindow;

    // Should NOT throw unhandled error, must fall back safely to DEFAULT_CONTACTS_WIDTH (320)
    let readWidth: number | null = null;
    let readThrew = false;
    let readErrorMessage = "";
    try {
      readWidth = getInitialContactsWidth();
    } catch (e) {
      readThrew = true;
      readErrorMessage = e instanceof Error ? e.message : String(e);
    }

    assert.strictEqual(
      readThrew,
      false,
      `CRITICAL: getInitialContactsWidth() crashed with uncaught error when window.localStorage property threw SecurityError: ${readErrorMessage}`
    );
    assert.strictEqual(readWidth, DEFAULT_CONTACTS_WIDTH);

    // saveContactsWidth should also NOT throw
    let saveThrew = false;
    let saveErrorMessage = "";
    try {
      saveContactsWidth(400);
    } catch (e) {
      saveThrew = true;
      saveErrorMessage = e instanceof Error ? e.message : String(e);
    }

    assert.strictEqual(
      saveThrew,
      false,
      `CRITICAL: saveContactsWidth() crashed with uncaught error when window.localStorage property threw SecurityError: ${saveErrorMessage}`
    );
  } finally {
    globalObj.window = originalWindow;
  }
});

// ---------------------------------------------------------------------------
// 4. CONCURRENT & RAPID STORAGE ACCESS STRESS
// ---------------------------------------------------------------------------

test("Challenge 4.1: Rapid successive read/writes (10,000 iterations)", () => {
  const originalWindow = globalObj.window;
  try {
    const mock = createMockStorage();
    globalObj.window = { localStorage: mock };

    for (let i = 0; i < 10_000; i++) {
      const targetWidth = (i % 800) - 100; // range [-100, 699]
      saveContactsWidth(targetWidth);
      const read = getInitialContactsWidth();
      assert.ok(
        read >= MIN_CONTACTS_WIDTH && read <= MAX_CONTACTS_WIDTH,
        `Read value ${read} must be within [260, 500]`
      );
      assert.strictEqual(Number.isInteger(read), true, "Read value must be integer");
    }
  } finally {
    globalObj.window = originalWindow;
  }
});

test("Challenge 4.2: Interleaved alternating valid/corrupted writes", () => {
  const originalWindow = globalObj.window;
  try {
    const mock = createMockStorage();
    globalObj.window = { localStorage: mock };

    const sequence = [
      () => saveContactsWidth(450),
      () => mock.setItem(STORAGE_KEY_CONTACTS_WIDTH, "garbage"),
      () => saveContactsWidth(270.4),
      () => mock.setItem(STORAGE_KEY_CONTACTS_WIDTH, ""),
      () => saveContactsWidth(-50),
      () => mock.setItem(STORAGE_KEY_CONTACTS_WIDTH, "1e6"),
      () => saveContactsWidth(350),
    ];

    for (const step of sequence) {
      step();
      const read = getInitialContactsWidth();
      assert.ok(read >= 260 && read <= 500, `Interleaved read must stay clamped: ${read}`);
    }
  } finally {
    globalObj.window = originalWindow;
  }
});

// ---------------------------------------------------------------------------
// 5. DIVIDER EVENT HANDLING & POINTERID CHALLENGES
// ---------------------------------------------------------------------------

test("Challenge 5.1: Divider window blur event handling with non-zero pointerId", () => {
  let isDragActive = false;
  let activePointerId: number | null = null;
  let isDragging = false;
  let cursor = "";
  let userSelect = "";

  const onPointerDown = (pointerId: number) => {
    activePointerId = pointerId;
    isDragActive = true;
    isDragging = true;
    cursor = "col-resize";
    userSelect = "none";
  };

  const onPointerEnd = (e?: { pointerId?: number }) => {
    // Remediated ResizableDivider.tsx logic
    if (
      e &&
      activePointerId !== null &&
      e.pointerId !== undefined &&
      e.pointerId !== activePointerId
    ) {
      return;
    }
    isDragActive = false;
    activePointerId = null;
    isDragging = false;
    cursor = "";
    userSelect = "";
  };

  const onWindowBlur = () => {
    if (isDragActive) {
      // Remediated ResizableDivider.tsx logic: forwards active pointerId
      onPointerEnd({ pointerId: activePointerId ?? 0 });
    }
  };

  // Simulate active drag with mouse (pointerId: 1)
  onPointerDown(1);
  assert.strictEqual(isDragActive, true);
  assert.strictEqual(isDragging, true);

  // Trigger window blur (e.g. Alt+Tab, popup, click outside)
  onWindowBlur();

  // Drag MUST be terminated and styles cleaned up!
  assert.strictEqual(
    isDragActive,
    false,
    "CRITICAL: Window blur failed to terminate active drag when pointerId is non-zero (pointerId mismatch bug)"
  );
  assert.strictEqual(isDragging, false);
  assert.strictEqual(cursor, "");
  assert.strictEqual(userSelect, "");
});
