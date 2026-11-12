/**
 * Tier 2 - Boundary & Corner Cases: Physical Boundaries & Limit Clamping
 * Covers Min/Max limits, boundary edge values, corrupt storage, and breakpoint thresholds.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { MockLocalStorage } from "../harness/dom-harness.ts";
import {
  SIDEBAR_CONSTRAINTS,
  ATTACHMENT_CONSTRAINTS,
  VIEWPORT_BREAKPOINTS,
  clampSidebarWidth,
  loadSavedSidebarWidth,
  validateTotalAttachmentSize,
  evaluateMasterDetailView,
} from "../harness/spec-contracts.ts";

test("Tier 2 - Sidebar: Exact boundary values 260px and 500px are preserved without clipping", () => {
  assert.strictEqual(clampSidebarWidth(260), 260, "Exact min 260px must not change");
  assert.strictEqual(clampSidebarWidth(500), 500, "Exact max 500px must not change");
});

test("Tier 2 - Sidebar: Micro-delta boundaries (259.9px and 500.1px) clamp strictly", () => {
  assert.strictEqual(clampSidebarWidth(259.9), 260);
  assert.strictEqual(clampSidebarWidth(259.4), 260);
  assert.strictEqual(clampSidebarWidth(500.1), 500);
  assert.strictEqual(clampSidebarWidth(500.6), 500);
});

test("Tier 2 - Sidebar: Extreme boundary values (-100000 and +100000) clamp safely", () => {
  assert.strictEqual(clampSidebarWidth(-100000), 260);
  assert.strictEqual(clampSidebarWidth(0), 260);
  assert.strictEqual(clampSidebarWidth(100000), 500);
});

test("Tier 2 - Sidebar: Floating point numbers round to nearest integer within boundaries", () => {
  assert.strictEqual(clampSidebarWidth(325.4), 325);
  assert.strictEqual(clampSidebarWidth(325.6), 326);
});

test("Tier 2 - Sidebar: Corrupted and non-numeric localStorage values fall back safely to 320px", () => {
  const storage = new MockLocalStorage();
  const corruptValues = [
    "undefined",
    "null",
    "NaN",
    "not_a_number",
    "{}",
    "[]",
    "true",
    "",
    "   ",
  ];

  for (const corrupt of corruptValues) {
    storage.setItem(SIDEBAR_CONSTRAINTS.STORAGE_KEY, corrupt);
    const resolved = loadSavedSidebarWidth(storage);
    assert.strictEqual(
      resolved,
      SIDEBAR_CONSTRAINTS.DEFAULT_WIDTH,
      `Corrupt value '${corrupt}' must fall back to 320px`
    );
  }
});

test("Tier 2 - Sidebar: Out-of-bounds stored localStorage values are clamped on restore", () => {
  const storage = new MockLocalStorage();

  storage.setItem(SIDEBAR_CONSTRAINTS.STORAGE_KEY, "120");
  assert.strictEqual(loadSavedSidebarWidth(storage), 260, "Stored 120 must clamp to 260 on read");

  storage.setItem(SIDEBAR_CONSTRAINTS.STORAGE_KEY, "850");
  assert.strictEqual(loadSavedSidebarWidth(storage), 500, "Stored 850 must clamp to 500 on read");
});

test("Tier 2 - Sidebar: Handles localStorage failure (QuotaExceededError) gracefully", () => {
  const storage = new MockLocalStorage();
  storage.shouldFail = true;

  // Reading when storage throws should not throw, but fall back to default
  const width = loadSavedSidebarWidth(storage);
  assert.strictEqual(width, SIDEBAR_CONSTRAINTS.DEFAULT_WIDTH);
});

test("Tier 2 - Attachments: Exact 20MB limit (20,971,520 bytes) is valid", () => {
  const exactLimit = ATATTACHMENT_LIMIT();
  const result = validateTotalAttachmentSize([{ size: exactLimit }]);

  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.totalBytes, exactLimit);
});

test("Tier 2 - Attachments: Exact 20MB + 1 byte (20,971,521 bytes) is rejected", () => {
  const overByOne = ATATTACHMENT_LIMIT() + 1;
  const result = validateTotalAttachmentSize([{ size: overByOne }]);

  assert.strictEqual(result.valid, false);
  assert.strictEqual(result.totalBytes, overByOne);
  assert.ok(result.error);
});

test("Tier 2 - Attachments: Multiple files summing to exactly 20MB are valid", () => {
  const exactLimit = ATATTACHMENT_LIMIT();
  const part1 = 10 * 1024 * 1024;
  const part2 = exactLimit - part1;

  const result = validateTotalAttachmentSize([{ size: part1 }, { size: part2 }]);
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.totalBytes, exactLimit);
});

test("Tier 2 - Attachments: Zero-byte files (0 bytes) do not affect cumulative limit", () => {
  const result = validateTotalAttachmentSize([
    { size: 0 },
    { size: 5 * 1024 * 1024 },
    { size: 0 },
  ]);

  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.totalBytes, 5 * 1024 * 1024);
});

test("Tier 2 - Breakpoints: Viewport at 639px vs 767px vs 768px threshold transitions", () => {
  // At 639px (mobile max), contact selected -> chat-area
  assert.strictEqual(evaluateMasterDetailView(639, "contact-1"), "chat-area");
  // At 639px, no contact -> contact-list
  assert.strictEqual(evaluateMasterDetailView(639, null), "contact-list");

  // At 767px (< md), contact selected -> chat-area
  assert.strictEqual(evaluateMasterDetailView(767, "contact-1"), "chat-area");

  // At 768px (md breakpoint), both panels visible regardless of contact selection
  assert.strictEqual(evaluateMasterDetailView(VIEWPORT_BREAKPOINTS.TABLET_MD, "contact-1"), "split");
  assert.strictEqual(evaluateMasterDetailView(VIEWPORT_BREAKPOINTS.TABLET_MD, null), "split");
});

function ATATTACHMENT_LIMIT(): number {
  return ATTACHMENT_CONSTRAINTS.MAX_TOTAL_BYTES;
}
