import test from "node:test";
import assert from "node:assert/strict";
import { createTimelineCache } from "../app/js/cache.js";

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}

test("write then read returns the same statuses", () => {
  const c = createTimelineCache(memStorage());
  c.write([{ id: "2" }, { id: "1" }]);
  assert.deepEqual(c.read().statuses, [{ id: "2" }, { id: "1" }]);
  assert.equal(typeof c.read().savedAt, "number");
});
test("corrupt stored JSON reads as null", () => {
  const s = memStorage();
  s.setItem("xenoclient.timeline", "{not json");
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
