/**
 * Recipient tokenization, RFC 5322 email validation, and autocomplete utilities.
 * Conforms strictly to PROJECT.md specifications and spec-contracts.ts.
 */

import type { EmailContact } from "@/types/email";

/**
 * Standard RFC 5322 dot-atom compatible email regular expression.
 * Disallows leading/trailing/consecutive dots in local-part and domain.
 */
export const RFC5322_EMAIL_REGEX =
  /^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

/**
 * Validates an email address against RFC 5322 format and RFC 5321 length (<= 254 chars).
 */
export function validateEmail(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  const trimmed = email.trim();
  if (trimmed.length === 0 || trimmed.length > 254) return false;
  return RFC5322_EMAIL_REGEX.test(trimmed);
}

/**
 * Tokenizes raw input string by comma, semicolon, space, tab, or newline delimiters.
 * Deduplicates case-insensitively while preserving insertion order and first seen case.
 */
export function tokenizeRecipients(raw: string): string[] {
  if (!raw || typeof raw !== "string") return [];
  const tokens = raw
    .split(/[\s,;\n\r\t]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const unique = new Set<string>();
  const result: string[] = [];
  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (!unique.has(lower)) {
      unique.add(lower);
      result.push(token);
    }
  }
  return result;
}

/**
 * Filters contacts by substring match on name or email (case-insensitive).
 */
export function filterAutocomplete(
  query: string,
  contacts: EmailContact[]
): EmailContact[] {
  if (!query || !query.trim() || !contacts || contacts.length === 0) return [];
  const q = query.toLowerCase().trim();
  return contacts.filter(
    (c) =>
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.email && c.email.toLowerCase().includes(q))
  );
}
