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
  const two = render(base({ instance_community: ["a@x", "b@y"] }));
  assert.equal(two.querySelector(".via").textContent, "status.via:a@x,b@y");
  const many = render(base({ instance_community: ["a@x", "b@y", "c@z"] }));
  assert.equal(many.querySelector(".via").textContent, "status.via:a@x,b@y...");
  assert.equal(render(base()).querySelector(".via"), null);
  assert.equal(render(base({ instance_community: "junk" })).querySelector(".via"), null);
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
  const draft = render(base({ instance_state: "draft" }));
  for (const c of ["like", "dislike", "bookmark", "pin"]) assert.equal(draft.querySelector(`button.${c}`), null, c);
  assert.equal(draft.querySelector("button.reply"), null);
  assert.match(draft.querySelector(".state").textContent, /status\.state_draft/);
  draft.querySelector("button.publish").onclick();
  draft.querySelector("button.discard").onclick();
  assert.deepEqual(calls.slice(-2), [["publish", "1"], ["discard", "1"]]);
  const sched = render(base({ instance_state: "scheduled" }));
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

test("a boost button shows the state and is off for posts that are neither public nor unlisted", () => {
  calls.length = 0;
  actions.onBoost = (s) => calls.push(["boost", s.id]);
  const off = render(base());
  const b = off.querySelector("button.boost");
  assert.equal(b.classList.contains("active"), false);
  assert.equal(b.disabled, false);
  b.onclick();
  assert.deepEqual(calls.at(-1), ["boost", "1"]);
  assert.equal(render(base({ reblogged: true })).querySelector("button.boost").classList.contains("active"), true);
  assert.match(render(base({ reblogged: true })).querySelector("button.boost").getAttribute("aria-label"), /status\.unboost/);
  assert.equal(render(base({ visibility: "unlisted" })).querySelector("button.boost").disabled, false);
  assert.equal(render(base({ visibility: "private" })).querySelector("button.boost").disabled, true);
  assert.equal(render(base({ visibility: "direct" })).querySelector("button.boost").disabled, true);
  delete actions.onBoost;
  assert.equal(render(base()).querySelector("button.boost"), null);
});

test("the author's avatar and name open the profile when a handler exists", () => {
  const seen = [];
  actions.onProfile = (a) => seen.push(a.id);
  const card = render(base());
  const who = card.querySelectorAll("header.head button.author");
  assert.equal(who.length, 2); // avatar and name
  who[1].onclick();
  who[0].onclick();
  assert.deepEqual(seen, ["a", "a"]);
  delete actions.onProfile;
  assert.equal(render(base()).querySelector("button.author"), null);
});
test("on a boost the profile opened is the boosted author's, not the booster's", () => {
  const seen = [];
  actions.onProfile = (a) => seen.push(a.id);
  const inner = base({ id: "2", account: { ...base().account, id: "bob", acct: "bob" } });
  const card = render(base({ id: "9", content: "", reblog: inner, account: { ...base().account, id: "booster" } }));
  card.querySelector("header.head button.author").onclick();
  assert.deepEqual(seen, ["bob"]);
  delete actions.onProfile;
});

const pollBase = (over = {}) => ({
  id: "p1", expired: false, voted: false, multiple: false, votes_count: 4, own_votes: [], expires_at: "2026-10-20T10:00:00Z",
  options: [{ title: "Yes", votes_count: 3 }, { title: "No", votes_count: 1 }], ...over,
});
test("a poll shows its options with percentages, the total and when it closes", () => {
  const card = render(base({ poll: pollBase() }));
  const rows = [...card.querySelectorAll(".poll .poll-option")];
  assert.equal(rows.length, 2);
  assert.match(rows[0].textContent, /Yes/);
  assert.match(rows[0].textContent, /75%/);
  assert.match(rows[1].textContent, /25%/);
  assert.match(card.querySelector(".poll-footer").textContent, /status\.poll_votes:4/);
  assert.match(card.querySelector(".poll-footer").textContent, /status\.poll_closes/);
});
test("an open poll can be voted on; a single-choice poll uses radios and sends the index", async () => {
  const seen = [];
  actions.onVote = async (s, choices) => { seen.push([s.id, choices]); return pollBase({ voted: true, own_votes: choices, votes_count: 5 }); };
  const card = render(base({ poll: pollBase() }));
  const inputs = [...card.querySelectorAll(".poll input")];
  assert.equal(inputs[0].type, "radio");
  inputs[1].checked = true;
  await card.querySelector(".poll").onsubmit({ preventDefault() {} });
  assert.deepEqual(seen, [["1", [1]]]);
  assert.equal(card.querySelector(".poll input"), null);
  assert.match(card.querySelector(".poll .poll-option.mine").textContent, /No/);
  delete actions.onVote;
});
test("a multiple-choice poll uses checkboxes; nothing chosen sends nothing", async () => {
  const seen = [];
  actions.onVote = async (s, choices) => { seen.push(choices); return pollBase({ voted: true }); };
  const card = render(base({ poll: pollBase({ multiple: true }) }));
  const inputs = [...card.querySelectorAll(".poll input")];
  assert.equal(inputs[0].type, "checkbox");
  await card.querySelector(".poll").onsubmit({ preventDefault() {} });
  assert.deepEqual(seen, []);
  inputs[0].checked = true;
  inputs[1].checked = true;
  await card.querySelector(".poll").onsubmit({ preventDefault() {} });
  assert.deepEqual(seen, [[0, 1]]);
  delete actions.onVote;
});
test("a closed or already voted poll has no vote button", () => {
  actions.onVote = async () => pollBase();
  assert.equal(render(base({ poll: pollBase({ expired: true }) })).querySelector(".poll button[type=submit]"), null);
  assert.equal(render(base({ poll: pollBase({ voted: true }) })).querySelector(".poll button[type=submit]"), null);
  assert.match(render(base({ poll: pollBase({ expired: true }) })).querySelector(".poll-footer").textContent, /status\.poll_closed/);
  delete actions.onVote;
});
test("a failed vote keeps the poll and shows the error line", async () => {
  actions.onVote = async () => { throw new Error("no"); };
  const card = render(base({ poll: pollBase() }));
  card.querySelector(".poll input").checked = true;
  await card.querySelector(".poll").onsubmit({ preventDefault() {} });
  assert.match(card.querySelector(".poll .error").textContent, /error\.action_failed/);
  assert.ok(card.querySelector(".poll input"));
  delete actions.onVote;
});

const quoted = (over = {}) => ({ id: "q1", content: "<p>quoted <a href='https://e.example'>link</a></p>", spoiler_text: "", sensitive: false,
  account: { id: "z", acct: "zed@h", display_name: "Zed", avatar: "https://h/z.png" }, media_attachments: [], ...over });
test("a quoting post shows the quoted post in a box and hides the RE: paragraph", () => {
  const card = render(base({ content: '<p>my take</p><p class="quote-inline">RE: https://h/q1</p>', quote: { quoted_status: quoted() } }));
  const box = card.querySelector(".quote");
  assert.ok(box);
  assert.match(box.textContent, /Zed/);
  assert.match(box.textContent, /quoted/);
  assert.equal(box.querySelector("a").getAttribute("href"), "https://e.example");
  assert.doesNotMatch(card.querySelector(".body").textContent, /RE:/);
  assert.match(card.querySelector(".body").textContent, /my take/);
});
test("without a quote the RE: paragraph is left alone", () => {
  const card = render(base({ content: '<p class="quote-inline">RE: x</p>' }));
  assert.match(card.querySelector(".body").textContent, /RE: x/);
});
test("tapping the quote opens the quoted post, but a link inside it still works as a link", () => {
  const seen = [];
  actions.onOpenStatus = (id) => seen.push(id);
  const card = render(base({ quote: { quoted_status: quoted() } }));
  card.querySelector(".quote").onclick({ target: card.querySelector(".quote .quote-text") });
  card.querySelector(".quote").onclick({ target: card.querySelector(".quote a") });
  assert.deepEqual(seen, ["q1"]);
  delete actions.onOpenStatus;
});
test("a quote with a content warning shows only the warning; a sensitive image is not previewed", () => {
  const withCw = render(base({ quote: { quoted_status: quoted({ spoiler_text: "careful", content: "<p>secret</p>" }) } }));
  assert.match(withCw.querySelector(".quote").textContent, /careful/);
  assert.doesNotMatch(withCw.querySelector(".quote").textContent, /secret/);
  const img = { type: "image", preview_url: "https://h/p.png", url: "https://h/f.png", description: "d" };
  assert.equal(render(base({ quote: { quoted_status: quoted({ media_attachments: [img] }) } })).querySelector(".quote img.quote-image").getAttribute("src"), "https://h/p.png");
  assert.equal(render(base({ quote: { quoted_status: quoted({ media_attachments: [img], sensitive: true }) } })).querySelector(".quote img.quote-image"), null);
});
test("a quote with no author or an unsafe image is ignored or shown without the image", () => {
  assert.equal(render(base({ quote: { quoted_status: { id: "q", content: "x" } } })).querySelector(".quote"), null);
  const bad = { type: "image", preview_url: "javascript:1", url: "javascript:1" };
  assert.equal(render(base({ quote: { quoted_status: quoted({ media_attachments: [bad] }) } })).querySelector(".quote img.quote-image"), null);
});
test("Quote appears in the post menu only for public and unlisted posts", () => {
  const saved = { ...actions };
  actions.onQuote = () => {};
  assert.ok(menuItems(render(base())).includes("quote"));
  assert.ok(menuItems(render(base({ visibility: "unlisted" }))).includes("quote"));
  assert.ok(!menuItems(render(base({ visibility: "private" }))).includes("quote"));
  assert.ok(!menuItems(render(base({ visibility: "direct" }))).includes("quote"));
  for (const k of Object.keys(actions)) delete actions[k];
  Object.assign(actions, saved);
});

test("with a zoom handler, a post's image opens full size when tapped; its alt text goes along", () => {
  const seen = [];
  actions.onZoom = (url, alt) => seen.push([url, alt]);
  const card = render(base({ media_attachments: [{ type: "image", url: "https://h/full.png", preview_url: "https://h/small.png", description: "a cat" }] }));
  const img = card.querySelector("img.attachment");
  assert.equal(img.getAttribute("src"), "https://h/small.png");
  const trigger = img.closest("button.zoom");
  assert.ok(trigger);
  trigger.onclick();
  assert.deepEqual(seen, [["https://h/full.png", "a cat"]]);
  delete actions.onZoom;
  assert.equal(render(base({ media_attachments: [{ type: "image", url: "https://h/full.png", preview_url: "https://h/small.png" }] })).querySelector("button.zoom"), null);
});
test("the image in a quote can be enlarged too", () => {
  const seen = [];
  actions.onZoom = (url) => seen.push(url);
  const img = { type: "image", preview_url: "https://h/p.png", url: "https://h/f.png", description: "d" };
  const card = render(base({ quote: { quoted_status: quoted({ media_attachments: [img] }) } }));
  card.querySelector(".quote button.zoom").onclick({ stopPropagation() {} });
  assert.deepEqual(seen, ["https://h/f.png"]);
  delete actions.onZoom;
});

import { rewrap } from "../app/js/status-card.js";
test("a card remembers the status it was drawn from (a boost keeps its wrapper)", () => {
  const inner = base({ id: "2" });
  const wrapper = base({ id: "9", content: "", reblog: inner });
  assert.equal(render(wrapper).stabbyInput, wrapper);
});
test("rewrap puts an updated inner status back inside its boost wrapper", () => {
  const inner = base({ id: "2", favourited: false });
  const wrapper = base({ id: "9", content: "", reblog: inner });
  const updated = base({ id: "2", favourited: true });
  const next = rewrap(wrapper, updated);
  assert.equal(next.id, "9");
  assert.equal(next.reblog.favourited, true);
  assert.equal(next.account.id, wrapper.account.id);
});
test("rewrap leaves a plain post, or an answer that already is a wrapper, alone", () => {
  const plain = base({ id: "1" });
  const updated = base({ id: "1", favourited: true });
  assert.equal(rewrap(plain, updated), updated);
  const wrapper = base({ id: "9", content: "", reblog: base({ id: "2" }) });
  const answer = base({ id: "10", content: "", reblog: base({ id: "2", reblogged: true }) });
  assert.equal(rewrap(wrapper, answer), answer);
  assert.equal(rewrap(undefined, updated), updated);
});

test("the like and boost buttons show how many there are, when there are any", () => {
  actions.onBoost = () => {};
  const none = render(base({ favourites_count: 0, reblogs_count: 0 }));
  assert.equal(none.querySelector("button.like").textContent, "★");
  assert.equal(none.querySelector("button.boost").textContent, "⟳");
  const some = render(base({ favourites_count: 3, reblogs_count: 12 }));
  assert.equal(some.querySelector("button.like").textContent, "★ 3");
  assert.equal(some.querySelector("button.boost").textContent, "⟳ 12");
  assert.equal(some.querySelector("button.like").getAttribute("aria-label"), "status.like");
  delete actions.onBoost;
});
test("a count that is missing or not a number shows nothing", () => {
  const card = render(base({ favourites_count: undefined }));
  assert.equal(card.querySelector("button.like").textContent, "★");
  assert.equal(render(base({ favourites_count: "x" })).querySelector("button.like").textContent, "★");
});

const blob = { shortcode: "blob", url: "https://h/blob.png" };
test("custom emoji show as pictures in the author's name, the text and the content warning", () => {
  const card = render(base({
    content: "<p>hello :blob:</p>", spoiler_text: "careful :blob:", emojis: [blob],
    account: { ...base().account, display_name: "Anna :blob:", emojis: [blob] },
  }));
  assert.equal(card.querySelectorAll("header.head strong img.emoji").length, 1);
  assert.equal(card.querySelectorAll(".body img.emoji").length, 1);
  assert.equal(card.querySelectorAll("p.cw img.emoji").length, 1);
  assert.equal(card.querySelector("header.head strong").textContent.trim(), "Anna");
});
test("emoji in a quoted post and its author's name are shown too", () => {
  const q = { ...quoted(), content: "<p>q :blob:</p>", emojis: [blob], account: { ...quoted().account, display_name: "Zed :blob:", emojis: [blob] } };
  const card = render(base({ quote: { quoted_status: q } }));
  assert.equal(card.querySelectorAll(".quote img.emoji").length, 2);
});
test("without an emoji list the shortcodes stay as text", () => {
  const card = render(base({ content: "<p>hello :blob:</p>" }));
  assert.equal(card.querySelector(".body img"), null);
  assert.match(card.querySelector(".body").textContent, /:blob:/);
});

test("who liked or boosted a post is offered in the menu when the handlers exist", () => {
  const saved = { ...actions };
  for (const k of Object.keys(actions)) delete actions[k];
  Object.assign(actions, { onReply() {}, onFavourite() {}, onDislike() {}, onToggleThread() {}, onLikedBy() {}, onBoostedBy() {} });
  assert.deepEqual(menuItems(render(base())), ["liked-by", "boosted-by"]);
  for (const k of Object.keys(actions)) delete actions[k];
  Object.assign(actions, saved);
});

test("the text of a post carries its language, so a screen reader reads it in the right voice", () => {
  const el = render(base({ language: "fr", spoiler_text: "avertissement" }));
  assert.equal(el.querySelector(".body").getAttribute("lang"), "fr");
  assert.equal(el.querySelector(".cw").getAttribute("lang"), "fr");
});
test("a missing or malformed language sets no lang attribute", () => {
  assert.equal(render(base()).querySelector(".body").hasAttribute("lang"), false);
  assert.equal(render(base({ language: "x\" onload=\"1" })).querySelector(".body").hasAttribute("lang"), false);
});

test("the menu offers the link to the single post, for the user's own posts and for others', when the post has a safe address", () => {
  const saved = { ...actions };
  for (const k of Object.keys(actions)) delete actions[k];
  const seen = [];
  Object.assign(actions, { onReply() {}, onFavourite() {}, onDislike() {}, onToggleThread() {}, onCopyLink: (s) => seen.push(s.url), isOwn: (s) => s.account.id === "a" });
  const mine = render(base({ url: "https://x.y05.eu/oh_pyt/p/1.2" }));
  assert.deepEqual(menuItems(mine), ["copy-link"]);
  mine.querySelector(".post-menu button.copy-link").onclick();
  assert.deepEqual(seen, ["https://x.y05.eu/oh_pyt/p/1.2"]);
  assert.match(mine.querySelector(".post-menu button.copy-link").textContent, /status\.copy_link/);
  const other = base({ url: "https://other.example/@bob/9", account: { ...base().account, id: "z" } });
  assert.deepEqual(menuItems(render(other)), ["copy-link"]);
  assert.deepEqual(menuItems(render(base({ url: "javascript:alert(1)" }))), []);
  assert.deepEqual(menuItems(render(base({ url: "" }))), []);
  for (const k of Object.keys(actions)) delete actions[k];
  Object.assign(actions, saved);
});
