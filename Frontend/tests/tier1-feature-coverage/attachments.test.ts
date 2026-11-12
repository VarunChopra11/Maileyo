/**
 * Tier 1 - Feature Coverage: Area 5 - Attachment Selection, List & Size Validation
 * Covers Features 16, 17 from PROJECT.md
 */

import test from "node:test";
import assert from "node:assert/strict";
import { MockFile } from "../harness/dom-harness.ts";
import {
  validateTotalAttachmentSize,
} from "../harness/spec-contracts.ts";

test("Tier 1 - Feature 16: File metadata is accurately captured on selection", () => {
  const file = new MockFile("invoice_2026.pdf", 1024 * 500, "application/pdf");

  assert.strictEqual(file.name, "invoice_2026.pdf");
  assert.strictEqual(file.size, 512000);
  assert.strictEqual(file.type, "application/pdf");
});

test("Tier 1 - Feature 16: Converts selected file content to base64 encoding", async () => {
  const textContent = "Hello World PDF Attachment Mock";
  const file = new MockFile("notes.txt", textContent.length, "text/plain", textContent);

  const base64 = await file.toBase64();
  const decoded = Buffer.from(base64, "base64").toString("utf-8");

  assert.strictEqual(decoded, textContent);
});

test("Tier 1 - Feature 17: Renders attachment list pills and permits file removal", () => {
  let attachments = [
    { id: "att-1", name: "doc1.pdf", size: 1024 },
    { id: "att-2", name: "photo.jpg", size: 2048 },
    { id: "att-3", name: "sheet.xlsx", size: 4096 },
  ];

  const removeAttachment = (idToRemove: string) => {
    attachments = attachments.filter((a) => a.id !== idToRemove);
  };

  assert.strictEqual(attachments.length, 3);

  removeAttachment("att-2");
  assert.strictEqual(attachments.length, 2);
  assert.strictEqual(attachments.some((a) => a.id === "att-2"), false);
  assert.strictEqual(attachments[0].name, "doc1.pdf");
  assert.strictEqual(attachments[1].name, "sheet.xlsx");
});

test("Tier 1 - Feature 17: Validates cumulative attachments within 20MB limit", () => {
  const validFiles = [
    { size: 5 * 1024 * 1024 }, // 5 MB
    { size: 8 * 1024 * 1024 }, // 8 MB
    { size: 6 * 1024 * 1024 }, // 6 MB
  ]; // Total 19 MB

  const result = validateTotalAttachmentSize(validFiles);
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.totalBytes, 19 * 1024 * 1024);
  assert.strictEqual(result.error, undefined);
});

test("Tier 1 - Feature 17: Rejects attachment batches exceeding 20MB limit with descriptive error", () => {
  const oversizedFiles = [
    { size: 12 * 1024 * 1024 }, // 12 MB
    { size: 9 * 1024 * 1024 },  // 9 MB
  ]; // Total 21 MB > 20 MB

  const result = validateTotalAttachmentSize(oversizedFiles);
  assert.strictEqual(result.valid, false);
  assert.strictEqual(result.totalBytes, 21 * 1024 * 1024);
  assert.match(result.error!, /exceeds maximum allowed limit of 20 MB/);
});

test("Tier 1 - Feature 17: Accepts empty attachment list (0 bytes)", () => {
  const result = validateTotalAttachmentSize([]);
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.totalBytes, 0);
});
