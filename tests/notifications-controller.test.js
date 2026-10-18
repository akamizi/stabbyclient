import test from "node:test";
import assert from "node:assert/strict";
import { createNotificationsController } from "../app/js/notifications-controller.js";

const store = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const n = (id) => ({ id, type: "favourite", account: { acct: "a" }, status: { id: "s" } });
const t = (k) => k;

function setup({ api = {}, items = [n("3"), n("2"), n("1")], confirmAnswer = true } = {}) {
  const calls = [];
  const toasts = [];
  let changes = 0;
  const fake = {
    get: async (p, q) => { calls.push(["get", p, q]); return p === "/api/v1/markers" ? {} : items; },
    postJson: async (p, b) => { calls.push(["postJson", p, b]); return {}; },
    ...api,
  };
  const storage = store();
  const c = createNotificationsController({
    api: fake, storage, seenKey: "seen", hiddenKey: "hidden", t, toast: (m) => toasts.push(m),
    confirm: () => confirmAnswer, onChange: () => { changes++; },
  });
  return { c, calls, toasts, storage, changes: () => changes };
}

test("starting reads the server's read position, then the notifications, and reports the change", async () => {
  const { c, changes } = setup({ api: { get: async (p) => (p === "/api/v1/markers" ? { notifications: { last_read_id: "2" } } : [n("3"), n("2"), n("1")]) } });
  await c.start();
  assert.deepEqual(c.items().map((x) => x.id), ["3", "2", "1"]);
  assert.equal(c.lastSeen(), "2");
  assert.equal(c.unread(), 1);
  assert.ok(changes() > 0);
});
test("marking all as read moves the position to the newest and saves it; a refusal is told", async () => {
  const a = setup();
  await a.c.start();
  await a.c.markAllRead();
  assert.equal(a.c.lastSeen(), "3");
  assert.equal(a.c.unread(), 0);
  assert.deepEqual(a.calls.find((x) => x[0] === "postJson")[2], { notifications: { last_read_id: "3" } });
  const b = setup({ api: { postJson: async () => { throw new Error("x"); } } });
  await b.c.start();
  await b.c.markAllRead();
  assert.deepEqual(b.toasts, ["notifications.mark_failed"]);
  assert.equal(b.c.unread(), 0);
});
test("dismissing takes one notification away on the server and from the list", async () => {
  const { c, calls } = setup();
  await c.start();
  await c.dismiss(n("2"));
  assert.equal(calls.find((x) => x[1] === "/api/v1/notifications/2/dismiss")[0], "postJson");
  assert.deepEqual(c.items().map((x) => x.id), ["3", "1"]);
});
test("if the dismissed one is where the read position was, the position moves to the one below", async () => {
  const { c, calls } = setup({ api: { get: async (p) => (p === "/api/v1/markers" ? { notifications: { last_read_id: "2" } } : [n("3"), n("2"), n("1")]) } });
  await c.start();
  await c.dismiss(n("2"));
  assert.equal(c.lastSeen(), "1");
  assert.equal(c.unread(), 1);
  assert.ok(calls.some((x) => x[1] === "/api/v1/markers" && x[0] === "postJson"));
});
test("a failed dismissal keeps the notification and still reports a change, so a swiped row is drawn back", async () => {
  const { c, toasts, changes } = setup({ api: { postJson: async () => { throw Object.assign(new Error("HTTP 500"), { status: 500 }); } } });
  await c.start();
  const before = changes();
  await c.dismiss(n("2"));
  assert.deepEqual(c.items().map((x) => x.id), ["3", "2", "1"]);
  assert.deepEqual(toasts, ["notifications.dismiss_failed"]);
  assert.ok(changes() > before);
});
test("an old notification the server cannot find (404) is hidden on this device, and stays hidden", async () => {
  const { c, toasts, storage } = setup({ api: { postJson: async () => { throw Object.assign(new Error("HTTP 404"), { status: 404 }); } } });
  await c.start();
  await c.dismiss(n("2"));
  assert.deepEqual(c.items().map((x) => x.id), ["3", "1"]);
  assert.deepEqual(toasts, ["notifications.hidden_here"]);
  assert.match(storage.getItem("hidden"), /"2"/);
  c.setItems([n("3"), n("2"), n("1")]);
  assert.deepEqual(c.items().map((x) => x.id), ["3", "1"]);
});
test("an expired session during a dismissal says nothing (the app handles the sign-out)", async () => {
  const { c, toasts } = setup({ api: { postJson: async () => { throw Object.assign(new Error("unauthorized"), { status: 401 }); } } });
  await c.start();
  await c.dismiss(n("2"));
  assert.deepEqual(toasts, []);
});
test("clearing everything asks first, then empties the list and the hidden ones", async () => {
  const no = setup({ confirmAnswer: false });
  await no.c.start();
  await no.c.clearAll();
  assert.equal(no.c.items().length, 3);
  assert.equal(no.calls.some((x) => x[1] === "/api/v1/notifications/clear"), false);
  const yes = setup();
  await yes.c.start();
  await yes.c.clearAll();
  assert.deepEqual(yes.c.items(), []);
  assert.deepEqual(yes.calls.find((x) => x[1] === "/api/v1/notifications/clear")[2], {});
});
test("a failed clear keeps the list and says so", async () => {
  const { c, toasts } = setup({ api: { postJson: async () => { throw new Error("x"); } } });
  await c.start();
  await c.clearAll();
  assert.equal(c.items().length, 3);
  assert.deepEqual(toasts, ["notifications.clear_failed"]);
});
test("another device's read position is taken in, unless ours is being saved", async () => {
  let server = { notifications: { last_read_id: "1" } };
  const { c } = setup({ api: { get: async (p) => (p === "/api/v1/markers" ? server : [n("3"), n("2"), n("1")]) } });
  await c.start();
  assert.equal(c.lastSeen(), "1");
  server = { notifications: { last_read_id: "3" } };
  await c.syncMarker();
  assert.equal(c.lastSeen(), "3");
});
