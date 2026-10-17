import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { renderAnnouncements, announcementKey, loadDismissed, saveDismissed } from "../app/js/announcements.js";

const t = (k) => k;
const store = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
const dom = () => parseHTML("<html><body><div id='c'></div></body></html>").document;
const item = (content, id = "17") => ({ id, content, published_at: "2026-10-17T10:00:00Z" });

test("each announcement shows its text, cleaned, with a dismiss button", () => {
  const document = dom();
  const c = document.getElementById("c");
  renderAnnouncements({ doc: document, container: c, items: [item("<p>Maintenance <script>x</script>at noon</p>")], dismissed: new Set(), onDismiss() {}, t });
  const box = c.querySelector(".announcement");
  assert.match(box.textContent, /Maintenance/);
  assert.equal(box.querySelector("script"), null);
  assert.ok(box.querySelector("button.dismiss"));
});
test("dismissing calls back with the announcement's key and removes it", () => {
  const document = dom();
  const c = document.getElementById("c");
  const seen = [];
  const a = item("<p>Hello</p>");
  renderAnnouncements({ doc: document, container: c, items: [a], dismissed: new Set(), onDismiss: (k) => seen.push(k), t });
  c.querySelector("button.dismiss").onclick();
  assert.deepEqual(seen, [announcementKey(a)]);
  assert.equal(c.querySelector(".announcement"), null);
});
test("announcements already dismissed on this device are not shown", () => {
  const document = dom();
  const c = document.getElementById("c");
  const a = item("<p>Hello</p>");
  renderAnnouncements({ doc: document, container: c, items: [a, item("<p>Other</p>")], dismissed: new Set([announcementKey(a)]), onDismiss() {}, t });
  assert.equal(c.querySelectorAll(".announcement").length, 1);
  assert.match(c.textContent, /Other/);
});
test("the key follows the text, not the id the server gives (the server's ids are coarse)", () => {
  assert.equal(announcementKey(item("<p>A</p>", "17")), announcementKey(item("<p>A</p>", "99")));
  assert.notEqual(announcementKey(item("<p>A</p>")), announcementKey(item("<p>B</p>")));
});
test("the dismissed list is kept on the device and survives bad data", () => {
  const s = store();
  assert.deepEqual([...loadDismissed(s)], []);
  saveDismissed(s, new Set(["a", "b"]));
  assert.deepEqual([...loadDismissed(s)].sort(), ["a", "b"]);
  assert.deepEqual([...loadDismissed(store({ "xenoclient.announcements": "not json" }))], []);
  const many = new Set(Array.from({ length: 60 }, (_, i) => `k${i}`));
  saveDismissed(s, many);
  assert.ok(loadDismissed(s).size <= 50);
});
