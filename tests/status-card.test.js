import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { renderStatusCard } from "../app/js/status-card.js";

const { document } = parseHTML("<html><body></body></html>");
const t = (k, p = {}) => k + (p.count !== undefined ? `:${p.count}` : "") + (p.name ? `:${p.name}` : "");
const calls = [];
const actions = {
  onReply: (s) => calls.push(["reply", s.id]),
  onFavourite: (s) => calls.push(["fav", s.id]),
  onDislike: (s) => calls.push(["dislike", s.id]),
  onToggleThread: (s) => calls.push(["thread", s.id]),
};
const base = (over = {}) => ({
  id: "1", content: "<p>hello</p>", spoiler_text: "", sensitive: false, visibility: "public",
  created_at: "2026-10-16T10:00:00Z", replies_count: 3, reblogs_count: 0, favourites_count: 0,
  favourited: false, reblogged: false, media_attachments: [], reblog: null,
  account: { id: "a", acct: "anna", display_name: "Anna", avatar: "https://h/a.png", url: "https://h/anna" },
  ...over,
});
const render = (s) => renderStatusCard(s, { doc: document, t, actions });

test("renders author and sanitized body", () => {
  const el = render(base({ content: "<p>hi</p><script>x</script>" }));
  assert.match(el.textContent, /Anna/);
  assert.match(el.textContent, /hi/);
  assert.equal(el.querySelector("script"), null);
});
test("a boost shows the boosted status and a boosted-by label", () => {
  const inner = base({ id: "2", content: "<p>original</p>", account: { ...base().account, display_name: "Bob", acct: "bob" } });
  const el = render(base({ id: "9", content: "", reblog: inner }));
  assert.match(el.textContent, /original/);
  assert.match(el.textContent, /status\.boosted_by/);
  assert.match(el.textContent, /Bob/);
});
test("a content warning hides the body behind a collapsed button", () => {
  const el = render(base({ spoiler_text: "cw text", content: "<p>secret</p>" }));
  const btn = el.querySelector("button[aria-expanded]");
  assert.equal(btn.getAttribute("aria-expanded"), "false");
  assert.equal(el.querySelector(".body").hidden, true);
  btn.onclick();
  assert.equal(btn.getAttribute("aria-expanded"), "true");
  assert.equal(el.querySelector(".body").hidden, false);
});
test("disliked true marks the dislike button active with the undo label", () => {
  const el = render(base({ disliked: true }));
  const b = el.querySelector("button.dislike");
  assert.ok(b.classList.contains("active"));
  assert.equal(b.getAttribute("aria-label"), "status.undislike");
});
test("a status without the disliked field renders as not disliked", () => {
  const el = render(base());
  const b = el.querySelector("button.dislike");
  assert.ok(!b.classList.contains("active"));
  assert.equal(b.getAttribute("aria-label"), "status.dislike");
});
test("no element shows a dislike count", () => {
  const el = render(base({ disliked: true, dislikes_count: 7 }));
  assert.ok(!el.textContent.includes("7"));
});
test("action buttons call the handlers with the displayed status", () => {
  calls.length = 0;
  const el = render(base({ id: "5" }));
  el.querySelector("button.reply").onclick();
  el.querySelector("button.like").onclick();
  el.querySelector("button.dislike").onclick();
  el.querySelector("button.replies-toggle").onclick();
  assert.deepEqual(calls, [["reply", "5"], ["fav", "5"], ["dislike", "5"], ["thread", "5"]]);
});
test("missing optional fields do not throw", () => {
  assert.doesNotThrow(() => render({ id: "1", content: "", account: { acct: "x" } }));
});

test("an unknown attachment with a javascript: url gets no href", () => {
  const el = render(base({ media_attachments: [{ type: "unknown", url: "javascript:alert(1)", description: "x" }] }));
  const a = el.querySelector("a.attachment");
  assert.ok(!a || !a.getAttribute("href"));
});
test("an image attachment with a non-http src is not rendered with that src", () => {
  const el = render(base({ media_attachments: [{ type: "image", url: "javascript:alert(1)", preview_url: "javascript:alert(1)" }] }));
  const img = el.querySelector("img.attachment");
  assert.ok(!img || !(img.getAttribute("src") || "").startsWith("javascript"));
});

test("inThread cards have no replies toggle and are marked", () => {
  const el = renderStatusCard(base({ replies_count: 4 }), { doc: document, t, actions, inThread: true });
  assert.equal(el.querySelector("button.replies-toggle"), null);
  assert.equal(el.dataset.inThread, "1");
});

import { setActionsDisabled } from "../app/js/status-card.js";
test("handlers receive the card element that fired them", () => {
  const got = [];
  const acts = { onReply: (s, c) => got.push(c), onFavourite: (s, c) => got.push(c), onDislike: (s, c) => got.push(c), onToggleThread: (s, c) => got.push(c) };
  const el = renderStatusCard(base({ id: "5" }), { doc: document, t, actions: acts });
  el.querySelector("button.reply").onclick();
  el.querySelector("button.like").onclick();
  el.querySelector("button.dislike").onclick();
  el.querySelector("button.replies-toggle").onclick();
  assert.equal(got.length, 4);
  assert.ok(got.every((c) => c === el));
});
test("setActionsDisabled locks only the card's own action row, not an open thread", () => {
  const el = render(base());
  const inner = document.createElement("button");
  el.querySelector(".thread").append(inner);
  setActionsDisabled(el, true);
  assert.equal(el.querySelector("button.like").disabled, true);
  assert.equal(inner.disabled, false);
  setActionsDisabled(el, false);
  assert.equal(el.querySelector("button.like").disabled, false);
});
test("there is no inert boost button", () => {
  assert.equal(render(base()).querySelector("button.repost"), null);
});

test("the date links to the instance permalink and opens in a new tab", () => {
  const el = render(base({ url: "https://h.example/anna/s/1" }));
  const a = el.querySelector("a.permalink");
  assert.equal(a.getAttribute("href"), "https://h.example/anna/s/1");
  assert.equal(a.getAttribute("target"), "_blank");
  assert.match(a.getAttribute("rel"), /noopener/);
  assert.ok(a.querySelector("time"));
});
test("a non-http permalink gives a plain date without a link", () => {
  const el = render(base({ url: "javascript:alert(1)" }));
  assert.equal(el.querySelector("a.permalink"), null);
  assert.ok(el.querySelector("time"));
});
test("a reply gets an ancestors button wired to the handler; a root post does not", () => {
  const got = [];
  const acts = { ...actions, onToggleAncestors: (s, c) => got.push([s.id, c]) };
  const reply = renderStatusCard(base({ id: "8", in_reply_to_id: "7" }), { doc: document, t, actions: acts });
  reply.querySelector("button.ancestors-toggle").onclick();
  assert.deepEqual(got.map((g) => g[0]), ["8"]);
  assert.equal(got[0][1], reply);
  assert.equal(render(base({ in_reply_to_id: null })).querySelector("button.ancestors-toggle"), null);
});
test("cards inside a thread have no ancestors button", () => {
  const el = renderStatusCard(base({ in_reply_to_id: "7" }), { doc: document, t, actions, inThread: true });
  assert.equal(el.querySelector("button.ancestors-toggle"), null);
});
