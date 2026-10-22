import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { MORE_ENTRIES, createMorePages } from "../app/js/more.js";

const t = (k, p = {}) => k + (p.count !== undefined ? `:${p.count}` : "") + (p.name ? `:${p.name}` : "") + (p.acct ? `:${p.acct}` : "");
const tick = () => new Promise((r) => setTimeout(r, 0));
const acct = (id, name = id) => ({ id, acct: `${name}@h`, display_name: name, avatar: "https://h/a.png" });

function setup(handlers = {}) {
  const { document } = parseHTML("<html><body><div id='c'></div></body></html>");
  const container = document.getElementById("c");
  const calls = [];
  const toasts = [];
  const rec = (kind) => async (path, arg) => {
    calls.push([kind, path, arg]);
    const h = handlers[`${kind} ${path.split("?")[0]}`];
    return h ? h(arg) : kind === "get" ? [] : {};
  };
  const api = {
    get: rec("get"), post: rec("post"), postJson: rec("postJson"), patchJson: rec("patchJson"), del: rec("del"),
    getPage: async (p, params) => { calls.push(["getPage", p, params]); const h = handlers[`getPage ${p}`]; return { items: h ? h() : [], next: null }; },
  };
  const renderCard = (st) => { const a = document.createElement("article"); a.dataset.id = st.id; return a; };
  const pages = createMorePages({
    doc: document, container, api, t, renderCard, me: { id: "me" }, toast: (m) => toasts.push(m),
    confirm: () => true, createCache: () => ({ read: () => null, write() {} }),
  });
  return { document, container, calls, toasts, pages };
}
const ids = (c) => [...c.querySelectorAll("article")].map((a) => a.dataset.id);

test("the menu lists the entries of stabbypossum's More menu, after the user's own profile", () => {
  assert.deepEqual(MORE_ENTRIES.map((e) => e.id), [
    "profile", "edit_profile", "aliases", "search", "bookmarks", "admirations", "drafts", "scheduled", "pinned", "following", "followers", "mutes", "blocks", "follow_requests", "followed_tags", "lists", "messages", "feeds", "about",
  ]);
});

test("bookmarks, admirations, drafts and scheduled are feeds of their own route", async () => {
  const routes = {
    bookmarks: "/api/v1/bookmarks", admirations: "/api/v1/stabbypossum/admirations",
    drafts: "/api/v1/stabbypossum/drafts", scheduled: "/api/v1/stabbypossum/scheduled",
  };
  for (const [id, path] of Object.entries(routes)) {
    const { container, pages } = setup({ [`getPage ${path}`]: () => [{ id: "5" }, { id: "4" }] });
    await pages.open(id);
    assert.deepEqual(ids(container), ["5", "4"], id);
    assert.ok(container.querySelector("h2"), id);
  }
});
test("an empty feed says so", async () => {
  const { container, pages } = setup();
  await pages.open("bookmarks");
  assert.match(container.textContent, /timeline\.empty/);
});

test("pinned shows only the user's pinned posts", async () => {
  const { container, pages, calls } = setup({
    "get /api/v1/accounts/me/statuses": () => [{ id: "1", pinned: true }, { id: "2", pinned: false }, { id: "3", pinned: true }],
  });
  await pages.open("pinned");
  assert.deepEqual(ids(container), ["1", "3"]);
  assert.equal(calls[0][1], "/api/v1/accounts/me/statuses");
});

test("follow requests can be authorized or rejected, and the card goes away", async () => {
  const { container, pages, calls } = setup({ "get /api/v1/follow_requests": () => [acct("7", "ann"), acct("8", "bob")] });
  await pages.open("follow_requests");
  assert.equal(container.querySelectorAll("li").length, 2);
  container.querySelector("li button.authorize").onclick();
  await tick();
  assert.ok(calls.some((c) => c[0] === "postJson" && c[1] === "/api/v1/follow_requests/7/authorize"));
  assert.equal(container.querySelectorAll("li").length, 1);
  container.querySelector("li button.reject").onclick();
  await tick();
  assert.ok(calls.some((c) => c[1] === "/api/v1/follow_requests/8/reject"));
  assert.match(container.textContent, /more\.no_requests/);
});

test("followed hashtags: follow one, unfollow one, open one as a feed", async () => {
  let tags = [{ name: "ada" }];
  const { container, pages, calls } = setup({
    "get /api/v1/followed_tags": () => tags,
    "getPage /api/v1/timelines/tag/ada": () => [{ id: "9" }],
  });
  await pages.open("followed_tags");
  const input = container.querySelector("input");
  input.value = "#rust";
  tags = [{ name: "ada" }, { name: "rust" }];
  await container.querySelector("form").onsubmit({ preventDefault() {} });
  assert.ok(calls.some((c) => c[0] === "postJson" && c[1] === "/api/v1/tags/rust/follow"));
  assert.equal(container.querySelectorAll("li").length, 2);
  container.querySelector("li button.unfollow").onclick();
  await tick();
  assert.ok(calls.some((c) => c[1] === "/api/v1/tags/ada/unfollow"));
  tags = [{ name: "ada" }];
  await pages.open("followed_tags");
  container.querySelector("li button.open").onclick();
  await tick();
  await tick();
  assert.deepEqual(ids(container), ["9"]);
});

test("lists: create, delete after confirming, and open one with its members and posts", async () => {
  let lists = [{ id: "1", title: "friends" }];
  const { container, pages, calls } = setup({
    "get /api/v1/lists": () => lists,
    "get /api/v1/lists/1/accounts": () => [acct("5", "eve")],
    "getPage /api/v1/timelines/list/1": () => [{ id: "20" }],
  });
  await pages.open("lists");
  container.querySelector("input").value = "work";
  lists = [{ id: "1", title: "friends" }, { id: "2", title: "work" }];
  await container.querySelector("form").onsubmit({ preventDefault() {} });
  const created = calls.find((c) => c[0] === "postJson" && c[1] === "/api/v1/lists");
  assert.deepEqual(created[2], { title: "work", replies_policy: "list" });
  assert.equal(container.querySelectorAll("li").length, 2);
  container.querySelector("li button.delete").onclick();
  await tick();
  assert.ok(calls.some((c) => c[0] === "del" && c[1] === "/api/v1/lists/1"));
  await pages.open("lists");
  container.querySelector("li button.open").onclick();
  await tick();
  await tick();
  assert.deepEqual(ids(container), ["20"]);
  assert.match(container.textContent, /eve/);
  container.querySelector("li button.remove").onclick();
  await tick();
  const removed = calls.find((c) => c[0] === "del" && c[1] === "/api/v1/lists/1/accounts");
  assert.deepEqual(removed[2], { account_ids: ["5"] });
});
test("deleting a list asks first and does nothing when declined", async () => {
  const { document } = parseHTML("<html><body><div id='c'></div></body></html>");
  const calls = [];
  const api = { get: async () => [{ id: "1", title: "x" }], del: async (p) => { calls.push(p); } };
  const pages = createMorePages({ doc: document, container: document.getElementById("c"), api, t, renderCard() {}, me: { id: "m" }, toast() {}, confirm: () => false, onProfile() {}, createCache: () => ({ read: () => null, write() {} }) });
  await pages.open("lists");
  document.querySelector("li button.delete").onclick();
  await tick();
  assert.deepEqual(calls, []);
});

test("search shows accounts, posts and hashtags", async () => {
  const { container, pages, calls } = setup({
    "get /api/v2/search": () => ({ accounts: [acct("1", "ann")], statuses: [{ id: "30" }], hashtags: [{ name: "ada" }] }),
  });
  await pages.open("search");
  container.querySelector("input").value = "ada";
  await container.querySelector("form").onsubmit({ preventDefault() {} });
  const q = calls.find((c) => c[1] === "/api/v2/search");
  assert.deepEqual(q[2], { q: "ada", resolve: "true", limit: "40" });
  assert.deepEqual(ids(container), ["30"]);
  assert.match(container.textContent, /ann/);
  assert.ok(container.querySelector("button.open"));
});
test("search with nothing found says so, and a blank query asks nothing", async () => {
  const { container, pages, calls } = setup({ "get /api/v2/search": () => ({ accounts: [], statuses: [], hashtags: [] }) });
  await pages.open("search");
  const input = container.querySelector("input");
  input.value = "   ";
  await container.querySelector("form").onsubmit({ preventDefault() {} });
  assert.equal(calls.length, 0);
  input.value = "zzz";
  await container.querySelector("form").onsubmit({ preventDefault() {} });
  assert.match(container.textContent, /more\.nothing_found/);
});

test("a failing page load shows an error line instead of throwing", async () => {
  const { container, pages } = setup({ "get /api/v1/follow_requests": () => { throw new Error("boom"); } });
  await pages.open("follow_requests");
  assert.match(container.textContent, /error\.offline/);
});

test("tapping a person in a page opens that profile", async () => {
  const opened = [];
  const { document } = parseHTML("<html><body><div id='c'></div></body></html>");
  const container = document.getElementById("c");
  const api = { get: async () => [acct("7", "ann")] };
  const pages = createMorePages({ doc: document, container, api, t, renderCard() {}, me: { id: "m" }, toast() {}, confirm: () => true, onProfile: (a) => opened.push(a.id), createCache: () => ({ read: () => null, write() {} }) });
  await pages.open("follow_requests");
  container.querySelector("li.person button.name").onclick();
  assert.deepEqual(opened, ["7"]);
});

test("Following lists the people you follow with an Unfollow button each", async () => {
  const { container, pages, calls } = setup({ "getPage /api/v1/accounts/me/following": () => [acct("1", "ann"), acct("2", "bob")] });
  await pages.open("following");
  assert.equal(container.querySelectorAll("li.person").length, 2);
  assert.equal(calls.find((c) => c[0] === "getPage")[2].limit, "80");
  container.querySelector("li.person button.unfollow").onclick();
  await tick();
  assert.ok(calls.some((c) => c[0] === "postJson" && c[1] === "/api/v1/accounts/1/unfollow"));
  assert.equal(container.querySelectorAll("li.person").length, 1);
});
test("an empty Following page says so", async () => {
  const { container, pages } = setup();
  await pages.open("following");
  assert.match(container.textContent, /more\.no_following/);
});
test("a failed unfollow keeps the row and shows a toast", async () => {
  const { container, pages, toasts } = setup({
    "getPage /api/v1/accounts/me/following": () => [acct("1", "ann")],
    "postJson /api/v1/accounts/1/unfollow": () => { throw new Error("x"); },
  });
  await pages.open("following");
  container.querySelector("li.person button.unfollow").onclick();
  await tick();
  assert.equal(container.querySelectorAll("li.person").length, 1);
  assert.deepEqual(toasts, ["error.action_failed"]);
});
test("the follow form looks the handle up, follows the first match and refreshes the list", async () => {
  let following = [];
  const { container, pages, calls, toasts } = setup({
    "get /api/v2/search": () => ({ accounts: [acct("9", "zed")] }),
    "getPage /api/v1/accounts/me/following": () => following,
  });
  await pages.open("following");
  container.querySelector("input").value = "zed@h";
  following = [acct("9", "zed")];
  await container.querySelector("form").onsubmit({ preventDefault() {} });
  const q = calls.find((c) => c[1] === "/api/v2/search");
  assert.deepEqual(q[2], { q: "zed@h", resolve: "true", limit: "1" });
  assert.ok(calls.some((c) => c[0] === "postJson" && c[1] === "/api/v1/accounts/9/follow"));
  assert.equal(container.querySelectorAll("li.person").length, 1);
  assert.deepEqual(toasts, ["more.following_now:zed@h"]);
});
test("an unknown handle is reported and nothing is followed", async () => {
  const { container, pages, calls, toasts } = setup({ "get /api/v2/search": () => ({ accounts: [] }) });
  await pages.open("following");
  container.querySelector("input").value = "nobody@h";
  await container.querySelector("form").onsubmit({ preventDefault() {} });
  assert.equal(calls.some((c) => c[0] === "postJson"), false);
  assert.deepEqual(toasts, ["more.not_found"]);
});
test("Followers lists the people who follow you, with no buttons to change anything", async () => {
  const { container, pages } = setup({ "getPage /api/v1/accounts/me/followers": () => [acct("1", "ann")] });
  await pages.open("followers");
  assert.equal(container.querySelectorAll("li.person").length, 1);
  assert.equal(container.querySelector("li.person button.unfollow"), null);
});
test("a long list continues with a load-more button that follows the server's next link", async () => {
  const { document } = parseHTML("<html><body><div id='c'></div></body></html>");
  const container = document.getElementById("c");
  const seen = [];
  const api = { getPage: async (p) => { seen.push(p); return seen.length === 1 ? { items: [acct("1")], next: "https://h/api/v1/accounts/me/followers?max_id=5&limit=80" } : { items: [acct("2")], next: null }; } };
  const pages = createMorePages({ doc: document, container, api, t, renderCard() {}, me: { id: "me" }, toast() {}, confirm: () => true, onProfile() {}, createCache: () => ({ read: () => null, write() {} }) });
  await pages.open("followers");
  const more = container.querySelector("button.load-more");
  assert.ok(more);
  assert.equal(more.hidden, false);
  await more.onclick();
  assert.deepEqual(seen, ["/api/v1/accounts/me/followers", "/api/v1/accounts/me/followers?max_id=5&limit=80"]);
  assert.equal(container.querySelectorAll("li.person").length, 2);
  assert.equal(more.hidden, true);
});

test("custom emoji show in the names of people listed", async () => {
  const blob = { shortcode: "blob", url: "https://h/blob.png" };
  const { container, pages } = setup({ "get /api/v1/follow_requests": () => [{ ...acct("7", "ann"), display_name: "Ann :blob:", emojis: [blob] }] });
  await pages.open("follow_requests");
  assert.equal(container.querySelectorAll("li.person button.name img.emoji").length, 1);
});

const feedA = { id: "f1", title: "A blog", url: "https://a.example/feed.xml", nsfw: false };
const feedB = { id: "f2", title: "", url: "https://b.example/rss", nsfw: true };

test("the feeds page lists the sources with a Remove button each", async () => {
  const { container, pages } = setup({ "get /api/v1/stabbypossum/feeds": () => [feedA, feedB] });
  await pages.open("feeds");
  const rows = container.querySelectorAll("li.feed");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].querySelector("a").getAttribute("href"), "https://a.example/feed.xml");
  assert.match(rows[0].textContent, /A blog/);
  assert.match(rows[1].textContent, /b\.example/);
  assert.match(rows[1].textContent, /NSFW/);
  assert.ok(rows[0].querySelector("button.remove"));
});
test("a feed address that is not http(s) is shown, not linked", async () => {
  const { container, pages } = setup({ "get /api/v1/stabbypossum/feeds": () => [{ id: "x", title: "Odd", url: "javascript:alert(1)" }] });
  await pages.open("feeds");
  assert.equal(container.querySelector("li.feed a"), null);
  assert.match(container.querySelector("li.feed").textContent, /Odd/);
});
test("subscribing sends the address and the NSFW tick, then shows the list the server answers with", async () => {
  const { container, pages, calls, toasts } = setup({
    "get /api/v1/stabbypossum/feeds": () => [],
    "postJson /api/v1/stabbypossum/feeds/create": () => [feedA],
  });
  await pages.open("feeds");
  const form = container.querySelector("form");
  form.querySelector("input[type=text], input[type=url]").value = " https://a.example/feed.xml ";
  form.querySelector("input[type=checkbox]").checked = true;
  await form.onsubmit({ preventDefault() {} });
  const call = calls.find((c) => c[1] === "/api/v1/stabbypossum/feeds/create");
  assert.deepEqual(call[2], { url: "https://a.example/feed.xml", nsfw: true });
  assert.equal(container.querySelectorAll("li.feed").length, 1);
  assert.deepEqual(toasts, ["more.feed_added"]);
});
test("a refusal is explained with the server's own words when it has them", async () => {
  const { container, pages, toasts } = setup({
    "get /api/v1/stabbypossum/feeds": () => [],
    "postJson /api/v1/stabbypossum/feeds/create": () => { throw Object.assign(new Error("HTTP 422"), { status: 422, detail: "That is not a feed" }); },
  });
  await pages.open("feeds");
  const form = container.querySelector("form");
  form.querySelector("input[type=text], input[type=url]").value = "https://nope.example";
  await form.onsubmit({ preventDefault() {} });
  assert.deepEqual(toasts, ["That is not a feed"]);
  assert.equal(container.querySelectorAll("li.feed").length, 0);
});
test("removing a source asks the server and shows the list it answers with", async () => {
  const { container, pages, calls } = setup({
    "get /api/v1/stabbypossum/feeds": () => [feedA, feedB],
    "postJson /api/v1/stabbypossum/feeds/delete": () => [feedB],
  });
  await pages.open("feeds");
  await container.querySelector("li.feed button.remove").onclick();
  assert.deepEqual(calls.find((c) => c[1] === "/api/v1/stabbypossum/feeds/delete")[2], { id: "f1" });
  assert.equal(container.querySelectorAll("li.feed").length, 1);
});
test("at eight sources Subscribe is off, with a note", async () => {
  const eight = Array.from({ length: 8 }, (_, i) => ({ id: `f${i}`, title: `T${i}`, url: `https://h/${i}` }));
  const { container, pages } = setup({ "get /api/v1/stabbypossum/feeds": () => eight });
  await pages.open("feeds");
  assert.equal(container.querySelector("form button[type=submit]").disabled, true);
  assert.match(container.textContent, /more\.feeds_full/);
});
test("with no sources the page says so", async () => {
  const { container, pages } = setup({ "get /api/v1/stabbypossum/feeds": () => [] });
  await pages.open("feeds");
  assert.match(container.textContent, /more\.no_feeds/);
});

test("muted and blocked accounts are listed from their own routes and taken off with their own calls", async () => {
  for (const [kind, route, undo] of [["mutes", "/api/v1/mutes", "unmute"], ["blocks", "/api/v1/blocks", "unblock"]]) {
    const { container, calls, pages } = setup({ [`getPage ${route}`]: () => [acct("u1")] });
    await pages.open(kind);
    assert.equal(container.querySelectorAll("li.person").length, 1);
    await container.querySelector(`button.${undo}`).onclick();
    assert.ok(calls.some((c) => c[0] === "postJson" && c[1] === `/api/v1/accounts/u1/${undo}`));
    assert.equal(container.querySelectorAll("li.person").length, 0);
    assert.ok(container.querySelector(".empty"));
  }
});

test("messages lists the conversations and deletes one", async () => {
  const { container, calls, pages } = setup({ "getPage /api/v1/conversations": () => [{ id: "c1", accounts: [acct("u1", "Ugo")], last_status: { id: "s1" } }] });
  await pages.open("messages");
  assert.deepEqual(ids(container), ["s1"]);
  await container.querySelector("li.message button.delete").onclick();
  assert.ok(calls.some((c) => c[0] === "del" && c[1] === "/api/v1/conversations/c1"));
  assert.ok(container.querySelector(".empty"));
});

test("edit profile fills the form from the account and saves the four fields", async () => {
  const { container, calls, toasts, pages } = setup({
    "get /api/v1/accounts/verify_credentials": () => ({ display_name: "Me", locked: true, source: { note: "bio", bot: false } }),
  });
  await pages.open("edit_profile");
  const form = container.querySelector("form");
  assert.equal(form.querySelector("input[type=text]").value, "Me");
  assert.equal(form.querySelector("textarea").value, "bio");
  form.querySelector("textarea").value = "new bio";
  await form.onsubmit({ preventDefault() {} });
  const call = calls.find((c) => c[0] === "patchJson");
  assert.equal(call[1], "/api/v1/accounts/update_credentials");
  assert.deepEqual(call[2], { display_name: "Me", note: "new bio", locked: true, bot: false });
  assert.deepEqual(toasts, ["more.profile_saved"]);
});

test("following a handle asks the server's lookup first and searches only when it knows nothing", async () => {
  const known = setup({ "get /api/v1/accounts/lookup": () => acct("k1") });
  await known.pages.open("following");
  known.container.querySelector("form input").value = "@bob@h";
  await known.container.querySelector("form").onsubmit({ preventDefault() {} });
  assert.ok(known.calls.some((c) => c[1] === "/api/v1/accounts/lookup" && c[2].acct === "bob@h"));
  assert.ok(known.calls.some((c) => c[1] === "/api/v1/accounts/k1/follow"));
  assert.ok(!known.calls.some((c) => c[1] === "/api/v2/search"));
});

test("aliases are added and removed through the server, and the list shown is the one it answers with", async () => {
  const { container, calls, pages } = setup({
    "postJson /api/v1/stabbypossum/webfinger-aliases/create": () => ["me@old.example"],
    "postJson /api/v1/stabbypossum/webfinger-aliases/delete": () => [],
  });
  await pages.open("aliases");
  assert.equal(container.querySelectorAll("li.row").length, 0);
  container.querySelector("form input").value = "@me@old.example";
  await container.querySelector("form").onsubmit({ preventDefault() {} });
  assert.deepEqual(calls.find((c) => c[1].endsWith("/create"))[2], { alias: "me@old.example" });
  assert.equal(container.querySelectorAll("li.row code")[0].textContent, "@me@old.example");
  await container.querySelector("li.row button.remove").onclick();
  assert.deepEqual(calls.find((c) => c[1].endsWith("/delete"))[2], { alias: "me@old.example" });
  assert.ok(container.querySelector(".empty"));
});

test("a refused alias is told with the server's reason and the list is left as it was", async () => {
  const { container, toasts, pages } = setup({
    "postJson /api/v1/stabbypossum/webfinger-aliases/create": () => { throw Object.assign(new Error("x"), { status: 422, detail: "invalid-webfinger-alias" }); },
  });
  await pages.open("aliases");
  container.querySelector("form input").value = "nonsense";
  await container.querySelector("form").onsubmit({ preventDefault() {} });
  assert.deepEqual(toasts, ["invalid-webfinger-alias"]);
});

test("the about page shows the instance's description, sanitized, and the hosts it talks to", async () => {
  const { container, pages } = setup({
    "get /api/v1/instance/extended_description": () => ({ content: "<p>Hello <script>x</script><b>there</b></p>" }),
    "get /api/v1/instance/peers": () => ["a.example", "b.example"],
  });
  await pages.open("about");
  assert.match(container.querySelector(".about").textContent, /Hello/);
  assert.equal(container.querySelector(".about script"), null);
  assert.deepEqual([...container.querySelectorAll(".peers li")].map((li) => li.textContent), ["a.example", "b.example"]);
  assert.match(container.querySelector("h3").textContent, /more\.peers:2/);
});
