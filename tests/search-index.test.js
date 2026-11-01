import test from "node:test";
import assert from "node:assert/strict";
import { INDEX_PATH, searchIndex } from "../app/js/search-index.js";

const answer = { statuses: [{ id: "1" }], accounts: [{ acct: "mario@h.org", display_name: "Mario" }], total: 1 };

test("the service's answer is returned, asked on the local path with the query and a short timeout", async () => {
  const seen = [];
  const api = { get: async (path, params, opts) => { seen.push([path, params, opts]); return answer; } };
  const signal = new AbortController().signal;
  assert.deepEqual(await searchIndex(api, "ada", { signal }), answer);
  assert.equal(INDEX_PATH, "/app/search/v1/search");
  assert.deepEqual(seen, [[INDEX_PATH, { q: "ada", limit: "20" }, { signal, timeoutMs: 10000 }]]);
});

test("a missing service, a refusal, a network error or an answer that is not the service's give null", async () => {
  const fails = [
    () => Promise.reject(Object.assign(new Error("x"), { status: 404 })),
    () => Promise.reject(Object.assign(new Error("x"), { status: 401 })),
    () => Promise.reject(Object.assign(new Error("x"), { status: 503 })),
    () => Promise.reject(new TypeError("Failed to fetch")),
    () => Promise.resolve([]),
    () => Promise.resolve({ error: "x" }),
    () => Promise.resolve("<html>"),
    () => Promise.resolve(null),
  ];
  for (const f of fails) assert.equal(await searchIndex({ get: f }, "ada"), null);
});

test("stopping or timing out is passed on, not turned into a fallback", async () => {
  for (const name of ["AbortError", "TimeoutError"]) {
    const api = { get: () => Promise.reject(new DOMException("x", name)) };
    await assert.rejects(searchIndex(api, "ada"), { name });
  }
});
