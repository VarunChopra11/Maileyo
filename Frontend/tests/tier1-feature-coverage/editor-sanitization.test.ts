/**
 * Tier 1 - Feature Coverage: Area 4 - WYSIWYG Rich-Text Editor & HTML Sanitization
 * Covers Features 14, 15 from PROJECT.md
 */

import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeHtmlContent } from "../harness/spec-contracts.ts";

test("Tier 1 - Feature 14: Preserves rich-text formatting tags (bold, italic, underline, lists, links)", () => {
  const formattedHtml = "<p><strong>Bold text</strong> and <em>italicized phrase</em> with <u>underlined</u>.</p>";
  const sanitized = sanitizeHtmlContent(formattedHtml);

  assert.strictEqual(sanitized, formattedHtml);
});

test("Tier 1 - Feature 14: Preserves ordered and unordered list structures", () => {
  const listHtml = "<ul><li>First item</li><li>Second item</li></ul>";
  const sanitized = sanitizeHtmlContent(listHtml);

  assert.strictEqual(sanitized, listHtml);
});

test("Tier 1 - Feature 14: Preserves safe hyperlinks with target and rel attributes", () => {
  const linkHtml = '<p>Check out our <a href="https://example.com" target="_blank" rel="noopener noreferrer">Website</a>.</p>';
  const sanitized = sanitizeHtmlContent(linkHtml);

  assert.match(sanitized, /href="https:\/\/example\.com"/);
  assert.match(sanitized, /Website<\/a>/);
});

test("Tier 1 - Feature 15: Strips malicious <script> tags completely", () => {
  const malicious = '<p>Hello</p><script>alert("pwned")</script><p>World</p>';
  const sanitized = sanitizeHtmlContent(malicious);

  assert.doesNotMatch(sanitized, /<script/i);
  assert.doesNotMatch(sanitized, /alert/i);
  assert.match(sanitized, /<p>Hello<\/p>/);
  assert.match(sanitized, /<p>World<\/p>/);
});

test("Tier 1 - Feature 15: Strips dangerous inline event handlers (onerror, onclick, onload)", () => {
  const dangerous = '<img src="x" onerror="document.cookie=1" alt="avatar" /><b>Valid</b>';
  const sanitized = sanitizeHtmlContent(dangerous);

  assert.doesNotMatch(sanitized, /onerror/i);
  assert.doesNotMatch(sanitized, /document\.cookie/i);
  assert.match(sanitized, /<b>Valid<\/b>/);
});

test("Tier 1 - Feature 15: Strips javascript: pseudo-protocol URIs from links", () => {
  const jsLink = '<a href="javascript:alert(document.domain)">Click Here</a>';
  const sanitized = sanitizeHtmlContent(jsLink);

  assert.doesNotMatch(sanitized, /javascript:/i);
});
