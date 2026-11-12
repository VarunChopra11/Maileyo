/**
 * Tier 1 - Feature Coverage: Area 7 - Reply & Forward Workflows
 * Covers Feature 20 from PROJECT.md
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createReplyDraft, createForwardDraft } from "../harness/spec-contracts.ts";

test("Tier 1 - Feature 20: Reply workflow populates To recipient from original sender", () => {
  const original = {
    id: "msg_101",
    threadId: "thread_500",
    from: "alice@partner.org",
    subject: "Contract Terms",
    bodyPlain: "Please review the attached terms.",
  };

  const draft = createReplyDraft(original);

  assert.deepStrictEqual(draft.to, ["alice@partner.org"]);
  assert.strictEqual(draft.replyMode, "reply");
});

test("Tier 1 - Feature 20: Reply workflow prefixes subject with 'Re: ' without duplicating prefix", () => {
  const firstReply = createReplyDraft({
    id: "1",
    threadId: "t1",
    from: "bob@domain.com",
    subject: "Meeting Tomorrow",
  });
  assert.strictEqual(firstReply.subject, "Re: Meeting Tomorrow");

  const secondReply = createReplyDraft({
    id: "2",
    threadId: "t1",
    from: "bob@domain.com",
    subject: "Re: Meeting Tomorrow",
  });
  assert.strictEqual(secondReply.subject, "Re: Meeting Tomorrow", "Should not duplicate Re: prefix");
});

test("Tier 1 - Feature 20: Reply workflow configures inReplyTo and references threading headers", () => {
  const original = {
    id: "msg_202",
    threadId: "thread_500",
    from: "manager@corp.com",
    subject: "Sprint Goals",
    references: "<msg_100@corp.com>",
  };

  const draft = createReplyDraft(original);

  assert.strictEqual(draft.threadId, "thread_500");
  assert.strictEqual(draft.inReplyTo, "<msg_202>");
  assert.strictEqual(draft.references, "<msg_100@corp.com> <msg_202>");
});

test("Tier 1 - Feature 20: Forward workflow initializes with empty To recipient field", () => {
  const original = {
    id: "msg_303",
    from: "vendor@cloud.io",
    subject: "Billing Invoice #4451",
    bodyPlain: "Your invoice is ready.",
  };

  const draft = createForwardDraft(original);

  assert.deepStrictEqual(draft.to, [], "Forward To field must start empty");
  assert.strictEqual(draft.replyMode, "forward");
});

test("Tier 1 - Feature 20: Forward workflow prefixes subject with 'Fwd: ' and quotes original content", () => {
  const original = {
    id: "msg_303",
    from: "vendor@cloud.io",
    subject: "Billing Invoice #4451",
    bodyPlain: "Your invoice is ready.",
  };

  const draft = createForwardDraft(original);

  assert.strictEqual(draft.subject, "Fwd: Billing Invoice #4451");
  assert.match(draft.bodyPlain, /---------- Forwarded message ---------/);
  assert.match(draft.bodyPlain, /From: vendor@cloud\.io/);
  assert.match(draft.bodyPlain, /Your invoice is ready\./);
});

test("Tier 1 - Feature 20: Forward preserves HTML structure in quoted section", () => {
  const original = {
    id: "msg_404",
    from: "designer@studio.com",
    subject: "New Brand Guidelines",
    bodyHtml: "<p>Check out our <b>new palette</b>.</p>",
  };

  const draft = createForwardDraft(original);

  assert.match(draft.bodyHtml, /class="gmail_quote"/);
  assert.match(draft.bodyHtml, /<b>new palette<\/b>/);
});
