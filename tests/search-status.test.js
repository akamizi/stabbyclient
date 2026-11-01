import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { createSearchStatus } from "../app/js/search-status.js";

const { document } = parseHTML("<html><body></body></html>");
const t = (k, p = {}) => `${k}|${p.query ?? ""}|${p.seconds ?? ""}`;

// A clock and an interval that the test moves by hand.
function clock() {
  let ms = 0;
  let fn = null;
  let cleared = false;
  return {
    now: () => ms,
    timers: { setInterval: (f) => { fn = f; return 1; }, clearInterval: () => { cleared = true; } },
    advance(s) { ms += s * 1000; fn?.(); },
    get cleared() { return cleared; },
  };
}

test("it counts the seconds, warns that the server is slow after a while and can be stopped", () => {
  const c = clock();
  let cancelled = 0;
  const s = createSearchStatus({ doc: document, t, query: "ada", onCancel: () => cancelled++, ...c });
  assert.match(s.el.querySelector(".search-text").textContent, /more\.searching\|ada\|0/);
  assert.equal(s.el.querySelector(".search-slow").textContent, "");
  c.advance(3);
  assert.match(s.el.querySelector(".search-text").textContent, /\|3$/);
  c.advance(6);
  assert.match(s.el.querySelector(".search-slow").textContent, /more\.search_slow/);
  s.el.querySelector("button").click();
  assert.equal(cancelled, 1);
  assert.equal(s.el.getAttribute("role"), "status");
});
test("stopping ends the count, removes the mark and the button and says how long it took", () => {
  const c = clock();
  const s = createSearchStatus({ doc: document, t, query: "ada", onCancel() {}, ...c });
  c.advance(12);
  s.stop();
  assert.ok(c.cleared);
  assert.equal(s.el.querySelector(".spinner"), null);
  assert.equal(s.el.querySelector("button"), null);
  assert.match(s.el.textContent, /more\.search_done\|\|12\.0/);
  assert.ok(s.el.classList.contains("ended"));
});
test("stopping with a message shows that message instead", () => {
  const c = clock();
  const s = createSearchStatus({ doc: document, t, query: "ada", onCancel() {}, ...c });
  s.stop("Search stopped.");
  assert.equal(s.el.textContent, "Search stopped.");
});

test("the default timers work when called as methods of another object, as a browser requires", () => {
  const realSet = globalThis.setInterval;
  const realClear = globalThis.clearInterval;
  let ran = 0;
  // Like a browser's: refuses to run unless `this` is the global object.
  globalThis.setInterval = function (fn, ms) { if (this !== globalThis && this !== undefined) throw new TypeError("Illegal invocation"); ran++; return realSet(fn, ms); };
  globalThis.clearInterval = function (id) { if (this !== globalThis && this !== undefined) throw new TypeError("Illegal invocation"); return realClear(id); };
  try {
    const s = createSearchStatus({ doc: document, t, query: "ada", onCancel() {} });
    s.stop();
    assert.equal(ran, 1);
  } finally {
    globalThis.setInterval = realSet;
    globalThis.clearInterval = realClear;
  }
});
