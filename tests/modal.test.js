import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { createModal } from "../app/js/modal.js";

const t = (k) => k;
function setup() {
  const { document } = parseHTML("<html><body><main>page</main></body></html>");
  const listeners = {};
  let backs = 0;
  const win = {
    history: { state: null, pushState(s) { this.state = s; }, back() { backs++; this.state = null; win.fire("popstate"); } },
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    removeEventListener: (type, fn) => { listeners[type] = (listeners[type] || []).filter((f) => f !== fn); },
    fire: (type, ev = {}) => (listeners[type] || []).slice().forEach((fn) => fn(ev)),
  };
  const modal = createModal({ doc: document, win, t });
  const content = () => { const f = document.createElement("form"); f.id = "inside"; const ta = document.createElement("textarea"); f.append(ta); return f; };
  return { document, win, modal, content, listeners, backs: () => backs };
}

test("it opens a dialog over the page holding the given content", () => {
  const { document, modal, content } = setup();
  modal.open(content(), { label: "New post" });
  const dlg = document.querySelector(".modal");
  assert.equal(dlg.getAttribute("role"), "dialog");
  assert.equal(dlg.getAttribute("aria-modal"), "true");
  assert.equal(dlg.getAttribute("aria-label"), "New post");
  assert.ok(dlg.querySelector(".modal-panel #inside"));
  assert.equal(document.body.classList.contains("modal-open"), true);
});
test("closing removes it and gives the page back its scrolling", () => {
  const { document, modal, content } = setup();
  modal.open(content(), {});
  modal.close();
  assert.equal(document.querySelector(".modal"), null);
  assert.equal(document.body.classList.contains("modal-open"), false);
});
test("Escape and the phone's Back button close it; other keys do not", () => {
  const { document, win, modal, content } = setup();
  modal.open(content(), {});
  win.fire("keydown", { key: "a" });
  assert.ok(document.querySelector(".modal"));
  win.fire("keydown", { key: "Escape" });
  assert.equal(document.querySelector(".modal"), null);
  modal.open(content(), {});
  win.fire("popstate");
  assert.equal(document.querySelector(".modal"), null);
});
test("a tap on the dimmed area does not close it (what is being written would be lost)", () => {
  const { document, modal, content } = setup();
  modal.open(content(), {});
  const dlg = document.querySelector(".modal");
  assert.equal(dlg.onclick, null);
});
test("closing by hand takes its own history entry away once, and listeners do not pile up", () => {
  const { modal, content, backs, listeners } = setup();
  modal.open(content(), {});
  modal.close();
  assert.equal(backs(), 1);
  assert.equal((listeners.keydown || []).length, 0);
  assert.equal((listeners.popstate || []).length, 0);
  modal.close();
  assert.equal(backs(), 1);
});
test("the onClose callback runs however it is closed, once", () => {
  const { win, modal, content } = setup();
  let n = 0;
  modal.open(content(), { onClose: () => n++ });
  win.fire("keydown", { key: "Escape" });
  modal.close();
  assert.equal(n, 1);
  modal.open(content(), { onClose: () => n++ });
  modal.close();
  assert.equal(n, 2);
});
test("opening a second one replaces the first", () => {
  const { document, modal, content } = setup();
  modal.open(content(), {});
  modal.open(content(), {});
  assert.equal(document.querySelectorAll(".modal").length, 1);
});
