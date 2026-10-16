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
