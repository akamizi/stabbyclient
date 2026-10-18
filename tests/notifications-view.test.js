import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { renderNotifications } from "../app/js/notifications-view.js";

const t = (k, p = {}) => `${k}|${p.name ?? ""}`;
const items = [
  { id: "2", type: "favourite", account: { acct: "bea", display_name: "Bea" }, status: { id: "sA" } },
  { id: "1", type: "follow", account: { acct: "carl" }, status: null },
];

test("renders one row per notification and opens the post for rows with a status", () => {
  const { document } = parseHTML("<html><body><div id='c'></div></body></html>");
  const opened = [];
  renderNotifications({ doc: document, container: document.getElementById("c"), items, t, onOpen: (id) => opened.push(id) });
  const rows = document.querySelectorAll("#c li");
  assert.equal(rows.length, 2);
  rows[0].querySelector("button").onclick();
  assert.deepEqual(opened, ["sA"]);
  assert.equal(rows[1].querySelector("button"), null);
});
test("an empty list shows the empty message", () => {
  const { document } = parseHTML("<html><body><div id='c'></div></body></html>");
  renderNotifications({ doc: document, container: document.getElementById("c"), items: [], t, onOpen() {} });
  assert.match(document.getElementById("c").textContent, /notifications\.empty/);
});

test("unread notifications are marked and a Mark all as read button appears", () => {
  const { document } = parseHTML("<html><body><div id='c'></div></body></html>");
  const container = document.getElementById("c");
  const marked = [];
  const items = [{ id: "5", type: "favourite", account: { acct: "a" } }, { id: "4", type: "follow", account: { acct: "b" } }, { id: "3", type: "mention", account: { acct: "c" } }];
  renderNotifications({ doc: document, container, items, t: (k) => k, onOpen() {}, lastSeenId: "4", onMarkRead: () => marked.push(1) });
  assert.deepEqual([...container.querySelectorAll("li")].map((li) => li.classList.contains("unread")), [true, false, false]);
  container.querySelector("button.mark-read").onclick();
  assert.deepEqual(marked, [1]);
  assert.match(container.querySelector("button.mark-read").textContent, /notifications\.mark_read/);
});
test("with nothing unread there is no Mark all button and nothing is highlighted", () => {
  const { document } = parseHTML("<html><body><div id='c'></div></body></html>");
  const container = document.getElementById("c");
  const items = [{ id: "5", type: "favourite", account: { acct: "a" } }];
  renderNotifications({ doc: document, container, items, t: (k) => k, onOpen() {}, lastSeenId: "5", onMarkRead() {} });
  assert.equal(container.querySelector("button.mark-read"), null);
  assert.equal(container.querySelector("li.unread"), null);
});
test("with no read position yet, everything is unread", () => {
  const { document } = parseHTML("<html><body><div id='c'></div></body></html>");
  const container = document.getElementById("c");
  renderNotifications({ doc: document, container, items: [{ id: "5", type: "follow", account: { acct: "a" } }], t: (k) => k, onOpen() {}, lastSeenId: null, onMarkRead() {} });
  assert.equal(container.querySelectorAll("li.unread").length, 1);
});

test("each notification can be dismissed when a handler is given, and the handler gets that notification", () => {
  const { document } = parseHTML("<html><body><div id='c'></div></body></html>");
  const container = document.getElementById("c");
  const seen = [];
  const list = [{ id: "2", type: "favourite", account: { acct: "a" }, status: { id: "s" } }, { id: "1", type: "follow", account: { acct: "b" }, status: null }];
  renderNotifications({ doc: document, container, items: list, t: (k) => k, onOpen() {}, onDismiss: (n) => seen.push(n.id) });
  const buttons = container.querySelectorAll("li button.dismiss");
  assert.equal(buttons.length, 2);
  buttons[1].onclick();
  assert.deepEqual(seen, ["1"]);
  assert.match(buttons[0].getAttribute("aria-label"), /notifications\.dismiss/);
});
test("a repaired follow shows its explanation under the line", () => {
  const { document } = parseHTML("<html><body><div id='c'></div></body></html>");
  const container = document.getElementById("c");
  const list = [{ id: "1", type: "follow_repaired", xenomorph_reason: "silent-follow", account: { acct: "a" }, status: null }];
  renderNotifications({ doc: document, container, items: list, t: (k) => k, onOpen() {} });
  assert.match(container.querySelector("li .note").textContent, /notification\.repaired_note_silent/);
});

test("a notification can also be swiped away, and the tap after a swipe does not open the post", () => {
  const { document } = parseHTML("<html><body><div id='c'></div></body></html>");
  const container = document.getElementById("c");
  const dismissed = [];
  const opened = [];
  const list = [{ id: "2", type: "favourite", account: { acct: "a" }, status: { id: "s" } }];
  renderNotifications({ doc: document, container, items: list, t: (k) => k, onOpen: (id) => opened.push(id), onDismiss: (n) => dismissed.push(n.id) });
  const li = container.querySelector("li");
  li.setPointerCapture = () => {};
  const ev = (type, x) => li[`on${type}`]({ pointerId: 1, button: 0, clientX: x, clientY: 0 });
  ev("pointerdown", 250);
  ev("pointermove", 100);
  ev("pointerup", 100);
  assert.deepEqual(dismissed, ["2"]);
  li.querySelector("button").onclick();
  assert.deepEqual(opened, []);
  ev("pointerdown", 250);
  ev("pointerup", 250);
  li.querySelector("button").onclick();
  assert.deepEqual(opened, ["s"]);
});
test("without a dismiss handler rows are not swipeable", () => {
  const { document } = parseHTML("<html><body><div id='c'></div></body></html>");
  const container = document.getElementById("c");
  renderNotifications({ doc: document, container, items: [{ id: "2", type: "follow", account: { acct: "a" }, status: null }], t: (k) => k, onOpen() {} });
  assert.equal(container.querySelector("li").onpointerdown ?? null, null);
});

test("a Clear all button appears when there are notifications and a handler, and calls it", () => {
  const { document } = parseHTML("<html><body><div id='c'></div></body></html>");
  const container = document.getElementById("c");
  let n = 0;
  renderNotifications({ doc: document, container, items: [{ id: "1", type: "follow", account: { acct: "a" }, status: null }], t: (k) => k, onOpen() {}, onClearAll: () => { n++; } });
  const b = container.querySelector("button.clear-all");
  assert.ok(b);
  assert.match(b.textContent, /notifications\.clear_all/);
  b.onclick();
  assert.equal(n, 1);
});
test("there is no Clear all on an empty list or without a handler", () => {
  const { document } = parseHTML("<html><body><div id='c'></div></body></html>");
  const container = document.getElementById("c");
  renderNotifications({ doc: document, container, items: [], t: (k) => k, onOpen() {}, onClearAll() {} });
  assert.equal(container.querySelector("button.clear-all"), null);
  renderNotifications({ doc: document, container, items: [{ id: "1", type: "follow", account: { acct: "a" }, status: null }], t: (k) => k, onOpen() {} });
  assert.equal(container.querySelector("button.clear-all"), null);
});

test("custom emoji in a person's name show as pictures in the notification line", () => {
  const { document } = parseHTML("<html><body><div id='c'></div></body></html>");
  const container = document.getElementById("c");
  const blob = { shortcode: "blob", url: "https://h/blob.png" };
  const tt = (k, p = {}) => `${k} ${p.name ?? ""}`;
  const list = [{ id: "1", type: "favourite", account: { acct: "a", display_name: "Ann :blob:", emojis: [blob] }, status: { id: "s" } }, { id: "2", type: "follow", account: { acct: "b", display_name: "Bob :blob:", emojis: [blob] }, status: null }];
  renderNotifications({ doc: document, container, items: list, t: tt, onOpen() {} });
  const rows = container.querySelectorAll("li");
  assert.equal(rows[0].querySelectorAll("button img.emoji").length, 1);
  assert.equal(rows[1].querySelectorAll("img.emoji").length, 1);
  assert.doesNotMatch(container.textContent, /:blob:/);
});
test("without an emoji list the shortcode stays as text", () => {
  const { document } = parseHTML("<html><body><div id='c'></div></body></html>");
  const container = document.getElementById("c");
  renderNotifications({ doc: document, container, items: [{ id: "2", type: "follow", account: { acct: "b", display_name: "Bob :blob:" }, status: null }], t: (k, p = {}) => `${k} ${p.name ?? ""}`, onOpen() {} });
  assert.match(container.textContent, /:blob:/);
});
test("the dismiss button sits at the end of its own row, outside the text, and is a proper touch target", () => {
  const { document } = parseHTML("<html><body><div id='c'></div></body></html>");
  const container = document.getElementById("c");
  renderNotifications({ doc: document, container, items: [{ id: "1", type: "follow", account: { acct: "a" }, status: null }], t: (k) => k, onOpen() {}, onDismiss() {} });
  const li = container.querySelector("li");
  const kids = [...li.children].map((c) => c.className);
  assert.deepEqual(kids, ["main", "dismiss"]);
  assert.ok(li.querySelector(":scope > .main"));
  assert.equal(li.querySelector(":scope > button.dismiss").textContent, "✕");
});
