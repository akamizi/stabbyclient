import test from "node:test";
import assert from "node:assert/strict";
import { createTimelineCache } from "../app/js/cache.js";

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null };
}

test("write then read returns the same statuses", () => {
  const c = createTimelineCache(memStorage());
  c.write([{ id: "2" }, { id: "1" }]);
  assert.deepEqual(c.read().statuses, [{ id: "2" }, { id: "1" }]);
  assert.equal(typeof c.read().savedAt, "number");
});
test("corrupt stored JSON reads as null", () => {
  const s = memStorage();
  s.setItem("stabbyclient.timeline", "{not json");
  assert.equal(createTimelineCache(s).read(), null);
});
test("a storage that throws on write is ignored silently", () => {
  const s = memStorage();
  s.setItem = () => { throw new Error("quota"); };
  assert.doesNotThrow(() => createTimelineCache(s).write([{ id: "1" }]));
});
test("empty storage reads as null", () => {
  assert.equal(createTimelineCache(memStorage()).read(), null);
});

test("the cache is keyed by account: another account sees nothing", () => {
  const s = memStorage();
  createTimelineCache(s, "A").write([{ id: "1" }]);
  assert.equal(createTimelineCache(s, "B").read(), null);
  assert.deepEqual(createTimelineCache(s, "A").read().statuses, [{ id: "1" }]);
});
test("clearAll removes every account's cache and the legacy key", () => {
  const s = memStorage();
  createTimelineCache(s, "A").write([{ id: "1" }]);
  createTimelineCache(s, "B").write([{ id: "2" }]);
  s.setItem("stabbyclient.timeline", "legacy");
  createTimelineCache.clearAll(s);
  assert.equal(createTimelineCache(s, "A").read(), null);
  assert.equal(createTimelineCache(s, "B").read(), null);
  assert.equal(s.getItem("stabbyclient.timeline"), null);
});

test("a named timeline has its own cache and clearAll removes it too", () => {
  const s = memStorage();
  createTimelineCache(s, "A").write([{ id: "1" }]);
  createTimelineCache(s, "A", "federated").write([{ id: "2" }]);
  assert.deepEqual(createTimelineCache(s, "A").read().statuses, [{ id: "1" }]);
  assert.deepEqual(createTimelineCache(s, "A", "federated").read().statuses, [{ id: "2" }]);
  createTimelineCache.clearAll(s);
  assert.equal(createTimelineCache(s, "A", "federated").read(), null);
});

test("a cache written by an older version (which could hold posts out of order) is ignored", () => {
  const s = memStorage();
  s.setItem("stabbyclient.timeline.A", JSON.stringify({ statuses: [{ id: "1" }], savedAt: 1 }));
  assert.equal(createTimelineCache(s, "A").read(), null);
  createTimelineCache(s, "A").write([{ id: "2" }]);
  assert.deepEqual(createTimelineCache(s, "A").read().statuses, [{ id: "2" }]);
});
