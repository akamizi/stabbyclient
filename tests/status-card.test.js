import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { renderStatusCard } from "../app/js/status-card.js";

const { document } = parseHTML("<html><body></body></html>");
const t = (k, p = {}) => k + (p.count !== undefined ? `:${p.count}` : "") + (p.name ? `:${p.name}` : "") + (p.groups ? `:${p.groups}` : "");
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

test("a post tied to groups says so, naming at most two and ending in ... for more", () => {
  const two = render(base({ xenomorph_community: ["a@x", "b@y"] }));
  assert.equal(two.querySelector(".via").textContent, "status.via:a@x,b@y");
  const many = render(base({ xenomorph_community: ["a@x", "b@y", "c@z"] }));
  assert.equal(many.querySelector(".via").textContent, "status.via:a@x,b@y...");
  assert.equal(render(base()).querySelector(".via"), null);
  assert.equal(render(base({ xenomorph_community: "junk" })).querySelector(".via"), null);
});

test("a save button toggles the bookmark and shows its state", () => {
  calls.length = 0;
  actions.onBookmark = (s) => calls.push(["bookmark", s.id]);
  const off = render(base());
  off.querySelector("button.bookmark").onclick();
  assert.deepEqual(calls.at(-1), ["bookmark", "1"]);
  assert.equal(off.querySelector("button.bookmark").classList.contains("active"), false);
  assert.equal(render(base({ bookmarked: true })).querySelector("button.bookmark").classList.contains("active"), true);
});
test("a pin button appears only on the user's own posts", () => {
  calls.length = 0;
  actions.onPin = (s) => calls.push(["pin", s.id]);
  actions.isOwn = (s) => s.account.id === "a";
  const own = render(base({ pinned: true }));
  own.querySelector("button.pin").onclick();
  assert.deepEqual(calls.at(-1), ["pin", "1"]);
  assert.equal(own.querySelector("button.pin").classList.contains("active"), true);
  assert.equal(render(base({ account: { ...base().account, id: "z" } })).querySelector("button.pin"), null);
  delete actions.isOwn;
  assert.equal(render(base()).querySelector("button.pin"), null);
});
test("a draft offers publish and discard only; a scheduled post only discard", () => {
  calls.length = 0;
  actions.onPublish = (s) => calls.push(["publish", s.id]);
  actions.onDiscard = (s) => calls.push(["discard", s.id]);
  const draft = render(base({ xenomorph_state: "draft" }));
  for (const c of ["like", "dislike", "bookmark", "pin"]) assert.equal(draft.querySelector(`button.${c}`), null, c);
  assert.equal(draft.querySelector("button.reply"), null);
  assert.match(draft.querySelector(".state").textContent, /status\.state_draft/);
  draft.querySelector("button.publish").onclick();
  draft.querySelector("button.discard").onclick();
  assert.deepEqual(calls.slice(-2), [["publish", "1"], ["discard", "1"]]);
  const sched = render(base({ xenomorph_state: "scheduled" }));
  assert.equal(sched.querySelector("button.publish"), null);
  assert.ok(sched.querySelector("button.discard"));
  assert.match(sched.querySelector(".state").textContent, /status\.state_scheduled/);
});

function menuItems(card) { return [...card.querySelectorAll(".post-menu button")].map((b) => b.className); }
test("each post has a hidden menu on the right, opened by a ⋯ button", () => {
  const card = render(base());
  const menu = card.querySelector(".post-menu");
  const toggle = card.querySelector("button.more");
  assert.ok(menu && toggle);
  assert.equal(menu.hidden, true);
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  toggle.onclick({ stopPropagation() {} });
  assert.equal(menu.hidden, false);
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  toggle.onclick({ stopPropagation() {} });
  assert.equal(menu.hidden, true);
});
test("the menu offers only what the handlers support, own posts get pin/edit/delete, others report", () => {
  const saved = { ...actions };
  for (const k of Object.keys(actions)) delete actions[k];
  Object.assign(actions, {
    onReply() {}, onFavourite() {}, onDislike() {}, onToggleThread() {},
    onReact() {}, onBookmark() {}, onHide() {}, onPin() {}, onEdit() {}, onDelete() {}, onReport() {},
    isOwn: (s) => s.account.id === "a",
  });
  const own = menuItems(render(base()));
  assert.deepEqual(own, ["react", "bookmark", "hide", "pin", "edit", "delete"]);
  const other = menuItems(render(base({ account: { ...base().account, id: "z" } })));
  assert.deepEqual(other, ["react", "bookmark", "hide", "report"]);
  delete actions.onReport;
  delete actions.onReact;
  assert.deepEqual(menuItems(render(base({ account: { ...base().account, id: "z" } }))), ["bookmark", "hide"]);
  for (const k of Object.keys(actions)) delete actions[k];
  Object.assign(actions, saved);
});
test("choosing a menu item calls its handler with the status and closes the menu", () => {
  const seen = [];
  const saved = { ...actions };
  actions.onHide = (s, c) => seen.push(["hide", s.id, !!c]);
  const card = render(base());
  card.querySelector("button.more").onclick({ stopPropagation() {} });
  card.querySelector(".post-menu button.hide").onclick();
  assert.deepEqual(seen, [["hide", "1", true]]);
  assert.equal(card.querySelector(".post-menu").hidden, true);
  for (const k of Object.keys(actions)) delete actions[k];
  Object.assign(actions, saved);
});
test("reactions are listed; the user's own reaction can be taken back", () => {
  const seen = [];
  actions.onUnreact = (s, c, name) => seen.push(name);
  const card = render(base({ reactions: [
    { name: "🎉", count: 2, me: true },
    { name: "blob", count: 1, me: false, url: "https://h/blob.png" },
    { name: "bad", count: 1, me: false, url: "javascript:alert(1)" },
  ] }));
  const chips = [...card.querySelectorAll(".reactions > *")];
  assert.equal(chips.length, 3);
  assert.match(chips[0].textContent, /🎉/);
  assert.match(chips[0].textContent, /2/);
  assert.equal(chips[0].tagName, "BUTTON");
  chips[0].onclick();
  assert.deepEqual(seen, ["🎉"]);
  assert.equal(chips[1].tagName, "SPAN");
  assert.equal(chips[1].querySelector("img").getAttribute("src"), "https://h/blob.png");
  assert.equal(chips[2].querySelector("img"), null);
  assert.equal(render(base()).querySelector(".reactions"), null);
  delete actions.onUnreact;
});
