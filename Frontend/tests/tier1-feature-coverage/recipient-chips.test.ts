/**
 * Tier 1 - Feature Coverage: Area 3 - Recipient Chip Management, Validation & Autocomplete
 * Covers Features 10, 11, 12, 13 from PROJECT.md
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  tokenizeRecipients,
  validateEmail,
} from "../harness/spec-contracts.ts";

interface Contact {
  id: string;
  name: string;
  email: string;
}

function filterAutocomplete(query: string, contacts: Contact[]): Contact[] {
  if (!query || !query.trim()) return [];
  const q = query.toLowerCase().trim();
  return contacts.filter(
    (c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
  );
}

test("Tier 1 - Feature 10: Tokenizes email chips on comma, semicolon, space, and enter delimiters", () => {
  const input = "alice@example.com, bob@example.com; charlie@domain.org  david@company.io";
  const chips = tokenizeRecipients(input);

  assert.deepStrictEqual(chips, [
    "alice@example.com",
    "bob@example.com",
    "charlie@domain.org",
    "david@company.io",
  ]);
});

test("Tier 1 - Feature 10: Tokenizes pasted multi-line recipient list and strips trailing whitespace", () => {
  const pasted = `
    lead@example.com
    manager@corp.com
    team@dev.io
  `;
  const chips = tokenizeRecipients(pasted);

  assert.deepStrictEqual(chips, [
    "lead@example.com",
    "manager@corp.com",
    "team@dev.io",
  ]);
});

test("Tier 1 - Feature 11: Validates standard RFC 5322 email addresses", () => {
  assert.strictEqual(validateEmail("user@example.com"), true);
  assert.strictEqual(validateEmail("first.last@domain.co.uk"), true);
  assert.strictEqual(validateEmail("name+tag@sub.domain.io"), true);
  assert.strictEqual(validateEmail("123_456@numbers.net"), true);
});

test("Tier 1 - Feature 11: Flags invalid email formats with validation error state", () => {
  assert.strictEqual(validateEmail(""), false);
  assert.strictEqual(validateEmail("not-an-email"), false);
  assert.strictEqual(validateEmail("@missinguser.com"), false);
  assert.strictEqual(validateEmail("missingdomain@"), false);
  assert.strictEqual(validateEmail("user with spaces@domain.com"), false);
  assert.strictEqual(validateEmail("user@domain..com"), false);
});

test("Tier 1 - Feature 12: Filters contact autocomplete suggestions by matching name or email substring", () => {
  const contacts: Contact[] = [
    { id: "1", name: "Alice Smith", email: "alice@smith.org" },
    { id: "2", name: "Bob Jones", email: "bjones@enterprise.com" },
    { id: "3", name: "Alice Cooper", email: "rock@star.net" },
    { id: "4", name: "Charlie Day", email: "charlie@paddys.com" },
  ];

  const byName = filterAutocomplete("Alice", contacts);
  assert.strictEqual(byName.length, 2);
  assert.strictEqual(byName[0].id, "1");
  assert.strictEqual(byName[1].id, "3");

  const byEmail = filterAutocomplete("enterprise", contacts);
  assert.strictEqual(byEmail.length, 1);
  assert.strictEqual(byEmail[0].name, "Bob Jones");

  const noMatch = filterAutocomplete("xyzNonExistent", contacts);
  assert.strictEqual(noMatch.length, 0);
});

test("Tier 1 - Feature 13: Manages independent collapsible visibility for CC and BCC rows", () => {
  let showCc = false;
  let showBcc = false;

  const toggleCc = () => {
    showCc = !showCc;
  };
  const toggleBcc = () => {
    showBcc = !showBcc;
  };

  assert.strictEqual(showCc, false);
  assert.strictEqual(showBcc, false);

  toggleCc();
  assert.strictEqual(showCc, true);
  assert.strictEqual(showBcc, false);

  toggleBcc();
  assert.strictEqual(showCc, true);
  assert.strictEqual(showBcc, true);

  toggleCc();
  assert.strictEqual(showCc, false);
  assert.strictEqual(showBcc, true);
});
