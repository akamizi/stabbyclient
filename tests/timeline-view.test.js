import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { createTimelineView } from "../app/js/timeline.js";

const t = (k, p = {}) => `${k}:${p.count ?? ""}`;
const s = (...ids) => ids.map((id) => ({ id: String(id) }));
const card = (doc) => (st) => { const e = doc.createElement("article"); e.dataset.id = st.id; return e; };

function setup({ cached, fresh, next = null }) {
  const { document } = parseHTML("<html><body><div id='c'></div></body></html>");
  const container = document.getElementById("c");
  const written = [];
  const cache = { read: () => (cached ? { statuses: cached, savedAt: 1 } : null), write: (x) => written.push(x) };
  const api = { getPage: async () => ({ items: fresh, next }) };
  return { document, container, view: createTimelineView({ doc: document, container, api, cache, renderCard: card(document), t }), written };
}
const ids = (c) => [...c.querySelectorAll("article")].map((a) => a.dataset.id);

test("cached posts show first and fresh ones wait behind the indicator", async () => {
  const { container, view } = setup({ cached: s(3, 2), fresh: s(5, 4, 3, 2) });
  await view.load();
  assert.deepEqual(ids(container), ["3", "2"]);
  assert.equal(view.pendingCount, 2);
});
test("without a cache the fresh page is shown directly", async () => {
  const { container, view } = setup({ cached: null, fresh: s(2, 1) });
  await view.load();
  assert.deepEqual(ids(container), ["2", "1"]);
  assert.equal(view.pendingCount, 0);
});
test("tapping the indicator inserts pending posts on top", async () => {
  const { container, view } = setup({ cached: s(3), fresh: s(4, 3) });
  await view.load();
  view.revealPending();
  assert.deepEqual(ids(container), ["4", "3"]);
});

test("prepend puts a just-posted status on top and caches it", async () => {
  const { container, view, written } = setup({ cached: s(3), fresh: s(3) });
  await view.load();
  view.prepend({ id: "9" });
  assert.deepEqual(ids(container), ["9", "3"]);
  assert.deepEqual(written.at(-1).map((x) => x.id), ["9", "3"]);
});

test("a failing fresh load keeps the cached cards on screen and rejects", async () => {
  const { document } = parseHTML("<html><body><div id='c'></div></body></html>");
  const container = document.getElementById("c");
  const cache = { read: () => ({ statuses: s(2, 1), savedAt: 1 }), write() {} };
  const api = { getPage: async () => { throw new TypeError("network"); } };
  const view = createTimelineView({ doc: document, container, api, cache, renderCard: card(document), t });
  await assert.rejects(view.load(), /network/);
  assert.deepEqual(ids(container), ["2", "1"]);
});

test("the view loads the path it is given, home by default", async () => {
  const { document } = parseHTML("<html><body><div id='c'></div></body></html>");
  const calls = [];
  const api = { getPage: async (p) => { calls.push(p); return { items: [], next: null }; } };
  const cache = { read: () => null, write() {} };
  const mk = (extra) => createTimelineView({ doc: document, container: document.getElementById("c"), api, cache, renderCard: card(document), t, ...extra });
  await mk({}).load();
  await mk({ path: "/api/v1/timelines/public" }).load();
  assert.deepEqual(calls, ["/api/v1/timelines/home", "/api/v1/timelines/public"]);
});

test("pending count changes are reported and the view draws no banner of its own", async () => {
  const { document } = parseHTML("<html><body><div id='c'></div></body></html>");
  const container = document.getElementById("c");
  const seen = [];
  const cache = { read: () => ({ statuses: s(3), savedAt: 1 }), write() {} };
  const api = { getPage: async () => ({ items: s(5, 4, 3), next: null }) };
  const view = createTimelineView({ doc: document, container, api, cache, renderCard: card(document), t, onPending: (n) => seen.push(n) });
  await view.load();
  assert.equal(container.querySelector("button[data-banner]"), null);
  view.revealPending();
  assert.deepEqual(seen, [2, 0]);
  assert.deepEqual(ids(container), ["5", "4", "3"]);
});

function refreshSetup({ cached, pages }) {
  const { document } = parseHTML("<html><body><div id='c'></div></body></html>");
  const container = document.getElementById("c");
  const seen = [];
  let call = 0;
  const api = { getPage: async () => ({ items: pages[Math.min(call++, pages.length - 1)], next: null }) };
  const cache = { read: () => (cached ? { statuses: cached, savedAt: 1 } : null), write() {} };
  const view = createTimelineView({ doc: document, container, api, cache, renderCard: card(document), t, onPending: (n) => seen.push(n) });
  return { container, view, seen };
}

test("refresh finds newer posts and reports them without touching what is shown", async () => {
  const { container, view, seen } = refreshSetup({ cached: s(3, 2), pages: [s(3, 2), s(5, 4, 3, 2)] });
  await view.load();
  await view.refresh();
  assert.deepEqual(ids(container), ["3", "2"]);
  assert.equal(view.pendingCount, 2);
  assert.equal(seen.at(-1), 2);
});
test("refresh again with nothing new keeps the count; more new posts raise it", async () => {
  const { view } = refreshSetup({ cached: s(3), pages: [s(3), s(4, 3), s(4, 3), s(6, 5, 4, 3)] });
  await view.load();
  await view.refresh();
  assert.equal(view.pendingCount, 1);
  await view.refresh();
  assert.equal(view.pendingCount, 1);
  await view.refresh();
  assert.equal(view.pendingCount, 3);
});
test("after revealing, a refresh with nothing newer reports zero", async () => {
  const { container, view, seen } = refreshSetup({ cached: s(3), pages: [s(3), s(4, 3), s(4, 3)] });
  await view.load();
  await view.refresh();
  view.revealPending();
  assert.deepEqual(ids(container), ["4", "3"]);
  await view.refresh();
  assert.equal(view.pendingCount, 0);
  assert.equal(seen.at(-1), 0);
});
test("refresh on an empty view just shows the posts", async () => {
  const { container, view } = refreshSetup({ cached: null, pages: [[], s(2, 1)] });
  await view.load();
  await view.refresh();
  assert.deepEqual(ids(container), ["2", "1"]);
  assert.equal(view.pendingCount, 0);
});
test("loaded tells whether the first load succeeded", async () => {
  const { view } = refreshSetup({ cached: null, pages: [s(1)] });
  assert.equal(view.loaded, false);
  await view.load();
  assert.equal(view.loaded, true);
});

test("newest tells the date of the first post shown", async () => {
  const { view } = refreshSetup({ cached: [{ id: "1", created_at: "2026-10-16T23:11:00Z" }], pages: [[{ id: "1", created_at: "2026-10-16T23:11:00Z" }]] });
  assert.equal(view.newest, null);
  await view.load();
  assert.equal(view.newest, "2026-10-16T23:11:00Z");
});

test("lastFetch tells what the server sent the last time", async () => {
  const items = [{ id: "5", created_at: "2026-10-16T23:31:13Z" }, { id: "4", created_at: "2026-10-16T23:00:00Z" }];
  const { view } = refreshSetup({ cached: null, pages: [items] });
  assert.equal(view.lastFetch, null);
  await view.load();
  assert.deepEqual(view.lastFetch, { newest: "2026-10-16T23:31:13Z", count: 2 });
});

test("posts waiting behind the indicator are not saved into the cache (they would come back at the bottom, known and hidden)", async () => {
  const { view, written } = setup({ cached: s(3, 2), fresh: s(5, 4, 3, 2) });
  await view.load();
  assert.equal(view.pendingCount, 2);
  assert.deepEqual(written.at(-1).map((x) => x.id), ["3", "2"]);
});
test("after the indicator is tapped the cache holds the new posts on top, in order", async () => {
  const { view, written } = setup({ cached: s(3, 2), fresh: s(5, 4, 3, 2) });
  await view.load();
  view.revealPending();
  assert.deepEqual(written.at(-1).map((x) => x.id), ["5", "4", "3", "2"]);
});

test("when loading older posts fails, the error is reported, the button works again and nothing is lost", async () => {
  const { document } = parseHTML("<html><body><div id='c'></div></body></html>");
  const container = document.getElementById("c");
  let fail = false;
  const errors = [];
  const api = { getPage: async (p) => {
    if (fail && p !== "/api/v1/timelines/home") throw new Error("HTTP 500");
    return { items: p === "/api/v1/timelines/home" ? s(3, 2) : s(1), next: p === "/api/v1/timelines/home" ? "https://h/api/v1/timelines/home?max_id=2" : null };
  } };
  const cache = { read: () => null, write() {} };
  const view = createTimelineView({ doc: document, container, api, cache, renderCard: card(document), t, onError: (e) => errors.push(e.message) });
  await view.load();
  const more = container.querySelector("button");
  fail = true;
  await more.onclick();
  assert.deepEqual(errors, ["HTTP 500"]);
  assert.equal(more.disabled, false);
  assert.equal(more.hidden, false);
  assert.deepEqual(ids(container), ["3", "2"]);
  fail = false;
  await more.onclick();
  assert.deepEqual(ids(container), ["3", "2", "1"]);
});

function stateSetup({ cached, pages }) {
  const { document } = parseHTML("<html><body><div id='c'></div></body></html>");
  const container = document.getElementById("c");
  const written = [];
  let call = 0;
  const api = { getPage: async () => ({ items: pages[Math.min(call++, pages.length - 1)], next: null }) };
  const cache = { read: () => ({ statuses: cached, savedAt: 1 }), write: (x) => written.push(x) };
  const rendered = [];
  const renderCard = (st) => { const e = document.createElement("article"); e.dataset.id = st.id; e.dataset.fav = String(st.favourited); e.dataset.count = String(st.favourites_count); rendered.push(st.id); return e; };
  const view = createTimelineView({ doc: document, container, api, cache, renderCard, t });
  return { container, view, written, rendered };
}
const post = (id, over = {}) => ({ id, favourited: false, favourites_count: 0, reblogged: false, reblogs_count: 0, ...over });

test("a post already on screen is redrawn when the server now says it is liked (a like made elsewhere)", async () => {
  const { container, view, written, rendered } = stateSetup({ cached: [post("2"), post("1")], pages: [[post("2", { favourited: true, favourites_count: 1 }), post("1")]] });
  await view.load();
  const cards = [...container.querySelectorAll("article")];
  assert.deepEqual(cards.map((c) => c.dataset.fav), ["true", "false"]);
  assert.equal(cards[0].dataset.count, "1");
  assert.deepEqual(written.at(-1).map((s) => s.favourited), [true, false]);
  assert.deepEqual(rendered, ["2", "1", "2"]);
});
test("posts whose state did not change are left alone", async () => {
  const { container, view, rendered } = stateSetup({ cached: [post("2"), post("1")], pages: [[post("2"), post("1")]] });
  const before = rendered.length;
  await view.load();
  assert.equal(rendered.length - before, 2); // just the two cached cards, no redraw
  assert.equal(container.querySelectorAll("article").length, 2);
});
test("the periodic refresh updates counts of posts on screen without moving anything", async () => {
  const { container, view } = stateSetup({ cached: [post("2"), post("1")], pages: [[post("2"), post("1")], [post("3"), post("2", { reblogged: true, reblogs_count: 2 }), post("1")]] });
  await view.load();
  await view.refresh();
  assert.deepEqual([...container.querySelectorAll("article")].map((c) => c.dataset.id), ["2", "1"]);
  assert.equal(view.pendingCount, 1);
});

test("a post just written, put on top by prepend, is also kept up to date", async () => {
  const { container, view } = stateSetup({ cached: [post("1")], pages: [[post("1")], [post("9", { favourited: true, favourites_count: 2 }), post("1")]] });
  await view.load();
  view.prepend(post("9"));
  await view.refresh();
  const top = container.querySelector("article");
  assert.equal(top.dataset.id, "9");
  assert.equal(top.dataset.fav, "true");
  assert.equal(top.dataset.count, "2");
});
