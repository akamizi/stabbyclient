import test from "node:test";
import assert from "node:assert/strict";
import { unreadCount, describeNotification, startPolling } from "../app/js/notifications.js";

const n = (id, type = "favourite", statusId = "s" + id) => ({ id, type, account: { display_name: "Bea", acct: "bea" }, status: statusId ? { id: statusId } : null });
const t = (k, p = {}) => `${k}|${p.name ?? ""}|${p.type ?? ""}`;

test("unreadCount counts items above the last seen id (list is newest first)", () => {
  assert.equal(unreadCount([n("4"), n("3"), n("2"), n("1")], "2"), 2);
});
test("null last seen counts all; an unknown last seen counts all", () => {
  assert.equal(unreadCount([n("2"), n("1")], null), 2);
  assert.equal(unreadCount([n("2"), n("1")], "zzz"), 2);
});
test("everything seen gives zero", () => {
  assert.equal(unreadCount([n("2"), n("1")], "2"), 0);
  assert.equal(unreadCount([], "2"), 0);
});
test("a favourite notification returns the status id and a type-specific text key", () => {
  const d = describeNotification(n("1", "favourite", "sX"), t);
  assert.equal(d.statusId, "sX");
  assert.match(d.text, /^notification\.favourite\|Bea/);
});
test("dislike and reaction have their own text", () => {
  assert.match(describeNotification(n("1", "dislike"), t).text, /^notification\.dislike/);
  assert.match(describeNotification(n("1", "reaction"), t).text, /^notification\.reaction/);
});
test("an unknown type is described generically without throwing", () => {
  const d = describeNotification(n("1", "zzz"), t);
  assert.match(d.text, /^notification\.unknown\|Bea\|zzz/);
});
test("a notification without a status has a null statusId (e.g. follow)", () => {
  assert.equal(describeNotification(n("1", "follow", null), t).statusId, null);
});

test("startPolling calls onUpdate each tick, skips hidden ticks, and stops", async () => {
  const ticks = [];
  let visible = true;
  const updates = [];
  const api = { get: async () => [n("1")] };
  const stop = startPolling({
    api, intervalMs: 60000, isVisible: () => visible, onUpdate: (x) => updates.push(x),
    setIntervalFn: (f) => { ticks.push(f); return 1; }, clearIntervalFn: () => { ticks.length = 0; },
  });
  await ticks[0]();
  visible = false;
  await ticks[0]();
  assert.equal(updates.length, 1);
  stop();
  assert.equal(ticks.length, 0);
});
test("a failing poll does not throw out of the tick", async () => {
  const ticks = [];
  startPolling({ api: { get: async () => { throw new Error("net"); } }, intervalMs: 1, isVisible: () => true, onUpdate() {}, setIntervalFn: (f) => { ticks.push(f); return 1; }, clearIntervalFn() {} });
  await assert.doesNotReject(ticks[0]());
});

test("the kinds xenomorph also sends (move, block, unfollow) have their own text, not the generic one", () => {
  for (const type of ["move", "block", "unfollow"]) {
    assert.match(describeNotification(n("1", type, null), t).text, new RegExp(`^notification\\.${type}\\|Bea`));
  }
});
test("a repaired follow says which kind it was, and explains itself in a note", () => {
  const silent = describeNotification({ ...n("1", "follow_repaired", null), xenomorph_reason: "silent-follow" }, t);
  assert.match(silent.text, /^notification\.follow_repaired_silent\|Bea/);
  assert.match(silent.note, /^notification\.repaired_note_silent/);
  const other = describeNotification({ ...n("1", "follow_repaired", null), xenomorph_reason: "follower-without-follow" }, t);
  assert.match(other.text, /^notification\.follow_repaired\|Bea/);
  assert.match(other.note, /^notification\.repaired_note_lost/);
  assert.equal(describeNotification(n("1", "favourite"), t).note, undefined);
});

import { loadHidden, saveHidden, withoutHidden } from "../app/js/notifications.js";
const store = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

test("notifications hidden on this device are left out of the list", () => {
  const list = [n("3"), n("2"), n("1")];
  assert.deepEqual(withoutHidden(list, new Set(["2"])).map((x) => x.id), ["3", "1"]);
  assert.deepEqual(withoutHidden(list, new Set()).map((x) => x.id), ["3", "2", "1"]);
});
test("the hidden ids are kept per key on the device and survive bad data; only the latest 200 are kept", () => {
  const s = store();
  assert.deepEqual([...loadHidden(s, "k")], []);
  saveHidden(s, "k", new Set(["a", "b"]));
  assert.deepEqual([...loadHidden(s, "k")].sort(), ["a", "b"]);
  assert.deepEqual([...loadHidden(s, "other")], []);
  s.setItem("bad", "not json");
  assert.deepEqual([...loadHidden(s, "bad")], []);
  saveHidden(s, "k", new Set(Array.from({ length: 250 }, (_, i) => `id${i}`)));
  assert.equal(loadHidden(s, "k").size, 200);
});
