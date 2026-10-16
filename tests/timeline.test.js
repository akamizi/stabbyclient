import test from "node:test";
import assert from "node:assert/strict";
import { mergeFresh } from "../app/js/timeline.js";

const s = (...ids) => ids.map((id) => ({ id: String(id) }));

test("new ids go to pendingNew and shown is unchanged", () => {
  const shown = s(10, 9, 8);
  const r = mergeFresh(shown, s(12, 11, 10, 9));
  assert.deepEqual(r.toShow, shown);
  assert.deepEqual(r.pendingNew.map((x) => x.id), ["12", "11"]);
});
test("identical lists give no pendingNew", () => {
  const r = mergeFresh(s(3, 2), s(3, 2));
  assert.deepEqual(r.pendingNew, []);
  assert.deepEqual(r.toShow, s(3, 2));
});
test("an empty shown list shows everything fresh", () => {
  const r = mergeFresh([], s(2, 1));
  assert.deepEqual(r.toShow, s(2, 1));
  assert.deepEqual(r.pendingNew, []);
});
test("fresh posts older than the newest shown are not treated as new", () => {
  const r = mergeFresh(s(10), s(10, 7));
  assert.deepEqual(r.pendingNew, []);
});
