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
