/**
 * Unit & Integration Tests: Milestone 3 Composer Production Utilities
 * Verifies recipientUtils, sanitizer, and attachmentUtils implementations.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  validateEmail,
  tokenizeRecipients,
  filterAutocomplete,
} from "../../src/lib/recipientUtils.ts";
import { sanitizeHtml } from "../../src/lib/sanitizer.ts";
import {
  validateTotalAttachmentSize,
  formatFileSize,
  convertFileToBase64,
  MAX_ATTACHMENT_SIZE_BYTES,
} from "../../src/lib/attachmentUtils.ts";
import type { EmailContact } from "../../src/types/email.ts";

test("recipientUtils: validateEmail accepts valid RFC 5322 addresses", () => {
  const valid = [
    "user@example.com",
    "john.doe@sub.domain.org",
    "dev+test@company.co.uk",
    "user_name@domain.io",
    "123.456@numbers.com",
    "first-last@hyphen.net",
  ];
  for (const email of valid) {
    assert.strictEqual(validateEmail(email), true, `Expected valid: ${email}`);
  }
});

test("recipientUtils: validateEmail rejects invalid and out-of-spec addresses", () => {
  const invalid = [
    "",
    "   ",
    "plainaddress",
    "@missingusername.com",
    "missingatdomain.com",
    "two@@domain.com",
    ".leadingdot@domain.com",
    "user@.leadingdotdomain.com",
    "trailingdot@domain.com.",
    "consecutive..dots@domain.com",
    "a".repeat(250) + "@domain.com", // > 254 characters
    null as unknown as string,
    undefined as unknown as string,
  ];
  for (const email of invalid) {
    assert.strictEqual(validateEmail(email), false, `Expected invalid: ${String(email)}`);
  }
});

test("recipientUtils: tokenizeRecipients splits across various delimiters and deduplicates", () => {
  const raw = "alice@test.com, bob@test.com; charlie@test.com  ALICE@test.com\ndavid@test.com\tfrank@test.com";
  const tokens = tokenizeRecipients(raw);

  assert.deepStrictEqual(tokens, [
    "alice@test.com",
    "bob@test.com",
    "charlie@test.com",
    "david@test.com",
    "frank@test.com",
  ]);

  // Empty inputs
  assert.deepStrictEqual(tokenizeRecipients(""), []);
  assert.deepStrictEqual(tokenizeRecipients("   \n\t  "), []);
});

test("recipientUtils: filterAutocomplete filters contacts case-insensitively by name and email", () => {
  const mockContacts: EmailContact[] = [
    {
      id: "c1",
      name: "Sarah Connor",
      email: "sarah@skynet.com",
      lastMessage: "",
      timestamp: "",
      labels: [],
      unread: false,
      snippet: "",
    },
    {
      id: "c2",
      name: "John Connor",
      email: "john@resistance.org",
      lastMessage: "",
      timestamp: "",
      labels: [],
      unread: false,
      snippet: "",
    },
    {
      id: "c3",
      name: "Kyle Reese",
      email: "reese@past.mil",
      lastMessage: "",
      timestamp: "",
      labels: [],
      unread: false,
      snippet: "",
    },
  ];

  // Match by name
  const byName = filterAutocomplete("connor", mockContacts);
  assert.strictEqual(byName.length, 2);
  assert.strictEqual(byName[0].name, "Sarah Connor");
  assert.strictEqual(byName[1].name, "John Connor");

  // Match by email
  const byEmail = filterAutocomplete("past.mil", mockContacts);
  assert.strictEqual(byEmail.length, 1);
  assert.strictEqual(byEmail[0].name, "Kyle Reese");

  // Empty query or contacts
  assert.deepStrictEqual(filterAutocomplete("", mockContacts), []);
  assert.deepStrictEqual(filterAutocomplete("reese", []), []);
});

test("sanitizer: sanitizeHtml neutralizes script, event handlers, and unsafe protocols", () => {
  const dirty = `
    <p>Legitimate paragraph <b>bold</b> and <i>italic</i></p>
    <script>alert("xss")</script>
    <sCrIpt type="text/javascript">window.compromised = true;</ScRiPt>
    <img src="valid.png" alt="safe" onerror="stealCookies()" />
    <a href="javascript:alert(1)">Malicious Link</a>
    <a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">Phishing Link</a>
    <iframe src="https://evil.com"></iframe>
    <embed src="flash.swf" />
    <table class="data-table"><thead><tr><th>Header</th></tr></thead><tbody><tr><td>Cell</td></tr></tbody></table>
  `;

  const clean = sanitizeHtml(dirty);

  // Unsafe elements and handlers must be removed
  assert.doesNotMatch(clean, /<script/i);
  assert.doesNotMatch(clean, /compromised/i);
  assert.doesNotMatch(clean, /onerror/i);
  assert.doesNotMatch(clean, /javascript:alert/i);
  assert.doesNotMatch(clean, /data:text\/html/i);
  assert.doesNotMatch(clean, /<iframe/i);
  assert.doesNotMatch(clean, /<embed/i);

  // Safe markup must be preserved
  assert.match(clean, /<p>Legitimate paragraph/);
  assert.match(clean, /<b>bold<\/b>/);
  assert.match(clean, /<i>italic<\/i>/);
  assert.match(clean, /<table/);
  assert.match(clean, /<th>Header<\/th>/);
});

test("attachmentUtils: validateTotalAttachmentSize validates 20MB cumulative threshold", () => {
  assert.strictEqual(MAX_ATTACHMENT_SIZE_BYTES, 20 * 1024 * 1024);

  // Zero-byte and empty batch
  assert.strictEqual(validateTotalAttachmentSize([]).valid, true);
  assert.strictEqual(validateTotalAttachmentSize([{ size: 0 }]).valid, true);

  // Small batch
  assert.strictEqual(
    validateTotalAttachmentSize([
      { size: 5 * 1024 * 1024 },
      { size: 10 * 1024 * 1024 },
    ]).valid,
    true
  );

  // Exact 20MB limit
  const exact = validateTotalAttachmentSize([{ size: 20 * 1024 * 1024 }]);
  assert.strictEqual(exact.valid, true);
  assert.strictEqual(exact.totalBytes, 20 * 1024 * 1024);

  // Exceeding 20MB by 1 byte
  const exceeded = validateTotalAttachmentSize([{ size: 20 * 1024 * 1024 + 1 }]);
  assert.strictEqual(exceeded.valid, false);
  assert.match(exceeded.error || "", /exceeds maximum allowed limit of 20 MB/);
});

test("attachmentUtils: formatFileSize produces human-readable strings", () => {
  assert.strictEqual(formatFileSize(512), "512 B");
  assert.strictEqual(formatFileSize(2048), "2 KB");
  assert.strictEqual(formatFileSize(1048576), "1.0 MB");
  assert.strictEqual(formatFileSize(15728640), "15.0 MB");
});

test("attachmentUtils: convertFileToBase64 handles MockFile and pre-populated content", async () => {
  const mockFile = {
    name: "report.pdf",
    size: 1024,
    type: "application/pdf",
    toBase64: async () => "JVBERi0xLjQK...",
  };

  const converted = await convertFileToBase64(mockFile);
  assert.strictEqual(converted.filename, "report.pdf");
  assert.strictEqual(converted.content, "JVBERi0xLjQK...");
  assert.strictEqual(converted.mimeType, "application/pdf");

  const rawObject = {
    name: "data.txt",
    size: 12,
    type: "text/plain",
    content: "SGVsbG8gV29ybGQ=",
  };

  const convertedRaw = await convertFileToBase64(rawObject);
  assert.strictEqual(convertedRaw.filename, "data.txt");
  assert.strictEqual(convertedRaw.content, "SGVsbG8gV29ybGQ=");
  assert.strictEqual(convertedRaw.mimeType, "text/plain");
});
