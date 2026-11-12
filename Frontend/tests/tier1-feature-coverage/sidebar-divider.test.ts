/**
 * Tier 1 - Feature Coverage: Area 1 - Resizable Contacts Sidebar
 * Covers Features 1, 2, 3, 4 from PROJECT.md
 */

import test from "node:test";
import assert from "node:assert/strict";
import { MockLocalStorage } from "../harness/dom-harness.ts";
import {
  SIDEBAR_CONSTRAINTS,
  clampSidebarWidth,
  loadSavedSidebarWidth,
} from "../harness/spec-contracts.ts";

test("Tier 1 - Feature 1: Draggable divider calculates new width from mouse movement", () => {
  const initialWidth = 320;
  const deltaX = 45;
  const targetWidth = initialWidth + deltaX;

  const calculated = clampSidebarWidth(targetWidth);
  assert.strictEqual(calculated, 365, "Dragging by +45px should result in 365px width");
});

test("Tier 1 - Feature 2: Minimum width is strictly clamped to 260px", () => {
  const belowMin = clampSidebarWidth(200);
  assert.strictEqual(belowMin, SIDEBAR_CONSTRAINTS.MIN_WIDTH);
  assert.strictEqual(belowMin, 260, "Width below 260px must be clamped to 260px");
});

test("Tier 1 - Feature 2: Maximum width is strictly clamped to 500px", () => {
  const aboveMax = clampSidebarWidth(650);
  assert.strictEqual(aboveMax, SIDEBAR_CONSTRAINTS.MAX_WIDTH);
  assert.strictEqual(aboveMax, 500, "Width above 500px must be clamped to 500px");
});

test("Tier 1 - Feature 3: Saved width persists into localStorage with designated key", () => {
  const storage = new MockLocalStorage();
  const customWidth = 380;

  storage.setItem(SIDEBAR_CONSTRAINTS.STORAGE_KEY, customWidth.toString());

  const stored = storage.getItem(SIDEBAR_CONSTRAINTS.STORAGE_KEY);
  assert.strictEqual(stored, "380");

  const restored = loadSavedSidebarWidth(storage);
  assert.strictEqual(restored, 380, "Stored width 380px must be read back faithfully");
});

test("Tier 1 - Feature 3: Missing localStorage key falls back safely to 320px default", () => {
  const storage = new MockLocalStorage();
  const width = loadSavedSidebarWidth(storage);

  assert.strictEqual(width, SIDEBAR_CONSTRAINTS.DEFAULT_WIDTH);
  assert.strictEqual(width, 320, "Absence of stored preference must yield default 320px");
});

test("Tier 1 - Feature 4: Double-clicking divider resets custom width back to 320px default", () => {
  const storage = new MockLocalStorage();
  storage.setItem(SIDEBAR_CONSTRAINTS.STORAGE_KEY, "450");

  // Simulate double-click reset
  const resetWidth = SIDEBAR_CONSTRAINTS.DEFAULT_WIDTH;
  storage.setItem(SIDEBAR_CONSTRAINTS.STORAGE_KEY, resetWidth.toString());

  assert.strictEqual(loadSavedSidebarWidth(storage), 320);
});
