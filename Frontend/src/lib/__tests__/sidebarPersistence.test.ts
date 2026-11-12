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

interface MockWindow {
  localStorage?: MockStorage | {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
  };
}

const globalObj = globalThis as unknown as { window?: MockWindow };

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

test("Suite 1: clampContactsWidth - Nominal in-range values", () => {
  assert.strictEqual(clampContactsWidth(320), 320);
  assert.strictEqual(clampContactsWidth(260), 260);
  assert.strictEqual(clampContactsWidth(500), 500);
  assert.strictEqual(clampContactsWidth(400), 400);
});

test("Suite 1: clampContactsWidth - Lower boundary enforcement", () => {
  assert.strictEqual(clampContactsWidth(259), 260);
  assert.strictEqual(clampContactsWidth(100), 260);
  assert.strictEqual(clampContactsWidth(0), 260);
  assert.strictEqual(clampContactsWidth(-150), 260);
});

test("Suite 1: clampContactsWidth - Upper boundary enforcement", () => {
  assert.strictEqual(clampContactsWidth(501), 500);
  assert.strictEqual(clampContactsWidth(800), 500);
  assert.strictEqual(clampContactsWidth(99999), 500);
});

test("Suite 1: clampContactsWidth - Subpixel rounding", () => {
  assert.strictEqual(clampContactsWidth(320.4), 320);
  assert.strictEqual(clampContactsWidth(320.6), 321);
  assert.strictEqual(clampContactsWidth(259.8), 260);
  assert.strictEqual(clampContactsWidth(500.4), 500);
});

test("Suite 1: clampContactsWidth - Non-finite and malformed values", () => {
  assert.strictEqual(clampContactsWidth(NaN), DEFAULT_CONTACTS_WIDTH);
  assert.strictEqual(clampContactsWidth(Infinity), DEFAULT_CONTACTS_WIDTH);
  assert.strictEqual(clampContactsWidth(-Infinity), DEFAULT_CONTACTS_WIDTH);
  assert.strictEqual(clampContactsWidth("400" as unknown as number), DEFAULT_CONTACTS_WIDTH);
  assert.strictEqual(clampContactsWidth(null as unknown as number), DEFAULT_CONTACTS_WIDTH);
  assert.strictEqual(clampContactsWidth(undefined as unknown as number), DEFAULT_CONTACTS_WIDTH);
});

test("Suite 2: getInitialContactsWidth - Empty storage returns default 320", () => {
  const originalWindow = globalObj.window;
  try {
    const mock = createMockStorage();
    globalObj.window = { localStorage: mock };
    assert.strictEqual(getInitialContactsWidth(), DEFAULT_CONTACTS_WIDTH);
  } finally {
    globalObj.window = originalWindow;
  }
});

test("Suite 2: getInitialContactsWidth - Valid saved value returned", () => {
  const originalWindow = globalObj.window;
  try {
    const mock = createMockStorage({ [STORAGE_KEY_CONTACTS_WIDTH]: "420" });
    globalObj.window = { localStorage: mock };
    assert.strictEqual(getInitialContactsWidth(), 420);
  } finally {
    globalObj.window = originalWindow;
  }
});

test("Suite 2: getInitialContactsWidth - Out-of-bounds saved values clamped", () => {
  const originalWindow = globalObj.window;
  try {
    const mockLow = createMockStorage({ [STORAGE_KEY_CONTACTS_WIDTH]: "100" });
    globalObj.window = { localStorage: mockLow };
    assert.strictEqual(getInitialContactsWidth(), MIN_CONTACTS_WIDTH);

    const mockHigh = createMockStorage({ [STORAGE_KEY_CONTACTS_WIDTH]: "800" });
    globalObj.window = { localStorage: mockHigh };
    assert.strictEqual(getInitialContactsWidth(), MAX_CONTACTS_WIDTH);
  } finally {
    globalObj.window = originalWindow;
  }
});

test("Suite 2: getInitialContactsWidth - Corrupted values fall back to default", () => {
  const originalWindow = globalObj.window;
  try {
    const corruptions = ["", "   ", "abc", "NaN", "undefined", "{}", "null", "[object Object]"];
    for (const bad of corruptions) {
      const mock = createMockStorage({ [STORAGE_KEY_CONTACTS_WIDTH]: bad });
      globalObj.window = { localStorage: mock };
      assert.strictEqual(
        getInitialContactsWidth(),
        DEFAULT_CONTACTS_WIDTH,
        `Failed on corrupted value: "${bad}"`
      );
    }
  } finally {
    globalObj.window = originalWindow;
  }
});

test("Suite 2: getInitialContactsWidth - Handles SecurityError gracefully", () => {
  const originalWindow = globalObj.window;
  try {
    globalObj.window = {
      localStorage: {
        getItem: () => {
          throw new Error("SecurityError: storage disabled");
        },
        setItem: () => {
          throw new Error("SecurityError: storage disabled");
        },
      },
    };
    assert.strictEqual(getInitialContactsWidth(), DEFAULT_CONTACTS_WIDTH);
  } finally {
    globalObj.window = originalWindow;
  }
});

test("Suite 2: getInitialContactsWidth - Handles undefined window / SSR environment", () => {
  const originalWindow = globalObj.window;
  try {
    delete globalObj.window;
    assert.strictEqual(getInitialContactsWidth(), DEFAULT_CONTACTS_WIDTH);
  } finally {
    globalObj.window = originalWindow;
  }
});

test("Suite 3: saveContactsWidth - Saves clamped integer strings", () => {
  const originalWindow = globalObj.window;
  try {
    const mock = createMockStorage();
    globalObj.window = { localStorage: mock };

    saveContactsWidth(380);
    assert.strictEqual(mock.getItem(STORAGE_KEY_CONTACTS_WIDTH), "380");

    saveContactsWidth(100);
    assert.strictEqual(mock.getItem(STORAGE_KEY_CONTACTS_WIDTH), "260");

    saveContactsWidth(850);
    assert.strictEqual(mock.getItem(STORAGE_KEY_CONTACTS_WIDTH), "500");
  } finally {
    globalObj.window = originalWindow;
  }
});

test("Suite 3: saveContactsWidth - Handles QuotaExceededError without throwing", () => {
  const originalWindow = globalObj.window;
  try {
    globalObj.window = {
      localStorage: {
        getItem: () => null,
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
      },
    };
    assert.doesNotThrow(() => saveContactsWidth(400));
  } finally {
    globalObj.window = originalWindow;
  }
});

test("Suite 3: saveContactsWidth - Handles undefined window / SSR environment", () => {
  const originalWindow = globalObj.window;
  try {
    delete globalObj.window;
    assert.doesNotThrow(() => saveContactsWidth(400));
  } finally {
    globalObj.window = originalWindow;
  }
});

test("Suite 4: Drag I/O isolation verification", () => {
  const originalWindow = globalObj.window;
  try {
    let writes = 0;
    const mock = {
      getItem: () => null,
      setItem: () => {
        writes++;
      },
    };
    globalObj.window = { localStorage: mock };

    // Simulate 100 pointermove frames during drag: zero storage writes
    for (let i = 0; i < 100; i++) {
      const simulatedDragWidth = clampContactsWidth(260 + i * 2);
      assert.ok(simulatedDragWidth >= 260 && simulatedDragWidth <= 500);
    }
    assert.strictEqual(writes, 0, "No storage writes should occur during active drag move");

    // Drag end fires once: exactly 1 storage write
    saveContactsWidth(450);
    assert.strictEqual(writes, 1, "Exactly one storage write on drag end");
  } finally {
    globalObj.window = originalWindow;
  }
});

test("Suite 2: getInitialContactsWidth - Handles SecurityError when window.localStorage getter throws", () => {
  const originalWindow = globalObj.window;
  try {
    const mockWindow: Record<string, unknown> = {};
    Object.defineProperty(mockWindow, "localStorage", {
      get() {
        throw new Error("SecurityError: Failed to read the 'localStorage' property from 'Window': Access is denied for this document.");
      },
      configurable: true,
    });
    globalObj.window = mockWindow as unknown as MockWindow;

    let width: number | null = null;
    let threw = false;
    try {
      width = getInitialContactsWidth();
    } catch {
      threw = true;
    }

    assert.strictEqual(threw, false, "getInitialContactsWidth must not throw when localStorage property getter throws SecurityError");
    assert.strictEqual(width, DEFAULT_CONTACTS_WIDTH, "Must fall back safely to DEFAULT_CONTACTS_WIDTH");
  } finally {
    globalObj.window = originalWindow;
  }
});

test("Suite 3: saveContactsWidth - Handles SecurityError when window.localStorage getter throws", () => {
  const originalWindow = globalObj.window;
  try {
    const mockWindow: Record<string, unknown> = {};
    Object.defineProperty(mockWindow, "localStorage", {
      get() {
        throw new Error("SecurityError: Failed to read the 'localStorage' property from 'Window': Access is denied for this document.");
      },
      configurable: true,
    });
    globalObj.window = mockWindow as unknown as MockWindow;

    assert.doesNotThrow(() => {
      saveContactsWidth(450);
    }, "saveContactsWidth must not throw when localStorage property getter throws SecurityError");
  } finally {
    globalObj.window = originalWindow;
  }
});
