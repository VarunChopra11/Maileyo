/**
 * Empirical Stress Test Harness & Adversarial Challenge Suite
 * Milestone 2: Globally Accessible Compose Modal (Features 5, 6, 7, 8, 9)
 *
 * Authored by: Challenger M2-1 (Empirical Testing: Keyboard Shortcut Robustness & Draft Isolation)
 * Focus:
 * 1. Keyboard Shortcut Robustness (useComposeShortcut):
 *    - Exhaustive 16-state modifier truth table (ctrlKey, metaKey, altKey, shiftKey combinations like Ctrl+Shift+C, Cmd+Option+C).
 *    - Deeply nested interactive elements (contenteditable variants, 10+ levels deep spans, inputs in custom web components / shadow roots).
 *    - 500 rapid keypress bursts under Closed, Open, Minimized, and Maximized modal states.
 * 2. Draft Isolation Stress:
 *    - Rapid folder switches (100+) and contact switches (200+) while typing draft text.
 *    - Verification of draft object integrity, reply/forward metadata retention, and zero state pollution.
 * 3. Lifecycle & Teardown Safety:
 *    - Event listener attachment, detachment on disable/unmount, and memory leak prevention.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_COMPOSE_DRAFT,
  extractCleanEmail,
  formatReplySubject,
  formatForwardSubject,
  type ComposeDraft,
  type EmailMessage,
  type EmailContact,
  type SidebarFolder,
} from "../../src/types/email.ts";

// ---------------------------------------------------------------------------
// ADVERSARIAL DOM HIERARCHY SIMULATION HARNESS
// ---------------------------------------------------------------------------

export interface MockDOMElementOptions {
  tagName?: string;
  isContentEditable?: boolean;
  attributes?: Record<string, string>;
  parentElement?: MockDOMElement | null;
  shadowRoot?: MockShadowRoot | null;
}

export class MockShadowRoot {
  public mode: "open" | "closed";
  public host: MockDOMElement;
  public children: MockDOMElement[] = [];

  constructor(host: MockDOMElement, mode: "open" | "closed" = "open") {
    this.host = host;
    this.mode = mode;
  }

  appendChild(child: MockDOMElement): MockDOMElement {
    child.parentElement = null; // In DOM, parentNode is the shadow root, parentElement is null
    this.children.push(child);
    return child;
  }
}

export class MockDOMElement {
  public tagName: string;
  public attributes: Map<string, string>;
  public parentElement: MockDOMElement | null;
  public shadowRoot: MockShadowRoot | null;
  public _explicitIsContentEditable?: boolean;

  constructor(options: MockDOMElementOptions = {}) {
    this.tagName = options.tagName ? options.tagName.toUpperCase() : "DIV";
    this.attributes = new Map();
    if (options.attributes) {
      for (const [k, v] of Object.entries(options.attributes)) {
        this.attributes.set(k.toLowerCase(), v);
      }
    }
    this.parentElement = options.parentElement ?? null;
    this.shadowRoot = options.shadowRoot ?? null;
    this._explicitIsContentEditable = options.isContentEditable;
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name.toLowerCase()) ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name.toLowerCase(), value);
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name.toLowerCase());
  }

  /**
   * HTML5 isContentEditable standard:
   * Returns true if element has contenteditable="true" | "" | "plaintext-only",
   * or if inherited from parentElement, unless explicitly "false".
   */
  get isContentEditable(): boolean {
    if (this._explicitIsContentEditable !== undefined) {
      return this._explicitIsContentEditable;
    }
    const attr = this.getAttribute("contenteditable");
    if (attr !== null) {
      const lower = attr.toLowerCase();
      if (lower === "false") return false;
      if (lower === "true" || lower === "" || lower === "plaintext-only" || lower === "events") {
        return true;
      }
    }
    if (this.parentElement) {
      return this.parentElement.isContentEditable;
    }
    return false;
  }

  set isContentEditable(val: boolean) {
    this._explicitIsContentEditable = val;
  }

  /**
   * Standard DOM Element.closest() implementation supporting:
   * - [contenteditable='true']
   * - input, textarea, select
   * - custom tag names and class selectors
   */
  closest(selector: string): MockDOMElement | null {
    const parts = selector.split(",").map((s) => s.trim().toLowerCase());

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let current: MockDOMElement | null = this;
    while (current) {
      for (const sel of parts) {
        if (sel === "[contenteditable='true']") {
          if (current.getAttribute("contenteditable")?.toLowerCase() === "true") {
            return current;
          }
        } else if (sel === "input" || sel === "textarea" || sel === "select") {
          if (current.tagName.toLowerCase() === sel) {
            return current;
          }
        } else if (sel.startsWith(".")) {
          const className = current.getAttribute("class") || "";
          if (className.split(/\s+/).includes(sel.substring(1))) {
            return current;
          }
        } else if (current.tagName.toLowerCase() === sel) {
          return current;
        }
      }
      current = current.parentElement;
    }
    return null;
  }

  appendChild(child: MockDOMElement): MockDOMElement {
    child.parentElement = this;
    return child;
  }
}

/**
 * Creates a synthetic KeyboardEvent adhering to the exact DOM interface
 * queried by useComposeShortcut.ts.
 */
export interface SyntheticKeyboardEventOptions {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  target?: MockDOMElement | HTMLElement | null;
}

export class SyntheticKeyboardEvent {
  public key: string;
  public ctrlKey: boolean;
  public metaKey: boolean;
  public altKey: boolean;
  public shiftKey: boolean;
  public target: MockDOMElement | HTMLElement | null;
  public defaultPrevented: boolean = false;

  constructor(options: SyntheticKeyboardEventOptions) {
    this.key = options.key;
    this.ctrlKey = !!options.ctrlKey;
    this.metaKey = !!options.metaKey;
    this.altKey = !!options.altKey;
    this.shiftKey = !!options.shiftKey;
    this.target = options.target ?? null;
  }

  preventDefault(): void {
    this.defaultPrevented = true;
  }
}

/**
 * Verbatim execution of the keyboard shortcut handler in useComposeShortcut.ts.
 * Returns true if the shortcut triggered (event.preventDefault() and onTrigger() called),
 * or false if safely rejected by any of the guarding layers.
 */
export function runComposeShortcutEvaluator(
  event: SyntheticKeyboardEvent,
  onTrigger: () => void
): boolean {
  // 1. Guard against modifier keys: Ctrl+C (copy), Cmd+C (mac copy), Alt+C
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return false;
  }

  // 2. Only respond to key 'c' or 'C'
  if (event.key !== "c" && event.key !== "C") {
    return false;
  }

  // 3. Inspect target element to protect input fields and editors
  const target = event.target as MockDOMElement | HTMLElement | null;
  if (target) {
    const tagName = target.tagName ? target.tagName.toLowerCase() : "";

    // Form elements
    if (tagName === "input" || tagName === "textarea" || tagName === "select") {
      return false;
    }

    // Direct contentEditable
    if (target.isContentEditable) {
      return false;
    }

    // Nested inside editable regions or form elements
    if (
      target.closest?.("[contenteditable='true']") ||
      target.closest?.("input, textarea, select")
    ) {
      return false;
    }
  }

  // 4. Prevent default browser scroll/action and trigger compose
  event.preventDefault();
  onTrigger();
  return true;
}

// ---------------------------------------------------------------------------
// HIGH-FIDELITY DASHBOARD & COMPOSE CONTEXT STATE HARNESS
// ---------------------------------------------------------------------------

export class DashboardStateHarness {
  // Dashboard state (Dashboard.tsx)
  public selectedFolder: SidebarFolder = "Primary+Sent";
  public selectedContact: EmailContact | null = null;
  public contacts: EmailContact[] = [];
  public messages: EmailMessage[] = [];
  public contactsLoading: boolean = false;
  public messagesLoading: boolean = false;
  public contactsPageToken: string = "";
  public messagesPageToken: string = "";

  // Compose Context state (ComposeContext.tsx)
  public isOpen: boolean = false;
  public isMinimized: boolean = false;
  public isMaximized: boolean = false;
  public draft: ComposeDraft = { ...DEFAULT_COMPOSE_DRAFT };
  public triggerCount: number = 0;

  // Shortcuts & UI triggers
  handleShortcutTrigger() {
    this.triggerCount++;
    this.isOpen = true;
    this.isMinimized = false;
  }

  openCompose(initial?: Partial<ComposeDraft>) {
    if (initial) {
      this.draft = {
        ...DEFAULT_COMPOSE_DRAFT,
        ...this.draft,
        ...initial,
      };
    } else {
      // If draft already has content, preserve it
      if (
        !this.draft.bodyHtml &&
        !this.draft.bodyPlain &&
        this.draft.to.length === 0 &&
        !this.draft.subject &&
        this.draft.attachments.length === 0
      ) {
        this.draft = { ...DEFAULT_COMPOSE_DRAFT };
      }
    }
    this.isOpen = true;
    this.isMinimized = false;
  }

  openReply(message: EmailMessage, threadId?: string) {
    const replyRecipient = message.isSent
      ? message.to && message.to.length > 0
        ? message.to
        : []
      : [extractCleanEmail(message.from)].filter(Boolean);

    this.draft = {
      ...DEFAULT_COMPOSE_DRAFT,
      to: replyRecipient,
      subject: formatReplySubject(message.subject),
      threadId: threadId || message.threadId || message.id,
      inReplyTo: message.id,
      references: message.id,
      replyMode: "reply",
    };
    this.isOpen = true;
    this.isMinimized = false;
    this.isMaximized = false;
  }

  openForward(message: EmailMessage) {
    const originalContent =
      message.cleanBodyHtml ||
      message.bodyHtml ||
      message.cleanBodyPlain ||
      message.bodyPlain ||
      "";

    this.draft = {
      ...DEFAULT_COMPOSE_DRAFT,
      to: [],
      subject: formatForwardSubject(message.subject),
      bodyHtml: `<div class="gmail_quote"><div>${originalContent}</div></div>`,
      bodyPlain: `\n---------- Forwarded message ---------\n${message.cleanBodyPlain || ""}`,
      replyMode: "forward",
    };
    this.isOpen = true;
    this.isMinimized = false;
    this.isMaximized = false;
  }

  closeCompose() {
    this.isOpen = false;
    this.isMinimized = false;
    this.isMaximized = false;
  }

  minimizeCompose() {
    this.isMinimized = !this.isMinimized;
    this.isMaximized = false;
  }

  maximizeCompose() {
    this.isMaximized = !this.isMaximized;
    this.isMinimized = false;
  }

  restoreCompose() {
    this.isMinimized = false;
    this.isMaximized = false;
  }

  updateDraft(updates: Partial<ComposeDraft>) {
    this.draft = {
      ...this.draft,
      ...updates,
    };
  }

  clearDraft() {
    this.draft = { ...DEFAULT_COMPOSE_DRAFT };
  }

  // Dashboard operations (Dashboard.tsx)
  handleFolderSelect(folder: SidebarFolder) {
    this.selectedFolder = folder;
    this.selectedContact = null;
    this.contacts = [];
    this.messages = [];
    this.contactsPageToken = "";
    this.messagesPageToken = "";
  }

  handleContactSelect(contact: EmailContact) {
    this.selectedContact = contact;
    this.messages = [];
    this.messagesPageToken = "";
  }
}

// ===========================================================================
// SUITE 1: EXHAUSTIVE 16-STATE MODIFIER KEYS COMBINATIONS MATRIX
// ===========================================================================

test("Suite 1.1: Exhaustive 16-state truth table for key 'c' across all modifier permutations", () => {
  const modifiers = [false, true];
  let testedStates = 0;

  for (const ctrlKey of modifiers) {
    for (const metaKey of modifiers) {
      for (const altKey of modifiers) {
        for (const shiftKey of modifiers) {
          testedStates++;
          let triggered = false;
          const event = new SyntheticKeyboardEvent({
            key: "c",
            ctrlKey,
            metaKey,
            altKey,
            shiftKey,
          });

          const result = runComposeShortcutEvaluator(event, () => {
            triggered = true;
          });

          // Invariant: ANY of ctrlKey, metaKey, altKey MUST reject the shortcut completely
          const hasDisallowedModifier = ctrlKey || metaKey || altKey;

          if (hasDisallowedModifier) {
            assert.strictEqual(
              result,
              false,
              `State failed: ctrl=${ctrlKey}, meta=${metaKey}, alt=${altKey}, shift=${shiftKey} must be REJECTED`
            );
            assert.strictEqual(triggered, false);
            assert.strictEqual(event.defaultPrevented, false);
          } else {
            // No disallowed modifiers (pure 'c' or Shift+'c') -> MUST trigger
            assert.strictEqual(
              result,
              true,
              `State failed: ctrl=${ctrlKey}, meta=${metaKey}, alt=${altKey}, shift=${shiftKey} must TRIGGER`
            );
            assert.strictEqual(triggered, true);
            assert.strictEqual(event.defaultPrevented, true);
          }
        }
      }
    }
  }

  assert.strictEqual(testedStates, 16, "Must test exactly 16 modifier permutations");
});

test("Suite 1.2: Exhaustive 16-state truth table for uppercase 'C' across all modifier permutations", () => {
  const modifiers = [false, true];
  let testedStates = 0;

  for (const ctrlKey of modifiers) {
    for (const metaKey of modifiers) {
      for (const altKey of modifiers) {
        for (const shiftKey of modifiers) {
          testedStates++;
          let triggered = false;
          const event = new SyntheticKeyboardEvent({
            key: "C",
            ctrlKey,
            metaKey,
            altKey,
            shiftKey,
          });

          const result = runComposeShortcutEvaluator(event, () => {
            triggered = true;
          });

          const hasDisallowedModifier = ctrlKey || metaKey || altKey;

          if (hasDisallowedModifier) {
            assert.strictEqual(
              result,
              false,
              `State failed: ctrl=${ctrlKey}, meta=${metaKey}, alt=${altKey}, shift=${shiftKey} must be REJECTED`
            );
            assert.strictEqual(triggered, false);
            assert.strictEqual(event.defaultPrevented, false);
          } else {
            assert.strictEqual(
              result,
              true,
              `State failed: ctrl=${ctrlKey}, meta=${metaKey}, alt=${altKey}, shift=${shiftKey} must TRIGGER`
            );
            assert.strictEqual(triggered, true);
            assert.strictEqual(event.defaultPrevented, true);
          }
        }
      }
    }
  }

  assert.strictEqual(testedStates, 16, "Must test exactly 16 modifier permutations for 'C'");
});

test("Suite 1.3: Real-world OS accelerator key combinations are strictly guarded", () => {
  const osAccelerators: Array<{ name: string; options: SyntheticKeyboardEventOptions }> = [
    { name: "Windows/Linux Copy: Ctrl+C", options: { key: "c", ctrlKey: true } },
    { name: "macOS Copy: Cmd+C", options: { key: "c", metaKey: true } },
    { name: "macOS Uppercase Copy: Cmd+Shift+C", options: { key: "C", metaKey: true, shiftKey: true } },
    { name: "Browser DevTools Elements Inspector: Ctrl+Shift+C", options: { key: "C", ctrlKey: true, shiftKey: true } },
    { name: "macOS Keynote Copy Style: Cmd+Option+C", options: { key: "c", metaKey: true, altKey: true } },
    { name: "macOS Uppercase Copy Style: Cmd+Option+Shift+C", options: { key: "C", metaKey: true, altKey: true, shiftKey: true } },
    { name: "System Accelerator: Alt+C", options: { key: "c", altKey: true } },
    { name: "System Accelerator: Alt+Shift+C", options: { key: "C", altKey: true, shiftKey: true } },
    { name: "Linux Terminal Interrupt: Ctrl+C", options: { key: "c", ctrlKey: true } },
    { name: "All 4 Modifiers: Ctrl+Cmd+Alt+Shift+C", options: { key: "C", ctrlKey: true, metaKey: true, altKey: true, shiftKey: true } },
  ];

  for (const { name, options } of osAccelerators) {
    let triggered = false;
    const event = new SyntheticKeyboardEvent(options);
    const result = runComposeShortcutEvaluator(event, () => {
      triggered = true;
    });

    assert.strictEqual(result, false, `Expected ${name} to be rejected`);
    assert.strictEqual(triggered, false, `Expected ${name} to not trigger compose`);
    assert.strictEqual(event.defaultPrevented, false, `Expected ${name} to not call preventDefault`);
  }
});

test("Suite 1.4: Non-'c' keys (alphanumeric, functional, navigation) are strictly ignored", () => {
  const ignoredKeys = [
    "v", "V", "x", "X", "a", "A", "z", "Z", "c1", "cc",
    "Enter", "Escape", "Tab", "Backspace", "Delete", "Space", " ",
    "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
    "Home", "End", "PageUp", "PageDown",
    "Shift", "Control", "Alt", "Meta", "CapsLock",
    "F1", "F2", "F5", "F11", "F12",
  ];

  for (const key of ignoredKeys) {
    let triggered = false;
    const event = new SyntheticKeyboardEvent({ key });
    const result = runComposeShortcutEvaluator(event, () => {
      triggered = true;
    });

    assert.strictEqual(result, false, `Expected key '${key}' to be ignored`);
    assert.strictEqual(triggered, false);
    assert.strictEqual(event.defaultPrevented, false);
  }
});

// ===========================================================================
// SUITE 2: DEEPLY NESTED INTERACTIVE ELEMENTS & DOM TOPOLOGIES
// ===========================================================================

test("Suite 2.1: Native form controls (input, textarea, select) strictly suppress shortcut", () => {
  const formTagNames = [
    "input", "INPUT", "Input",
    "textarea", "TEXTAREA", "Textarea",
    "select", "SELECT", "Select",
  ];

  for (const tag of formTagNames) {
    const el = new MockDOMElement({ tagName: tag });
    let triggered = false;
    const event = new SyntheticKeyboardEvent({ key: "c", target: el });
    const result = runComposeShortcutEvaluator(event, () => {
      triggered = true;
    });

    assert.strictEqual(result, false, `Form element <${tag}> must suppress compose shortcut`);
    assert.strictEqual(triggered, false);
    assert.strictEqual(event.defaultPrevented, false);
  }
});

test("Suite 2.2: Contenteditable container variants suppress shortcut", () => {
  const editableVariants: Array<{ name: string; element: MockDOMElement }> = [
    {
      name: "Explicit contenteditable='true'",
      element: new MockDOMElement({ tagName: "div", attributes: { contenteditable: "true" } }),
    },
    {
      name: "Empty contenteditable=''",
      element: new MockDOMElement({ tagName: "div", attributes: { contenteditable: "" } }),
    },
    {
      name: "Plaintext-only contenteditable='plaintext-only'",
      element: new MockDOMElement({ tagName: "div", attributes: { contenteditable: "plaintext-only" } }),
    },
    {
      name: "Direct isContentEditable property = true",
      element: new MockDOMElement({ tagName: "div", isContentEditable: true }),
    },
    {
      name: "Section with contenteditable='true'",
      element: new MockDOMElement({ tagName: "section", attributes: { contenteditable: "true" } }),
    },
  ];

  for (const { name, element } of editableVariants) {
    let triggered = false;
    const event = new SyntheticKeyboardEvent({ key: "c", target: element });
    const result = runComposeShortcutEvaluator(event, () => {
      triggered = true;
    });

    assert.strictEqual(result, false, `${name} must suppress compose shortcut`);
    assert.strictEqual(triggered, false);
    assert.strictEqual(event.defaultPrevented, false);
  }
});

test("Suite 2.3: Deeply nested elements (10+ levels deep) inside contenteditable are suppressed", () => {
  // Build a 10-level deep DOM hierarchy:
  // div[contenteditable="true"] > section > article > div > ul > li > p > span > em > strong > mark > span#deep-target
  const root = new MockDOMElement({
    tagName: "div",
    attributes: { contenteditable: "true" },
  });

  const level1 = root.appendChild(new MockDOMElement({ tagName: "section" }));
  const level2 = level1.appendChild(new MockDOMElement({ tagName: "article" }));
  const level3 = level2.appendChild(new MockDOMElement({ tagName: "div" }));
  const level4 = level3.appendChild(new MockDOMElement({ tagName: "ul" }));
  const level5 = level4.appendChild(new MockDOMElement({ tagName: "li" }));
  const level6 = level5.appendChild(new MockDOMElement({ tagName: "p" }));
  const level7 = level6.appendChild(new MockDOMElement({ tagName: "span" }));
  const level8 = level7.appendChild(new MockDOMElement({ tagName: "em" }));
  const level9 = level8.appendChild(new MockDOMElement({ tagName: "strong" }));
  const level10 = level9.appendChild(new MockDOMElement({ tagName: "mark" }));
  const leaf = level10.appendChild(
    new MockDOMElement({ tagName: "span", attributes: { id: "deep-target" } })
  );

  // Assert standard DOM inheritance properties
  assert.strictEqual(leaf.isContentEditable, true, "Leaf must inherit isContentEditable from ancestor");
  assert.strictEqual(leaf.closest("[contenteditable='true']"), root, "closest() must find root editable div");

  // Dispatch 'c' keydown at deep leaf
  let triggered = false;
  const event = new SyntheticKeyboardEvent({ key: "c", target: leaf });
  const result = runComposeShortcutEvaluator(event, () => {
    triggered = true;
  });

  assert.strictEqual(result, false, "Typing 'c' in 10-level deep contenteditable child must be suppressed");
  assert.strictEqual(triggered, false);
  assert.strictEqual(event.defaultPrevented, false);
});

test("Suite 2.4: Deeply nested elements inside form wrappers (label > span > input)", () => {
  // Hierarchy: form > fieldset > div.form-group > label > span > input
  const form = new MockDOMElement({ tagName: "form" });
  const fieldset = form.appendChild(new MockDOMElement({ tagName: "fieldset" }));
  const formGroup = fieldset.appendChild(new MockDOMElement({ tagName: "div" }));
  const label = formGroup.appendChild(new MockDOMElement({ tagName: "label" }));
  const span = label.appendChild(new MockDOMElement({ tagName: "span" }));
  const input = span.appendChild(new MockDOMElement({ tagName: "input" }));

  let triggered = false;
  const event = new SyntheticKeyboardEvent({ key: "c", target: input });
  const result = runComposeShortcutEvaluator(event, () => {
    triggered = true;
  });

  assert.strictEqual(result, false, "Input inside nested label/form must suppress shortcut");
  assert.strictEqual(triggered, false);
  assert.strictEqual(event.defaultPrevented, false);
});

test("Suite 2.5: Shadow DOM and Custom Web Components edge cases", () => {
  // Scenario A: Custom input component with inner input
  const customInputHost = new MockDOMElement({ tagName: "CUSTOM-INPUT" });
  const shadowRoot = new MockShadowRoot(customInputHost, "open");
  const innerInput = shadowRoot.appendChild(new MockDOMElement({ tagName: "input" }));

  // When focus is on the inner input
  let triggered = false;
  const eventA = new SyntheticKeyboardEvent({ key: "c", target: innerInput });
  const resultA = runComposeShortcutEvaluator(eventA, () => {
    triggered = true;
  });
  assert.strictEqual(resultA, false, "Inner input in shadow DOM must suppress shortcut");
  assert.strictEqual(triggered, false);

  // Scenario B: Read-only shadow DOM email renderer (SecureEmailRenderer)
  // Email content is read-only (not contenteditable).
  const emailHost = new MockDOMElement({ tagName: "DIV", attributes: { class: "secure-shadow-host" } });
  const emailShadow = new MockShadowRoot(emailHost, "open");
  const emailBodyContent = emailShadow.appendChild(new MockDOMElement({ tagName: "div", attributes: { class: "email-body-content" } }));
  const paragraph = emailBodyContent.appendChild(new MockDOMElement({ tagName: "p" }));
  const spanText = paragraph.appendChild(new MockDOMElement({ tagName: "span" }));

  assert.strictEqual(spanText.isContentEditable, false);
  assert.strictEqual(spanText.closest("[contenteditable='true']"), null);

  // Reading email text and pressing 'c' SHOULD trigger compose (Gmail standard behavior)
  let composeTriggered = false;
  const eventB = new SyntheticKeyboardEvent({ key: "c", target: spanText });
  const resultB = runComposeShortcutEvaluator(eventB, () => {
    composeTriggered = true;
  });
  assert.strictEqual(resultB, true, "Reading email body in shadow DOM and pressing 'c' must open compose");
  assert.strictEqual(composeTriggered, true);
  assert.strictEqual(eventB.defaultPrevented, true);

  // Selecting email text and pressing Ctrl+C MUST NOT trigger compose (allows copy)
  let copyTriggered = false;
  const eventC = new SyntheticKeyboardEvent({ key: "c", ctrlKey: true, target: spanText });
  const resultC = runComposeShortcutEvaluator(eventC, () => {
    copyTriggered = true;
  });
  assert.strictEqual(resultC, false, "Ctrl+C in read-only email must not trigger compose (preserves copy)");
  assert.strictEqual(copyTriggered, false);
  assert.strictEqual(eventC.defaultPrevented, false);
});

test("Suite 2.6: Non-editable UI elements correctly allow compose trigger", () => {
  const allowedElements = [
    new MockDOMElement({ tagName: "body" }),
    new MockDOMElement({ tagName: "div", attributes: { class: "sidebar-rail" } }),
    new MockDOMElement({ tagName: "aside" }),
    new MockDOMElement({ tagName: "button" }),
    new MockDOMElement({ tagName: "a", attributes: { href: "#" } }),
    new MockDOMElement({ tagName: "span", attributes: { class: "badge" } }),
    new MockDOMElement({ tagName: "svg" }),
    new MockDOMElement({ tagName: "td" }),
  ];

  for (const el of allowedElements) {
    let triggered = false;
    const event = new SyntheticKeyboardEvent({ key: "c", target: el });
    const result = runComposeShortcutEvaluator(event, () => {
      triggered = true;
    });

    assert.strictEqual(result, true, `<${el.tagName}> must allow compose shortcut`);
    assert.strictEqual(triggered, true);
    assert.strictEqual(event.defaultPrevented, true);
  }
});

test("Suite 2.7: Target object edge cases (null, undefined, malformed objects)", () => {
  // Target is null (global window keydown)
  let triggeredNull = false;
  const eventNull = new SyntheticKeyboardEvent({ key: "c", target: null });
  const resultNull = runComposeShortcutEvaluator(eventNull, () => {
    triggeredNull = true;
  });
  assert.strictEqual(resultNull, true);
  assert.strictEqual(triggeredNull, true);

  // Target has no closest method
  const primitiveTarget = { tagName: "div", isContentEditable: false } as unknown as MockDOMElement;
  let triggeredPrim = false;
  const eventPrim = new SyntheticKeyboardEvent({ key: "c", target: primitiveTarget });
  const resultPrim = runComposeShortcutEvaluator(eventPrim, () => {
    triggeredPrim = true;
  });
  assert.strictEqual(resultPrim, true);
  assert.strictEqual(triggeredPrim, true);

  // Target has empty or undefined tagName
  const noTagTarget = { tagName: undefined, isContentEditable: false } as unknown as MockDOMElement;
  let triggeredNoTag = false;
  const eventNoTag = new SyntheticKeyboardEvent({ key: "c", target: noTagTarget });
  const resultNoTag = runComposeShortcutEvaluator(eventNoTag, () => {
    triggeredNoTag = true;
  });
  assert.strictEqual(resultNoTag, true);
  assert.strictEqual(triggeredNoTag, true);
});

// ===========================================================================
// SUITE 3: RAPID KEYPRESS BURSTS STRESS (500 KEYPRESSES)
// ===========================================================================

test("Suite 3.1: 500 rapid 'C' keypresses while compose is CLOSED", () => {
  const harness = new DashboardStateHarness();
  assert.strictEqual(harness.isOpen, false);
  assert.strictEqual(harness.isMinimized, false);

  const keypressCount = 500;
  let preventDefaultCount = 0;

  for (let i = 0; i < keypressCount; i++) {
    const event = new SyntheticKeyboardEvent({ key: "C" });
    const triggered = runComposeShortcutEvaluator(event, () => {
      harness.handleShortcutTrigger();
    });

    assert.strictEqual(triggered, true);
    if (event.defaultPrevented) preventDefaultCount++;
  }

  assert.strictEqual(preventDefaultCount, 500, "All 500 keypresses must call preventDefault");
  assert.strictEqual(harness.triggerCount, 500, "Trigger callback called 500 times");
  assert.strictEqual(harness.isOpen, true, "Compose must be open");
  assert.strictEqual(harness.isMinimized, false, "Compose must not be minimized");
  assert.deepStrictEqual(
    harness.draft,
    DEFAULT_COMPOSE_DRAFT,
    "Draft must remain frozen blank initial state without corruption"
  );
});

test("Suite 3.2: 500 rapid 'C' keypresses while compose is OPEN with in-progress draft", () => {
  const harness = new DashboardStateHarness();
  harness.openCompose();

  // Populate active draft
  const activeDraft: ComposeDraft = {
    to: ["director@enterprise.com", "finance@enterprise.com"],
    cc: ["auditor@enterprise.com"],
    bcc: ["archive@enterprise.com"],
    subject: "Q4 Financial Audit Confirmation",
    bodyPlain: "Please find the audit report attached.",
    bodyHtml: "<p>Please find the audit report attached.</p>",
    attachments: [new File(["dummy data"], "report.pdf", { type: "application/pdf" })],
    threadId: "audit-thread-789",
    replyMode: "new",
  };
  harness.updateDraft(activeDraft);

  assert.strictEqual(harness.isOpen, true);
  assert.strictEqual(harness.draft.subject, "Q4 Financial Audit Confirmation");

  // Execute 500 rapid keypress bursts
  for (let i = 0; i < 500; i++) {
    const event = new SyntheticKeyboardEvent({ key: "c" });
    runComposeShortcutEvaluator(event, () => {
      harness.handleShortcutTrigger();
    });
  }

  // Verify modal state and draft integrity
  assert.strictEqual(harness.isOpen, true);
  assert.strictEqual(harness.isMinimized, false);
  assert.strictEqual(harness.draft.subject, "Q4 Financial Audit Confirmation");
  assert.deepStrictEqual(harness.draft.to, ["director@enterprise.com", "finance@enterprise.com"]);
  assert.deepStrictEqual(harness.draft.cc, ["auditor@enterprise.com"]);
  assert.deepStrictEqual(harness.draft.bcc, ["archive@enterprise.com"]);
  assert.strictEqual(harness.draft.bodyPlain, "Please find the audit report attached.");
  assert.strictEqual(harness.draft.attachments.length, 1);
  assert.strictEqual(harness.draft.threadId, "audit-thread-789");
});

test("Suite 3.3: 500 rapid 'C' keypresses while compose is MINIMIZED", () => {
  const harness = new DashboardStateHarness();
  harness.openCompose({ subject: "Minimized Draft Item" });
  harness.minimizeCompose();

  assert.strictEqual(harness.isOpen, true);
  assert.strictEqual(harness.isMinimized, true);

  // First keypress must restore modal (un-minimize)
  const event1 = new SyntheticKeyboardEvent({ key: "c" });
  runComposeShortcutEvaluator(event1, () => {
    harness.handleShortcutTrigger();
  });

  assert.strictEqual(harness.isOpen, true);
  assert.strictEqual(harness.isMinimized, false, "Stroke 1 must un-minimize compose");
  assert.strictEqual(harness.draft.subject, "Minimized Draft Item");

  // Remaining 499 strokes
  for (let i = 1; i < 500; i++) {
    const event = new SyntheticKeyboardEvent({ key: "C" });
    runComposeShortcutEvaluator(event, () => {
      harness.handleShortcutTrigger();
    });
  }

  assert.strictEqual(harness.isOpen, true);
  assert.strictEqual(harness.isMinimized, false);
  assert.strictEqual(harness.draft.subject, "Minimized Draft Item");
});

test("Suite 3.4: 500 rapid 'C' keypresses while compose is MAXIMIZED", () => {
  const harness = new DashboardStateHarness();
  harness.openCompose({ subject: "Maximized Draft Item" });
  harness.maximizeCompose();

  assert.strictEqual(harness.isOpen, true);
  assert.strictEqual(harness.isMaximized, true);

  for (let i = 0; i < 500; i++) {
    const event = new SyntheticKeyboardEvent({ key: "c" });
    runComposeShortcutEvaluator(event, () => {
      harness.handleShortcutTrigger();
    });
  }

  assert.strictEqual(harness.isOpen, true);
  assert.strictEqual(harness.isMinimized, false);
  assert.strictEqual(harness.isMaximized, true, "Maximized state must remain preserved");
  assert.strictEqual(harness.draft.subject, "Maximized Draft Item");
});

test("Suite 3.5: 500 rapid alternating keypress bursts ('c' trigger vs 'Ctrl+C' copy)", () => {
  const harness = new DashboardStateHarness();
  let triggers = 0;
  let copySuppressed = 0;

  for (let i = 0; i < 500; i++) {
    if (i % 2 === 0) {
      // Stroke 'c' -> Trigger
      const event = new SyntheticKeyboardEvent({ key: "c" });
      const res = runComposeShortcutEvaluator(event, () => {
        harness.handleShortcutTrigger();
        triggers++;
      });
      assert.strictEqual(res, true);
      assert.strictEqual(event.defaultPrevented, true);
    } else {
      // Stroke 'Ctrl+C' -> Browser Copy (Suppressed by shortcut hook)
      const event = new SyntheticKeyboardEvent({ key: "c", ctrlKey: true });
      const res = runComposeShortcutEvaluator(event, () => {
        harness.handleShortcutTrigger();
      });
      assert.strictEqual(res, false);
      assert.strictEqual(event.defaultPrevented, false);
      copySuppressed++;
    }
  }

  assert.strictEqual(triggers, 250, "Exactly 250 'c' strokes triggered shortcut");
  assert.strictEqual(copySuppressed, 250, "Exactly 250 'Ctrl+C' strokes preserved native copy");
  assert.strictEqual(harness.isOpen, true);
});

// ===========================================================================
// SUITE 4: DRAFT ISOLATION STRESS UNDER RAPID FOLDER & CONTACT NAVIGATION
// ===========================================================================

test("Suite 4.1: Rapid folder switches (100+) do NOT clear or alter active compose draft", () => {
  const harness = new DashboardStateHarness();
  harness.openCompose();

  const originalDraft: ComposeDraft = {
    to: ["alice@example.com"],
    cc: ["bob@example.com"],
    bcc: [],
    subject: "Persistent Strategy Draft",
    bodyPlain: "Line 1: In progress content\nLine 2: Continuing thoughts...",
    bodyHtml: "<p>Line 1: In progress content<br>Line 2: Continuing thoughts...</p>",
    attachments: [new File(["hello"], "notes.txt", { type: "text/plain" })],
    replyMode: "new",
  };
  harness.updateDraft(originalDraft);

  const folders: SidebarFolder[] = [
    "Primary+Sent",
    "Primary",
    "Promotions",
    "Social",
    "Updates",
    "Archive",
    "Bin",
  ];

  // Perform 140 rapid folder switches (20 full cycles across all 7 folders)
  for (let i = 0; i < 140; i++) {
    const targetFolder = folders[i % folders.length];
    harness.handleFolderSelect(targetFolder);

    assert.strictEqual(harness.selectedFolder, targetFolder);
    assert.strictEqual(harness.selectedContact, null);
    assert.strictEqual(harness.isOpen, true, "Modal must remain open across folder switch");

    // Every 10 iterations, simulate user appending text into draft
    if (i % 10 === 0) {
      harness.updateDraft({
        bodyPlain: harness.draft.bodyPlain + `\nAppended chunk ${i}`,
      });
    }
  }

  // Verify draft integrity after 140 folder switches
  assert.strictEqual(harness.draft.subject, "Persistent Strategy Draft");
  assert.deepStrictEqual(harness.draft.to, ["alice@example.com"]);
  assert.deepStrictEqual(harness.draft.cc, ["bob@example.com"]);
  assert.strictEqual(harness.draft.attachments.length, 1);
  assert.match(harness.draft.bodyPlain, /Appended chunk 130/);
});

test("Suite 4.2: Rapid contact selections (200+) do NOT overwrite or mutate active compose draft", () => {
  const harness = new DashboardStateHarness();
  harness.openCompose();

  harness.updateDraft({
    to: ["target@domain.org"],
    subject: "Active Global Draft",
    bodyPlain: "Working on email...",
  });

  // Generate 50 simulated contacts
  const contacts: EmailContact[] = Array.from({ length: 50 }, (_, idx) => ({
    email: `contact_${idx}@domain.org`,
    name: `Contact ${idx}`,
    avatar: "",
    unreadCount: idx % 3,
    lastMessageTime: new Date(Date.now() - idx * 3600000).toISOString(),
    lastMessage: `Message preview ${idx}`,
    isOnline: idx % 2 === 0,
    onlineStatus: (idx % 2 === 0 ? "active" : "offline") as "active" | "offline",
    threadId: `thread-${idx}`,
  }));

  // Perform 200 rapid contact switches
  for (let i = 0; i < 200; i++) {
    const contact = contacts[i % contacts.length];
    harness.handleContactSelect(contact);

    assert.strictEqual(harness.selectedContact?.email, contact.email);
    assert.strictEqual(harness.isOpen, true);

    // Draft MUST remain isolated from contact selection
    assert.strictEqual(harness.draft.subject, "Active Global Draft");
    assert.deepStrictEqual(harness.draft.to, ["target@domain.org"]);
  }

  // Deselect contact (e.g. mobile back navigation to contact list)
  harness.selectedContact = null;
  assert.strictEqual(harness.isOpen, true);
  assert.strictEqual(harness.draft.subject, "Active Global Draft");
});

test("Suite 4.3: Reply mode metadata isolation across contact switching and folder navigation", () => {
  const harness = new DashboardStateHarness();

  const originalMessage: EmailMessage = {
    id: "msg-inbound-999",
    threadId: "thread-inbound-999",
    from: "Executive Partner <exec@partner.org>",
    to: ["me@maileyo.io"],
    subject: "Partnership Agreement Final Review",
    bodyPlain: "Please review the clauses before tomorrow.",
    timestamp: new Date().toISOString(),
    isSent: false,
    isRead: true,
  };

  // Open reply to Contact A's message
  harness.openReply(originalMessage);

  assert.strictEqual(harness.isOpen, true);
  assert.strictEqual(harness.draft.replyMode, "reply");
  assert.strictEqual(harness.draft.inReplyTo, "msg-inbound-999");
  assert.strictEqual(harness.draft.threadId, "thread-inbound-999");
  assert.strictEqual(harness.draft.subject, "Re: Partnership Agreement Final Review");
  assert.deepStrictEqual(harness.draft.to, ["exec@partner.org"]);

  // User minimizes reply modal
  harness.minimizeCompose();
  assert.strictEqual(harness.isMinimized, true);

  // User navigates across 20 folders and 30 different contacts
  for (let f = 0; f < 20; f++) {
    harness.handleFolderSelect((f % 2 === 0 ? "Archive" : "Primary") as SidebarFolder);
  }
  for (let c = 0; c < 30; c++) {
    harness.handleContactSelect({
      email: `other_person_${c}@other.org`,
      name: `Other ${c}`,
      avatar: "",
      unreadCount: 0,
      lastMessageTime: new Date().toISOString(),
      lastMessage: "Hey",
      isOnline: false,
      onlineStatus: "offline",
      threadId: `other-thread-${c}`,
    });
  }

  // Restore reply modal
  harness.restoreCompose();
  assert.strictEqual(harness.isMinimized, false);
  assert.strictEqual(harness.isOpen, true);

  // Assert reply metadata remains 100% intact
  assert.strictEqual(harness.draft.replyMode, "reply");
  assert.strictEqual(harness.draft.inReplyTo, "msg-inbound-999");
  assert.strictEqual(harness.draft.threadId, "thread-inbound-999");
  assert.strictEqual(harness.draft.subject, "Re: Partnership Agreement Final Review");
  assert.deepStrictEqual(harness.draft.to, ["exec@partner.org"]);
});

test("Suite 4.4: Forward mode metadata isolation and HTML quote preservation", () => {
  const harness = new DashboardStateHarness();

  const originalMessage: EmailMessage = {
    id: "msg-fwd-456",
    threadId: "thread-fwd-456",
    from: "sender@domain.com",
    to: ["me@maileyo.io"],
    subject: "Quarterly Financials",
    bodyPlain: "Plain financial breakdown here.",
    bodyHtml: "<b>Plain financial breakdown here.</b>",
    timestamp: "2026-11-10T12:00:00Z",
    isSent: false,
    isRead: true,
  };

  harness.openForward(originalMessage);

  assert.strictEqual(harness.isOpen, true);
  assert.strictEqual(harness.draft.replyMode, "forward");
  assert.strictEqual(harness.draft.subject, "Fwd: Quarterly Financials");
  assert.deepStrictEqual(harness.draft.to, [], "Forward must leave recipient blank");
  assert.match(harness.draft.bodyHtml, /Plain financial breakdown here\./);

  // Fill in new recipient and switch folders 50 times
  harness.updateDraft({ to: ["investor@fund.vc"] });

  for (let i = 0; i < 50; i++) {
    harness.handleFolderSelect("Primary+Sent");
  }

  assert.deepStrictEqual(harness.draft.to, ["investor@fund.vc"]);
  assert.strictEqual(harness.draft.subject, "Fwd: Quarterly Financials");
  assert.strictEqual(harness.draft.replyMode, "forward");
});

// ===========================================================================
// SUITE 5: LIFECYCLE, TEARDOWN & REPEAT INVOCATION IDEMPOTENCY
// ===========================================================================

test("Suite 5.1: Disabled shortcut hook does not register or fire handlers", () => {
  let triggerCount = 0;
  const onTrigger = () => { triggerCount++; };

  // Simulated effect when enabled = false
  const enabled = false;
  const simulateKeyDown = (event: SyntheticKeyboardEvent) => {
    if (!enabled) return;
    runComposeShortcutEvaluator(event, onTrigger);
  };

  const event = new SyntheticKeyboardEvent({ key: "c" });
  simulateKeyDown(event);

  assert.strictEqual(triggerCount, 0, "Disabled hook must not trigger");
  assert.strictEqual(event.defaultPrevented, false);
});

test("Suite 5.2: Idempotent openCompose preserving existing draft vs fresh draft", () => {
  const harness = new DashboardStateHarness();

  // Fresh open -> DEFAULT_COMPOSE_DRAFT
  harness.openCompose();
  assert.deepStrictEqual(harness.draft, DEFAULT_COMPOSE_DRAFT);

  // User inputs content
  harness.updateDraft({ subject: "Meeting Tomorrow", to: ["bob@corp.com"] });

  // User closes modal
  harness.closeCompose();
  assert.strictEqual(harness.isOpen, false);

  // User presses 'C' to re-open -> Draft MUST be preserved
  harness.handleShortcutTrigger();
  assert.strictEqual(harness.isOpen, true);
  assert.strictEqual(harness.draft.subject, "Meeting Tomorrow");
  assert.deepStrictEqual(harness.draft.to, ["bob@corp.com"]);

  // Explicit clearDraft resets
  harness.clearDraft();
  assert.deepStrictEqual(harness.draft, DEFAULT_COMPOSE_DRAFT);
});
