import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { MORE_ENTRIES, createMorePages } from "../app/js/more.js";

const t = (k, p = {}) => k + (p.count !== undefined ? `:${p.count}` : "") + (p.name ? `:${p.name}` : "");
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
    get: rec("get"), post: rec("post"), postJson: rec("postJson"), del: rec("del"),
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

test("the menu lists the nine entries of xenomorph's More menu", () => {
  assert.deepEqual(MORE_ENTRIES.map((e) => e.id), [
    "search", "bookmarks", "admirations", "drafts", "scheduled", "pinned", "follow_requests", "followed_tags", "lists",
  ]);
});

test("bookmarks, admirations, drafts and scheduled are feeds of their own route", async () => {
  const routes = {
    bookmarks: "/api/v1/bookmarks", admirations: "/api/v1/xenomorph/admirations",
    drafts: "/api/v1/xenomorph/drafts", scheduled: "/api/v1/xenomorph/scheduled",
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
  const pages = createMorePages({ doc: document, container: document.getElementById("c"), api, t, renderCard() {}, me: { id: "m" }, toast() {}, confirm: () => false, createCache: () => ({ read: () => null, write() {} }) });
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
