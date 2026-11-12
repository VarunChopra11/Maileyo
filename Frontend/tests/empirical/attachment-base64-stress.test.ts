/**
 * Empirical Stress Test Suite: Milestone 3 Attachment Prefix Stripping & Base64 Python Oracle Parity
 *
 * Authored by: Challenger M3-it2-1 (Adversarial Critic & Empirical Specialist)
 * Execution: node --test tests/empirical/attachment-base64-stress.test.ts
 *
 * Scope:
 * 1. Interface & API parity (fileToBase64Attachment === convertFileToBase64, exports integrity)
 * 2. Prefix stripping stress against RFC 2397 Data URIs, whitespace, case, and parameters
 * 3. Byte-level fidelity verification against Python base64.b64decode oracle across thousands of payloads
 * 4. File input polymorphism (browser File, FileReader, toBase64() method, content string)
 * 5. Cumulative 20MB limit boundary conditions and high-concurrency throughput stress
 */

import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import child_process from "node:child_process";
import {
  stripBase64Prefix,
  convertFileToBase64,
  fileToBase64Attachment,
  validateTotalAttachmentSize,
  formatFileSize,
  MAX_ATTACHMENT_SIZE_BYTES,
} from "../../src/lib/attachmentUtils.ts";

// Standard RFC 4648 Base64 regex (strictly printable base64 alphabet with padding)
const STRICT_BASE64_REGEX = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/**
 * Polyfill FileReader for Node.js test environment to simulate browser FileReader.readAsDataURL.
 */
class BrowserSimFileReader {
  result: string | ArrayBuffer | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  error: Error | null = null;

  async readAsDataURL(file: File) {
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const base64 = buffer.toString("base64");
      const mime = file.type || "application/octet-stream";
      this.result = `data:${mime};base64,${base64}`;
      setTimeout(() => this.onload?.(), 0);
    } catch (err) {
      this.error = err as Error;
      setTimeout(() => this.onerror?.(), 0);
    }
  }
}

// Register polyfill if not present
if (typeof globalThis.FileReader === "undefined") {
  (globalThis as unknown as { FileReader: typeof BrowserSimFileReader }).FileReader = BrowserSimFileReader;
}

// ---------------------------------------------------------------------------
// SUITE 1: SPECIFICATION CONTRACT & EXPORT PARITY
// ---------------------------------------------------------------------------

test("1.1 Contract: fileToBase64Attachment alias matches convertFileToBase64 identically", () => {
  assert.strictEqual(
    fileToBase64Attachment,
    convertFileToBase64,
    "fileToBase64Attachment must be referentially identical to convertFileToBase64"
  );
  assert.strictEqual(typeof stripBase64Prefix, "function");
  assert.strictEqual(typeof validateTotalAttachmentSize, "function");
  assert.strictEqual(typeof formatFileSize, "function");
  assert.strictEqual(MAX_ATTACHMENT_SIZE_BYTES, 20 * 1024 * 1024);
});

// ---------------------------------------------------------------------------
// SUITE 2: PREFIX STRIPPING ROBUSTNESS & ADVERSARIAL MUTATIONS
// ---------------------------------------------------------------------------

test("2.1 Prefix Stripping: Handles empty, whitespace-only, and nil inputs safely", () => {
  assert.strictEqual(stripBase64Prefix(""), "");
  assert.strictEqual(stripBase64Prefix("   "), "");
  assert.strictEqual(stripBase64Prefix("\t\r\n  \t"), "");
  assert.strictEqual(stripBase64Prefix(null as unknown as string), "");
  assert.strictEqual(stripBase64Prefix(undefined as unknown as string), "");
});

test("2.2 Prefix Stripping: Pure Base64 strings without prefixes remain unchanged", () => {
  const pureVectors = [
    "SGVsbG8gV29ybGQ=",
    "QQ==",
    "QUI=",
    "QUJD",
    "aW52b2ljZV8yMDI2X2ZpbmFsLnBkZg==",
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  ];

  for (const vec of pureVectors) {
    assert.strictEqual(
      stripBase64Prefix(vec),
      vec,
      `Pure Base64 payload '${vec}' should not be modified by stripBase64Prefix`
    );
  }
});

test("2.3 Prefix Stripping: Strips standard RFC 2397 Data URI prefixes across diverse MIME types", () => {
  const testCases = [
    {
      input: "data:application/pdf;base64,JVBERi0xLjc=",
      expected: "JVBERi0xLjc=",
      mime: "application/pdf",
    },
    {
      input: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
      expected: "iVBORw0KGgoAAAANSUhEUg==",
      mime: "image/png",
    },
    {
      input: "data:text/plain;charset=utf-8;base64,SGVsbG8=",
      expected: "SGVsbG8=",
      mime: "text/plain with charset",
    },
    {
      input: "data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,UEsDBBQAAAAIA",
      expected: "UEsDBBQAAAAIA",
      mime: "complex MIME type",
    },
    {
      input: "data:;base64,QUJD",
      expected: "QUJD",
      mime: "empty mediatype",
    },
    {
      input: "data:,QUJD",
      expected: "QUJD",
      mime: "bare comma prefix",
    },
    {
      input: "DATA:APPLICATION/PDF;BASE64,JVBERi0xLjc=",
      expected: "JVBERi0xLjc=",
      mime: "uppercase prefix",
    },
  ];

  for (const { input, expected, mime } of testCases) {
    const stripped = stripBase64Prefix(input);
    assert.strictEqual(stripped, expected, `Failed stripping prefix for ${mime}`);
    assert.strictEqual(stripped.includes("data:"), false);
    assert.strictEqual(stripped.includes(","), false);
  }
});

test("2.4 Prefix Stripping: Strips extraneous surrounding whitespace around prefix and payload", () => {
  const noisy = "   \r\n\t  data:image/jpeg;base64,   /9j/4AAQSkZJRg==  \t \n\r ";
  const stripped = stripBase64Prefix(noisy);
  assert.strictEqual(stripped, "/9j/4AAQSkZJRg==");
  assert.strictEqual(STRICT_BASE64_REGEX.test(stripped), true);
});

test("2.5 Prefix Stripping: Idempotence invariant", () => {
  const samples = [
    "data:application/pdf;base64,JVBERi0xLjQK",
    "SGVsbG8gV29ybGQ=",
    "data:image/svg+xml;utf8;base64,PHN2Zz48L3N2Zz4=",
  ];

  for (const s of samples) {
    const once = stripBase64Prefix(s);
    const twice = stripBase64Prefix(once);
    const thrice = stripBase64Prefix(twice);
    assert.strictEqual(twice, once, "stripBase64Prefix must be strictly idempotent");
    assert.strictEqual(thrice, once, "stripBase64Prefix must remain idempotent across multiple applications");
  }
});

// ---------------------------------------------------------------------------
// SUITE 3: PYTHON base64.b64decode ORACLE VERIFICATION (BYTE-LEVEL PARITY)
// ---------------------------------------------------------------------------

test("3.1 Python Oracle: Single-byte exhaustive coverage (all 256 byte values 0x00..0xFF)", () => {
  // Generate all 256 individual bytes
  const pythonBatch: Array<{ expectedHex: string; base64Input: string }> = [];

  for (let b = 0; b < 256; b++) {
    const rawBuf = Buffer.from([b]);
    const pureB64 = rawBuf.toString("base64");
    const dataUri = `data:application/octet-stream;base64,${pureB64}`;
    const stripped = stripBase64Prefix(dataUri);

    assert.strictEqual(stripped, pureB64);
    pythonBatch.push({
      expectedHex: rawBuf.toString("hex"),
      base64Input: stripped,
    });
  }

  // Invoke Python 3 oracle to decode every single base64 string
  const pythonScript = `
import sys, json, base64

batch = json.loads(sys.stdin.read())
mismatches = []
for idx, item in enumerate(batch):
    decoded = base64.b64decode(item["base64Input"])
    if decoded.hex() != item["expectedHex"]:
        mismatches.append(f"Index {idx}: expected {item['expectedHex']} got {decoded.hex()}")

if mismatches:
    print("FAILED:" + "; ".join(mismatches[:5]))
    sys.exit(1)
else:
    print(f"SUCCESS:{len(batch)}")
`;

  const proc = child_process.spawnSync("python3", ["-c", pythonScript], {
    input: JSON.stringify(pythonBatch),
    encoding: "utf-8",
  });

  assert.strictEqual(proc.status, 0, `Python oracle execution failed: ${proc.stderr}`);
  assert.match(proc.stdout.trim(), /^SUCCESS:256$/);
});

test("3.2 Python Oracle: Length boundary coverage (0B, 1B, 2B, 3B, 4B, 7B, 8B, 15B, 16B, 64B, 255B, 1KB, 64KB, 1MB)", () => {
  const boundarySizes = [0, 1, 2, 3, 4, 7, 8, 15, 16, 31, 32, 63, 64, 127, 128, 255, 256, 1024, 65536, 1048576];
  const pythonBatch: Array<{ expectedSha256: string; base64Input: string; size: number }> = [];

  for (const size of boundarySizes) {
    const rawBuf = crypto.randomBytes(size);
    const pureB64 = rawBuf.toString("base64");
    const prefixes = [
      `data:application/pdf;base64,`,
      `data:image/png;base64,`,
      `data:text/plain;charset=utf-8;base64,`,
      `data:;base64,`,
      ``, // No prefix
    ];
    const prefix = prefixes[size % prefixes.length];
    const fullInput = `${prefix}${pureB64}`;
    const stripped = stripBase64Prefix(fullInput);

    // Node-side parity
    const nodeDecoded = Buffer.from(stripped, "base64");
    assert.strictEqual(Buffer.compare(nodeDecoded, rawBuf), 0, `Node decode failed at size ${size}`);

    pythonBatch.push({
      expectedSha256: crypto.createHash("sha256").update(rawBuf).digest("hex"),
      base64Input: stripped,
      size,
    });
  }

  const pythonScript = `
import sys, json, base64, hashlib

batch = json.loads(sys.stdin.read())
mismatches = []
for item in batch:
    decoded = base64.b64decode(item["base64Input"])
    digest = hashlib.sha256(decoded).hexdigest()
    if digest != item["expectedSha256"] or len(decoded) != item["size"]:
        mismatches.append(f"Size {item['size']}: digest mismatch")

if mismatches:
    print("FAILED:" + "; ".join(mismatches))
    sys.exit(1)
else:
    print(f"SUCCESS:{len(batch)}")
`;

  const proc = child_process.spawnSync("python3", ["-c", pythonScript], {
    input: JSON.stringify(pythonBatch),
    maxBuffer: 32 * 1024 * 1024,
    encoding: "utf-8",
  });

  assert.strictEqual(proc.status, 0, `Python boundary length verification failed: ${proc.stderr}`);
  assert.match(proc.stdout.trim(), /^SUCCESS:20$/);
});

test("3.3 Python Oracle: High-volume pseudorandom fuzzing (200 random byte payloads)", () => {
  const pythonBatch: Array<{ expectedSha256: string; base64Input: string }> = [];

  for (let i = 0; i < 200; i++) {
    // Lengths varying from 1 to 5000 bytes
    const length = Math.floor(Math.random() * 5000) + 1;
    const rawBuf = crypto.randomBytes(length);
    const pureB64 = rawBuf.toString("base64");

    // Randomize prefix formatting
    const mimeTypes = ["application/octet-stream", "image/jpeg", "application/json", "audio/mp3", "video/mp4"];
    const mime = mimeTypes[i % mimeTypes.length];
    const dataUri = `  data:${mime};base64,${pureB64}  `;

    const stripped = stripBase64Prefix(dataUri);

    pythonBatch.push({
      expectedSha256: crypto.createHash("sha256").update(rawBuf).digest("hex"),
      base64Input: stripped,
    });
  }

  const pythonScript = `
import sys, json, base64, hashlib

batch = json.loads(sys.stdin.read())
mismatches = []
for idx, item in enumerate(batch):
    decoded = base64.b64decode(item["base64Input"])
    digest = hashlib.sha256(decoded).hexdigest()
    if digest != item["expectedSha256"]:
        mismatches.append(str(idx))

if mismatches:
    print(f"FAILED on indices: {','.join(mismatches[:10])}")
    sys.exit(1)
else:
    print(f"SUCCESS:{len(batch)}")
`;

  const proc = child_process.spawnSync("python3", ["-c", pythonScript], {
    input: JSON.stringify(pythonBatch),
    encoding: "utf-8",
  });

  assert.strictEqual(proc.status, 0, `Python fuzzing failed: ${proc.stderr}`);
  assert.match(proc.stdout.trim(), /^SUCCESS:200$/);
});

test("3.4 Python Oracle: Real-world file format magic numbers and international text", () => {
  const binarySignatures = [
    { name: "sample.pdf", mime: "application/pdf", data: Buffer.from("%PDF-1.7 Authoritative Spec Document\n1 0 obj\n<< /Length 12 >>\nstream\nHello World\nendstream\nendobj\n%%EOF") },
    { name: "image.png", mime: "image/png", data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]) },
    { name: "photo.jpg", mime: "image/jpeg", data: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01]) },
    { name: "archive.zip", mime: "application/zip", data: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00]) },
    { name: "archive.tar.gz", mime: "application/gzip", data: Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03]) },
    {
      name: "multilingual.txt",
      mime: "text/plain;charset=utf-8",
      data: Buffer.from("English text, Deutsch ÄÖÜß, Français éàçù, 日本語のテキスト, العربية, עִבְרִית, 🚀🔥✨🎉, Mathematical 𝔄𝔅𝔆 ∇·B=0"),
    },
  ];

  for (const sig of binarySignatures) {
    const rawB64 = sig.data.toString("base64");
    const dataUri = `data:${sig.mime};base64,${rawB64}`;
    const stripped = stripBase64Prefix(dataUri);

    // Python oracle check
    const proc = child_process.spawnSync("python3", [
      "-c",
      "import sys, base64; raw = sys.stdin.buffer.read(); sys.stdout.buffer.write(base64.b64decode(raw))",
    ], {
      input: Buffer.from(stripped),
    });

    assert.strictEqual(proc.status, 0);
    assert.strictEqual(
      Buffer.compare(proc.stdout, sig.data),
      0,
      `Byte mismatch for file format: ${sig.name}`
    );
  }
});

// ---------------------------------------------------------------------------
// SUITE 4: FILE INPUT POLYMORPHISM STRESS (convertFileToBase64 & fileToBase64Attachment)
// ---------------------------------------------------------------------------

test("4.1 Polymorphism: MockFile with toBase64() returning Data URI vs Pure Base64", async () => {
  // Case A: toBase64 returns Data URI
  const mockA = {
    name: "contract.pdf",
    size: 500,
    type: "application/pdf",
    toBase64: async () => "data:application/pdf;base64,JVBERi0xLjc=",
  };
  const resultA = await fileToBase64Attachment(mockA);
  assert.strictEqual(resultA.filename, "contract.pdf");
  assert.strictEqual(resultA.mimeType, "application/pdf");
  assert.strictEqual(resultA.content, "JVBERi0xLjc=");
  assert.strictEqual(resultA.content.includes("data:"), false);

  // Case B: toBase64 returns pure Base64
  const mockB = {
    name: "document.txt",
    size: 20,
    type: "text/plain",
    toBase64: async () => "SGVsbG8gV29ybGQ=",
  };
  const resultB = await fileToBase64Attachment(mockB);
  assert.strictEqual(resultB.filename, "document.txt");
  assert.strictEqual(resultB.mimeType, "text/plain");
  assert.strictEqual(resultB.content, "SGVsbG8gV29ybGQ=");
});

test("4.2 Polymorphism: Plain object with content string property", async () => {
  // Case A: content contains Data URI
  const objA = {
    name: "screenshot.png",
    size: 1024,
    type: "image/png",
    content: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
  };
  const resA = await convertFileToBase64(objA);
  assert.strictEqual(resA.filename, "screenshot.png");
  assert.strictEqual(resA.content, "iVBORw0KGgoAAAANSUhEUg==");

  // Case B: content is pure Base64
  const objB = {
    name: "data.bin",
    size: 10,
    content: "QUJDREVGR0hJSg==",
  };
  const resB = await convertFileToBase64(objB);
  assert.strictEqual(resB.filename, "data.bin");
  assert.strictEqual(resB.mimeType, "application/octet-stream"); // Defaults safely
  assert.strictEqual(resB.content, "QUJDREVGR0hJSg==");
});

test("4.3 Polymorphism: Browser File processed through FileReader", async () => {
  const textContent = "Authoritative browser file payload content for email delivery";
  const rawBuf = Buffer.from(textContent);
  const file = new File([rawBuf], "notes.txt", { type: "text/plain" });

  const converted = await convertFileToBase64(file);
  assert.strictEqual(converted.filename, "notes.txt");
  assert.strictEqual(converted.mimeType, "text/plain");
  assert.strictEqual(converted.content, rawBuf.toString("base64"));
  assert.strictEqual(converted.content.includes("data:"), false);

  // Verify byte decoding against Python oracle
  const proc = child_process.spawnSync("python3", [
    "-c",
    "import sys, base64; raw = sys.stdin.buffer.read(); sys.stdout.buffer.write(base64.b64decode(raw))",
  ], {
    input: Buffer.from(converted.content),
  });
  assert.strictEqual(proc.status, 0);
  assert.strictEqual(proc.stdout.toString(), textContent);
});

test("4.4 Polymorphism: Zero-byte file returns empty content string", async () => {
  const emptyFile = new File([], "zero.dat", { type: "application/octet-stream" });
  const result = await fileToBase64Attachment(emptyFile);
  assert.strictEqual(result.filename, "zero.dat");
  assert.strictEqual(result.content, "");
  assert.strictEqual(result.mimeType, "application/octet-stream");
});

test("4.5 Polymorphism: FileReader failure propagation", async () => {
  const originalFileReader = globalThis.FileReader;
  try {
    globalThis.FileReader = class FaultyFileReader {
      public error = new Error("Disk I/O read failure");
      public onerror: (() => void) | null = null;
      readAsDataURL() {
        setTimeout(() => this.onerror?.(), 0);
      }
    } as unknown as typeof FileReader;

    const dummy = { name: "corrupt.bin", size: 100 };
    await assert.rejects(
      async () => convertFileToBase64(dummy as unknown as File),
      /Disk I\/O read failure/
    );
  } finally {
    globalThis.FileReader = originalFileReader;
  }
});

// ---------------------------------------------------------------------------
// SUITE 5: HIGH-CONCURRENCY & HIGH-VOLUME ATTACHMENT CONVERSIONS
// ---------------------------------------------------------------------------

test("5.1 Concurrency: 500 concurrent convertFileToBase64 operations in parallel", async () => {
  const count = 500;
  const tasks = Array.from({ length: count }, (_, i) => {
    const raw = Buffer.from(`Message payload index ${i} with unique identifier`);
    const b64 = raw.toString("base64");
    const mockFile = {
      name: `file_${i}.txt`,
      size: raw.length,
      type: "text/plain",
      content: `data:text/plain;base64,${b64}`,
    };
    return fileToBase64Attachment(mockFile);
  });

  const start = performance.now();
  const results = await Promise.all(tasks);
  const elapsed = performance.now() - start;

  assert.strictEqual(results.length, count);
  for (let i = 0; i < count; i++) {
    const expectedB64 = Buffer.from(`Message payload index ${i} with unique identifier`).toString("base64");
    assert.strictEqual(results[i].filename, `file_${i}.txt`);
    assert.strictEqual(results[i].content, expectedB64);
    assert.strictEqual(results[i].content.includes("data:"), false);
  }

  assert.ok(elapsed < 2000, `500 concurrent conversions completed in ${elapsed.toFixed(1)}ms (expected < 2000ms)`);
});

// ---------------------------------------------------------------------------
// SUITE 6: CUMULATIVE 20MB LIMIT STRESS & ERROR REPORTING
// ---------------------------------------------------------------------------

test("6.1 Size Constraints: Exact 20MB, +/- 1 byte, and fractional thresholds", () => {
  const EXACT_LIMIT = 20 * 1024 * 1024; // 20,971,520 bytes

  // Boundary: Exact 20MB limit
  const exact = validateTotalAttachmentSize([{ size: EXACT_LIMIT }]);
  assert.strictEqual(exact.valid, true);
  assert.strictEqual(exact.totalBytes, EXACT_LIMIT);
  assert.strictEqual(exact.error, undefined);

  // Boundary: 20MB + 1 byte (Must fail)
  const breach1 = validateTotalAttachmentSize([{ size: EXACT_LIMIT + 1 }]);
  assert.strictEqual(breach1.valid, false);
  assert.strictEqual(breach1.totalBytes, EXACT_LIMIT + 1);
  assert.match(breach1.error || "", /exceeds maximum allowed limit of 20 MB/);

  // Boundary: 20MB - 1 byte (Must pass)
  const under1 = validateTotalAttachmentSize([{ size: EXACT_LIMIT - 1 }]);
  assert.strictEqual(under1.valid, true);
  assert.strictEqual(under1.totalBytes, EXACT_LIMIT - 1);

  // 100 files of 209,715 bytes = 20,971,500 bytes (Passes)
  const files100 = Array.from({ length: 100 }, () => ({ size: 209715 }));
  const res100 = validateTotalAttachmentSize(files100);
  assert.strictEqual(res100.valid, true);

  // Add 1 file of 21 bytes -> exceeds 20MB
  const files101 = [...files100, { size: 21 }];
  const res101 = validateTotalAttachmentSize(files101);
  assert.strictEqual(res101.valid, false);
});

test("6.2 Human-readable formatting: formatFileSize accuracy across byte ranges", () => {
  assert.strictEqual(formatFileSize(0), "0 B");
  assert.strictEqual(formatFileSize(1), "1 B");
  assert.strictEqual(formatFileSize(1023), "1023 B");
  assert.strictEqual(formatFileSize(1024), "1 KB");
  assert.strictEqual(formatFileSize(1500), "1 KB");
  assert.strictEqual(formatFileSize(1024 * 1024), "1.0 MB");
  assert.strictEqual(formatFileSize(1024 * 1024 * 1.5), "1.5 MB");
  assert.strictEqual(formatFileSize(20 * 1024 * 1024), "20.0 MB");
  assert.strictEqual(formatFileSize(25 * 1024 * 1024), "25.0 MB");
});
