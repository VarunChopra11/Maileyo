/**
 * Tier 2 - Boundary & Corner Cases: Adversarial XSS & HTML Sanitization
 * Tests defense against script injection, event handlers, iframes, and malformed tags.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeHtmlContent } from "../harness/spec-contracts.ts";

test("Tier 2 - XSS: Strips mixed-case and whitespace-obfuscated script tags", () => {
  const dirty = '<p>Test</p><sCrIpt type="text/javascript">window.hacked=true;</ScRiPt>';
  const clean = sanitizeHtmlContent(dirty);

  assert.doesNotMatch(clean, /script/i);
  assert.doesNotMatch(clean, /hacked/i);
  assert.match(clean, /<p>Test<\/p>/);
});

test("Tier 2 - XSS: Strips iframe and embed injection vectors", () => {
  const dirty = '<p>Normal text</p><iframe src="https://attacker.site/stealer"></iframe><embed src="malware.swf">';
  const clean = sanitizeHtmlContent(dirty);

  assert.doesNotMatch(clean, /<iframe/i);
  assert.doesNotMatch(clean, /<embed/i);
  assert.doesNotMatch(clean, /attacker\.site/i);
});

test("Tier 2 - XSS: Strips unquoted and slash-separated event handlers", () => {
  const dirty = '<img src=x onerror=alert(1) /><svg onload=steal()><b>Safe</b>';
  const clean = sanitizeHtmlContent(dirty);

  assert.doesNotMatch(clean, /onerror/i);
  assert.doesNotMatch(clean, /onload/i);
  assert.match(clean, /<b>Safe<\/b>/);
});

test("Tier 2 - XSS: Strips data:text/html pseudo-protocols from anchors", () => {
  const dirty = '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">Phishing Link</a>';
  const clean = sanitizeHtmlContent(dirty);

  assert.doesNotMatch(clean, /data:text\/html/i);
});

test("Tier 2 - XSS: Neutralizes nested and recursively constructed tag attempts", () => {
  const dirty = '<scr<script>ipt>alert(1)</scr</script>ipt><p>Clean content</p>';
  const clean = sanitizeHtmlContent(dirty);

  assert.doesNotMatch(clean, /alert/i);
  assert.match(clean, /Clean content/);
});

test("Tier 2 - XSS: Retains legitimate HTML entities and formatted tables without distortion", () => {
  const table = '<table class="w-full"><thead><tr><th>Header &amp; Title</th></tr></thead><tbody><tr><td>Data 1 &lt; 2</td></tr></tbody></table>';
  const clean = sanitizeHtmlContent(table);

  assert.match(clean, /<table/);
  assert.match(clean, /Header &amp; Title/);
  assert.match(clean, /Data 1 &lt; 2/);
});
