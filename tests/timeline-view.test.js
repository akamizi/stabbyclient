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
  container.querySelector("button").onclick();
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
