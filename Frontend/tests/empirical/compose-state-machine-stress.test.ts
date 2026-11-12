/**
 * Empirical Stress & Adversarial Challenge Test Suite: Compose State Machine & Utilities
 *
 * Authored by: Challenger M2-2
 * Focus:
 * 1. State machine transition matrix under high-frequency interleaved stress (10,000+ transitions)
 * 2. Absolute invariant verification: !(isMinimized && isMaximized)
 * 3. Mutual exclusivity, transition resets, and close resets
 * 4. Immutability, deep referential safety, and draft protection
 * 5. Pathological input edge cases for extractCleanEmail, formatReplySubject, formatForwardSubject
 * 6. Reply and forward workflow draft initialization invariants
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
} from "../../src/types/email.ts";

/**
 * High-fidelity state machine engine replicating the exact state lifecycle,
 * functional updater mechanics, and transitions of ComposeContext.tsx.
 */
class ComposeStateMachineEngine {
  public isOpen: boolean = false;
  public isMinimized: boolean = false;
  public isMaximized: boolean = false;
  public draft: ComposeDraft;

  // History ledger for post-mortem invariants
  public transitionCount: number = 0;
  public stateSnapshots: Array<{
    op: string;
    isOpen: boolean;
    isMinimized: boolean;
    isMaximized: boolean;
  }> = [];

  constructor(initialDraft?: Partial<ComposeDraft>) {
    this.draft = {
      ...DEFAULT_COMPOSE_DRAFT,
      ...initialDraft,
    };
  }

  private record(op: string) {
    this.transitionCount++;
    // Invariant check at every transition
    assert.strictEqual(
      this.isMinimized && this.isMaximized,
      false,
      `FATAL INVARIANT VIOLATION at step ${this.transitionCount} (${op}): isMinimized and isMaximized are simultaneously true!`
    );
    this.stateSnapshots.push({
      op,
      isOpen: this.isOpen,
      isMinimized: this.isMinimized,
      isMaximized: this.isMaximized,
    });
  }

  public openCompose(initial?: Partial<ComposeDraft>) {
    if (initial) {
      this.draft = {
        ...DEFAULT_COMPOSE_DRAFT,
        ...this.draft,
        ...initial,
      };
    } else {
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
    this.record("openCompose");
  }

  public openReply(message: EmailMessage, threadId?: string) {
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
    this.record("openReply");
  }

  public openForward(message: EmailMessage) {
    const dateStr = message.timestamp
      ? new Date(message.timestamp).toLocaleString()
      : "";

    const originalContent =
      message.cleanBodyHtml ||
      message.bodyHtml ||
      message.cleanBodyPlain ||
      message.bodyPlain ||
      "";

    const fwdBodyHtml = `
      <br><br>
      <div class="gmail_quote">
        <div>---------- Forwarded message ---------</div>
        <div><b>From:</b> ${message.from || "Unknown"}</div>
        <div><b>Date:</b> ${dateStr}</div>
        <div><b>Subject:</b> ${message.subject || "(no subject)"}</div>
        <div><b>To:</b> ${(message.to || []).join(", ")}</div>
        <br>
        <div>${originalContent}</div>
      </div>
    `.trim();

    const fwdBodyPlain = `

---------- Forwarded message ---------
From: ${message.from || "Unknown"}
Date: ${dateStr}
Subject: ${message.subject || "(no subject)"}
To: ${(message.to || []).join(", ")}

${message.cleanBodyPlain || message.bodyPlain || ""}
    `.trim();

    this.draft = {
      ...DEFAULT_COMPOSE_DRAFT,
      to: [],
      subject: formatForwardSubject(message.subject),
      bodyHtml: fwdBodyHtml,
      bodyPlain: fwdBodyPlain,
      replyMode: "forward",
    };
    this.isOpen = true;
    this.isMinimized = false;
    this.isMaximized = false;
    this.record("openForward");
  }

  public closeCompose() {
    this.isOpen = false;
    this.isMinimized = false;
    this.isMaximized = false;
    this.record("closeCompose");
  }

  public minimizeCompose() {
    this.isMinimized = !this.isMinimized;
    this.isMaximized = false;
    this.record("minimizeCompose");
  }

  public maximizeCompose() {
    this.isMaximized = !this.isMaximized;
    this.isMinimized = false;
    this.record("maximizeCompose");
  }

  public restoreCompose() {
    this.isMinimized = false;
    this.isMaximized = false;
    this.record("restoreCompose");
  }

  public updateDraft(updates: Partial<ComposeDraft>) {
    this.draft = {
      ...this.draft,
      ...updates,
    };
    this.record("updateDraft");
  }

  public clearDraft() {
    this.draft = { ...DEFAULT_COMPOSE_DRAFT };
    this.record("clearDraft");
  }
}

// ---------------------------------------------------------------------------
// SUITE 1: HIGH-FREQUENCY INTERLEAVED TRANSITION MATRIX STRESS
// ---------------------------------------------------------------------------

test("Suite 1.1: 10,000 rapid randomized transitions never violate mutual exclusivity invariant", () => {
  const engine = new ComposeStateMachineEngine();

  const dummyMessage: EmailMessage = {
    id: "msg-123",
    threadId: "th-456",
    from: "Alice <alice@domain.org>",
    to: ["me@example.com"],
    subject: "Sprint Discussion",
    bodyPlain: "Hello team",
    bodyHtml: "<p>Hello team</p>",
    timestamp: "2026-11-11T20:00:00Z",
    isSent: false,
    labels: ["INBOX"],
  };

  const ops = [
    () => engine.openCompose(),
    () => engine.openCompose({ subject: `Test ${Math.random()}` }),
    () => engine.minimizeCompose(),
    () => engine.maximizeCompose(),
    () => engine.restoreCompose(),
    () => engine.closeCompose(),
    () => engine.updateDraft({ bodyPlain: `Body ${Math.random()}` }),
    () => engine.clearDraft(),
    () => engine.openReply(dummyMessage),
    () => engine.openForward(dummyMessage),
  ];

  for (let i = 0; i < 10000; i++) {
    const selectedOp = ops[Math.floor(Math.random() * ops.length)];
    selectedOp();
    assert.strictEqual(
      engine.isMinimized && engine.isMaximized,
      false,
      `Step ${i}: isMinimized and isMaximized must NEVER simultaneously be true!`
    );
  }

  assert.strictEqual(engine.transitionCount, 10000);
});

test("Suite 1.2: Deterministic path traversal covers all 36 pairwise transitions between states", () => {
  const operations = [
    { name: "openCompose", fn: (e: ComposeStateMachineEngine) => e.openCompose() },
    { name: "minimizeCompose", fn: (e: ComposeStateMachineEngine) => e.minimizeCompose() },
    { name: "maximizeCompose", fn: (e: ComposeStateMachineEngine) => e.maximizeCompose() },
    { name: "restoreCompose", fn: (e: ComposeStateMachineEngine) => e.restoreCompose() },
    { name: "closeCompose", fn: (e: ComposeStateMachineEngine) => e.closeCompose() },
    { name: "updateDraft", fn: (e: ComposeStateMachineEngine) => e.updateDraft({ subject: "Pairwise" }) },
  ];

  // Test every Op_A -> Op_B pair
  for (const opA of operations) {
    for (const opB of operations) {
      const engine = new ComposeStateMachineEngine();
      opA.fn(engine);
      assert.strictEqual(
        engine.isMinimized && engine.isMaximized,
        false,
        `Pair ${opA.name} -> ${opB.name}: violated mutual exclusivity on first op`
      );
      opB.fn(engine);
      assert.strictEqual(
        engine.isMinimized && engine.isMaximized,
        false,
        `Pair ${opA.name} -> ${opB.name}: violated mutual exclusivity on second op`
      );
    }
  }
});

// ---------------------------------------------------------------------------
// SUITE 2: TARGETED STATE TRANSITION INVARIANTS & TRI-STATE MECHANICS
// ---------------------------------------------------------------------------

test("Suite 2.1: Minimizing while maximized unconditionally resets maximize", () => {
  const engine = new ComposeStateMachineEngine();
  engine.openCompose();
  engine.maximizeCompose();

  assert.strictEqual(engine.isOpen, true);
  assert.strictEqual(engine.isMaximized, true);
  assert.strictEqual(engine.isMinimized, false);

  engine.minimizeCompose();

  assert.strictEqual(engine.isMinimized, true);
  assert.strictEqual(engine.isMaximized, false, "Minimizing while maximized MUST reset isMaximized to false");
});

test("Suite 2.2: Maximizing while minimized unconditionally resets minimize", () => {
  const engine = new ComposeStateMachineEngine();
  engine.openCompose();
  engine.minimizeCompose();

  assert.strictEqual(engine.isOpen, true);
  assert.strictEqual(engine.isMinimized, true);
  assert.strictEqual(engine.isMaximized, false);

  engine.maximizeCompose();

  assert.strictEqual(engine.isMaximized, true);
  assert.strictEqual(engine.isMinimized, false, "Maximizing while minimized MUST reset isMinimized to false");
});

test("Suite 2.3: Restoring resets both minimized and maximized states to normal docked", () => {
  const engine = new ComposeStateMachineEngine();
  engine.openCompose();

  // From minimized
  engine.minimizeCompose();
  assert.strictEqual(engine.isMinimized, true);
  engine.restoreCompose();
  assert.strictEqual(engine.isMinimized, false);
  assert.strictEqual(engine.isMaximized, false);
  assert.strictEqual(engine.isOpen, true);

  // From maximized
  engine.maximizeCompose();
  assert.strictEqual(engine.isMaximized, true);
  engine.restoreCompose();
  assert.strictEqual(engine.isMinimized, false);
  assert.strictEqual(engine.isMaximized, false);
  assert.strictEqual(engine.isOpen, true);
});

test("Suite 2.4: Closing resets all window flags (isOpen, isMinimized, isMaximized)", () => {
  const engine = new ComposeStateMachineEngine();

  // Close from normal
  engine.openCompose();
  engine.closeCompose();
  assert.strictEqual(engine.isOpen, false);
  assert.strictEqual(engine.isMinimized, false);
  assert.strictEqual(engine.isMaximized, false);

  // Close from minimized
  engine.openCompose();
  engine.minimizeCompose();
  engine.closeCompose();
  assert.strictEqual(engine.isOpen, false);
  assert.strictEqual(engine.isMinimized, false);
  assert.strictEqual(engine.isMaximized, false);

  // Close from maximized
  engine.openCompose();
  engine.maximizeCompose();
  engine.closeCompose();
  assert.strictEqual(engine.isOpen, false);
  assert.strictEqual(engine.isMinimized, false);
  assert.strictEqual(engine.isMaximized, false);
});

test("Suite 2.5: Re-opening an active draft restores from minimized without erasing content", () => {
  const engine = new ComposeStateMachineEngine();
  engine.openCompose({ subject: "Quarterly Review", bodyPlain: "Preliminary numbers attached" });

  // Minimize
  engine.minimizeCompose();
  assert.strictEqual(engine.isMinimized, true);
  assert.strictEqual(engine.draft.subject, "Quarterly Review");

  // Re-trigger openCompose (e.g. user presses 'C' shortcut or clicks sidebar Compose)
  engine.openCompose();
  assert.strictEqual(engine.isOpen, true);
  assert.strictEqual(engine.isMinimized, false, "openCompose must un-minimize active modal");
  assert.strictEqual(engine.draft.subject, "Quarterly Review", "Draft subject must be retained");
  assert.strictEqual(engine.draft.bodyPlain, "Preliminary numbers attached", "Draft body must be retained");
});

test("Suite 2.6: Consecutive toggles of minimizeCompose flip isMinimized predictably", () => {
  const engine = new ComposeStateMachineEngine();
  engine.openCompose();

  for (let i = 1; i <= 50; i++) {
    engine.minimizeCompose();
    const expectedMinimized = i % 2 === 1;
    assert.strictEqual(engine.isMinimized, expectedMinimized);
    assert.strictEqual(engine.isMaximized, false);
  }
});

test("Suite 2.7: Consecutive toggles of maximizeCompose flip isMaximized predictably", () => {
  const engine = new ComposeStateMachineEngine();
  engine.openCompose();

  for (let i = 1; i <= 50; i++) {
    engine.maximizeCompose();
    const expectedMaximized = i % 2 === 1;
    assert.strictEqual(engine.isMaximized, expectedMaximized);
    assert.strictEqual(engine.isMinimized, false);
  }
});

// ---------------------------------------------------------------------------
// SUITE 3: IMMUTABILITY & REFERENTIAL SAFETY STRESS
// ---------------------------------------------------------------------------

test("Suite 3.1: DEFAULT_COMPOSE_DRAFT is frozen and rejects runtime mutations", () => {
  assert.strictEqual(Object.isFrozen(DEFAULT_COMPOSE_DRAFT), true);

  // Attempting to modify properties in strict mode must throw
  assert.throws(() => {
    (DEFAULT_COMPOSE_DRAFT as unknown as Record<string, unknown>).subject = "Tampered";
  }, TypeError);

  assert.throws(() => {
    (DEFAULT_COMPOSE_DRAFT as unknown as Record<string, unknown>).isOpen = true;
  }, TypeError);
});

test("Suite 3.2: updateDraft preserves unmentioned fields and guarantees new reference", () => {
  const engine = new ComposeStateMachineEngine();
  engine.openCompose({
    to: ["alice@domain.org"],
    subject: "Initial Subject",
    bodyPlain: "Initial Body",
  });

  const prevDraft = engine.draft;

  engine.updateDraft({ subject: "Updated Subject" });

  assert.notStrictEqual(engine.draft, prevDraft, "updateDraft must produce a new draft object reference");
  assert.strictEqual(engine.draft.subject, "Updated Subject");
  assert.deepStrictEqual(engine.draft.to, ["alice@domain.org"], "to field must be preserved");
  assert.strictEqual(engine.draft.bodyPlain, "Initial Body", "bodyPlain field must be preserved");
});

test("Suite 3.3: 1,000 rapid sequential updates maintain referential integrity", () => {
  const engine = new ComposeStateMachineEngine();
  engine.openCompose();

  let lastDraft = engine.draft;
  for (let i = 0; i < 1000; i++) {
    engine.updateDraft({ subject: `Draft Iteration ${i}` });
    assert.notStrictEqual(engine.draft, lastDraft, `Iteration ${i}: draft reference must update`);
    assert.strictEqual(engine.draft.subject, `Draft Iteration ${i}`);
    lastDraft = engine.draft;
  }
});

test("Suite 3.4: clearDraft resets draft to default blank structure without mutating default", () => {
  const engine = new ComposeStateMachineEngine();
  engine.openCompose({
    to: ["recipient@test.com"],
    cc: ["cc@test.com"],
    subject: "Dirty Subject",
    bodyPlain: "Dirty Body",
  });

  engine.clearDraft();

  assert.deepStrictEqual(engine.draft.to, []);
  assert.deepStrictEqual(engine.draft.cc, []);
  assert.deepStrictEqual(engine.draft.bcc, []);
  assert.strictEqual(engine.draft.subject, "");
  assert.strictEqual(engine.draft.bodyHtml, "");
  assert.strictEqual(engine.draft.bodyPlain, "");
  assert.strictEqual(engine.draft.replyMode, "new");

  // Ensure DEFAULT_COMPOSE_DRAFT was untouched
  assert.deepStrictEqual(DEFAULT_COMPOSE_DRAFT.to, []);
  assert.strictEqual(DEFAULT_COMPOSE_DRAFT.subject, "");
});

// ---------------------------------------------------------------------------
// SUITE 4: EMAIL UTILITY PATHOLOGICAL EDGE CASES (extractCleanEmail)
// ---------------------------------------------------------------------------

test("Suite 4.1: extractCleanEmail handles standard and RFC angle-bracket formats", () => {
  assert.strictEqual(extractCleanEmail("user@example.com"), "user@example.com");
  assert.strictEqual(extractCleanEmail("Alice Smith <alice@example.com>"), "alice@example.com");
  assert.strictEqual(extractCleanEmail("<alice@example.com>"), "alice@example.com");
  assert.strictEqual(extractCleanEmail("Engineering Team <eng-team@corp.co.uk>"), "eng-team@corp.co.uk");
  assert.strictEqual(extractCleanEmail("Admin <admin@sub.domain.corp.net>"), "admin@sub.domain.corp.net");
});

test("Suite 4.2: extractCleanEmail handles null, undefined, blank, and whitespace variations", () => {
  assert.strictEqual(extractCleanEmail(""), "");
  assert.strictEqual(extractCleanEmail("   "), "");
  assert.strictEqual(extractCleanEmail(null as unknown as string), "");
  assert.strictEqual(extractCleanEmail(undefined as unknown as string), "");
  assert.strictEqual(extractCleanEmail("\n\t  "), "");
  assert.strictEqual(extractCleanEmail("  alice@domain.org  "), "alice@domain.org");
  assert.strictEqual(extractCleanEmail("  Alice <  alice@domain.org  >  "), "alice@domain.org");
});

test("Suite 4.3: extractCleanEmail handles quoted display names with commas and escaped quotes", () => {
  assert.strictEqual(
    extractCleanEmail('"Smith, John" <john.smith@domain.com>'),
    "john.smith@domain.com"
  );
  assert.strictEqual(
    extractCleanEmail('"" <empty.quotes@domain.com>'),
    "empty.quotes@domain.com"
  );
  assert.strictEqual(
    extractCleanEmail('"\\"Super\\" Admin" <admin@domain.com>'),
    "admin@domain.com"
  );
});

test("Suite 4.4: extractCleanEmail against pathological angle brackets and delimiters", () => {
  // Nested brackets
  assert.strictEqual(extractCleanEmail("<<nested@domain.com>>"), "<nested@domain.com");

  // Missing opening bracket
  assert.strictEqual(extractCleanEmail("user@domain.com>"), "user@domain.com>");

  // Missing closing bracket
  assert.strictEqual(extractCleanEmail("User <user@domain.com"), "User <user@domain.com");

  // Empty angle brackets
  assert.strictEqual(extractCleanEmail("User <>"), "User <>");

  // Angle brackets with spaces only
  assert.strictEqual(extractCleanEmail("User <   >"), "");

  // Multiple angle brackets in string (extracts first match)
  assert.strictEqual(
    extractCleanEmail("Alice <alice@first.com>, Bob <bob@second.com>"),
    "alice@first.com"
  );
});

test("Suite 4.5: extractCleanEmail against malicious injection and attack payloads", () => {
  // Script tag injection inside angle brackets
  assert.strictEqual(extractCleanEmail("<script>alert('xss')</script>"), "script");

  // SQL injection string in display name
  assert.strictEqual(
    extractCleanEmail("Robert'); DROP TABLE users;-- <robert@domain.com>"),
    "robert@domain.com"
  );

  // CRLF header injection payload
  assert.strictEqual(
    extractCleanEmail("Sender <legit@domain.com>\r\nBcc: evil@attacker.com"),
    "legit@domain.com"
  );

  // Angle bracket with SVG payload
  assert.strictEqual(extractCleanEmail("<svg/onload=alert(1)>"), "svg/onload=alert(1)");
});

test("Suite 4.6: extractCleanEmail handles international and non-ASCII display names", () => {
  assert.strictEqual(
    extractCleanEmail("René Descartes <rene@filosofia.fr>"),
    "rene@filosofia.fr"
  );
  assert.strictEqual(
    extractCleanEmail("山田 太郎 <yamada@domain.co.jp>"),
    "yamada@domain.co.jp"
  );
  assert.strictEqual(
    extractCleanEmail("Иван Иванов <ivan@domain.ru>"),
    "ivan@domain.ru"
  );
  assert.strictEqual(
    extractCleanEmail("Müller & Söhne <info@mueller.de>"),
    "info@mueller.de"
  );
});

// ---------------------------------------------------------------------------
// SUITE 5: SUBJECT FORMATTING EDGE CASES (formatReplySubject & formatForwardSubject)
// ---------------------------------------------------------------------------

test("Suite 5.1: formatReplySubject handles blank, null, undefined, and empty inputs", () => {
  assert.strictEqual(formatReplySubject(""), "Re: Conversation");
  assert.strictEqual(formatReplySubject("   "), "Re: Conversation");
  assert.strictEqual(formatReplySubject(null as unknown as string), "Re: Conversation");
  assert.strictEqual(formatReplySubject(undefined as unknown as string), "Re: Conversation");
  assert.strictEqual(formatReplySubject("\t\n  \r\n"), "Re: Conversation");
});

test("Suite 5.2: formatForwardSubject handles blank, null, undefined, and empty inputs", () => {
  assert.strictEqual(formatForwardSubject(""), "Fwd: Message");
  assert.strictEqual(formatForwardSubject("   "), "Fwd: Message");
  assert.strictEqual(formatForwardSubject(null as unknown as string), "Fwd: Message");
  assert.strictEqual(formatForwardSubject(undefined as unknown as string), "Fwd: Message");
  assert.strictEqual(formatForwardSubject("\t\n  \r\n"), "Fwd: Message");
});

test("Suite 5.3: formatReplySubject enforces 'Re:' prefix idempotence across casing and repeats", () => {
  // Standard addition
  assert.strictEqual(formatReplySubject("Project Q4"), "Re: Project Q4");

  // Idempotent against standard casing
  assert.strictEqual(formatReplySubject("Re: Project Q4"), "Re: Project Q4");

  // Idempotent against lower and upper casing
  assert.strictEqual(formatReplySubject("re: project q4"), "re: project q4");
  assert.strictEqual(formatReplySubject("RE: PROJECT Q4"), "RE: PROJECT Q4");
  assert.strictEqual(formatReplySubject("rE: Project Q4"), "rE: Project Q4");

  // Repeated Re: chains preserved without compounding
  assert.strictEqual(formatReplySubject("Re: Re: Re: Project Q4"), "Re: Re: Re: Project Q4");
  assert.strictEqual(formatReplySubject("re: RE: Re: Project Q4"), "re: RE: Re: Project Q4");

  // Excessive whitespace following prefix
  assert.strictEqual(formatReplySubject("Re:   Spaced Subject"), "Re:   Spaced Subject");
});

test("Suite 5.4: formatForwardSubject enforces 'Fwd:' prefix idempotence across casing and repeats", () => {
  // Standard addition
  assert.strictEqual(formatForwardSubject("Financial Summary"), "Fwd: Financial Summary");

  // Idempotent against standard casing
  assert.strictEqual(formatForwardSubject("Fwd: Financial Summary"), "Fwd: Financial Summary");

  // Idempotent against lower and upper casing
  assert.strictEqual(formatForwardSubject("fwd: financial summary"), "fwd: financial summary");
  assert.strictEqual(formatForwardSubject("FWD: FINANCIAL SUMMARY"), "FWD: FINANCIAL SUMMARY");
  assert.strictEqual(formatForwardSubject("FwD: Financial Summary"), "FwD: Financial Summary");

  // Repeated Fwd: chains preserved without compounding
  assert.strictEqual(formatForwardSubject("Fwd: Fwd: Fwd: Financial Summary"), "Fwd: Fwd: Fwd: Financial Summary");
  assert.strictEqual(formatForwardSubject("fwd: FWD: Fwd: Financial Summary"), "fwd: FWD: Fwd: Financial Summary");

  // Excessive whitespace following prefix
  assert.strictEqual(formatForwardSubject("Fwd:   Spaced Subject"), "Fwd:   Spaced Subject");
});

test("Suite 5.5: False-positive prefix prevention for words starting with 're' or 'fwd'", () => {
  // Words starting with 're' but not 're:'
  assert.strictEqual(formatReplySubject("Report for November"), "Re: Report for November");
  assert.strictEqual(formatReplySubject("Review: Quarterly Performance"), "Re: Review: Quarterly Performance");
  assert.strictEqual(formatReplySubject("React 19 Migration"), "Re: React 19 Migration");
  assert.strictEqual(formatReplySubject("Regarding your invoice"), "Re: Regarding your invoice");
  assert.strictEqual(formatReplySubject("re-structuring proposal"), "Re: re-structuring proposal");

  // Words starting with 'fwd' but not 'fwd:'
  assert.strictEqual(formatForwardSubject("FWDing all assets"), "Fwd: FWDing all assets");
  assert.strictEqual(formatForwardSubject("fwd_backup_archive.tar"), "Fwd: fwd_backup_archive.tar");
});

test("Suite 5.6: Cross-prefix workflows (replying to forward and forwarding a reply)", () => {
  // Replying to a forwarded email prepends 'Re:'
  assert.strictEqual(formatReplySubject("Fwd: Contract Draft"), "Re: Fwd: Contract Draft");

  // Forwarding a reply prepends 'Fwd:'
  assert.strictEqual(formatForwardSubject("Re: Contract Draft"), "Fwd: Re: Contract Draft");
});

test("Suite 5.7: Unicode, emoji, and extreme character lengths in subject formatting", () => {
  const emojiSubject = "🚀 Launch Announcement 🎉";
  assert.strictEqual(formatReplySubject(emojiSubject), "Re: 🚀 Launch Announcement 🎉");
  assert.strictEqual(formatForwardSubject(emojiSubject), "Fwd: 🚀 Launch Announcement 🎉");

  const longSubject = "A".repeat(500);
  assert.strictEqual(formatReplySubject(longSubject), `Re: ${longSubject}`);
  assert.strictEqual(formatForwardSubject(longSubject), `Fwd: ${longSubject}`);
});

// ---------------------------------------------------------------------------
// SUITE 6: REPLY & FORWARD DRAFT INITIALIZATION INVARIANTS
// ---------------------------------------------------------------------------

test("Suite 6.1: openReply properly distinguishes inbound vs outbound message recipients", () => {
  const engine = new ComposeStateMachineEngine();

  // Inbound message: reply goes to sender
  const inboundMessage: EmailMessage = {
    id: "in-100",
    threadId: "th-100",
    from: "Alice Smith <alice@domain.org>",
    to: ["me@company.com"],
    subject: "Budget Approval",
    timestamp: "2026-11-11T10:00:00Z",
    isSent: false,
    labels: ["INBOX"],
  };

  engine.openReply(inboundMessage);
  assert.deepStrictEqual(engine.draft.to, ["alice@domain.org"]);
  assert.strictEqual(engine.draft.subject, "Re: Budget Approval");
  assert.strictEqual(engine.draft.inReplyTo, "in-100");
  assert.strictEqual(engine.draft.references, "in-100");
  assert.strictEqual(engine.draft.threadId, "th-100");
  assert.strictEqual(engine.draft.replyMode, "reply");
  assert.strictEqual(engine.isOpen, true);
  assert.strictEqual(engine.isMinimized, false);
  assert.strictEqual(engine.isMaximized, false);

  // Outbound message (sent by me): reply goes to original recipients
  const outboundMessage: EmailMessage = {
    id: "out-200",
    threadId: "th-200",
    from: "me@company.com",
    to: ["client@external.com", "partner@firm.org"],
    subject: "Follow Up",
    timestamp: "2026-11-11T12:00:00Z",
    isSent: true,
    labels: ["SENT"],
  };

  engine.openReply(outboundMessage);
  assert.deepStrictEqual(engine.draft.to, ["client@external.com", "partner@firm.org"]);
  assert.strictEqual(engine.draft.subject, "Re: Follow Up");
  assert.strictEqual(engine.draft.inReplyTo, "out-200");
  assert.strictEqual(engine.draft.threadId, "th-200");
});

test("Suite 6.2: openForward clears recipient and properly formats forward quote block", () => {
  const engine = new ComposeStateMachineEngine();

  const messageToForward: EmailMessage = {
    id: "fwd-300",
    threadId: "th-300",
    from: "Executive <exec@corporation.com>",
    to: ["me@company.com", "legal@company.com"],
    subject: "Confidential Strategy",
    bodyPlain: "Here is the new strategy document.",
    bodyHtml: "<p>Here is the new strategy document.</p>",
    timestamp: "2026-11-11T14:30:00Z",
    isSent: false,
    labels: ["INBOX"],
  };

  engine.openForward(messageToForward);

  // Recipient must be strictly empty
  assert.deepStrictEqual(engine.draft.to, [], "Forward recipient must be empty");
  assert.strictEqual(engine.draft.subject, "Fwd: Confidential Strategy");
  assert.strictEqual(engine.draft.replyMode, "forward");

  // Formatted quotes must include metadata
  assert.match(engine.draft.bodyPlain, /---------- Forwarded message ---------/);
  assert.match(engine.draft.bodyPlain, /From: Executive <exec@corporation\.com>/);
  assert.match(engine.draft.bodyPlain, /Subject: Confidential Strategy/);
  assert.match(engine.draft.bodyPlain, /To: me@company\.com, legal@company\.com/);
  assert.match(engine.draft.bodyPlain, /Here is the new strategy document\./);

  assert.match(engine.draft.bodyHtml, /class="gmail_quote"/);
  assert.match(engine.draft.bodyHtml, /<b>From:<\/b> Executive <exec@corporation\.com>/);

  assert.strictEqual(engine.isOpen, true);
  assert.strictEqual(engine.isMinimized, false);
  assert.strictEqual(engine.isMaximized, false);
});
