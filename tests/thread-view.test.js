import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { toggleThread, insertReply } from "../app/js/thread-view.js";

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
  const box = card.querySelector(".ancestors");
  const scrolled = [];
  box.scrollIntoView = (o) => scrolled.push(o);
  const run = (scroll) => toggleAncestors({ doc: document, card, status: { id: "me" }, api, renderCard, t, initial: 5, scroll });
  return { run, box, scrolled };
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
test("opening ancestors scrolls to the top of them only when asked, and again after the earlier ones load", async () => {
  const quiet = setupAnc(anc(8));
  await quiet.run();
  assert.equal(quiet.scrolled.length, 0);
  const { run, box, scrolled } = setupAnc(anc(8));
  await run(true);
  assert.equal(scrolled.length, 1);
  box.querySelector("button.earlier").onclick();
  assert.equal(scrolled.length, 2);
});
test("no ancestors to show: nothing opens and the caller is told, so it can say so", async () => {
  const { run, box } = setupAnc([]);
  assert.equal(await run(true), false);
  assert.equal(box.hidden, true);
  const full = setupAnc(anc(2));
  assert.equal(await full.run(true), true);
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

function replyDom() {
  const { document } = parseHTML("<html><body><article id='root'><div class='thread'><article class='depth-1' id='first'><div class='thread' hidden></div></article><article class='depth-1' id='second'><div class='thread' hidden></div></article></div></article></body></html>");
  const renderCard = (st) => { const e = document.createElement("article"); e.dataset.id = st.id; e.dataset.statusId = st.id; return e; };
  return { document, renderCard, root: document.getElementById("root"), first: document.getElementById("first") };
}

test("a reply to the post at the top of an open thread appears at the end of the thread", () => {
  const { document, renderCard, root } = replyDom();
  insertReply({ card: root, reply: { id: "new" }, renderCard });
  const items = [...root.querySelector(".thread").children].map((c) => c.id || c.dataset.id);
  assert.deepEqual(items, ["first", "second", "new"]);
  assert.ok(document.querySelector("[data-id=new]").classList.contains("depth-1"));
});
test("a reply to a post inside the thread appears right under it, one step deeper", () => {
  const { document, renderCard, first } = replyDom();
  insertReply({ card: first, reply: { id: "new" }, renderCard });
  const box = document.querySelector("#root > .thread");
  assert.deepEqual([...box.children].map((c) => c.id || c.dataset.id), ["first", "new", "second"]);
  assert.ok(document.querySelector("[data-id=new]").classList.contains("depth-2"));
});
test("when the thread is not open nothing is added", () => {
  const { document, renderCard, root } = replyDom();
  root.querySelector(":scope > .thread").hidden = true;
  insertReply({ card: root, reply: { id: "new" }, renderCard });
  assert.equal(document.querySelector("[data-id=new]"), null);
});
test("a reply that is already in the thread is not added twice", () => {
  const { document, renderCard, root } = replyDom();
  insertReply({ card: root, reply: { id: "new" }, renderCard });
  insertReply({ card: root, reply: { id: "new" }, renderCard });
  assert.equal(document.querySelectorAll("[data-id=new]").length, 1);
});
