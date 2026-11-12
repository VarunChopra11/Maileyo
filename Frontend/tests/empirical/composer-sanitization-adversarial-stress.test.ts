/**
 * Empirical Adversarial Stress Test Suite: Milestone 3 Iteration 2
 * Challenger: Challenger M3-it2-2 (teamwork_challenger)
 *
 * Exhaustive empirical testing of:
 * 1. HTML sanitization (sanitizeHtml in Frontend/src/lib/sanitizer.ts) against adversarial XSS vectors
 * 2. Link normalization and security controls in Frontend/src/components/dashboard/RichTextEditor.tsx
 * 3. Sanitizer configuration invariants and headless fallback boundary properties
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { sanitizeHtml, SANITIZER_CONFIG } from "../../src/lib/sanitizer.ts";

// ===========================================================================
// SUITE 1: ADVERSARIAL XSS VECTORS AGAINST `sanitizeHtml`
// ===========================================================================

test("Suite 1.1: Quoted javascript: href variations with inner single, double, and nested quotes", () => {
  const vectors = [
    // Outer double quotes, inner single quotes
    '<a href="javascript:eval(\'alert(1)\')">Inner Single</a>',
    '<a href="javascript:alert(\'xss\')">Alert Single</a>',
    '<a href="javascript:window.location=\'https://evil.com\'">Location Single</a>',
    '<a href="javascript:fetch(\'/api/cookie?c=\'+document.cookie)">Fetch Single</a>',

    // Outer single quotes, inner double quotes
    '<a href=\'javascript:eval("alert(2)")\'>Inner Double</a>',
    '<a href=\'javascript:alert("xss")\'>Alert Double</a>',
    '<a href=\'javascript:window.location="https://evil.com"\'>Location Double</a>',

    // Mixed & escaped quotes inside function arguments
    '<a href="javascript:console.log(\'hello \\\'world\\\'\')">Escaped Single</a>',
    '<a href="javascript:void(\'test\')">Void Arg</a>',
    '<a href="javascript:/*comment*/alert(3)">Block Comment</a>',
  ];

  for (const v of vectors) {
    const clean = sanitizeHtml(v);
    assert.doesNotMatch(clean, /javascript:/i, `javascript: protocol leaked in: ${v}`);
    assert.match(clean, /href="#"/, `Should replace unsafe href with safe anchor in: ${v}`);
  }
});

test("Suite 1.2: Case permutations and whitespace variations in dangerous pseudo-protocols", () => {
  const caseAndSpaceVectors = [
    '<a href="JAVASCRIPT:alert(1)">Upper JS</a>',
    '<a href="jAvAsCrIpT:alert(2)">Mixed JS</a>',
    '<a href="  javascript:alert(3)">Leading Space JS</a>',
    '<a href="javascript:alert(4)  ">Trailing Space JS</a>',
    '<a href="\njavascript:alert(5)">Newline JS</a>',
    '<a href="\tjavascript:alert(6)">Tab JS</a>',
    '<a href="VBSCRIPT:msgbox(1)">Upper VBScript</a>',
    '<a href="vBsCrIpT:alert(2)">Mixed VBScript</a>',
    '<a href="  vbscript:msgbox(3)">Spaced VBScript</a>',
    '<a href="DATA:TEXT/HTML;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">Upper Data HTML</a>',
    '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">Base64 Data HTML</a>',
    '<a href="data:application/javascript,alert(1)">Data JS</a>',
    '<a href="DATA:APPLICATION/JAVASCRIPT,alert(2)">Upper Data JS</a>',
    '<a href="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+">Data SVG Base64</a>',
  ];

  for (const v of caseAndSpaceVectors) {
    const clean = sanitizeHtml(v);
    assert.doesNotMatch(clean, /javascript:/i, `Protocol leaked in: ${v}`);
    assert.doesNotMatch(clean, /vbscript:/i, `Protocol leaked in: ${v}`);
    assert.doesNotMatch(clean, /data:(?:text\/html|application\/javascript|image\/svg\+xml)/i, `Data URI leaked in: ${v}`);
    assert.match(clean, /href="#"/, `Unsafe href should be neutralized to href="#" in: ${v}`);
  }
});

test("Suite 1.3: Unquoted attribute variants in pseudo-protocol href links", () => {
  const unquotedVectors = [
    '<a href=javascript:alert(1)>Unquoted JS</a>',
    '<a href=JAVASCRIPT:alert(2)>Unquoted Upper JS</a>',
    '<a href=vbscript:alert(3)>Unquoted VBS</a>',
    '<a href=data:text/html;base64,AAAA>Unquoted Data</a>',
  ];

  for (const v of unquotedVectors) {
    const clean = sanitizeHtml(v);
    assert.doesNotMatch(clean, /javascript:/i, `Unquoted protocol leaked in: ${v}`);
    assert.doesNotMatch(clean, /vbscript:/i, `Unquoted protocol leaked in: ${v}`);
    assert.doesNotMatch(clean, /data:text\/html/i, `Unquoted data URI leaked in: ${v}`);
    assert.match(clean, /href="#"/, `Should neutralize unquoted href in: ${v}`);
  }
});

test("Suite 1.4: Multiple malicious and benign anchors within complex markup", () => {
  const complex = `
    <div>
      <p>Here is a <a href="https://example.com/valid">valid link</a> to documentation.</p>
      <p>Here is an attack: <a href="javascript:eval('steal()')">click for prize</a>.</p>
      <p>Another attack: <a href="vbscript:MsgBox('boom')">vbscript link</a>.</p>
      <p>Another valid link: <a href="mailto:support@example.com">email us</a>.</p>
      <p>A third attack: <a href="data:application/javascript,alert(1)">data link</a>.</p>
    </div>
  `;

  const clean = sanitizeHtml(complex);

  // Valid links must be preserved
  assert.match(clean, /href="https:\/\/example\.com\/valid"/, "Valid https link must be preserved");
  assert.match(clean, /href="mailto:support@example\.com"/, "Valid mailto link must be preserved");

  // Attack links must be neutralized
  assert.doesNotMatch(clean, /javascript:/i, "javascript: link leaked in complex markup");
  assert.doesNotMatch(clean, /vbscript:/i, "vbscript: link leaked in complex markup");
  assert.doesNotMatch(clean, /data:application\/javascript/i, "data:application/javascript link leaked in complex markup");
  assert.doesNotMatch(clean, /steal\(\)/i, "Malicious payload text leaked");

  // Link texts must remain intact
  assert.match(clean, /valid link/);
  assert.match(clean, /click for prize/);
  assert.match(clean, /vbscript link/);
  assert.match(clean, /email us/);
  assert.match(clean, /data link/);
});

test("Suite 1.5: Event handlers across diverse HTML tags and casing", () => {
  const eventPayloads = [
    '<img src="invalid.png" onerror="alert(\'img-error\')" />',
    '<img src="x" ONERROR="alert(1)" />',
    '<img src=x onerror=alert(2) />',
    '<svg onload="alert(\'svg-load\')"></svg>',
    '<svg ONLOAD=alert(3)></svg>',
    '<body onload="alert(\'body-load\')">',
    '<div onmouseover="alert(\'hover\')">Hover me</div>',
    '<div onfocus="alert(\'focus\')" tabindex="0">Focus me</div>',
    '<input onfocus="alert(\'input-focus\')" autofocus />',
    '<button onclick="alert(\'click\')">Click</button>',
    '<details ontoggle="alert(\'toggle\')">Open</details>',
    '<video oncanplay="alert(\'canplay\')"><source src="v.mp4"></video>',
    '<audio onloadedmetadata="alert(\'audio\')"><source src="a.mp3"></audio>',
  ];

  for (const p of eventPayloads) {
    const clean = sanitizeHtml(p);
    assert.doesNotMatch(clean, /\bon[a-z]+\s*=/i, `Event handler attribute leaked in: ${p}`);
    assert.doesNotMatch(clean, /alert\(/i, `Alert payload leaked in: ${p}`);
  }
});

test("Suite 1.6: Recursive, nested, and malformed container tags", () => {
  const containerPayloads = [
    '<script>alert(1)</script>',
    '<sCrIpt>alert(2)</sCrIpt>',
    '<scr<script>ipt>alert(3)</scr</script>ipt>',
    '<<script>script>alert(4)<</script>/script>',
    '<script<script>>alert(5)</script></script>',
    '<iframe src="https://evil.com"></iframe>',
    '<ifr<iframeame src="https://evil.com">',
    '<object data="https://evil.com/payload.swf"></object>',
    '<embed src="https://evil.com/payload.swf" />',
    '<applet code="Exploit.class"></applet>',
    '<form action="https://evil.com/steal" method="POST"><input name="p" /></form>',
    '<base href="https://evil.com/" />',
    '<link rel="stylesheet" href="https://evil.com/evil.css" />',
    '<meta http-equiv="refresh" content="0;url=https://evil.com" />',
  ];

  for (const p of containerPayloads) {
    const clean = sanitizeHtml(p);
    assert.doesNotMatch(clean, /<script/i, `Script tag leaked in: ${p}`);
    assert.doesNotMatch(clean, /<iframe/i, `Iframe tag leaked in: ${p}`);
    assert.doesNotMatch(clean, /<object/i, `Object tag leaked in: ${p}`);
    assert.doesNotMatch(clean, /<embed/i, `Embed tag leaked in: ${p}`);
    assert.doesNotMatch(clean, /<applet/i, `Applet tag leaked in: ${p}`);
    assert.doesNotMatch(clean, /<form/i, `Form tag leaked in: ${p}`);
    assert.doesNotMatch(clean, /<base/i, `Base tag leaked in: ${p}`);
    assert.doesNotMatch(clean, /<link/i, `Link tag leaked in: ${p}`);
    assert.doesNotMatch(clean, /<meta/i, `Meta tag leaked in: ${p}`);
  }
});

test("Suite 1.7: Legitimate rich-text HTML markup structure is faithfully preserved", () => {
  const richHtml = `
    <h2>Project Sprint Review</h2>
    <p>Good morning team, here are the <strong>deliverables</strong> for sprint <em>#42</em>:</p>
    <ul>
      <li>Task 1: <u>Composer Redesign</u></li>
      <li>Task 2: <s>Deprecated Legacy Modal</s></li>
    </ul>
    <blockquote class="border-l-4">"Security is paramount." - Architecture Team</blockquote>
    <table border="1">
      <thead>
        <tr><th>Module</th><th>Status</th></tr>
      </thead>
      <tbody>
        <tr><td>Sanitizer</td><td>Hardened</td></tr>
      </tbody>
    </table>
    <hr />
    <p>Visit <a href="https://github.com" target="_blank" rel="noopener noreferrer">GitHub</a> for code.</p>
  `;

  const clean = sanitizeHtml(richHtml);

  assert.match(clean, /<h2>Project Sprint Review<\/h2>/);
  assert.match(clean, /<strong>deliverables<\/strong>/);
  assert.match(clean, /<em>#42<\/em>/);
  assert.match(clean, /<u>Composer Redesign<\/u>/);
  assert.match(clean, /<s>Deprecated Legacy Modal<\/s>/);
  assert.match(clean, /<ul>/);
  assert.match(clean, /<li>/);
  assert.match(clean, /<blockquote/);
  assert.match(clean, /<table/);
  assert.match(clean, /<th>Module<\/th>/);
  assert.match(clean, /<td>Hardened<\/td>/);
  assert.match(clean, /<hr/);
  assert.match(clean, /href="https:\/\/github\.com"/);
});

// ===========================================================================
// SUITE 2: LINK NORMALIZATION STRESS TESTING (RichTextEditor.tsx Model)
// ===========================================================================

/**
 * Authoritative behavioral model of handleInsertLink protocol normalization
 * from Frontend/src/components/dashboard/RichTextEditor.tsx:109-119
 */
function normalizeEditorLink(rawUrl: string): { accepted: boolean; normalizedUrl?: string } {
  if (!rawUrl || !rawUrl.trim()) return { accepted: false };
  const targetUrl = rawUrl.trim();

  // Neutralize dangerous pseudo-protocols
  if (/^(?:javascript|data|vbscript):/i.test(targetUrl)) {
    return { accepted: false };
  }

  // Prepend https:// if no protocol provided or if input is localhost:PORT
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(targetUrl) || /^localhost(?::\d+)?(?:\/|$)/i.test(targetUrl)) {
    return { accepted: true, normalizedUrl: `https://${targetUrl}` };
  }

  return { accepted: true, normalizedUrl: targetUrl };
}

test("Suite 2.1: Dangerous pseudo-protocols are strictly rejected by link normalizer", () => {
  const rejectedUrls = [
    "javascript:alert(1)",
    "JAVASCRIPT:alert(2)",
    "JavaScript:void(0)",
    "  javascript:eval('alert(3)')  ",
    "vbscript:msgbox(1)",
    "VBSCRIPT:alert(2)",
    "  vbscript:MsgBox('xss')  ",
    "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    "data:text/html,<script>alert(1)</script>",
    "data:application/javascript,alert(1)",
    "DATA:IMAGE/SVG+XML,<svg onload=alert(1)>",
  ];

  for (const url of rejectedUrls) {
    const res = normalizeEditorLink(url);
    assert.strictEqual(res.accepted, false, `Dangerous scheme should be rejected: ${url}`);
  }
});

test("Suite 2.2: Localhost URL variations are prepended with https:// protocol", () => {
  const localhostVariants = [
    { input: "localhost", expected: "https://localhost" },
    { input: "localhost:3000", expected: "https://localhost:3000" },
    { input: "localhost:8080", expected: "https://localhost:8080" },
    { input: "localhost:8000/api/v1/emails", expected: "https://localhost:8000/api/v1/emails" },
    { input: "localhost/dashboard", expected: "https://localhost/dashboard" },
    { input: "LOCALHOST:5173", expected: "https://LOCALHOST:5173" },
  ];

  for (const { input, expected } of localhostVariants) {
    const res = normalizeEditorLink(input);
    assert.strictEqual(res.accepted, true, `Localhost URL should be accepted: ${input}`);
    assert.strictEqual(res.normalizedUrl, expected, `Localhost should be prepended with https://: ${input}`);
  }
});

test("Suite 2.3: Protocol-less web addresses are prepended with https://", () => {
  const webAddresses = [
    { input: "example.com", expected: "https://example.com" },
    { input: "www.google.com", expected: "https://www.google.com" },
    { input: "mail.company.org/inbox", expected: "https://mail.company.org/inbox" },
    { input: "sub.domain.co.uk/path", expected: "https://sub.domain.co.uk/path" },
    { input: "127.0.0.1:8080", expected: "https://127.0.0.1:8080" },
    { input: "192.168.1.1/admin", expected: "https://192.168.1.1/admin" },
  ];

  for (const { input, expected } of webAddresses) {
    const res = normalizeEditorLink(input);
    assert.strictEqual(res.accepted, true, `Address should be accepted: ${input}`);
    assert.strictEqual(res.normalizedUrl, expected, `Should prepend https://: ${input}`);
  }
});

test("Suite 2.4: Valid URI schemes are preserved verbatim", () => {
  const validSchemes = [
    "https://maileyo.app",
    "https://api.github.com/repos?owner=test",
    "http://insecure-internal.local:8080",
    "mailto:dev@maileyo.app",
    "mailto:user@domain.com?subject=Hello",
    "tel:+1-800-555-0199",
    "callto:+123456789",
    "ftp://files.example.com/pub",
  ];

  for (const url of validSchemes) {
    const res = normalizeEditorLink(url);
    assert.strictEqual(res.accepted, true, `Valid scheme should be accepted: ${url}`);
    assert.strictEqual(res.normalizedUrl, url, `Valid scheme should be preserved verbatim: ${url}`);
  }
});

test("Suite 2.5: Blank, whitespace, or invalid link inputs are rejected", () => {
  const blankInputs = ["", "   ", "\t", "\n", " \n \t "];

  for (const b of blankInputs) {
    const res = normalizeEditorLink(b);
    assert.strictEqual(res.accepted, false, `Blank input must be rejected: ${JSON.stringify(b)}`);
  }
});

// ===========================================================================
// SUITE 3: SANITIZER CONFIGURATION INVARIANTS & INTEGRATION CHECKS
// ===========================================================================

test("Suite 3.1: SANITIZER_CONFIG adheres to safe DOMPurify policy specification", () => {
  // 1. Tags allowed must encompass basic formatting and layout
  const requiredTags = ["b", "i", "u", "s", "p", "br", "ul", "ol", "li", "a", "table", "img"];
  for (const tag of requiredTags) {
    assert.ok(
      SANITIZER_CONFIG.ALLOWED_TAGS.includes(tag as (typeof SANITIZER_CONFIG.ALLOWED_TAGS)[number]),
      `ALLOWED_TAGS must include safe tag: ${tag}`
    );
  }

  // 2. Dangerous tags must be forbidden
  const forbiddenTags = ["script", "iframe", "object", "embed", "applet", "form", "base", "meta", "link"];
  for (const tag of forbiddenTags) {
    assert.ok(
      SANITIZER_CONFIG.FORBID_TAGS.includes(tag as (typeof SANITIZER_CONFIG.FORBID_TAGS)[number]),
      `FORBID_TAGS must include dangerous tag: ${tag}`
    );
  }

  // 3. Event handler attributes must be forbidden
  const forbiddenAttrs = ["onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur"];
  for (const attr of forbiddenAttrs) {
    assert.ok(
      SANITIZER_CONFIG.FORBID_ATTR.includes(attr as (typeof SANITIZER_CONFIG.FORBID_ATTR)[number]),
      `FORBID_ATTR must include event handler: ${attr}`
    );
  }

  // 4. URI regex must reject javascript:, vbscript:, data: and accept safe schemes
  const uriRegex = SANITIZER_CONFIG.ALLOWED_URI_REGEXP;
  assert.strictEqual(uriRegex.test("https://example.com"), true, "Must allow https:");
  assert.strictEqual(uriRegex.test("http://example.com"), true, "Must allow http:");
  assert.strictEqual(uriRegex.test("mailto:user@test.com"), true, "Must allow mailto:");
  assert.strictEqual(uriRegex.test("tel:+12345"), true, "Must allow tel:");
  assert.strictEqual(uriRegex.test("cid:part1.123"), true, "Must allow cid:");
  assert.strictEqual(uriRegex.test("/relative/path"), true, "Must allow relative path");
  assert.strictEqual(uriRegex.test("#section"), true, "Must allow hash anchor");

  // Rejections
  assert.strictEqual(uriRegex.test("javascript:alert(1)"), false, "Must reject javascript:");
  assert.strictEqual(uriRegex.test("vbscript:alert(1)"), false, "Must reject vbscript:");
  assert.strictEqual(uriRegex.test("data:text/html,abc"), false, "Must reject data:text/html");
  assert.strictEqual(uriRegex.test("data:image/svg+xml,abc"), false, "Must reject data:image/svg+xml");
  assert.strictEqual(uriRegex.test("blob:https://evil.com"), false, "Must reject blob:");
});

test("Suite 3.2: RichTextEditor source code security attributes verification", () => {
  const editorFile = new URL("../../src/components/dashboard/RichTextEditor.tsx", import.meta.url);
  const source = fs.readFileSync(editorFile, "utf-8");

  // Invariant 1: target=_blank on inserted links
  assert.match(
    source,
    /a\.setAttribute\("target",\s*"_blank"\)/,
    "Inserted links must have target='_blank' attribute"
  );

  // Invariant 2: rel=noopener noreferrer on inserted links
  assert.match(
    source,
    /a\.setAttribute\("rel",\s*"noopener noreferrer"\)/,
    "Inserted links must have rel='noopener noreferrer' attribute"
  );

  // Invariant 3: Pasted rich content passes through sanitizeHtml
  assert.match(
    source,
    /sanitizeHtml\(html\)/,
    "Pasted HTML must be filtered through sanitizeHtml before document.execCommand('insertHTML')"
  );

  // Invariant 4: Localhost link regex handles localhost with optional port and path
  assert.match(
    source,
    /\^localhost\(\?::\\d\+\)\?\(\?:\\\/\|\$\)/,
    "Link normalizer must have regex checking localhost with port/path"
  );
});
