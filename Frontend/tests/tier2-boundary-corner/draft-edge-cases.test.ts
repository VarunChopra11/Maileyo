/**
 * Tier 2 - Boundary & Corner Cases: Draft State & Window Transitions
 * Tests state retention, subject length limits, special characters in filenames.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { MockBackendApi, type MockSendPayload } from "../harness/mock-api.ts";
import { createBlankDraft } from "../harness/spec-contracts.ts";

test("Tier 2 - Draft: Subject at exact maximum limit of 500 characters is accepted", async () => {
  const api = new MockBackendApi();
  const maxSubject = "A".repeat(500);

  const payload: MockSendPayload = {
    to: ["recipient@domain.com"],
    subject: maxSubject,
    body_plain: "Body content",
  };

  const response = await api.sendEmail(payload);
  assert.strictEqual(response.status, 200);
});

test("Tier 2 - Draft: Subject exceeding 500 characters (501 chars) is rejected by schema validation", async () => {
  const api = new MockBackendApi();
  const oversizedSubject = "B".repeat(501);

  const payload: MockSendPayload = {
    to: ["recipient@domain.com"],
    subject: oversizedSubject,
    body_plain: "Body content",
  };

  const response = await api.sendEmail(payload);
  assert.strictEqual(response.status, 422);
  assert.match(response.data.detail!, /cannot exceed 500 characters/);
});

test("Tier 2 - Draft: Attachments with Unicode, spaces, and international characters are accepted", async () => {
  const api = new MockBackendApi();
  const payload: MockSendPayload = {
    to: ["recipient@domain.com"],
    subject: "International Documents",
    body_plain: "Attached files.",
    attachments: [
      {
        filename: "résumé_final (2026).pdf",
        mimeType: "application/pdf",
        content: Buffer.from("sample content").toString("base64"),
      },
      {
        filename: "공식_문서 [v1.0].docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        content: Buffer.from("docx content").toString("base64"),
      },
    ],
  };

  const response = await api.sendEmail(payload);
  assert.strictEqual(response.status, 200);
  assert.strictEqual(api.receivedRequests[0].attachments?.length, 2);
  assert.strictEqual(api.receivedRequests[0].attachments?.[0].filename, "résumé_final (2026).pdf");
});

test("Tier 2 - Draft: Blank draft preserves expected initial data shape", () => {
  const draft = createBlankDraft();

  assert.deepStrictEqual(draft.to, []);
  assert.deepStrictEqual(draft.cc, []);
  assert.deepStrictEqual(draft.bcc, []);
  assert.strictEqual(draft.subject, "");
  assert.strictEqual(draft.bodyPlain, "");
  assert.strictEqual(draft.bodyHtml, "");
  assert.deepStrictEqual(draft.attachments, []);
  assert.strictEqual(draft.replyMode, "new");
});
