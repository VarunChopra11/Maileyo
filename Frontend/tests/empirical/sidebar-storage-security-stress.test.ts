/**
 * Empirical Adversarial Challenge Suite: Sidebar Storage & Security Robustness
 *
 * Authored by: Challenger 1 (Milestone 1, Iteration 2)
 * Focus: Exhaustive verification of sidebarPersistence.ts against property-access throwing,
 * arbitrary thrown values (DOMException, Error, string, number, null, undefined, symbol, object),
 * pathological window/storage object structures, Proxy traps, and intermittent flapping errors.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  MIN_CONTACTS_WIDTH,
  MAX_CONTACTS_WIDTH,
  DEFAULT_CONTACTS_WIDTH,
  getInitialContactsWidth,
  saveContactsWidth,
} from "../../src/lib/sidebarPersistence.ts";

const globalObj = globalThis as unknown as { window?: unknown };

// ---------------------------------------------------------------------------
// SUITE 1: PROPERTY-ACCESS THROWING ON window.localStorage
// ---------------------------------------------------------------------------

test("Suite 1.1: window.localStorage getter throws DOMException (SecurityError)", () => {
  const originalWindow = globalObj.window;
  try {
    const mockWindow: Record<string, unknown> = {};
    Object.defineProperty(mockWindow, "localStorage", {
      get() {
        const err = new Error("SecurityError: Access is denied for this document.");
        err.name = "SecurityError";
        throw err;
      },
      configurable: true,
    });
    globalObj.window = mockWindow;

    // getInitialContactsWidth must not throw and must return DEFAULT_CONTACTS_WIDTH
    let readResult: number | undefined;
    assert.doesNotThrow(() => {
      readResult = getInitialContactsWidth();
    }, "getInitialContactsWidth must not throw when localStorage getter throws DOMException SecurityError");
    assert.strictEqual(readResult, DEFAULT_CONTACTS_WIDTH);

    // saveContactsWidth must not throw
    assert.doesNotThrow(() => {
      saveContactsWidth(450);
    }, "saveContactsWidth must not throw when localStorage getter throws DOMException SecurityError");
  } finally {
    globalObj.window = originalWindow;
  }
});

test("Suite 1.2: window.localStorage getter throws standard Error", () => {
  const originalWindow = globalObj.window;
  try {
    const mockWindow: Record<string, unknown> = {};
    Object.defineProperty(mockWindow, "localStorage", {
      get() {
        throw new Error("Generic failure reading window.localStorage");
      },
      configurable: true,
    });
    globalObj.window = mockWindow;

    assert.doesNotThrow(() => {
      const val = getInitialContactsWidth();
      assert.strictEqual(val, DEFAULT_CONTACTS_WIDTH);
    });

    assert.doesNotThrow(() => {
      saveContactsWidth(380);
    });
  } finally {
    globalObj.window = originalWindow;
  }
});

test("Suite 1.3: window.localStorage getter throws primitive string", () => {
  const originalWindow = globalObj.window;
  try {
    const mockWindow: Record<string, unknown> = {};
    Object.defineProperty(mockWindow, "localStorage", {
      get() {
        throw "String throw: Restricted access";
      },
      configurable: true,
    });
    globalObj.window = mockWindow;

    assert.doesNotThrow(() => {
      const val = getInitialContactsWidth();
      assert.strictEqual(val, DEFAULT_CONTACTS_WIDTH);
    });

    assert.doesNotThrow(() => {
      saveContactsWidth(400);
    });
  } finally {
    globalObj.window = originalWindow;
  }
});

test("Suite 1.4: window.localStorage getter throws primitive number", () => {
  const originalWindow = globalObj.window;
  try {
    const mockWindow: Record<string, unknown> = {};
    Object.defineProperty(mockWindow, "localStorage", {
      get() {
        throw 403;
      },
      configurable: true,
    });
    globalObj.window = mockWindow;

    assert.doesNotThrow(() => {
      const val = getInitialContactsWidth();
      assert.strictEqual(val, DEFAULT_CONTACTS_WIDTH);
    });

    assert.doesNotThrow(() => {
      saveContactsWidth(400);
    });
  } finally {
    globalObj.window = originalWindow;
  }
});

test("Suite 1.5: window.localStorage getter throws null and undefined", () => {
  const originalWindow = globalObj.window;
  try {
    // Test throw null
    const mockWindowNull: Record<string, unknown> = {};
    Object.defineProperty(mockWindowNull, "localStorage", {
      get() {
        throw null;
      },
      configurable: true,
    });
    globalObj.window = mockWindowNull;

    assert.doesNotThrow(() => {
      assert.strictEqual(getInitialContactsWidth(), DEFAULT_CONTACTS_WIDTH);
      saveContactsWidth(300);
    });

    // Test throw undefined
    const mockWindowUndef: Record<string, unknown> = {};
    Object.defineProperty(mockWindowUndef, "localStorage", {
      get() {
        throw undefined;
      },
      configurable: true,
    });
    globalObj.window = mockWindowUndef;

    assert.doesNotThrow(() => {
      assert.strictEqual(getInitialContactsWidth(), DEFAULT_CONTACTS_WIDTH);
      saveContactsWidth(300);
    });
  } finally {
    globalObj.window = originalWindow;
  }
});

test("Suite 1.6: window.localStorage getter throws non-Error object or Symbol", () => {
  const originalWindow = globalObj.window;
  try {
    const mockWindow: Record<string, unknown> = {};
    Object.defineProperty(mockWindow, "localStorage", {
      get() {
        throw { code: 18, reason: "SecurityError", details: { blocked: true } };
      },
      configurable: true,
    });
    globalObj.window = mockWindow;

    assert.doesNotThrow(() => {
      assert.strictEqual(getInitialContactsWidth(), DEFAULT_CONTACTS_WIDTH);
      saveContactsWidth(320);
    });

    // Symbol throw
    Object.defineProperty(mockWindow, "localStorage", {
      get() {
        throw Symbol("security-denial");
      },
      configurable: true,
    });

    assert.doesNotThrow(() => {
      assert.strictEqual(getInitialContactsWidth(), DEFAULT_CONTACTS_WIDTH);
      saveContactsWidth(320);
    });
  } finally {
    globalObj.window = originalWindow;
  }
});

// ---------------------------------------------------------------------------
// SUITE 2: STORAGE METHOD THROWING (getItem / setItem)
// ---------------------------------------------------------------------------

test("Suite 2.1: getItem throws diverse error types", () => {
  const originalWindow = globalObj.window;
  try {
    const errorTypes = [
      new Error("getItem standard error"),
      "getItem string error",
      1001,
      null,
      undefined,
      { code: 18, message: "Storage disabled" },
      Symbol("getItem fail"),
    ];

    for (const thrown of errorTypes) {
      globalObj.window = {
        localStorage: {
          getItem() {
                throw thrown;
          },
          setItem() {},
        },
      };

      assert.doesNotThrow(() => {
        const val = getInitialContactsWidth();
        assert.strictEqual(val, DEFAULT_CONTACTS_WIDTH);
      }, `Must not throw when getItem throws ${String(thrown)}`);
    }
  } finally {
    globalObj.window = originalWindow;
  }
});

test("Suite 2.2: setItem throws diverse error types", () => {
  const originalWindow = globalObj.window;
  try {
    const errorTypes = [
      new Error("QuotaExceededError"),
      "Quota exceeded string",
      507,
      null,
      undefined,
      { quota: 0 },
      Symbol("quota full"),
    ];

    for (const thrown of errorTypes) {
      globalObj.window = {
        localStorage: {
          getItem() {
            return null;
          },
          setItem() {
                throw thrown;
          },
        },
      };

      assert.doesNotThrow(() => {
        saveContactsWidth(420);
      }, `Must not throw when setItem throws ${String(thrown)}`);
    }
  } finally {
    globalObj.window = originalWindow;
  }
});

// ---------------------------------------------------------------------------
// SUITE 3: PATHOLOGICAL WINDOW AND LOCALSTORAGE SHAPES
// ---------------------------------------------------------------------------

test("Suite 3.1: window is null, boolean, or non-object", () => {
  const originalWindow = globalObj.window;
  try {
    // window = null
    globalObj.window = null as unknown as Window;
    assert.doesNotThrow(() => {
      assert.strictEqual(getInitialContactsWidth(), DEFAULT_CONTACTS_WIDTH);
      saveContactsWidth(350);
    }, "Must safely handle window === null");

    // window = 42
    globalObj.window = 42 as unknown as Window;
    assert.doesNotThrow(() => {
      assert.strictEqual(getInitialContactsWidth(), DEFAULT_CONTACTS_WIDTH);
      saveContactsWidth(350);
    }, "Must safely handle window as number");

    // window = "browser"
    globalObj.window = "browser" as unknown as Window;
    assert.doesNotThrow(() => {
      assert.strictEqual(getInitialContactsWidth(), DEFAULT_CONTACTS_WIDTH);
      saveContactsWidth(350);
    }, "Must safely handle window as string");
  } finally {
    globalObj.window = originalWindow;
  }
});

test("Suite 3.2: localStorage is null, undefined, false, or primitive", () => {
  const originalWindow = globalObj.window;
  try {
    const oddValues = [null, undefined, false, true, 0, 999, "string", Symbol("storage")];

    for (const odd of oddValues) {
      globalObj.window = { localStorage: odd };

      assert.doesNotThrow(() => {
        assert.strictEqual(
          getInitialContactsWidth(),
          DEFAULT_CONTACTS_WIDTH,
          `Must return default width when localStorage is ${String(odd)}`
        );
        saveContactsWidth(400);
      }, `Must not throw when localStorage is ${String(odd)}`);
    }
  } finally {
    globalObj.window = originalWindow;
  }
});

test("Suite 3.3: getItem and setItem are not functions or missing", () => {
  const originalWindow = globalObj.window;
  try {
    // localStorage is empty object {}
    globalObj.window = { localStorage: {} };
    assert.doesNotThrow(() => {
      assert.strictEqual(getInitialContactsWidth(), DEFAULT_CONTACTS_WIDTH);
      saveContactsWidth(350);
    }, "Must safely handle localStorage with missing methods");

    // getItem is string, setItem is number
    globalObj.window = {
      localStorage: {
        getItem: "notAFunction" as unknown as Storage["getItem"],
        setItem: 12345 as unknown as Storage["setItem"],
      },
    };
    assert.doesNotThrow(() => {
      assert.strictEqual(getInitialContactsWidth(), DEFAULT_CONTACTS_WIDTH);
      saveContactsWidth(350);
    }, "Must safely handle non-function getItem/setItem");
  } finally {
    globalObj.window = originalWindow;
  }
});

test("Suite 3.4: getItem returns unexpected types (non-string returns)", () => {
  const originalWindow = globalObj.window;
  try {
    const nonStringReturns = [
      {},
      [],
      [350],
      true,
      false,
      350,
      Symbol("350"),
      () => 350,
    ];

    for (const ret of nonStringReturns) {
      globalObj.window = {
        localStorage: {
          getItem() {
            return ret as unknown as string;
          },
          setItem() {},
        },
      };

      assert.doesNotThrow(() => {
        const result = getInitialContactsWidth();
        assert.ok(
          Number.isFinite(result) && result >= MIN_CONTACTS_WIDTH && result <= MAX_CONTACTS_WIDTH,
          `Result must be valid clamped finite number when getItem returns non-string ${String(ret)}`
        );
      }, `Must safely handle non-string return: ${String(ret)}`);
    }
  } finally {
    globalObj.window = originalWindow;
  }
});

// ---------------------------------------------------------------------------
// SUITE 4: PROXY-BASED ADVERSARIAL ENVIRONMENTS
// ---------------------------------------------------------------------------

test("Suite 4.1: Proxy window with throwing property traps", () => {
  const originalWindow = globalObj.window;
  try {
    const proxyWindow = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "localStorage") {
            const err = new Error("Blocked by Proxy security trap");
            err.name = "SecurityError";
            throw err;
          }
          return undefined;
        },
        has(_target, prop) {
          if (prop === "localStorage") {
            throw new Error("Proxy 'has' trap thrown");
          }
          return false;
        },
      }
    );

    globalObj.window = proxyWindow;

    assert.doesNotThrow(() => {
      assert.strictEqual(getInitialContactsWidth(), DEFAULT_CONTACTS_WIDTH);
    });

    assert.doesNotThrow(() => {
      saveContactsWidth(380);
    });
  } finally {
    globalObj.window = originalWindow;
  }
});

test("Suite 4.2: Proxy localStorage with method-access trapping and throwing", () => {
  const originalWindow = globalObj.window;
  try {
    const proxyStorage = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "getItem") {
            throw new Error("Proxy trapped getItem property access");
          }
          if (prop === "setItem") {
            throw new Error("Proxy trapped setItem property access");
          }
          return undefined;
        },
      }
    );

    globalObj.window = { localStorage: proxyStorage };

    assert.doesNotThrow(() => {
      assert.strictEqual(getInitialContactsWidth(), DEFAULT_CONTACTS_WIDTH);
    });

    assert.doesNotThrow(() => {
      saveContactsWidth(450);
    });
  } finally {
    globalObj.window = originalWindow;
  }
});

// ---------------------------------------------------------------------------
// SUITE 5: RAPID FLAPPING & CONCURRENT HIGH-FREQUENCY STRESS
// ---------------------------------------------------------------------------

test("Suite 5.1: 5,000 rapid calls under alternating throwing and normal conditions", () => {
  const originalWindow = globalObj.window;
  try {
    let callIndex = 0;
    const store = new Map<string, string>();

    const flappingWindow: Record<string, unknown> = {};
    Object.defineProperty(flappingWindow, "localStorage", {
      get() {
        callIndex++;
        const mod = callIndex % 5;
        if (mod === 0) {
          const secErr = new Error("SecurityError: Access denied");
          secErr.name = "SecurityError";
          throw secErr;
        }
        if (mod === 1) {
            throw "Raw string denial";
        }
        if (mod === 2) {
          return null; // no storage
        }
        if (mod === 3) {
          return {
            getItem: () => {
              throw new Error("QuotaExceededError");
            },
            setItem: () => {
              throw new Error("QuotaExceededError");
            },
          };
        }
        // mod === 4: normal working storage
        return {
          getItem: (key: string) => store.get(key) ?? null,
          setItem: (key: string, val: string) => store.set(key, val),
        };
      },
      configurable: true,
    });

    globalObj.window = flappingWindow;

    const originalWarn = console.warn;
    let warnCount = 0;
    console.warn = () => {
      warnCount++;
    };

    try {
      for (let i = 0; i < 5000; i++) {
        const target = 260 + (i % 241); // [260, 500]
        saveContactsWidth(target);
        const read = getInitialContactsWidth();

        assert.ok(
          Number.isFinite(read),
          `Read width must be a finite number at iteration ${i}`
        );
        assert.ok(
          read >= MIN_CONTACTS_WIDTH && read <= MAX_CONTACTS_WIDTH,
          `Read width ${read} must be within [260, 500] at iteration ${i}`
        );
        assert.strictEqual(
          Number.isInteger(read),
          true,
          `Read width ${read} must be an integer at iteration ${i}`
        );
      }
      assert.ok(warnCount > 0, "Warnings should have been recorded during throwing iterations");
    } finally {
      console.warn = originalWarn;
    }
  } finally {
    globalObj.window = originalWindow;
  }
});

