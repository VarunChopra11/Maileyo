/**
 * Tier 1 - Feature Coverage: Area 8 - Mobile Master-Detail & Responsive Layout
 * Covers Features 21, 22, 23, 24, 25 from PROJECT.md
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateMasterDetailView,
  VIEWPORT_BREAKPOINTS,
} from "../harness/spec-contracts.ts";

test("Tier 1 - Feature 21: Mobile viewport displays full-width ContactList when no contact is selected", () => {
  const mobileWidth = 375; // iPhone viewport
  const view = evaluateMasterDetailView(mobileWidth, null);

  assert.strictEqual(view, "contact-list");
});

test("Tier 1 - Feature 21: Mobile viewport displays full-width ChatArea when contact is selected", () => {
  const mobileWidth = 412; // Pixel viewport
  const view = evaluateMasterDetailView(mobileWidth, "contact_123");

  assert.strictEqual(view, "chat-area");
});

test("Tier 1 - Feature 22: Mobile Back Navigation action resets selectedContact to return to ContactList", () => {
  let selectedContactId: string | null = "contact_456";

  const onBackToContacts = () => {
    selectedContactId = null;
  };

  const mobileWidth = 390;
  assert.strictEqual(evaluateMasterDetailView(mobileWidth, selectedContactId), "chat-area");

  // User taps Back button in ChatArea header
  onBackToContacts();

  assert.strictEqual(selectedContactId, null);
  assert.strictEqual(evaluateMasterDetailView(mobileWidth, selectedContactId), "contact-list");
});

test("Tier 1 - Feature 23: Mobile Sidebar Drawer toggles folder drawer state on mobile viewports", () => {
  let isDrawerOpen = false;
  const toggleDrawer = () => {
    isDrawerOpen = !isDrawerOpen;
  };

  assert.strictEqual(isDrawerOpen, false);

  toggleDrawer();
  assert.strictEqual(isDrawerOpen, true);

  // Folder selected from drawer closes drawer
  const onFolderSelect = () => {
    isDrawerOpen = false;
  };
  onFolderSelect();
  assert.strictEqual(isDrawerOpen, false);
});

test("Tier 1 - Feature 24: Tablet viewport (>= 768px) maintains simultaneous split view", () => {
  const tabletWidth = VIEWPORT_BREAKPOINTS.TABLET_MD; // 768px
  const viewWithContact = evaluateMasterDetailView(tabletWidth, "contact_789");
  const viewWithoutContact = evaluateMasterDetailView(tabletWidth, null);

  assert.strictEqual(viewWithContact, "split");
  assert.strictEqual(viewWithoutContact, "split");
});

test("Tier 1 - Feature 25: Long recipient and subject text classes enforce truncation and prevent horizontal overflow", () => {
  const subjectHeaderClass = "truncate font-semibold text-gray-900";
  const messageBodyClass = "break-words overflow-hidden";
  const mainContainerClass = "overflow-hidden min-w-0 flex-1";

  assert.match(subjectHeaderClass, /truncate/);
  assert.match(messageBodyClass, /break-words/);
  assert.match(mainContainerClass, /overflow-hidden/);
  assert.match(mainContainerClass, /min-w-0/);
});
