import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { createLightbox } from "../app/js/lightbox.js";

const t = (k) => k;
function setup() {
  const { document, window } = parseHTML("<html><body><main id='m'>x</main></body></html>");
  const listeners = {};
  const pushed = [];
  let backs = 0;
  const win = {
    history: { state: null, pushState(s) { this.state = s; pushed.push(s); }, back() { backs++; this.state = null; win.fire("popstate"); } },
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    removeEventListener: (type, fn) => { listeners[type] = (listeners[type] || []).filter((f) => f !== fn); },
    fire: (type, ev = {}) => (listeners[type] || []).slice().forEach((fn) => fn(ev)),
  };
  const box = createLightbox({ doc: document, win, t });
  return { document, win, box, pushed, backs: () => backs, listeners };
}

test("opening shows the image full size in a dialog that names what it is", () => {
  const { document, box } = setup();
  box.open("https://h/big.png", "a cat");
  const dlg = document.querySelector(".lightbox");
  assert.equal(dlg.getAttribute("role"), "dialog");
  assert.equal(dlg.getAttribute("aria-modal"), "true");
  const img = dlg.querySelector("img");
  assert.equal(img.getAttribute("src"), "https://h/big.png");
  assert.equal(img.getAttribute("alt"), "a cat");
  assert.ok(dlg.querySelector("button.close"));
});
test("an address that is not http(s) is never opened", () => {
  const { document, box } = setup();
  box.open("javascript:alert(1)", "x");
  box.open("data:text/html,x", "x");
  assert.equal(document.querySelector(".lightbox"), null);
});
test("a tap on the picture, the dark area or the close button closes it (the tap bubbles to the dialog)", () => {
  const { document, box } = setup();
  for (const pick of [(d) => d, (d) => d.querySelector("img"), (d) => d.querySelector("button.close")]) {
    box.open("https://h/a.png", "");
    const dlg = document.querySelector(".lightbox");
    dlg.onclick({ target: pick(dlg) });
    assert.equal(document.querySelector(".lightbox"), null);
  }
});
test("Escape closes it, and other keys do not", () => {
  const { document, win, box } = setup();
  box.open("https://h/a.png", "");
  win.fire("keydown", { key: "a" });
  assert.ok(document.querySelector(".lightbox"));
  win.fire("keydown", { key: "Escape" });
  assert.equal(document.querySelector(".lightbox"), null);
});
test("the phone's Back button closes it instead of leaving the page", () => {
  const { document, win, box, pushed } = setup();
  box.open("https://h/a.png", "");
  assert.equal(pushed.length, 1);
  win.fire("popstate");
  assert.equal(document.querySelector(".lightbox"), null);
});
test("closing by tap goes back in history once, so the page's own history is not left with a stale entry", () => {
  const { document, box, backs } = setup();
  box.open("https://h/a.png", "");
  document.querySelector(".lightbox").onclick({ target: document.querySelector(".lightbox"), stopPropagation() {} });
  assert.equal(backs(), 1);
  assert.equal(document.querySelector(".lightbox"), null);
});
test("opening a second picture replaces the first, and listeners do not pile up", () => {
  const { document, box, listeners } = setup();
  box.open("https://h/a.png", "");
  box.open("https://h/b.png", "");
  assert.equal(document.querySelectorAll(".lightbox").length, 1);
  assert.equal(document.querySelector(".lightbox img").getAttribute("src"), "https://h/b.png");
  document.querySelector(".lightbox").onclick({ target: document.querySelector(".lightbox") });
  assert.equal((listeners.keydown || []).length, 0);
  assert.equal((listeners.popstate || []).length, 0);
});
