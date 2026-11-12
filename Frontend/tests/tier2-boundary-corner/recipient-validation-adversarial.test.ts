/**
 * Tier 2 - Boundary & Corner Cases: Adversarial Email Validation & Tokenization
 * Tests RFC 5322 compliance, malformed inputs, control characters, and deduplication.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  validateEmail,
  tokenizeRecipients,
} from "../harness/spec-contracts.ts";

test("Tier 2 - Adversarial: Validates complex RFC 5322 valid edge case email formats", () => {
  const validEmails = [
    "simple@example.com",
    "very.common@example.com",
    "disposable.style.email.with+symbol@example.com",
    "other.email-with-hyphen@and.subdomains.org",
    "fully-qualified-domain@example.com",
    "user.name+tag+sorting@example.com",
    "x@example.com",
    "example-indeed@strange-example.com",
    "admin@mailserver1.domain.org",
    "user_name@domain.co.jp",
  ];

  for (const email of validEmails) {
    assert.strictEqual(validateEmail(email), true, `Expected '${email}' to be valid`);
  }
});

test("Tier 2 - Adversarial: Rejects invalid combinations and malformed syntax", () => {
  const invalidEmails = [
    "",
    "   ",
    "plainaddress",
    "#@%^%#$@#$@#.com",
    "@example.com",
    "Joe Smith <email@example.com>",
    "email.example.com",
    "email@example@example.com",
    ".email@example.com",
    "email.@example.com",
    "email..email@example.com",
    "email@example.com (Joe Smith)",
    "email@example",
    "email@-example.com",
    "email@example..com",
    "Abc..123@example.com",
    "user name@domain.com",
    "user@dom ain.com",
  ];

  for (const email of invalidEmails) {
    assert.strictEqual(validateEmail(email), false, `Expected '${email}' to be invalid`);
  }
});

test("Tier 2 - Adversarial: Rejects email exceeding maximum RFC 5321 length (254 characters)", () => {
  const longLocal = "a".repeat(250);
  const oversizedEmail = `${longLocal}@example.com`;

  assert.ok(oversizedEmail.length > 254);
  assert.strictEqual(validateEmail(oversizedEmail), false);
});

test("Tier 2 - Tokenizer: Handles clustered, mixed, and repetitive delimiters cleanly", () => {
  const messyInput = "  ,,, ;;; \n\n  alice@domain.org ,,, ;;; bob@domain.org \t\t\t charlie@domain.org ;;; ";
  const tokens = tokenizeRecipients(messyInput);

  assert.deepStrictEqual(tokens, [
    "alice@domain.org",
    "bob@domain.org",
    "charlie@domain.org",
  ]);
});

test("Tier 2 - Tokenizer: Deduplicates identical emails case-insensitively preserving first case", () => {
  const duplicateInput = "User@Example.com, user@example.com, USER@EXAMPLE.COM, other@domain.org";
  const tokens = tokenizeRecipients(duplicateInput);

  assert.strictEqual(tokens.length, 2);
  assert.strictEqual(tokens[0], "User@Example.com");
  assert.strictEqual(tokens[1], "other@domain.org");
});

test("Tier 2 - Tokenizer: Returns empty array on empty or whitespace-only inputs", () => {
  assert.deepStrictEqual(tokenizeRecipients(""), []);
  assert.deepStrictEqual(tokenizeRecipients("   \n\t  "), []);
  assert.deepStrictEqual(tokenizeRecipients(",;,;,"), []);
});
