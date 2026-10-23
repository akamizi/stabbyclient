import test from "node:test";
import assert from "node:assert/strict";
import { resolveTheme, applyTheme, loadThemePref } from "../app/js/theme.js";

function memStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
function fakeEnv(prefersDark) {
  const listeners = [];
  const mql = { matches: prefersDark, addEventListener: (_, f) => listeners.push(f) };
  return { doc: { documentElement: { dataset: {} } }, matchMediaFn: () => mql, mql, listeners };
}

test("the high-contrast theme is a choice of its own, whatever the system prefers", () => {
  assert.equal(resolveTheme("contrast", true), "contrast");
  assert.equal(resolveTheme("contrast", false), "contrast");
});
test("auto follows the system", () => {
  assert.equal(resolveTheme("auto", true), "dark");
  assert.equal(resolveTheme("auto", false), "light");
});
test("explicit light/dark ignore the system", () => {
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("dark", false), "dark");
});
test("applyTheme sets data-theme and persists the preference", () => {
  const { doc, matchMediaFn } = fakeEnv(false);
  const storage = memStorage();
  applyTheme(doc, "dark", matchMediaFn, storage);
  assert.equal(doc.documentElement.dataset.theme, "dark");
  assert.equal(loadThemePref(storage), "dark");
});
test("an invalid stored value falls back to auto", () => {
  assert.equal(loadThemePref(memStorage({ "stabbyclient.theme": "purple" })), "auto");
});
test("in auto, a system change updates data-theme", () => {
  const { doc, matchMediaFn, mql, listeners } = fakeEnv(false);
  applyTheme(doc, "auto", matchMediaFn, memStorage());
  assert.equal(doc.documentElement.dataset.theme, "light");
  mql.matches = true;
  listeners.forEach((f) => f());
  assert.equal(doc.documentElement.dataset.theme, "dark");
});
test("with an explicit theme, a system change is ignored", () => {
  const { doc, matchMediaFn, mql, listeners } = fakeEnv(false);
  applyTheme(doc, "light", matchMediaFn, memStorage());
  mql.matches = true;
  listeners.forEach((f) => f());
  assert.equal(doc.documentElement.dataset.theme, "light");
});
