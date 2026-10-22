import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { expireSession } from "../app/js/session-expiry.js";

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
