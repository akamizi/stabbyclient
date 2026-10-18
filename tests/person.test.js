import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { personItem } from "../app/js/person.js";
import { el, elFor } from "../app/js/dom.js";

const { document } = parseHTML("<html><body></body></html>");
const account = { id: "1", acct: "ann@h", display_name: "Ann :blob:", avatar: "https://h/a.png", emojis: [{ shortcode: "blob", url: "https://h/blob.png" }] };

test("a person row has the avatar, the name as a button that opens the profile, the handle", () => {
  const opened = [];
  const li = personItem({ doc: document, account, onOpen: (a) => opened.push(a.id) });
  assert.equal(li.tagName, "LI");
  assert.ok(li.classList.contains("person"));
  assert.equal(li.querySelector("img.avatar").getAttribute("src"), "https://h/a.png");
  const name = li.querySelector("button.name");
  assert.ok(name.classList.contains("open"));
  assert.equal(name.querySelectorAll("img.emoji").length, 1);
  assert.match(li.querySelector(".acct").textContent, /@ann@h/);
  name.onclick();
  assert.deepEqual(opened, ["1"]);
});
test("extra buttons come after the name, and an unsafe avatar address is left out", () => {
  const b = document.createElement("button");
  b.className = "extra";
  const li = personItem({ doc: document, account: { ...account, avatar: "javascript:1" }, onOpen() {}, buttons: [b] });
  assert.equal(li.querySelector("img.avatar"), null);
  assert.equal(li.lastElementChild, b);
});
test("a person with no display name is shown by username, then handle", () => {
  const li = personItem({ doc: document, account: { id: "2", acct: "bob@h", username: "bob" }, onOpen() {} });
  assert.equal(li.querySelector("button.name").textContent, "bob");
  const li2 = personItem({ doc: document, account: { id: "3", acct: "carl@h" }, onOpen() {} });
  assert.equal(li2.querySelector("button.name").textContent, "carl@h");
});
test("the shared element helper makes an element with a class and text", () => {
  const e = el(document, "p", "note", "hi");
  assert.equal(e.tagName, "P");
  assert.equal(e.className, "note");
  assert.equal(e.textContent, "hi");
  assert.equal(elFor(document)("span").className, "");
});
