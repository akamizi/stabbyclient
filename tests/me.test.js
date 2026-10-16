import test from "node:test";
import assert from "node:assert/strict";
import { loadMe, forgetMe } from "../app/js/me.js";
import { ApiError } from "../app/js/api.js";

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

test("success returns the account and remembers it", async () => {
  const s = memStorage();
  const r = await loadMe({ get: async () => ({ id: "a", acct: "x" }) }, s, "tokA");
  assert.deepEqual(r, { me: { id: "a", acct: "x" }, offline: false });
  const again = await loadMe({ get: async () => { throw new TypeError("network"); } }, s, "tokA");
  assert.deepEqual(again, { me: { id: "a", acct: "x" }, offline: true });
});
test("a network error with nothing remembered rethrows", async () => {
  await assert.rejects(loadMe({ get: async () => { throw new TypeError("network"); } }, memStorage(), "tokA"), /network/);
});
test("an HTTP error (e.g. 401) is never masked by the remembered account", async () => {
  const s = memStorage();
  await loadMe({ get: async () => ({ id: "a" }) }, s, "tokA");
  await assert.rejects(loadMe({ get: async () => { throw new ApiError(401, "unauthorized"); } }, s, "tokA"), (e) => e.status === 401);
});

test("a remembered account of another token is never used offline", async () => {
  const s = memStorage();
  await loadMe({ get: async () => ({ id: "a" }) }, s, "tokA");
  await assert.rejects(loadMe({ get: async () => { throw new TypeError("network"); } }, s, "tokB"), /network/);
});
test("forgetMe removes the remembered account", async () => {
  const s = memStorage();
  await loadMe({ get: async () => ({ id: "a" }) }, s, "tokA");
  forgetMe(s);
  await assert.rejects(loadMe({ get: async () => { throw new TypeError("network"); } }, s, "tokA"), /network/);
});
