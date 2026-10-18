import test from "node:test";
import assert from "node:assert/strict";
import { loadFontPref, applyFont } from "../app/js/font.js";

const store = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
const doc = () => ({ documentElement: { dataset: {} } });

test("the font defaults to the system's proportional one", () => {
  assert.equal(loadFontPref(store()), "system");
});
test("a stored choice is read back, and an invalid one falls back to the default", () => {
  assert.equal(loadFontPref(store({ "xenoclient.font": "mono" })), "mono");
  assert.equal(loadFontPref(store({ "xenoclient.font": "comic" })), "system");
});
test("applying a font sets data-font on the page and remembers it", () => {
  const d = doc();
  const s = store();
  applyFont(d, "mono", s);
  assert.equal(d.documentElement.dataset.font, "mono");
  assert.equal(loadFontPref(s), "mono");
  applyFont(d, "system", s);
  assert.equal(d.documentElement.dataset.font, "system");
});
test("an unknown font is not applied or stored", () => {
  const d = doc();
  const s = store();
  applyFont(d, "comic", s);
  assert.equal(d.documentElement.dataset.font, "system");
  assert.equal(s.getItem("xenoclient.font"), null);
});
test("storage that throws does not stop the font from being applied", () => {
  const d = doc();
  applyFont(d, "mono", { getItem() { throw new Error("no"); }, setItem() { throw new Error("no"); } });
  assert.equal(d.documentElement.dataset.font, "mono");
  assert.equal(loadFontPref({ getItem() { throw new Error("no"); } }), "system");
});
