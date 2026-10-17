import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { emojifyText, emojifyNode } from "../app/js/emoji-text.js";
import { sanitizeHtml } from "../app/js/sanitize.js";

const { document } = parseHTML("<html><body></body></html>");
const cat = { shortcode: "cat_blob", url: "https://h/cat.gif", static_url: "https://h/cat.png" };
const dog = { shortcode: "dog", url: "https://h/dog.png" };
const box = (frag) => { const d = document.createElement("div"); d.append(frag); return d; };

test("a :shortcode: in text becomes a small picture, the words around it stay", () => {
  const d = box(emojifyText("hi :cat_blob: there", [cat], document));
  assert.equal(d.textContent, "hi  there");
  const img = d.querySelector("img.emoji");
  assert.equal(img.getAttribute("src"), "https://h/cat.png");
  assert.equal(img.getAttribute("alt"), ":cat_blob:");
  assert.equal(img.getAttribute("title"), ":cat_blob:");
  assert.equal(img.getAttribute("loading"), "lazy");
});
test("the still picture is preferred, the animated one used when there is no other", () => {
  const d = box(emojifyText(":dog: :cat_blob:", [cat, dog], document));
  assert.deepEqual([...d.querySelectorAll("img")].map((i) => i.getAttribute("src")), ["https://h/dog.png", "https://h/cat.png"]);
});
test("unknown shortcodes, no emoji list and plain colons are left as text", () => {
  assert.equal(box(emojifyText("a :nope: b", [cat], document)).textContent, "a :nope: b");
  assert.equal(box(emojifyText("a :cat_blob: b", undefined, document)).textContent, "a :cat_blob: b");
  assert.equal(box(emojifyText("time 10:30:45 ok", [cat], document)).textContent, "time 10:30:45 ok");
  assert.equal(box(emojifyText("", [cat], document)).textContent, "");
});
test("an emoji whose picture address is not http(s) is left as text", () => {
  const d = box(emojifyText(":bad:", [{ shortcode: "bad", url: "javascript:alert(1)" }], document));
  assert.equal(d.querySelector("img"), null);
  assert.equal(d.textContent, ":bad:");
});
test("the same emoji can appear many times, and shortcodes are matched whole", () => {
  const d = box(emojifyText(":dog::dog: :dogs:", [dog], document));
  assert.equal(d.querySelectorAll("img").length, 2);
  assert.match(d.textContent, /:dogs:/);
});
test("in already cleaned markup only the text is changed: links and paragraphs stay", () => {
  const d = document.createElement("div");
  d.append(sanitizeHtml('<p>hello :dog: <a href="https://e.example">:dog: link</a></p>', document));
  emojifyNode(d, [dog], document);
  assert.equal(d.querySelectorAll("img.emoji").length, 2);
  assert.equal(d.querySelector("a").getAttribute("href"), "https://e.example");
  assert.equal(d.querySelector("p").tagName, "P");
  assert.equal(d.textContent, "hello   link");
});
test("emojifyNode with no emoji changes nothing", () => {
  const d = document.createElement("div");
  d.append(sanitizeHtml("<p>:dog:</p>", document));
  emojifyNode(d, [], document);
  assert.equal(d.textContent, ":dog:");
});
