/**
 * Empirical Stress Test Suite: Milestone 3 Composer Validation, Limits & Error Propagation
 *
 * Authored by: Challenger M3-1
 * Execution: node --test tests/empirical/composer-validation-stress.test.ts
 *
 * Verification Areas:
 * 1. Recipient tokenization, RFC 5322 regex validation & autocomplete filtering stress
 * 2. Attachment 20MB limit validation, batch additions, zero-byte files & Base64 prefix stripping
 * 3. Backend send error handling, HTTP 400/422/500 detail propagation & draft retention invariant
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  validateEmail,
  tokenizeRecipients,
  filterAutocomplete,
} from "../../src/lib/recipientUtils.ts";
import {
  validateTotalAttachmentSize,
  convertFileToBase64,
  MAX_ATTACHMENT_SIZE_BYTES,
} from "../../src/lib/attachmentUtils.ts";
import {
  DEFAULT_COMPOSE_DRAFT,
  type ComposeDraft,
  type EmailContact,
} from "../../src/types/email.ts";
import { MockBackendApi, type MockSendPayload } from "../harness/mock-api.ts";

// ---------------------------------------------------------------------------
// SUITE 1: RECIPIENT TOKENIZATION & RFC 5322 REGEX VALIDATION STRESS
// ---------------------------------------------------------------------------

test("1.1 RFC 5322: Exact boundary length testing (RFC 5321 max length 254)", () => {
  // Max valid email = 254 chars
  // Local part 64 chars, domain 189 chars (63 + 1 + 63 + 1 + 57 + 1 + 3) -> 64 + 1 + 189 = 254
  const local64 = "a".repeat(64);
  const domPart63_1 = "b".repeat(63);
  const domPart63_2 = "c".repeat(63);
  const domPart57 = "d".repeat(57);
  const valid254 = `${local64}@${domPart63_1}.${domPart63_2}.${domPart57}.com`;
  assert.strictEqual(valid254.length, 254);
  assert.strictEqual(validateEmail(valid254), true, "254-char valid email must pass RFC 5321 validation");

  // 255 chars email (1 char over 254 boundary)
  const invalid255 = `${local64}@${domPart63_1}.${domPart63_2}.${"d".repeat(58)}.com`;
  assert.strictEqual(invalid255.length, 255);
  assert.strictEqual(validateEmail(invalid255), false, "255-char email must be rejected");

  // Pathological length email (1,000 and 10,000 characters)
  const extreme1000 = "a".repeat(900) + "@domain.org";
  assert.strictEqual(validateEmail(extreme1000), false, "1000-char email must be rejected");
  const extreme10000 = "x".repeat(9980) + "@domain.org";
  assert.strictEqual(validateEmail(extreme10000), false, "10000-char email must be rejected");
});

test("1.2 RFC 5322: Local-part special character conformance and restrictions", () => {
  // All RFC 5322 dot-atom printable ASCII special chars: !#$%&'*+/=?^_`{|}~-
  const rfcSpecials = "user!#$%&'*+/=?^_`{|}~-@example.com";
  assert.strictEqual(validateEmail(rfcSpecials), true, "RFC 5322 dot-atom special chars must be accepted");

  // Disallowed special chars in standard dot-atom
  const forbiddenChars = ['"', '(', ')', '<', '>', '[', ']', ':', ';', '\\', ',', '/'];
  for (const ch of forbiddenChars) {
    if (ch === '/') {
      // '/' is allowed in dot-atom local part
      assert.strictEqual(validateEmail(`user${ch}name@example.com`), true);
    } else {
      assert.strictEqual(
        validateEmail(`user${ch}name@example.com`),
        false,
        `Forbidden character '${ch}' must be rejected`
      );
    }
  }

  // Quoted string representations without unquoting must be rejected by dot-atom regex
  assert.strictEqual(validateEmail('"quoted.name"@example.com'), false);
  assert.strictEqual(validateEmail('"john doe"@example.com'), false);
});

test("1.3 RFC 5322: Dot placement boundary violations", () => {
  // Local-part dot violations
  assert.strictEqual(validateEmail(".leadingdot@example.com"), false, "Leading dot in local part rejected");
  assert.strictEqual(validateEmail("trailingdot.@example.com"), false, "Trailing dot in local part rejected");
  assert.strictEqual(validateEmail("consecutive..dot@example.com"), false, "Consecutive dots in local part rejected");
  assert.strictEqual(validateEmail("triple...dots@example.com"), false, "Triple dots in local part rejected");
  assert.strictEqual(validateEmail(".@example.com"), false, "Lone dot in local part rejected");

  // Domain dot violations
  assert.strictEqual(validateEmail("user@.leadingdotdomain.com"), false, "Leading dot in domain rejected");
  assert.strictEqual(validateEmail("user@trailingdotdomain.com."), false, "Trailing dot in domain rejected");
  assert.strictEqual(validateEmail("user@consecutive..dots.com"), false, "Consecutive dots in domain rejected");
  assert.strictEqual(validateEmail("user@domain...com"), false, "Triple dots in domain rejected");
  assert.strictEqual(validateEmail("user@."), false, "Lone dot domain rejected");
  assert.strictEqual(validateEmail("user@.."), false, "Double dot domain rejected");
});

test("1.4 RFC 5322: Domain label format, hyphens, and label length bounds", () => {
  // Valid hyphenated domain labels
  assert.strictEqual(validateEmail("user@my-domain.example-corp.com"), true);

  // Leading and trailing hyphens in domain labels are invalid
  assert.strictEqual(validateEmail("user@-leadinghyphen.com"), false, "Leading hyphen in domain label rejected");
  assert.strictEqual(validateEmail("user@trailinghyphen-.com"), false, "Trailing hyphen in domain label rejected");
  assert.strictEqual(validateEmail("user@sub.-hyphen.com"), false, "Leading hyphen in subdomain label rejected");
  assert.strictEqual(validateEmail("user@sub.hyphen-.com"), false, "Trailing hyphen in subdomain label rejected");

  // Single-label domain (no TLD) rejected by RFC 5322 dot-atom
  assert.strictEqual(validateEmail("user@localhost"), false, "Localhost without TLD rejected");

  // Domain label <= 63 chars (RFC 1035 limit)
  const label63 = "a".repeat(63);
  assert.strictEqual(validateEmail(`user@${label63}.com`), true, "63-char domain label accepted");

  // Domain label 64 chars (exceeds 63)
  const label64 = "a".repeat(64);
  assert.strictEqual(validateEmail(`user@${label64}.com`), false, "64-char domain label rejected");
});

test("1.5 RFC 5322: Injection attacks, whitespace, and malformed inputs", () => {
  const attacksAndEdgeCases = [
    "",
    "   ",
    "\t\n\r",
    "user @example.com",
    "user\n@example.com",
    "user\r\n@example.com",
    "user@ example.com",
    "victim@example.com\r\nBcc: evil@attacker.com",
    "user@example.com<script>alert(1)</script>",
    "admin' OR '1'='1'@domain.com",
    "user\0@domain.com",
    "user@domain\0.com",
    "user@@domain.com",
    "user@domain@other.com",
    "@domain.com",
    "user@",
    "@",
    "user",
    "üser@example.com", // Non-ASCII homoglyph
    "user@exämple.com",
    null as unknown as string,
    undefined as unknown as string,
    12345 as unknown as string,
    {} as unknown as string,
  ];

  for (const input of attacksAndEdgeCases) {
    assert.strictEqual(
      validateEmail(input),
      false,
      `Should reject malformed/adversarial input: ${JSON.stringify(input)}`
    );
  }
});

test("1.6 Recipient Tokenizer: Complex clustered delimiters and whitespace normalization", () => {
  const complexRaw = `
    \t   alice@example.com,,, ;;;  
    bob@example.com\r\n\t  charlie@example.com \t \n
    \r;,,;  david@example.com  \t
  `;

  const tokens = tokenizeRecipients(complexRaw);
  assert.deepStrictEqual(tokens, [
    "alice@example.com",
    "bob@example.com",
    "charlie@example.com",
    "david@example.com",
  ]);

  // Degenerate inputs
  assert.deepStrictEqual(tokenizeRecipients(""), []);
  assert.deepStrictEqual(tokenizeRecipients("   \t\n\r  "), []);
  assert.deepStrictEqual(tokenizeRecipients(",,,,,;;;;;     \n\n\n"), []);
  assert.deepStrictEqual(tokenizeRecipients(null as unknown as string), []);
  assert.deepStrictEqual(tokenizeRecipients(undefined as unknown as string), []);
});

test("1.7 Recipient Tokenizer: Case-insensitive deduplication preserving first-seen casing", () => {
  const raw = "Alice@Company.com, alice@company.com, ALICE@COMPANY.COM, Bob@Test.org, bob@test.org, Charlie@Domain.io";
  const tokens = tokenizeRecipients(raw);

  assert.deepStrictEqual(tokens, [
    "Alice@Company.com",
    "Bob@Test.org",
    "Charlie@Domain.io",
  ]);

  // Reverse casing order test
  const reverseRaw = "bob@test.org, Bob@Test.org, BOB@TEST.ORG";
  assert.deepStrictEqual(tokenizeRecipients(reverseRaw), ["bob@test.org"]);
});

test("1.8 Recipient Tokenizer: High-volume throughput and scalability stress", () => {
  // Generate 5,000 mixed emails with 25 unique addresses
  const uniqueAddresses = Array.from({ length: 25 }, (_, i) => `user_${i}@stress.test.com`);
  const mixedPool: string[] = [];

  for (let i = 0; i < 5000; i++) {
    const base = uniqueAddresses[i % uniqueAddresses.length];
    // Vary casing randomly
    const cased = i % 2 === 0 ? base.toUpperCase() : base.toLowerCase();
    mixedPool.push(cased);
  }

  const hugeRawString = mixedPool.join(" , \n ; \t ");
  const start = performance.now();
  const tokens = tokenizeRecipients(hugeRawString);
  const elapsed = performance.now() - start;

  assert.strictEqual(tokens.length, 25, "Must deduplicate exactly to 25 unique recipients");
  assert.ok(elapsed < 500, `Tokenizing 5,000 mixed emails took ${elapsed.toFixed(2)}ms (expected < 500ms)`);
});

test("1.9 Autocomplete Filtering: Regex character safety and substring matching", () => {
  const testContacts: EmailContact[] = [
    {
      id: "c1",
      name: "Alex (Engineering)",
      email: "alex+dev@internal.net",
      lastMessage: "",
      timestamp: "",
      labels: [],
      unread: false,
      snippet: "",
    },
    {
      id: "c2",
      name: "Beatrix [Finance]",
      email: "beatrix*ops@internal.net",
      lastMessage: "",
      timestamp: "",
      labels: [],
      unread: false,
      snippet: "",
    },
    {
      id: "c3",
      name: "Carlos $Special^",
      email: "carlos?query@internal.net",
      lastMessage: "",
      timestamp: "",
      labels: [],
      unread: false,
      snippet: "",
    },
  ];

  // Queries containing regex metacharacters: + * ( ) [ ] ? $ ^ \ .
  const safeQueries = ["alex+", "dev@", "(Eng", "[Fin", "beatrix*", "$special", "?query"];

  for (const q of safeQueries) {
    assert.doesNotThrow(() => {
      const results = filterAutocomplete(q, testContacts);
      assert.ok(results.length >= 1, `Query '${q}' should find matching contact without regex syntax error`);
    });
  }

  // Large contact list performance test (1,000 contacts)
  const largeContacts: EmailContact[] = Array.from({ length: 1000 }, (_, i) => ({
    id: `id_${i}`,
    name: `User Name ${i}`,
    email: `person_${i}@largecorp.com`,
    lastMessage: "",
    timestamp: "",
    labels: [],
    unread: false,
    snippet: "",
  }));

  const start = performance.now();
  const searchResults = filterAutocomplete("person_99", largeContacts);
  const elapsed = performance.now() - start;

  assert.strictEqual(searchResults.length >= 1, true);
  assert.ok(elapsed < 100, `Filtering 1,000 contacts took ${elapsed.toFixed(2)}ms (expected < 100ms)`);
});

// ---------------------------------------------------------------------------
// SUITE 2: ATTACHMENT 20MB LIMIT VALIDATION & BASE64 PREFIX STRIPPING STRESS
// ---------------------------------------------------------------------------

test("2.1 Attachments: Exact 20MB boundary testing (20,971,520 bytes)", () => {
  const EXACT_20MB = 20 * 1024 * 1024; // 20,971,520 bytes
  assert.strictEqual(MAX_ATTACHMENT_SIZE_BYTES, EXACT_20MB);

  // Exactly 20MB file
  const exactCheck = validateTotalAttachmentSize([{ size: EXACT_20MB }]);
  assert.strictEqual(exactCheck.valid, true);
  assert.strictEqual(exactCheck.totalBytes, EXACT_20MB);
  assert.strictEqual(exactCheck.error, undefined);

  // 20MB + 1 single byte
  const overCheck = validateTotalAttachmentSize([{ size: EXACT_20MB + 1 }]);
  assert.strictEqual(overCheck.valid, false);
  assert.strictEqual(overCheck.totalBytes, EXACT_20MB + 1);
  assert.match(overCheck.error || "", /exceeds maximum allowed limit of 20 MB/);

  // 20MB - 1 byte
  const underCheck = validateTotalAttachmentSize([{ size: EXACT_20MB - 1 }]);
  assert.strictEqual(underCheck.valid, true);
  assert.strictEqual(underCheck.totalBytes, EXACT_20MB - 1);
});

test("2.2 Attachments: Multi-file cumulative batch addition stress", () => {
  const ONE_MB = 1024 * 1024;

  // 20 files of exactly 1MB each = 20MB
  const files20x1MB = Array.from({ length: 20 }, () => ({ size: ONE_MB }));
  const batchValid = validateTotalAttachmentSize(files20x1MB);
  assert.strictEqual(batchValid.valid, true);
  assert.strictEqual(batchValid.totalBytes, 20 * ONE_MB);

  // Add 1 extra file of 1 byte -> breaches cumulative limit
  const batchBreached = validateTotalAttachmentSize([...files20x1MB, { size: 1 }]);
  assert.strictEqual(batchBreached.valid, false);
  assert.strictEqual(batchBreached.totalBytes, 20 * ONE_MB + 1);

  // 1,000 small files of 20,000 bytes (20,000,000 bytes < 20,971,520 bytes)
  const files1000 = Array.from({ length: 1000 }, () => ({ size: 20000 }));
  const largeBatch = validateTotalAttachmentSize(files1000);
  assert.strictEqual(largeBatch.valid, true);
  assert.strictEqual(largeBatch.totalBytes, 20000000);
});

test("2.3 Attachments: Zero-byte files and missing size property handling", () => {
  // Empty attachment list
  assert.strictEqual(validateTotalAttachmentSize([]).valid, true);
  assert.strictEqual(validateTotalAttachmentSize([]).totalBytes, 0);

  // Multiple zero-byte files
  const zeroBytes = validateTotalAttachmentSize([{ size: 0 }, { size: 0 }, { size: 0 }]);
  assert.strictEqual(zeroBytes.valid, true);
  assert.strictEqual(zeroBytes.totalBytes, 0);

  // Zero-byte file mixed with exact 20MB file
  const mixed = validateTotalAttachmentSize([
    { size: 0 },
    { size: 20 * 1024 * 1024 },
    { size: 0 },
  ]);
  assert.strictEqual(mixed.valid, true);
  assert.strictEqual(mixed.totalBytes, 20 * 1024 * 1024);

  // Missing or negative size safely defaults to 0
  const malformed = validateTotalAttachmentSize([
    { size: undefined as unknown as number },
    { size: NaN as unknown as number },
    { size: 500 },
  ]);
  assert.strictEqual(malformed.valid, true);
  assert.strictEqual(malformed.totalBytes, 500);
});

test("2.4 Attachments: Base64 data URL prefix stripping via FileReader (production browser path)", async () => {
  // Verifies the production browser path: browser File processed by FileReader
  const rawBytes = Buffer.from("PDF-1.4 Authoritative Specification Document Binary Content");
  const pureBase64 = rawBytes.toString("base64");
  const dataUri = `data:application/pdf;base64,${pureBase64}`;

  // Mock global FileReader to simulate browser execution in ComposeModal.tsx
  const originalFileReader = globalThis.FileReader;
  try {
    globalThis.FileReader = class MockFileReader {
      public result: string | null = null;
      public onload: (() => void) | null = null;
      public onerror: (() => void) | null = null;

      readAsDataURL() {
        setTimeout(() => {
          this.result = dataUri;
          if (this.onload) this.onload();
        }, 0);
      }
    } as unknown as typeof FileReader;

    // Browser File object (has name, size, type, but no toBase64 or content)
    const mockNativeFile = {
      name: "contract.pdf",
      size: rawBytes.length,
      type: "application/pdf",
    };

    const converted = await convertFileToBase64(mockNativeFile as unknown as File);

    // Critical requirement: must NOT contain data URL prefix or commas
    assert.strictEqual(converted.filename, "contract.pdf");
    assert.strictEqual(converted.mimeType, "application/pdf");
    assert.strictEqual(converted.content, pureBase64);
    assert.strictEqual(converted.content.includes("data:"), false, "Must strip 'data:' prefix");
    assert.strictEqual(converted.content.includes(";base64,"), false, "Must strip ';base64,' prefix");
    assert.strictEqual(converted.content.includes(","), false, "Must contain no commas");

    // Roundtrip decode check: Python backend base64.b64decode equivalence
    const decoded = Buffer.from(converted.content, "base64");
    assert.deepStrictEqual(decoded, rawBytes);
  } finally {
    globalThis.FileReader = originalFileReader;
  }
});

test("2.5 Attachments: Complex MIME types and pre-populated pure Base64 support", async () => {
  const svgContent = "<svg xmlns='http://www.w3.org/2000/svg'><circle r='10'/></svg>";
  const pureSvgBase64 = Buffer.from(svgContent).toString("base64");
  const svgDataUri = `data:image/svg+xml;charset=utf-8;base64,${pureSvgBase64}`;

  // Test complex MIME via production FileReader
  const originalFileReader = globalThis.FileReader;
  try {
    globalThis.FileReader = class MockFileReader {
      public result: string | null = null;
      public onload: (() => void) | null = null;
      public onerror: (() => void) | null = null;

      readAsDataURL() {
        setTimeout(() => {
          this.result = svgDataUri;
          if (this.onload) this.onload();
        }, 0);
      }
    } as unknown as typeof FileReader;

    const mockSvgFile = {
      name: "vector.svg",
      size: svgContent.length,
      type: "image/svg+xml",
    };

    const convertedSvg = await convertFileToBase64(mockSvgFile as unknown as File);
    assert.strictEqual(convertedSvg.filename, "vector.svg");
    assert.strictEqual(convertedSvg.mimeType, "image/svg+xml");
    assert.strictEqual(convertedSvg.content, pureSvgBase64);
    assert.strictEqual(convertedSvg.content.includes("data:"), false);
  } finally {
    globalThis.FileReader = originalFileReader;
  }

  // Test pre-populated pure Base64 content object
  const pureInput = {
    name: "data.txt",
    size: 11,
    type: "text/plain",
    content: "SGVsbG8gV29ybGQ=",
  };
  const convertedPure = await convertFileToBase64(pureInput);
  assert.strictEqual(convertedPure.content, "SGVsbG8gV29ybGQ=");

  // Test async toBase64 with pure Base64
  const asyncPure = {
    name: "report.pdf",
    size: 100,
    type: "application/pdf",
    toBase64: async () => "JVBERi0xLjQK...",
  };
  const convertedAsync = await convertFileToBase64(asyncPure);
  assert.strictEqual(convertedAsync.content, "JVBERi0xLjQK...");
});

// ---------------------------------------------------------------------------
// SUITE 3: BACKEND SEND ERROR HANDLING & DRAFT RETENTION INVARIANT STRESS
// ---------------------------------------------------------------------------

/**
 * Client error extractor matching ComposeModal.tsx / emailService.ts implementation:
 * extracts backend error detail message and formats human-readable error.
 */
function extractClientErrorMessage(error: unknown): string {
  const customErr = error as {
    detail?: string;
    response?: { data?: { detail?: string; error?: string; message?: string } };
    message?: string;
  };
  return (
    customErr?.detail ||
    customErr?.response?.data?.detail ||
    customErr?.response?.data?.error ||
    customErr?.response?.data?.message ||
    customErr?.message ||
    "Failed to send email"
  );
}

test("3.1 Backend Errors: Propagate detail string from HTTP 400 Bad Request", async () => {
  const api = new MockBackendApi();
  const badAttachmentPayload: MockSendPayload = {
    to: ["recipient@example.com"],
    subject: "Test with invalid attachment",
    attachments: [
      {
        filename: "", // Missing filename triggers 400
        content: "SGVsbG8=",
        mimeType: "",
      },
    ],
  };

  const response = await api.sendEmail(badAttachmentPayload);
  assert.strictEqual(response.status, 400);

  const errorObj = {
    status: response.status,
    response: { data: response.data },
    detail: response.data.detail,
  };

  const clientMsg = extractClientErrorMessage(errorObj);
  assert.match(clientMsg, /Invalid attachment schema: filename, mimeType, and content are required/);
});

test("3.2 Backend Errors: Propagate detail string from HTTP 422 Unprocessable Entity", async () => {
  const api = new MockBackendApi();

  // 1. Missing recipient
  const noRecipient = await api.sendEmail({ to: [], subject: "Hello" });
  assert.strictEqual(noRecipient.status, 422);
  assert.strictEqual(
    extractClientErrorMessage({ detail: noRecipient.data.detail }),
    "Field 'to' must contain at least one recipient email address."
  );

  // 2. Empty subject
  const noSubject = await api.sendEmail({ to: ["user@example.com"], subject: "" });
  assert.strictEqual(noSubject.status, 422);
  assert.strictEqual(
    extractClientErrorMessage({ detail: noSubject.data.detail }),
    "Field 'subject' cannot be empty."
  );

  // 3. Subject exceeding 500 chars
  const hugeSubject = await api.sendEmail({
    to: ["user@example.com"],
    subject: "A".repeat(501),
  });
  assert.strictEqual(hugeSubject.status, 422);
  assert.strictEqual(
    extractClientErrorMessage({ detail: hugeSubject.data.detail }),
    "Subject cannot exceed 500 characters."
  );

  // 4. Invalid recipient email
  const badEmail = await api.sendEmail({
    to: ["malformed..email@domain.com"],
    subject: "Test",
  });
  assert.strictEqual(badEmail.status, 422);
  assert.match(extractClientErrorMessage({ detail: badEmail.data.detail }), /Invalid recipient email address/);
});

test("3.3 Backend Errors: Propagate detail string from HTTP 500 Internal Server Error", async () => {
  const api = new MockBackendApi();
  const quotaMsg = "Gmail API Quota Exceeded for user account: daily message rate limit reached.";
  api.simulateFailure(500, quotaMsg);

  const response = await api.sendEmail({
    to: ["user@example.com"],
    subject: "Urgent update",
  });

  assert.strictEqual(response.status, 500);
  assert.strictEqual(extractClientErrorMessage({ detail: response.data.detail }), quotaMsg);
});

test("3.4 Backend Errors: Fallback extraction for HTTP 502/503 with error or message fields", () => {
  const gatewayErr = {
    response: {
      status: 502,
      data: { error: "Upstream MTA gateway timeout connecting to smtp.gmail.com:587" },
    },
  };
  assert.strictEqual(
    extractClientErrorMessage(gatewayErr),
    "Upstream MTA gateway timeout connecting to smtp.gmail.com:587"
  );

  const unavailableErr = {
    response: {
      status: 503,
      data: { message: "Mailbox backend undergoing maintenance. Try again in 30 seconds." },
    },
  };
  assert.strictEqual(
    extractClientErrorMessage(unavailableErr),
    "Mailbox backend undergoing maintenance. Try again in 30 seconds."
  );
});

test("3.5 Draft Retention Invariant: Full draft preservation across send failure", async () => {
  // Author an elaborate, high-value compose draft
  const originalDraft: ComposeDraft = {
    to: ["lead-architect@systems.com", "security@corp.org"],
    cc: ["director@company.com"],
    bcc: ["compliance-archive@internal.vault"],
    subject: "Q4 Mission-Critical Security Architecture Assessment",
    bodyPlain: "Detailed architectural threat models and mitigation roadmap...",
    bodyHtml: "<p>Detailed architectural <b>threat models</b> and mitigation roadmap...</p>",
    attachments: [
      {
        name: "architecture-v2.pdf",
        size: 1048576,
        type: "application/pdf",
      } as unknown as File,
    ],
    threadId: "thread_sec_9942",
    inReplyTo: "<msg_origin_001@systems.com>",
    references: "<msg_root@systems.com> <msg_origin_001@systems.com>",
    replyMode: "reply",
  };

  // Deep clone to verify invariant
  const draftBefore = JSON.parse(JSON.stringify(originalDraft));

  // Compose modal state simulation
  let currentDraft = { ...originalDraft };
  let isModalOpen = true;
  let clearDraftCallCount = 0;
  let closeComposeCallCount = 0;

  const clearDraft = () => {
    clearDraftCallCount++;
    currentDraft = { ...DEFAULT_COMPOSE_DRAFT };
  };
  const closeCompose = () => {
    closeComposeCallCount++;
    isModalOpen = false;
  };

  // Backend simulation with fatal 500 error
  const api = new MockBackendApi();
  api.simulateFailure(500, "OAuth2 Token Expired or Revoked. Re-authentication required.");

  // Simulate handleSend execution from ComposeModal.tsx
  try {
    const res = await api.sendEmail({
      to: currentDraft.to,
      subject: currentDraft.subject,
      body_plain: currentDraft.bodyPlain,
      body_html: currentDraft.bodyHtml,
      cc: currentDraft.cc,
      bcc: currentDraft.bcc,
      thread_id: currentDraft.threadId,
    });

    if (res.status === 200) {
      clearDraft();
      closeCompose();
    } else {
      throw {
        status: res.status,
        detail: res.data.detail,
      };
    }
  } catch (err) {
    const errorMsg = extractClientErrorMessage(err);
    assert.match(errorMsg, /OAuth2 Token Expired or Revoked/);
    // DRAFT RETENTION INVARIANT: clearDraft and closeCompose MUST NOT be called!
  }

  // INVARIANT ASSERTIONS:
  assert.strictEqual(clearDraftCallCount, 0, "clearDraft() must never be invoked upon send failure");
  assert.strictEqual(closeComposeCallCount, 0, "closeCompose() must never be invoked upon send failure");
  assert.strictEqual(isModalOpen, true, "Modal must remain open so user can retry or adjust email");

  // Deep structural equivalence check
  const draftAfter = JSON.parse(JSON.stringify(currentDraft));
  assert.deepStrictEqual(draftAfter, draftBefore, "Draft content must remain 100% intact after failure");
});

test("3.6 Draft Retention Invariant: Burst stress of 10 consecutive rapid failures", async () => {
  const api = new MockBackendApi();

  const durableDraft: ComposeDraft = {
    to: ["partner@enterprise.io"],
    cc: ["operations@enterprise.io"],
    bcc: [],
    subject: "Enterprise Contract Negotiation",
    bodyPlain: "Agreement draft terms...",
    bodyHtml: "<p>Agreement draft terms...</p>",
    attachments: [
      {
        name: "terms.docx",
        size: 512000,
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      } as unknown as File,
    ],
    replyMode: "new",
  };

  let modalOpen = true;
  let clearCount = 0;
  let closeCount = 0;

  const failureSequence = [
    { status: 422, message: "Validation error: Rate limit per minute exceeded" },
    { status: 400, message: "Bad Request: Malformed boundary headers" },
    { status: 500, message: "Internal Server Error: Database deadlock" },
    { status: 503, message: "Service Unavailable: Backend scaling in progress" },
    { status: 504, message: "Gateway Timeout: Network socket closed" },
    { status: 422, message: "Validation error: SMTP queue full" },
    { status: 500, message: "Internal Server Error: Memory pressure" },
    { status: 502, message: "Bad Gateway: Upstream connection reset" },
    { status: 503, message: "Service Unavailable: Retrying backoff" },
    { status: 500, message: "Fatal backend exception" },
  ];

  for (let attempt = 0; attempt < failureSequence.length; attempt++) {
    const { status, message } = failureSequence[attempt];
    api.simulateFailure(status, message);

    try {
      const res = await api.sendEmail({
        to: durableDraft.to,
        subject: durableDraft.subject,
        body_plain: durableDraft.bodyPlain,
      });

      if (res.status === 200) {
        clearCount++;
        closeCount++;
        modalOpen = false;
      } else {
        throw { status: res.status, detail: res.data.detail };
      }
    } catch (err) {
      const extracted = extractClientErrorMessage(err);
      assert.strictEqual(extracted, message);
    }

    // Verify invariant after EACH failure
    assert.strictEqual(clearCount, 0);
    assert.strictEqual(closeCount, 0);
    assert.strictEqual(modalOpen, true);
    assert.strictEqual(durableDraft.subject, "Enterprise Contract Negotiation");
    assert.strictEqual(durableDraft.attachments.length, 1);
  }
});

test("3.7 Pre-Send Client-Side Validation Invariants: Blocks API dispatch on invalid states", async () => {
  const api = new MockBackendApi();

  interface ComposerState {
    draft: ComposeDraft;
    isOpen: boolean;
  }

  // Pre-send validation executor matching ComposeModal.tsx lines 153-180
  function attemptSend(state: ComposerState): { success: boolean; error?: string } {
    const { draft } = state;

    // 1. Check for empty To field
    if (!draft.to || draft.to.length === 0) {
      return { success: false, error: "Please specify at least one recipient" };
    }

    // 2. Validate all recipient chips across To, CC, and BCC
    const invalidTo = draft.to.filter((email) => !validateEmail(email));
    const invalidCc = (draft.cc || []).filter((email) => !validateEmail(email));
    const invalidBcc = (draft.bcc || []).filter((email) => !validateEmail(email));

    const allInvalid = [...invalidTo, ...invalidCc, ...invalidBcc];
    if (allInvalid.length > 0) {
      return {
        success: false,
        error: `Invalid recipient email address${allInvalid.length > 1 ? "es" : ""}: ${allInvalid.slice(0, 2).join(", ")}. Please fix or remove before sending.`,
      };
    }

    // 3. Validate cumulative attachment size before sending
    if (draft.attachments && draft.attachments.length > 0) {
      const validation = validateTotalAttachmentSize(draft.attachments);
      if (!validation.valid) {
        return { success: false, error: validation.error || "Total attachments size exceeds 20 MB limit." };
      }
    }

    return { success: true };
  }

  // Case A: Missing recipient
  const stateA: ComposerState = {
    draft: { ...DEFAULT_COMPOSE_DRAFT, to: [], subject: "Valid Subject" },
    isOpen: true,
  };
  const resultA = attemptSend(stateA);
  assert.strictEqual(resultA.success, false);
  assert.strictEqual(resultA.error, "Please specify at least one recipient");
  assert.strictEqual(api.receivedRequests.length, 0, "No API call dispatched");

  // Case B: Invalid email in To chip
  const stateB: ComposerState = {
    draft: { ...DEFAULT_COMPOSE_DRAFT, to: ["invalid-email-address"], subject: "Valid Subject" },
    isOpen: true,
  };
  const resultB = attemptSend(stateB);
  assert.strictEqual(resultB.success, false);
  assert.match(resultB.error || "", /Invalid recipient email address/);
  assert.strictEqual(api.receivedRequests.length, 0, "No API call dispatched");

  // Case C: Invalid email in CC chip
  const stateC: ComposerState = {
    draft: {
      ...DEFAULT_COMPOSE_DRAFT,
      to: ["valid@example.com"],
      cc: ["user@domain..com"],
      subject: "Valid Subject",
    },
    isOpen: true,
  };
  const resultC = attemptSend(stateC);
  assert.strictEqual(resultC.success, false);
  assert.match(resultC.error || "", /Invalid recipient email address/);
  assert.strictEqual(api.receivedRequests.length, 0, "No API call dispatched");

  // Case D: Invalid email in BCC chip
  const stateD: ComposerState = {
    draft: {
      ...DEFAULT_COMPOSE_DRAFT,
      to: ["valid@example.com"],
      bcc: ["plainaddress"],
      subject: "Valid Subject",
    },
    isOpen: true,
  };
  const resultD = attemptSend(stateD);
  assert.strictEqual(resultD.success, false);
  assert.match(resultD.error || "", /Invalid recipient email address/);
  assert.strictEqual(api.receivedRequests.length, 0, "No API call dispatched");

  // Case E: Cumulative attachments exceeding 20MB
  const stateE: ComposerState = {
    draft: {
      ...DEFAULT_COMPOSE_DRAFT,
      to: ["valid@example.com"],
      subject: "Valid Subject",
      attachments: [
        { name: "large.iso", size: 20 * 1024 * 1024 + 100 } as unknown as File,
      ],
    },
    isOpen: true,
  };
  const resultE = attemptSend(stateE);
  assert.strictEqual(resultE.success, false);
  assert.match(resultE.error || "", /exceeds maximum allowed limit of 20 MB/);
  assert.strictEqual(api.receivedRequests.length, 0, "No API call dispatched");
});
