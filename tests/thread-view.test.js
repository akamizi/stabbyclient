import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { toggleThread } from "../app/js/thread-view.js";

const t = (k, p = {}) => `${k}:${p.count ?? ""}`;
const mk = (n) => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, in_reply_to_id: "r", created_at: `2026-10-16T10:${String(i).padStart(2, "0")}:00Z` }));

function setup(descendants, fail = false) {
  const { document } = parseHTML("<html><body><article id='card'><div class='thread' hidden></div></article></body></html>");
  const card = document.getElementById("card");
  const api = { get: async () => { if (fail) throw new Error("net"); return { ancestors: [], descendants }; } };
  const renderCard = (st) => { const e = document.createElement("article"); e.className = "reply"; e.dataset.id = st.id; return e; };
  const run = () => toggleThread({ doc: document, card, status: { id: "r" }, api, renderCard, t, initial: 5 });
  return { card, run, box: card.querySelector(".thread") };
}

test("opening shows the first replies and a show-more button", async () => {
  const { run, box } = setup(mk(8));
  await run();
  assert.equal(box.hidden, false);
  assert.equal(box.querySelectorAll(".reply").length, 5);
  assert.ok(box.querySelector("button.more"));
});
test("show more reveals the rest", async () => {
  const { run, box } = setup(mk(8));
  await run();
  box.querySelector("button.more").onclick();
  assert.equal(box.querySelectorAll(".reply").length, 8);
  assert.equal(box.querySelector("button.more"), null);
});
test("toggling again collapses", async () => {
  const { run, box } = setup(mk(2));
  await run();
  await run();
  assert.equal(box.hidden, true);
  assert.equal(box.children.length, 0);
});
test("a failed fetch leaves the thread closed and rejects", async () => {
  const { run, box } = setup(mk(2), true);
  await assert.rejects(run(), /net/);
  assert.equal(box.hidden, true);
});

import { toggleAncestors } from "../app/js/thread-view.js";

function setupAnc(ancestors, fail = false) {
  const { document } = parseHTML("<html><body><article id='card'><div class='ancestors' hidden></div><div class='thread' hidden></div></article></body></html>");
  const card = document.getElementById("card");
  const api = { get: async () => { if (fail) throw new Error("net"); return { ancestors, descendants: [] }; } };
  const renderCard = (st) => { const e = document.createElement("article"); e.className = "anc"; e.dataset.id = st.id; return e; };
  const run = () => toggleAncestors({ doc: document, card, status: { id: "me" }, api, renderCard, t, initial: 5 });
  return { run, box: card.querySelector(".ancestors") };
}
const anc = (n) => Array.from({ length: n }, (_, i) => ({ id: `a${i}` })); // oldest first

test("ancestors open in place, oldest first", async () => {
  const { run, box } = setupAnc(anc(3));
  await run();
  assert.equal(box.hidden, false);
  assert.deepEqual([...box.querySelectorAll(".anc")].map((e) => e.dataset.id), ["a0", "a1", "a2"]);
});
test("with many ancestors only the nearest 5 show, with a button for the earlier ones", async () => {
  const { run, box } = setupAnc(anc(8));
  await run();
  assert.deepEqual([...box.querySelectorAll(".anc")].map((e) => e.dataset.id), ["a3", "a4", "a5", "a6", "a7"]);
  box.querySelector("button.earlier").onclick();
  assert.equal(box.querySelectorAll(".anc").length, 8);
  assert.equal(box.querySelector("button.earlier"), null);
  assert.equal(box.querySelector(".anc").dataset.id, "a0");
});
test("toggling again collapses; a failed fetch leaves it closed and rejects", async () => {
  const a = setupAnc(anc(2));
  await a.run();
  await a.run();
  assert.equal(a.box.hidden, true);
  const b = setupAnc(anc(2), true);
  await assert.rejects(b.run(), /net/);
  assert.equal(b.box.hidden, true);
});
test("a post with no ancestors in the response stays closed", async () => {
  const { run, box } = setupAnc([]);
  await run();
  assert.equal(box.hidden, true);
});
