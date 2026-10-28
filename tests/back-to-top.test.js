import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { createBackToTop } from "../app/js/back-to-top.js";

function setup(extra = {}) {
  const { document } = parseHTML("<html><body><h1 id='view-title'>Home</h1></body></html>");
  const listeners = [];
  const win = { scrollY: 0, innerHeight: 800, calls: [], addEventListener: (n, f, o) => listeners.push([n, f, o]), scrollTo(o) { this.calls.push(o); }, matchMedia: () => ({ matches: false }), ...extra };
  const { button } = createBackToTop({ doc: document, win, t: (k) => k });
  document.body.append(button);
  const scroll = (y) => { win.scrollY = y; listeners.filter(([n]) => n === "scroll").forEach(([, f]) => f()); };
  return { document, win, button, scroll, listeners };
}

test("the button is hidden at the top and shows after two screens of scrolling", () => {
  const { button, scroll } = setup();
  assert.equal(button.hidden, true);
  scroll(1000);
  assert.equal(button.hidden, true);
  scroll(1700);
  assert.equal(button.hidden, false);
  scroll(0);
  assert.equal(button.hidden, true);
});

test("it is a named button, and pressing it scrolls to the top and focuses the heading", () => {
  const { document, win, button } = setup();
  assert.equal(button.tagName, "BUTTON");
  assert.equal(button.getAttribute("aria-label"), "nav.top");
  let focused = null;
  document.getElementById("view-title").focus = () => { focused = "title"; };
  button.onclick();
  assert.deepEqual(win.calls, [{ top: 0, behavior: "smooth" }]);
  assert.equal(focused, "title");
  assert.equal(document.getElementById("view-title").getAttribute("tabindex"), "-1");
});

test("with reduced motion the scroll is immediate, and the scroll listener is passive", () => {
  const { win, button, listeners } = setup({ matchMedia: () => ({ matches: true }) });
  button.onclick();
  assert.equal(win.calls[0].behavior, "auto");
  assert.deepEqual(listeners[0][2], { passive: true });
});
