import test from "node:test";
import assert from "node:assert/strict";
import { loadLayoutPref, applyLayout } from "../app/js/layout.js";

const store = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
};
const doc = () => ({ documentElement: { dataset: {} } });

test("the layout defaults to the avatar in the header", () => {
  assert.equal(loadLayoutPref(store()), "top");
  assert.equal(loadLayoutPref({ getItem() { throw new Error("blocked"); } }), "top");
});
test("a stored layout is read back, and an invalid one falls back to the default", () => {
  assert.equal(loadLayoutPref(store({ "stabbyclient.layout": "side" })), "side");
  assert.equal(loadLayoutPref(store({ "stabbyclient.layout": "grid" })), "top");
});
test("applying a layout sets data-layout on the page and remembers it", () => {
  const d = doc();
  const s = store();
  applyLayout(d, "side", s);
  assert.equal(d.documentElement.dataset.layout, "side");
  assert.equal(loadLayoutPref(s), "side");
  applyLayout(d, "bogus", s);
  assert.equal(d.documentElement.dataset.layout, "top");
  assert.equal(loadLayoutPref(s), "side");
});
