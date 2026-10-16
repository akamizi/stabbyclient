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
