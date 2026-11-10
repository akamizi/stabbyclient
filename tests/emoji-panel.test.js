import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { createEmojiPanel, EMOJI_SHOWN } from "../app/js/emoji-panel.js";

const t = (k, v) => (v ? `${k} ${v.count}` : k);
const e = (shortcode, url = `https://h/${shortcode}.png`) => ({ shortcode, url });

async function setup(emojis = [e("noto_cat"), e("noto_dog")]) {
  const { document } = parseHTML("<html><body></body></html>");
  const picked = [];
  const calls = [];
  const api = { get: async (p, q) => { calls.push([p, q]); if (emojis instanceof Error) throw emojis; return emojis; } };
  const open = async () => {
    const panel = createEmojiPanel({ doc: document, api, t, onPick: (x) => picked.push(x.shortcode) });
    document.body.replaceChildren(panel);
    await panel.ready;
    return panel;
  };
  const panel = await open();
  const names = () => [...panel.querySelectorAll(".emoji-grid button.emoji-option")].map((b) => b.title);
  const type = (text) => { const i = panel.querySelector("input.emoji-search"); i.value = text; i.oninput(); };
  return { panel, picked, calls, open, names, type };
}

test("the panel shows the emoji as pictures straight away; choosing one hands it over", async () => {
  const { panel, picked, names } = await setup();
  assert.deepEqual(names(), [":noto_cat:", ":noto_dog:"]);
  const first = panel.querySelector(".emoji-grid button.emoji-option");
  assert.equal(first.textContent, "");
  assert.equal(first.querySelector("img").getAttribute("src"), "https://h/noto_cat.png");
  assert.equal(first.getAttribute("aria-label"), ":noto_cat:");
  panel.querySelectorAll(".emoji-grid button.emoji-option")[1].onclick();
  assert.deepEqual(picked, ["noto_dog"]);
});
test("an emoji the server has in three styles is shown once, after the instance's own", async () => {
  const { names } = await setup([e("noto_cat"), e("om_cat"), e("om_cat_face"), e("tw_cat"), e("tw_cat_face"), e("xeno_cat"), e("blobcat")]);
  assert.deepEqual(names(), [":xeno_cat:", ":blobcat:", ":noto_cat:", ":tw_cat_face:"]);
});
test("typing narrows the grid at once, from the first letter, every word anywhere in the name", async () => {
  const { names, type, panel, calls } = await setup([e("noto_cat"), e("noto_cat_with_tears_of_joy"), e("noto_dog"), e("Tux")]);
  type("d");
  assert.deepEqual(names(), [":noto_dog:"]);
  type("joy cat");
  assert.deepEqual(names(), [":noto_cat_with_tears_of_joy:"]);
  type("TUX");
  assert.deepEqual(names(), [":Tux:"]);
  type("zebra");
  assert.match(panel.querySelector(".emoji-grid").textContent, /emoji\.none/);
  type("");
  assert.equal(names().length, 4);
  assert.equal(calls.length, 1);
});
test("a long list is drawn in part, with a button for the rest", async () => {
  const many = Array.from({ length: EMOJI_SHOWN + 5 }, (_, i) => e(`e${i}`));
  const { names, panel } = await setup(many);
  assert.equal(names().length, EMOJI_SHOWN);
  const more = panel.querySelector(".emoji-grid button.emoji-all");
  assert.equal(more.textContent, `emoji.all ${EMOJI_SHOWN + 5}`);
  more.onclick();
  assert.equal(names().length, EMOJI_SHOWN + 5);
  assert.equal(panel.querySelector(".emoji-all"), null);
});
test("the list is asked once and kept for the next time the panel opens", async () => {
  const { calls, open } = await setup();
  const again = await open();
  assert.equal(again.querySelectorAll(".emoji-grid button.emoji-option").length, 2);
  assert.equal(calls.length, 1);
});
test("an emoji with an unsafe picture address is left out, and a failing list is said and asked again", async () => {
  const bad = await setup([e("evil", "javascript:alert(1)"), e("ok")]);
  assert.deepEqual(bad.names(), [":ok:"]);
  const down = await setup(new Error("x"));
  assert.match(down.panel.querySelector(".emoji-grid").textContent, /emoji\.failed/);
  await down.open();
  assert.equal(down.calls.length, 2);
});
