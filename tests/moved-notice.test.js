import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { createApi, movedTarget } from "../app/js/api.js";
import { showMovedNotice } from "../app/js/moved-notice.js";

const MSG = "This account has moved to https://other.example/users/me and is read-only.";

test("movedTarget reads the address from the 403 text and nothing else", () => {
  assert.equal(movedTarget(403, MSG), "https://other.example/users/me");
  assert.equal(movedTarget(500, MSG), null);
  assert.equal(movedTarget(403, "Forbidden"), null);
  assert.equal(movedTarget(403, undefined), null);
});

test("a moved-account 403 calls onMoved and carries movedTo", async () => {
  const seen = [];
  const fetchFn = async () => new Response(JSON.stringify({ error: MSG }), { status: 403 });
  const api = createApi({ fetchFn, getToken: () => "t", onUnauthorized() {}, onMoved: (a) => seen.push(a) });
  await assert.rejects(api.post("/api/v1/statuses", {}), (e) => e.status === 403 && e.movedTo === "https://other.example/users/me");
  assert.deepEqual(seen, ["https://other.example/users/me"]);
});

test("any other 403 does not call onMoved", async () => {
  const seen = [];
  const fetchFn = async () => new Response(JSON.stringify({ error: "no" }), { status: 403 });
  const api = createApi({ fetchFn, getToken: () => "t", onUnauthorized() {}, onMoved: (a) => seen.push(a) });
  await assert.rejects(api.post("/api/v1/statuses", {}));
  assert.deepEqual(seen, []);
});

test("the notice shows once, as an alert with the address", () => {
  const { document } = parseHTML("<body></body>");
  const t = (k, v) => `${k}:${v?.address}`;
  showMovedNotice(document, t, "a@b");
  showMovedNotice(document, t, "a@b");
  const n = document.querySelectorAll(".moved-notice");
  assert.equal(n.length, 1);
  assert.equal(n[0].getAttribute("role"), "alert");
  assert.equal(n[0].textContent, "moved.notice:a@b");
});
