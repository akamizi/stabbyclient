import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { createEmojiPanel, loadRecent, saveRecent } from "../app/js/emoji-panel.js";

const t = (k) => k;
const wait = (ms = 15) => new Promise((r) => setTimeout(r, ms));
const store = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
const cat = { shortcode: "noto_cat", url: "https://h/cat.png" };
const dog = { shortcode: "noto_dog", url: "https://h/dog.png" };

test("recent emoji keep the latest first, without repeats, at most twelve", () => {
  const s = store();
  for (let i = 0; i < 15; i++) saveRecent(s, { shortcode: `e${i}`, url: `https://h/${i}.png` });
  saveRecent(s, { shortcode: "e3", url: "https://h/3.png" });
  const list = loadRecent(s);
  assert.equal(list.length, 12);
  assert.equal(list[0].shortcode, "e3");
  assert.equal(new Set(list.map((e) => e.shortcode)).size, 12);
});
test("recent emoji survive bad stored data, and never keep an unsafe picture address", () => {
  assert.deepEqual(loadRecent(store({ "xenoclient.emoji-recent": "oops" })), []);
  const s = store();
  saveRecent(s, { shortcode: "bad", url: "javascript:1" });
  assert.deepEqual(loadRecent(s), []);
});

function setup(search = () => [cat, dog], recent = []) {
  const { document } = parseHTML("<html><body></body></html>");
  const storage = store();
  for (const r of recent) saveRecent(storage, r);
  const picked = [];
  const api = { get: async (p, q) => search(q.q) };
  const panel = createEmojiPanel({ doc: document, api, t, storage, onPick: (e) => picked.push(e.shortcode), delay: 1 });
  document.body.append(panel);
  return { document, panel, picked, storage };
}

test("the panel has a search box and, before anything is typed, the recently used emoji", () => {
  const { panel } = setup(undefined, [cat]);
  assert.ok(panel.querySelector("input.emoji-search"));
  const recent = panel.querySelectorAll(".emoji-recent button.emoji-option");
  assert.equal(recent.length, 1);
  assert.match(recent[0].textContent, /noto_cat/);
});
test("with nothing recent it says how to search", () => {
  const { panel } = setup();
  assert.match(panel.querySelector(".emoji-recent").textContent, /emoji\.hint/);
});
test("typing a few letters lists matching emoji; choosing one hands it over and is remembered", async () => {
  const { panel, picked, storage } = setup();
  const input = panel.querySelector("input.emoji-search");
  input.value = "cat";
  input.oninput();
  await wait();
  const options = panel.querySelectorAll(".emoji-list button.emoji-option");
  assert.equal(options.length, 2);
  options[1].onclick();
  assert.deepEqual(picked, ["noto_dog"]);
  assert.equal(loadRecent(storage)[0].shortcode, "noto_dog");
});
test("choosing a recent emoji hands it over too", () => {
  const { panel, picked } = setup(undefined, [cat]);
  panel.querySelector(".emoji-recent button.emoji-option").onclick();
  assert.deepEqual(picked, ["noto_cat"]);
});
