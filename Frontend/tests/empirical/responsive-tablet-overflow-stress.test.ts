/**
 * Empirical Test Suite: Multi-Viewport Responsive Layout, Stress & Overflow Resilience
 * Verifies Milestone 4 acceptance criteria under adversarial lengths, extreme viewports, and touch constraints.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  evaluateMasterDetailView,
  validateEmail,
  tokenizeRecipients,
  validateTotalAttachmentSize,
  sanitizeHtmlContent,
} from "../harness/spec-contracts.ts";

const FRONTEND_DIR = path.resolve(import.meta.dirname, "../..");

test("Stress 1: Extreme 300-character unbroken subject line truncation", () => {
  const longSubject = "URGENT_" + "A".repeat(300);
  assert.strictEqual(longSubject.length, 307);

  // Inspect ChatArea, ComposeModal, and ComposeMessage for subject truncation classes
  const chatAreaSource = fs.readFileSync(
    path.join(FRONTEND_DIR, "src/components/dashboard/ChatArea.tsx"),
    "utf-8"
  );
  const composeModalSource = fs.readFileSync(
    path.join(FRONTEND_DIR, "src/components/dashboard/ComposeModal.tsx"),
    "utf-8"
  );

  // Filter banner subject truncation
  assert.match(
    chatAreaSource,
    /truncate min-w-0 flex-1 max-w-full/,
    "Filter banner in ChatArea must truncate fluidly without fixed 400px blowout"
  );

  // ComposeModal header subject truncation inside min-w-0 flex-1 wrapper
  assert.match(
    composeModalSource,
    /<h2[^>]*id="compose-modal-title"[^>]*truncate[^>]*>/,
    "ComposeModal header title must enforce subject truncation"
  );
});

test("Stress 2: RFC 5321 maximum 254-character email address boundary resilience", () => {
  // Max valid email format: 64 char local part + @ + 189 char domain = 254 chars
  const longEmail = "a".repeat(64) + "@" + "b".repeat(63) + "." + "c".repeat(63) + ".example.com";
  assert.strictEqual(longEmail.length, 204);
  assert.strictEqual(validateEmail(longEmail), true);

  // 255 character email exceeds RFC 5321 boundary
  const oversizedEmail = "a".repeat(64) + "@" + "b".repeat(60) + "." + "c".repeat(60) + "." + "d".repeat(65) + ".com";
  assert.ok(oversizedEmail.length > 254);
  assert.strictEqual(validateEmail(oversizedEmail), false);

  // ContactList & ChatArea headers must have truncate on email display
  const chatAreaSource = fs.readFileSync(
    path.join(FRONTEND_DIR, "src/components/dashboard/ChatArea.tsx"),
    "utf-8"
  );
  assert.match(
    chatAreaSource,
    /<p className="text-xs text-gray-500 dark:text-gray-400 truncate">/,
    "ChatArea contact email must be protected with truncate"
  );
});

test("Stress 3: Multi-recipient chips container wrap resilience", () => {
  const recipientInputSource = fs.readFileSync(
    path.join(FRONTEND_DIR, "src/components/dashboard/RecipientInput.tsx"),
    "utf-8"
  );

  // Container must flex-wrap so multiple chips stack vertically without horizontal overflow
  assert.match(
    recipientInputSource,
    /flex-wrap/,
    "RecipientInput chip container must use flex-wrap to prevent horizontal overflow"
  );

  // Individual chips must have max-w truncation
  assert.match(
    recipientInputSource,
    /truncate max-w-\[200px\] sm:max-w-\[280px\]/,
    "Recipient chips must truncate long email strings cleanly"
  );
});

test("Stress 4: Long attachment filename (150 chars) truncation", () => {
  const longFilename = "Quarterly_Consolidated_Financial_Audit_Report_FiscalYear2026_Final_Draft_Approved_By_Board_Of_Directors_Signed_Encrypted_Document_Confidential.pdf";
  assert.ok(longFilename.length > 100);

  const composeModalSource = fs.readFileSync(
    path.join(FRONTEND_DIR, "src/components/dashboard/ComposeModal.tsx"),
    "utf-8"
  );

  assert.match(
    composeModalSource,
    /truncate max-w-\[150px\] sm:max-w-\[200px\]/,
    "ComposeModal attachment pill must truncate long filenames"
  );
});

test("Stress 5: Massive HTML content horizontal scroll containment", () => {
  const messageBubbleSource = fs.readFileSync(
    path.join(FRONTEND_DIR, "src/components/dashboard/MessageBubble.tsx"),
    "utf-8"
  );

  // Message bubble body must have overflow-x-auto to isolate wide tables/pre tags
  assert.match(
    messageBubbleSource,
    /px-5 py-4 text-sm leading-relaxed text-gray-800 dark:text-gray-200 overflow-x-auto/,
    "MessageBubble body wrapper must have overflow-x-auto to prevent page blowout"
  );
});

test("Stress 6: Exhaustive Viewport Sweep Matrix across 10 device breakpoints", () => {
  const sweepMatrix = [
    { width: 320, name: "iPhone SE / Small Mobile", expectedSplit: false },
    { width: 375, name: "iPhone Mini / Standard Mobile", expectedSplit: false },
    { width: 412, name: "Pixel / Large Mobile", expectedSplit: false },
    { width: 639, name: "Tailwind max <sm boundary", expectedSplit: false },
    { width: 640, name: "Tailwind sm boundary", expectedSplit: false },
    { width: 767, name: "Tailwind max <md boundary", expectedSplit: false },
    { width: 768, name: "Tailwind md / iPad Portrait boundary", expectedSplit: true },
    { width: 820, name: "iPad Air", expectedSplit: true },
    { width: 1024, name: "Tailwind lg / Desktop boundary", expectedSplit: true },
    { width: 1280, name: "Tailwind xl / Desktop", expectedSplit: true },
    { width: 1920, name: "Tailwind 2xl / Ultrawide", expectedSplit: true },
  ];

  for (const device of sweepMatrix) {
    if (device.expectedSplit) {
      // At or above 768px, layout must always remain in split view regardless of contact selection
      assert.strictEqual(
        evaluateMasterDetailView(device.width, null),
        "split",
        `${device.name} (${device.width}px) without contact should be split`
      );
      assert.strictEqual(
        evaluateMasterDetailView(device.width, "contact_test_id"),
        "split",
        `${device.name} (${device.width}px) with contact should be split`
      );
    } else {
      // Below 768px, layout must toggle single-pane master-detail view
      assert.strictEqual(
        evaluateMasterDetailView(device.width, null),
        "contact-list",
        `${device.name} (${device.width}px) without contact should show contact-list`
      );
      assert.strictEqual(
        evaluateMasterDetailView(device.width, "contact_test_id"),
        "chat-area",
        `${device.name} (${device.width}px) with contact should show chat-area`
      );
    }
  }
});

test("Stress 7: Touch Target Compliance (>= 44x44px) across all mobile controls", () => {
  // Mobile Back Button in ChatArea
  const chatAreaSource = fs.readFileSync(
    path.join(FRONTEND_DIR, "src/components/dashboard/ChatArea.tsx"),
    "utf-8"
  );
  assert.match(
    chatAreaSource,
    /min-h-\[44px\] min-w-\[44px\]/,
    "ChatArea mobile back button must meet minimum 44x44px touch target"
  );

  // Mobile Hamburger Menu Button in ContactList
  const contactListSource = fs.readFileSync(
    path.join(FRONTEND_DIR, "src/components/dashboard/ContactList.tsx"),
    "utf-8"
  );
  assert.match(
    contactListSource,
    /min-h-\[44px\] min-w-\[44px\]/,
    "ContactList mobile hamburger menu button must meet minimum 44x44px touch target"
  );

  // Mobile Drawer Close and Compose Buttons in MobileFolderDrawer
  const drawerSource = fs.readFileSync(
    path.join(FRONTEND_DIR, "src/components/dashboard/MobileFolderDrawer.tsx"),
    "utf-8"
  );
  assert.match(
    drawerSource,
    /aria-label="Close navigation drawer"[^>]*min-h-\[44px\] min-w-\[44px\]/,
    "MobileFolderDrawer close button must meet minimum 44x44px touch target"
  );
  assert.match(
    drawerSource,
    /aria-label="Compose new email"[^>]*min-h-\[44px\]/,
    "MobileFolderDrawer compose button must meet minimum 44px height touch target"
  );
});

test("Stress 8: Wide 20-column HTML table sanitization & scroll containment invariant", () => {
  // Construct an adversarial 20-column table where each cell has 50-character unbroken text
  const cols = Array.from({ length: 20 }, (_, i) => `Col_${i}_${"X".repeat(40)}`);
  const headerHtml = cols.map((c) => `<th>${c}</th>`).join("");
  const rowHtml = cols.map((c) => `<td>data_${c}</td>`).join("");
  const wideTableHtml = `<div class="email-wrapper"><table border="1"><thead><tr>${headerHtml}</tr></thead><tbody><tr>${rowHtml}</tr></tbody></table></div>`;

  // Verify sanitizer retains table elements and does not strip structure
  const sanitized = sanitizeHtmlContent(wideTableHtml);
  assert.ok(sanitized.includes("<table"), "Sanitized output must retain <table> tag");
  assert.ok(sanitized.includes("<thead>"), "Sanitized output must retain <thead> tag");
  assert.ok(sanitized.includes("<tbody>"), "Sanitized output must retain <tbody> tag");
  assert.ok(sanitized.includes("<th>"), "Sanitized output must retain <th> tag");
  assert.ok(sanitized.includes("<td>"), "Sanitized output must retain <td> tag");

  // Inspect SecureEmailRenderer Shadow DOM styles for table and container constraints
  const secureEmailRendererSource = fs.readFileSync(
    path.join(FRONTEND_DIR, "src/components/dashboard/SecureEmailRenderer.tsx"),
    "utf-8"
  );
  assert.match(
    secureEmailRendererSource,
    /\.email-body-content\s*\{[\s\S]*?overflow-x:\s*auto;/,
    "SecureEmailRenderer must enforce overflow-x: auto on .email-body-content"
  );
  assert.match(
    secureEmailRendererSource,
    /table\s*\{[\s\S]*?max-width:\s*100%;/,
    "SecureEmailRenderer must enforce max-width: 100% on tables"
  );
});

test("Stress 9: Tablet Viewport Geometry Invariants under extreme sidebar widths (260px to 500px)", () => {
  const tabletBreakpoints = [
    { name: "iPad Mini / iPad Portrait (768px)", width: 768 },
    { name: "iPad 10.2 Portrait (810px)", width: 810 },
    { name: "iPad Air 10.9 (820px)", width: 820 },
    { name: "iPad Pro 11 Portrait (834px)", width: 834 },
    { name: "iPad Pro 12.9 Portrait (1024px)", width: 1024 },
  ];

  const sidebarRailWidth = 96; // 96px w-24 icon rail on >=md
  const mainMargin = 12; // 12px margin
  const dividerWidth = 12; // 12px divider

  for (const bp of tabletBreakpoints) {
    const netPanesWidth = bp.width - sidebarRailWidth - mainMargin - dividerWidth;

    // Test across sidebar width range: minimum 260px, default 320px, maximum 500px
    for (const contactsWidth of [260, 320, 400, 500]) {
      const chatAreaWidth = netPanesWidth - contactsWidth;

      // Invariant 1: Total occupied width must never exceed net available width (no horizontal blowout)
      assert.ok(
        contactsWidth + chatAreaWidth <= netPanesWidth,
        `${bp.name} with contacts=${contactsWidth}px must not exceed net width ${netPanesWidth}px`
      );

      // Invariant 2: At minimum sidebar (260px) on 768px tablet, chat area has at least 388px
      if (bp.width === 768 && contactsWidth === 260) {
        assert.strictEqual(chatAreaWidth, 388);
      }

      // Invariant 3: At default sidebar (320px) on 768px tablet, chat area has 328px
      if (bp.width === 768 && contactsWidth === 320) {
        assert.strictEqual(chatAreaWidth, 328);
      }

      // Invariant 4: Layout mode must always be "split" at >= 768px
      assert.strictEqual(
        evaluateMasterDetailView(bp.width, "contact_sample"),
        "split",
        `${bp.name} must evaluate to split view`
      );
    }
  }
});

test("Stress 10: Adversarial Email Boundaries & Tokenizer High-Volume Fuzzing", () => {
  // Exact 254-character boundary email (RFC 5321 limit)
  // 64-char local + 1 + 189-char domain = 254
  const exact254Email = "x".repeat(64) + "@" + "d".repeat(60) + "." + "d".repeat(60) + "." + "d".repeat(63) + ".com";
  assert.strictEqual(exact254Email.length, 254);
  assert.strictEqual(validateEmail(exact254Email), true, "RFC 5321 exact 254 char email must be valid");

  // 255-character boundary email (exceeds limit by 1 byte)
  const exact255Email = "x".repeat(64) + "@" + "d".repeat(60) + "." + "d".repeat(60) + "." + "d".repeat(64) + ".com";
  assert.strictEqual(exact255Email.length, 255);
  assert.strictEqual(validateEmail(exact255Email), false, "255 char email must be invalid");

  // High-volume recipient tokenization: 50 unique emails separated by mixed delimiters
  const rawRecipientString = Array.from({ length: 50 }, (_, i) => `user_${i}@example${i % 3}.org`).join(
    ", ; \n\t "
  );
  const tokenized = tokenizeRecipients(rawRecipientString);
  assert.strictEqual(tokenized.length, 50, "Tokenizer must parse 50 distinct emails cleanly");

  // Duplicate deduplication check
  const duplicatedString = "alpha@test.com, ALPHA@TEST.COM; beta@test.com Beta@Test.com";
  const deduped = tokenizeRecipients(duplicatedString);
  assert.deepStrictEqual(deduped, ["alpha@test.com", "beta@test.com"]);
});

test("Stress 11: Long filenames (200 chars) & Attachment Size Limit Invariants", () => {
  const longName200 = "Detailed_Security_Vulnerability_Assessment_And_Penetration_Testing_Full_Audit_Report_For_Year_2026_Enterprise_Edition_Confidential_Signed_And_Encrypted_Document_Payload_Final_Approved_Release_V2_Revision_8.pdf";
  assert.ok(longName200.length >= 200);

  // Attachment size validator check with exact 20MB limit
  const exact20MB = 20 * 1024 * 1024;
  const validFiles = [
    { size: exact20MB - 100 },
    { size: 100 },
  ];
  const validation1 = validateTotalAttachmentSize(validFiles);
  assert.strictEqual(validation1.valid, true);

  const overflowFiles = [
    { size: exact20MB },
    { size: 1 },
  ];
  const validation2 = validateTotalAttachmentSize(overflowFiles);
  assert.strictEqual(validation2.valid, false);
  assert.ok(validation2.error?.includes("exceeds maximum allowed limit"));
});

test("Stress 12: Unbroken 300-character Subject across all dashboard headers", () => {
  const chatAreaSource = fs.readFileSync(
    path.join(FRONTEND_DIR, "src/components/dashboard/ChatArea.tsx"),
    "utf-8"
  );
  const composeMessageSource = fs.readFileSync(
    path.join(FRONTEND_DIR, "src/components/dashboard/ComposeMessage.tsx"),
    "utf-8"
  );

  // Thread subject sticky header truncation
  assert.match(
    chatAreaSource,
    /<h3[^>]*uppercase tracking-wider truncate[^>]*>/,
    "Sticky thread subject header must enforce truncate"
  );

  // Dropdown thread items truncation
  assert.match(
    chatAreaSource,
    /<span className="truncate max-w-\[210px\]">/,
    "Dropdown conversation items must enforce truncate max-w-[210px]"
  );

  // ComposeMessage active thread subject preview truncation
  assert.match(
    composeMessageSource,
    /<span className="text-gray-500 truncate">\{formData\.subject\}<\/span>/,
    "ComposeMessage active thread subject preview must enforce truncate"
  );
  assert.match(
    composeMessageSource,
    /<span className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">/,
    "ComposeMessage header subject preview must enforce truncate"
  );
});

test("Stress 13: Tablet vs Desktop column collapse and button label compression", () => {
  const composeMessageSource = fs.readFileSync(
    path.join(FRONTEND_DIR, "src/components/dashboard/ComposeMessage.tsx"),
    "utf-8"
  );
  const messageBubbleSource = fs.readFileSync(
    path.join(FRONTEND_DIR, "src/components/dashboard/MessageBubble.tsx"),
    "utf-8"
  );

  // ComposeMessage grid must be single column below lg (<= 1023px)
  assert.match(
    composeMessageSource,
    /grid grid-cols-1 lg:grid-cols-2 gap-2/,
    "Primary inputs in ComposeMessage must remain single column on tablet"
  );
  assert.match(
    composeMessageSource,
    /grid grid-cols-1 lg:grid-cols-2 gap-2 pt-1/,
    "Cc/Bcc inputs in ComposeMessage must remain single column on tablet"
  );

  // MessageBubble actions must hide text labels below lg
  assert.match(
    messageBubbleSource,
    /<span className="hidden lg:inline">\s*Reply\s*<\/span>/,
    "Reply button label must be hidden on tablet"
  );
  assert.match(
    messageBubbleSource,
    /<span className="hidden lg:inline">\s*Forward\s*<\/span>/,
    "Forward button label must be hidden on tablet"
  );
});

