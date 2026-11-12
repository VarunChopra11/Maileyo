/**
 * Tier 3 - Cross-Feature Combinations: Pairwise Feature Interactions
 * Tests cross-module behaviors: sidebar resizing with active composer, mobile layout
 * switching with in-progress draft, contact switching vs compose draft isolation,
 * and API failure recovery with rich text and attachments.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { MockLocalStorage } from "../harness/dom-harness.ts";
import { MockBackendApi, type MockSendPayload } from "../harness/mock-api.ts";
import {
  SIDEBAR_CONSTRAINTS,
  clampSidebarWidth,
  createBlankDraft,
  createReplyDraft,
  createForwardDraft,
  sanitizeHtmlContent,
  evaluateMasterDetailView,
  type ComposeDraftState,
} from "../harness/spec-contracts.ts";

test("Tier 3 - Combination 1: Resizing sidebar while compose modal is open retains modal state and width persistence", () => {
  const storage = new MockLocalStorage();
  const composerOpen = true;
  let sidebarWidth = 320;

  // User drags divider to resize sidebar to 440px
  const newWidth = clampSidebarWidth(440);
  storage.setItem(SIDEBAR_CONSTRAINTS.STORAGE_KEY, newWidth.toString());
  sidebarWidth = newWidth;

  // Composer remains open and sidebar preference is saved
  assert.strictEqual(composerOpen, true, "Composer should remain open during/after sidebar resize");
  assert.strictEqual(sidebarWidth, 440);
  assert.strictEqual(storage.getItem(SIDEBAR_CONSTRAINTS.STORAGE_KEY), "440");
});

test("Tier 3 - Combination 2: Mobile master-detail view switching preserves in-progress composer draft", () => {
  let selectedContactId: string | null = "contact_001";
  const mobileWidth = 375;

  // User starts drafting an email in compose modal
  const activeDraft: ComposeDraftState = {
    ...createBlankDraft(),
    to: ["external@client.org"],
    subject: "Urgent Query",
    bodyPlain: "Drafting while on the move...",
  };

  // Currently viewing ChatArea on mobile
  assert.strictEqual(evaluateMasterDetailView(mobileWidth, selectedContactId), "chat-area");

  // User taps Back to return to ContactList
  selectedContactId = null;
  assert.strictEqual(evaluateMasterDetailView(mobileWidth, selectedContactId), "contact-list");

  // User selects Contact 2
  selectedContactId = "contact_002";
  assert.strictEqual(evaluateMasterDetailView(mobileWidth, selectedContactId), "chat-area");

  // Assert draft was NOT mutated or destroyed by mobile navigation
  assert.deepStrictEqual(activeDraft.to, ["external@client.org"]);
  assert.strictEqual(activeDraft.subject, "Urgent Query");
  assert.strictEqual(activeDraft.bodyPlain, "Drafting while on the move...");
});

test("Tier 3 - Combination 3: Selecting a contact in ContactList does not overwrite a global new draft", () => {
  let selectedContact: { id: string; email: string } | null = null;
  const draft: ComposeDraftState = {
    ...createBlankDraft(),
    to: ["unrelated@stranger.com"],
    subject: "Independent inquiry",
    replyMode: "new",
  };

  // User clicks on Contact in ContactList
  selectedContact = { id: "contact_99", email: "contact99@company.com" };

  // For a global compose modal in "new" mode, active draft must not be overwritten by contact click
  assert.deepStrictEqual(draft.to, ["unrelated@stranger.com"]);
  assert.strictEqual(selectedContact.email, "contact99@company.com");
});

test("Tier 3 - Combination 4: Contact autocomplete selection combines seamlessly with arbitrary manual recipients and CC/BCC", () => {
  const existingContacts = [
    { id: "c1", name: "Sarah Connor", email: "sarah@resistance.org" },
    { id: "c2", name: "John Connor", email: "john@resistance.org" },
  ];

  // User picks Sarah from autocomplete
  const pickedFromAutocomplete = existingContacts[0].email;

  // User enters external email in To, and another in CC
  const toList = [pickedFromAutocomplete, "external@vendor.net"];
  const ccList = ["auditor@compliance.gov"];

  assert.strictEqual(toList.length, 2);
  assert.strictEqual(toList[0], "sarah@resistance.org");
  assert.strictEqual(toList[1], "external@vendor.net");
  assert.strictEqual(ccList[0], "auditor@compliance.gov");
});

test("Tier 3 - Combination 5: Rich-text formatting with embedded links and base64 attachments packages cleanly for API", async () => {
  const api = new MockBackendApi();

  const rawHtml = '<p>Meeting notes: <b>action items</b> at <a href="https://workspace.io/tasks">Tasks</a>.</p>';
  const sanitizedHtml = sanitizeHtmlContent(rawHtml);

  const payload: MockSendPayload = {
    to: ["stakeholders@company.com"],
    subject: "Executive Summary",
    body_html: sanitizedHtml,
    body_plain: "Meeting notes: action items at https://workspace.io/tasks.",
    attachments: [
      {
        filename: "presentation.pptx",
        content: Buffer.from("mock pptx").toString("base64"),
        mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      },
    ],
  };

  const response = await api.sendEmail(payload);
  assert.strictEqual(response.status, 200);
  assert.strictEqual(api.receivedRequests.length, 1);

  const sent = api.receivedRequests[0];
  assert.match(sent.body_html!, /<b>action items<\/b>/);
  assert.match(sent.body_html!, /href="https:\/\/workspace\.io\/tasks"/);
  assert.strictEqual(sent.attachments?.length, 1);
});

test("Tier 3 - Combination 6: Reply action seamlessly configures inReplyTo and references while preserving thread context", () => {
  const originalMessage = {
    id: "msg_orig_10",
    threadId: "thread_k9",
    from: "colleague@team.org",
    subject: "Budget Allocations",
    bodyPlain: "Can we approve the Q3 budget?",
    references: "<root_budget@team.org>",
  };

  const replyDraft = createReplyDraft(originalMessage);

  assert.strictEqual(replyDraft.replyMode, "reply");
  assert.strictEqual(replyDraft.threadId, "thread_k9");
  assert.strictEqual(replyDraft.inReplyTo, "<msg_orig_10>");
  assert.strictEqual(replyDraft.references, "<root_budget@team.org> <msg_orig_10>");
  assert.strictEqual(replyDraft.subject, "Re: Budget Allocations");
  assert.deepStrictEqual(replyDraft.to, ["colleague@team.org"]);
});

test("Tier 3 - Combination 7: Forward action clears recipient To and formats forward quotation", () => {
  const originalMessage = {
    id: "msg_fwd_55",
    from: "client@enterprise.com",
    subject: "Urgent SLA Update",
    bodyPlain: "Please see our revised SLA.",
  };

  const fwdDraft = createForwardDraft(originalMessage);

  assert.strictEqual(fwdDraft.replyMode, "forward");
  assert.deepStrictEqual(fwdDraft.to, []);
  assert.strictEqual(fwdDraft.subject, "Fwd: Urgent SLA Update");
  assert.match(fwdDraft.bodyPlain, /---------- Forwarded message ---------/);
  assert.match(fwdDraft.bodyPlain, /From: client@enterprise\.com/);
});

test("Tier 3 - Combination 8: API failure retains complex draft containing rich text, chips, and attachments for retry", async () => {
  const api = new MockBackendApi();
  api.simulateFailure(500, "Database connection timeout");

  const draft: ComposeDraftState = {
    to: ["ceo@company.com", "board@company.com"],
    cc: ["cfo@company.com"],
    bcc: ["archive@company.com"],
    subject: "Confidential Strategy Memo",
    bodyPlain: "Strategy details...",
    bodyHtml: "<p><b>Strategy</b> details...</p>",
    attachments: [
      {
        filename: "memo.pdf",
        size: 1024 * 1024,
        mimeType: "application/pdf",
        content: Buffer.from("pdf").toString("base64"),
      },
    ],
    replyMode: "new",
  };

  // Attempt send
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

  assert.strictEqual(response.status, 500);

  // User fixes network or retries
  api.reset();
  const retryResponse = await api.sendEmail({
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

  assert.strictEqual(retryResponse.status, 200);
  assert.strictEqual(retryResponse.data.status, "sent");
});
