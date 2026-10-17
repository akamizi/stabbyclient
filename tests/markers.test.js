import test from "node:test";
import assert from "node:assert/strict";
import { loadReadMarker, saveReadMarker } from "../app/js/markers.js";

const store = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};

test("the server's marker wins and is remembered locally", async () => {
  const storage = store({ k: "local" });
  const api = { get: async (p, q) => { assert.equal(p, "/api/v1/markers"); assert.equal(q["timeline[]"], "notifications"); return { notifications: { last_read_id: "srv" } }; } };
  assert.equal(await loadReadMarker({ api, storage, key: "k" }), "srv");
  assert.equal(storage.getItem("k"), "srv");
});
test("with no marker on the server the local one is used", async () => {
  const storage = store({ k: "local" });
  assert.equal(await loadReadMarker({ api: { get: async () => ({}) }, storage, key: "k" }), "local");
});
test("when the server cannot be reached the local marker is used", async () => {
  const storage = store({ k: "local" });
  assert.equal(await loadReadMarker({ api: { get: async () => { throw new TypeError("x"); } }, storage, key: "k" }), "local");
  assert.equal(await loadReadMarker({ api: { get: async () => { throw new TypeError("x"); } }, storage: store(), key: "k" }), null);
});
test("saving writes locally first, then to the server as notifications[last_read_id]", async () => {
  const storage = store();
  const sent = [];
  const api = { postJson: async (p, body) => { sent.push([p, body]); return {}; } };
  assert.equal(await saveReadMarker({ api, storage, key: "k", id: "42" }), true);
  assert.equal(storage.getItem("k"), "42");
  assert.deepEqual(sent, [["/api/v1/markers", { notifications: { last_read_id: "42" } }]]);
});
test("if the server refuses, the local marker is still kept and false says so", async () => {
  const storage = store();
  const api = { postJson: async () => { throw new Error("x"); } };
  assert.equal(await saveReadMarker({ api, storage, key: "k", id: "7" }), false);
  assert.equal(storage.getItem("k"), "7");
});
