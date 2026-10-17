import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { attachEmojiPicker } from "../app/js/emoji-picker.js";

const t = (k) => k;
const wait = (ms = 15) => new Promise((r) => setTimeout(r, ms));
function setup(handler) {
  const { document } = parseHTML("<html><body><input id='i'></body></html>");
  const input = document.getElementById("i");
  const calls = [];
  const api = { get: async (path, params) => { calls.push([path, params]); return handler(params.q); } };
  const list = attachEmojiPicker({ doc: document, input, api, t, delay: 1 });
  document.body.append(list);
  const type = async (v) => { input.value = v; input.oninput?.(); await wait(); };
  return { document, input, list, calls, type };
}
const cat = { shortcode: "cat_blob", static_url: "https://h/cat.png" };

test("typing three or more characters of a shortcode lists the matching custom emoji", async () => {
  const { list, calls, type } = setup(() => [cat, { shortcode: "catfish", url: "https://h/f.png" }]);
  await type(":cat");
  assert.deepEqual(calls, [["/api/v1/custom_emojis", { q: "cat" }]]);
  const options = [...list.querySelectorAll("button.emoji-option")];
  assert.deepEqual(options.map((o) => o.textContent.trim()), [":cat_blob:", ":catfish:"]);
  assert.equal(options[0].querySelector("img").getAttribute("src"), "https://h/cat.png");
  assert.equal(list.hidden, false);
});
test("fewer than three characters, or something that is not a shortcode, asks nothing", async () => {
  const { list, calls, type } = setup(() => [cat]);
  await type(":ca");
  await type("hello");
  await type("");
  assert.deepEqual(calls, []);
  assert.equal(list.hidden, true);
});
test("choosing an emoji puts its :shortcode: in the field and closes the list", async () => {
  const { input, list, type } = setup(() => [cat]);
  await type(":cat");
  list.querySelector("button.emoji-option").onclick();
  assert.equal(input.value, ":cat_blob:");
  assert.equal(list.hidden, true);
});
test("an answer for text that has since changed is ignored", async () => {
  let release;
  const slow = new Promise((r) => { release = r; });
  const { list, input } = setup((q) => (q === "cat" ? slow : [{ shortcode: "dog_blob", url: "https://h/d.png" }]));
  input.value = ":cat";
  input.oninput();
  await wait();
  input.value = ":dog";
  input.oninput();
  await wait();
  release([cat]);
  await wait();
  assert.deepEqual([...list.querySelectorAll("button.emoji-option")].map((o) => o.textContent.trim()), [":dog_blob:"]);
});
test("no match and a failing catalog are said, not left blank", async () => {
  const none = setup(() => []);
  await none.type(":zzz");
  assert.match(none.list.textContent, /emoji\.none/);
  const bad = setup(() => { throw new Error("x"); });
  await bad.type(":zzz");
  assert.match(bad.list.textContent, /emoji\.failed/);
});
test("an emoji with an unsafe picture address is listed without the picture", async () => {
  const { list, type } = setup(() => [{ shortcode: "evil_one", url: "javascript:alert(1)" }]);
  await type(":evi");
  assert.equal(list.querySelector("img"), null);
  assert.match(list.textContent, /:evil_one:/);
});
