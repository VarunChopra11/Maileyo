/**
 * Tier 1 - Feature Coverage: Tablet Responsiveness, Spacing Adaptations & Overflow Prevention
 * Covers Features 21, 22, 23, 24, 25 from PROJECT.md
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  evaluateMasterDetailView,
  VIEWPORT_BREAKPOINTS,
  SIDEBAR_CONSTRAINTS,
} from "../harness/spec-contracts.ts";

const FRONTEND_DIR = path.resolve(import.meta.dirname, "../..");

test("Tier 1 - Feature 24: Tablet 768px Viewport Split Geometry Invariant", () => {
  const tabletWidth = VIEWPORT_BREAKPOINTS.TABLET_MD; // 768px
  const sidebarRailWidth = 96; // w-24
  const mainMargin = 12; // mr-3 or md:mr-3
  const dividerWidth = 12; // w-3

  // Net width available for the two dashboard panels
  const netPanesWidth = tabletWidth - sidebarRailWidth - mainMargin - dividerWidth;
  assert.strictEqual(netPanesWidth, 648);

  // At default contacts width (320px)
  const contactsWidth = SIDEBAR_CONSTRAINTS.DEFAULT_WIDTH;
  const chatAreaWidth = netPanesWidth - contactsWidth;

  assert.strictEqual(contactsWidth, 320);
  assert.strictEqual(chatAreaWidth, 328);

  // Both panels fit without requiring horizontal scroll
  assert.ok(contactsWidth + chatAreaWidth <= netPanesWidth);

  // Verify evaluateMasterDetailView contract returns split
  assert.strictEqual(evaluateMasterDetailView(tabletWidth, "contact_1"), "split");
  assert.strictEqual(evaluateMasterDetailView(tabletWidth, null), "split");
});

test("Tier 1 - Feature 24: MessageBubble header actions compact text labels on tablet (< 1024px)", () => {
  const messageBubbleSource = fs.readFileSync(
    path.join(FRONTEND_DIR, "src/components/dashboard/MessageBubble.tsx"),
    "utf-8"
  );

  // Assert Reply and Forward button text spans are hidden on tablet, showing only at lg: (>=1024px)
  assert.match(
    messageBubbleSource,
    /<span className="hidden lg:inline">\s*Reply\s*<\/span>/,
    "Reply text label must use hidden lg:inline to prevent tablet crushing"
  );
  assert.match(
    messageBubbleSource,
    /<span className="hidden lg:inline">\s*Forward\s*<\/span>/,
    "Forward text label must use hidden lg:inline to prevent tablet crushing"
  );
  assert.doesNotMatch(
    messageBubbleSource,
    /<span className="hidden sm:inline">\s*Reply\s*<\/span>/,
    "Reply text label must not use sm:inline which causes crushing at 768px"
  );
});

test("Tier 1 - Feature 24: ComposeMessage inputs use single column on tablet, 2-column only on lg (>=1024px)", () => {
  const composeMessageSource = fs.readFileSync(
    path.join(FRONTEND_DIR, "src/components/dashboard/ComposeMessage.tsx"),
    "utf-8"
  );

  // Grid should be grid-cols-1 lg:grid-cols-2 (not md:grid-cols-2)
  assert.match(
    composeMessageSource,
    /grid grid-cols-1 lg:grid-cols-2 gap-2/,
    "ComposeMessage To/Subject grid must use lg:grid-cols-2"
  );
  assert.doesNotMatch(
    composeMessageSource,
    /grid grid-cols-1 md:grid-cols-2/,
    "ComposeMessage must not use md:grid-cols-2 which squishes inputs down to ~100px"
  );
});

test("Tier 1 - Feature 25: ChatArea thread filter banner enforces fluid truncation", () => {
  const chatAreaSource = fs.readFileSync(
    path.join(FRONTEND_DIR, "src/components/dashboard/ChatArea.tsx"),
    "utf-8"
  );

  assert.match(
    chatAreaSource,
    /truncate min-w-0 flex-1 max-w-full/,
    "Viewing thread banner must use fluid truncation instead of hardcoded max-w"
  );
  assert.doesNotMatch(
    chatAreaSource,
    /truncate max-w-\[400px\]/,
    "Viewing thread banner must not hardcode max-w-[400px] which exceeds tablet pane width"
  );
});

test("Tier 1 - Feature 25: ContactList folder header enforces title truncation and badge protection", () => {
  const contactListSource = fs.readFileSync(
    path.join(FRONTEND_DIR, "src/components/dashboard/ContactList.tsx"),
    "utf-8"
  );

  assert.match(
    contactListSource,
    /<h2[^>]*capitalize tracking-tight truncate min-w-0[^>]*>/,
    "Folder title h2 must have truncate and min-w-0"
  );
  assert.match(
    contactListSource,
    /<span[^>]*shrink-0 ml-2[^>]*>/,
    "Conversations count badge must have shrink-0 ml-2 to prevent collision"
  );
});

test("Tier 1 - Feature 22: ChatArea header includes responsive mobile back button", () => {
  const chatAreaSource = fs.readFileSync(
    path.join(FRONTEND_DIR, "src/components/dashboard/ChatArea.tsx"),
    "utf-8"
  );

  // Verify md:hidden back button exists with >=44x44px touch target and accessibility attributes
  assert.match(chatAreaSource, /md:hidden/);
  assert.match(chatAreaSource, /min-h-\[44px\] min-w-\[44px\]/);
  assert.match(chatAreaSource, /aria-label="Back to contacts list"/);
  assert.match(chatAreaSource, /<ArrowLeft className="w-5 h-5 shrink-0" \/>/);
  assert.match(chatAreaSource, /<span className="sr-only">Back to contacts<\/span>/);
});

test("Tier 1 - Feature 23: MobileFolderDrawer configuration and full folder items coverage", () => {
  const drawerSource = fs.readFileSync(
    path.join(FRONTEND_DIR, "src/components/dashboard/MobileFolderDrawer.tsx"),
    "utf-8"
  );

  // Verify 9 folder items are registered
  const expectedFolders = [
    "Primary+Sent",
    "Inbox:Primary",
    "Inbox:Social",
    "Inbox:Promotions",
    "Starred",
    "Sent",
    "Drafts",
    "Spam",
    "Trash",
  ];
  for (const folder of expectedFolders) {
    assert.match(
      drawerSource,
      new RegExp(`id:\\s*"${folder.replace("+", "\\+")}"`),
      `MobileFolderDrawer must include ${folder}`
    );
  }

  // Verify drawer configuration in MobileFolderDrawer.tsx
  assert.match(drawerSource, /direction="left"/);
  assert.match(drawerSource, /shouldScaleBackground=\{false\}/);
  assert.match(drawerSource, /dismissible=\{true\}/);
  assert.match(drawerSource, /backdrop-blur-xs/);
  assert.match(drawerSource, /min-h-\[44px\]/);
});

test("Tier 1 - Feature 21: Dashboard implements mobile master-detail layout toggle", () => {
  const dashboardSource = fs.readFileSync(
    path.join(FRONTEND_DIR, "src/pages/Dashboard.tsx"),
    "utf-8"
  );

  // aside has state.selectedContact ? "hidden md:flex" : "flex"
  assert.match(dashboardSource, /state\.selectedContact \? "hidden md:flex" : "flex"/);

  // section has state.selectedContact ? "flex flex-1 w-full md:w-auto" : "hidden md:flex md:flex-1"
  assert.match(
    dashboardSource,
    /state\.selectedContact\s*\?\s*"flex flex-1 w-full md:w-auto"\s*:\s*"hidden md:flex md:flex-1"/
  );

  // passes onBackToContacts and onFolderSelect
  assert.match(dashboardSource, /onBackToContacts=\{handleBackToContacts\}/);
  assert.match(dashboardSource, /onFolderSelect=\{handleFolderSelect\}/);
});

test("Tier 1 - Feature 23: Desktop Sidebar icon rail is hidden on mobile (<md)", () => {
  const sidebarSource = fs.readFileSync(
    path.join(FRONTEND_DIR, "src/components/dashboard/Sidebar.tsx"),
    "utf-8"
  );

  assert.match(
    sidebarSource,
    /hidden md:flex/,
    "Desktop Sidebar must have hidden md:flex to hide on mobile screens"
  );
});
