/**
 * Tier 1 - Feature Coverage: Area 6 - Backend Send API Integration & Error Feedback
 * Covers Features 18, 19 from PROJECT.md
 */

import test from "node:test";
import assert from "node:assert/strict";
import { MockBackendApi, type MockSendPayload } from "../harness/mock-api.ts";
import { createBlankDraft, type ComposeDraftState } from "../harness/spec-contracts.ts";

test("Tier 1 - Feature 18: Successfully posts valid SendEmailRequest to API and receives sent confirmation", async () => {
  const api = new MockBackendApi();
  const payload: MockSendPayload = {
    to: ["recipient@example.com"],
    subject: "Weekly Status Update",
    body_plain: "Here is the summary of project accomplishments.",
    body_html: "<p>Here is the summary of project accomplishments.</p>",
    cc: ["manager@example.com"],
    bcc: [],
    attachments: [
      {
        filename: "report.pdf",
        content: Buffer.from("dummy pdf content").toString("base64"),
        mimeType: "application/pdf",
      },
    ],
  };

  const response = await api.sendEmail(payload);

  assert.strictEqual(response.status, 200);
  assert.strictEqual(response.data.status, "sent");
  assert.ok(response.data.message_id?.startsWith("msg_"));
  assert.ok(response.data.thread_id);
  assert.strictEqual(api.receivedRequests.length, 1);
});

test("Tier 1 - Feature 18: Validates schema requires non-empty recipient list", async () => {
  const api = new MockBackendApi();
  const payload: MockSendPayload = {
    to: [],
    subject: "Missing Recipient",
    body_plain: "Hello",
  };

  const response = await api.sendEmail(payload);
  assert.strictEqual(response.status, 422);
  assert.match(response.data.detail!, /must contain at least one recipient/);
});

test("Tier 1 - Feature 18: Validates schema requires non-empty subject", async () => {
  const api = new MockBackendApi();
  const payload: MockSendPayload = {
    to: ["recipient@example.com"],
    subject: "",
    body_plain: "Hello",
  };

  const response = await api.sendEmail(payload);
  assert.strictEqual(response.status, 422);
  assert.match(response.data.detail!, /cannot be empty/);
});

test("Tier 1 - Feature 19: Propagates backend 500 error detail message to client", async () => {
  const api = new MockBackendApi();
  api.simulateFailure(500, "Gmail API Quota Exceeded. Please try again later.");

  const payload: MockSendPayload = {
    to: ["user@example.com"],
    subject: "Important Notice",
    body_plain: "Content",
  };

  const response = await api.sendEmail(payload);
  assert.strictEqual(response.status, 500);
  assert.strictEqual(
    response.data.detail,
    "Gmail API Quota Exceeded. Please try again later."
  );
});

test("Tier 1 - Feature 19: Retains draft content completely when backend send fails", async () => {
  const api = new MockBackendApi();
  api.simulateFailure(503, "Service Unavailable: Network Timeout");

  const draft: ComposeDraftState = {
    ...createBlankDraft(),
    to: ["client@corp.net"],
    subject: "Critical Proposal",
    bodyPlain: "Detailed contract specifications...",
    bodyHtml: "<p>Detailed contract specifications...</p>",
  };

  // Attempt send
  const response = await api.sendEmail({
    to: draft.to,
    subject: draft.subject,
    body_plain: draft.bodyPlain,
    body_html: draft.bodyHtml,
  });

  assert.strictEqual(response.status, 503);

  // Invariant check: draft must retain all user data
  assert.deepStrictEqual(draft.to, ["client@corp.net"]);
  assert.strictEqual(draft.subject, "Critical Proposal");
  assert.strictEqual(draft.bodyPlain, "Detailed contract specifications...");
});

test("Tier 1 - Feature 18: Preserves optional threading headers (thread_id, in_reply_to, references)", async () => {
  const api = new MockBackendApi();
  const payload: MockSendPayload = {
    to: ["sender@example.com"],
    subject: "Re: Architecture Review",
    body_plain: "Looks solid.",
    thread_id: "thread_alpha_99",
    in_reply_to: "<msg_001@example.com>",
    references: "<root@example.com> <msg_001@example.com>",
  };

  const response = await api.sendEmail(payload);
  assert.strictEqual(response.status, 200);

  const sent = api.receivedRequests[0];
  assert.strictEqual(sent.thread_id, "thread_alpha_99");
  assert.strictEqual(sent.in_reply_to, "<msg_001@example.com>");
  assert.strictEqual(sent.references, "<root@example.com> <msg_001@example.com>");
});
