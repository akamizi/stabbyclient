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
