import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { expireSession, forgetDevice } from "../app/js/session-expiry.js";

test("expiry clears the session and removes the write button, nothing else", () => {
  const { document } = parseHTML("<html><body><button class='fab'></button><div id='keep'></div></body></html>");
  let cleared = false;
  expireSession({ session: { clear: () => { cleared = true; } }, doc: document });
  assert.equal(cleared, true);
  assert.equal(document.querySelector(".fab"), null);
  assert.ok(document.getElementById("keep"));
});

test("expiry also forgets the remembered account when given storage", () => {
  const { document } = parseHTML("<html><body></body></html>");
  const removed = [];
  expireSession({ session: { clear() {} }, doc: document, storage: { removeItem: (k) => removed.push(k) } });
  assert.deepEqual(removed, ["stabbyclient.me"]);
});

test("expiry drops every cached timeline but leaves the drafts", () => {
  const { document } = parseHTML("<html><body></body></html>");
  const m = new Map([["stabbyclient.timeline.7", "[]"], ["stabbyclient.timeline.7.groups", "[]"], ["stabbyclient.draft.7", "typed"]]);
  const storage = {
    get length() { return m.size; }, key: (i) => [...m.keys()][i],
    removeItem: (k) => m.delete(k), getItem: (k) => m.get(k) ?? null,
  };
  expireSession({ session: { clear() {} }, doc: document, storage });
  assert.deepEqual([...m.keys()], ["stabbyclient.draft.7"]);
});

test("logging out leaves nothing of the account on the device, only how the app looks", () => {
  const m = new Map([
    ["stabbyclient.session", "{}"], ["stabbyclient.app", "{\"client_secret\":\"s\"}"], ["stabbyclient.me", "{}"],
    ["stabbyclient.timeline.7", "[]"], ["stabbyclient.draft.7", "typed"], ["stabbyclient.notif-hidden.7", "[]"],
    ["stabbyclient.notif-seen.7", "9"], ["stabbyclient.emoji-recent", "[]"], ["stabbyclient.announcements", "[]"],
    ["stabbyclient.theme", "dark"], ["stabbyclient.font", "mono"], ["stabbyclient.lang", "it"], ["other.site", "x"],
  ]);
  forgetDevice({ get length() { return m.size; }, key: (i) => [...m.keys()][i], removeItem: (k) => m.delete(k) });
  assert.deepEqual([...m.keys()], ["stabbyclient.theme", "stabbyclient.font", "stabbyclient.lang", "other.site"]);
  assert.doesNotThrow(() => forgetDevice({ get length() { throw new Error("blocked"); } }));
});
