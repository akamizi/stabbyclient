import test from "node:test";
import assert from "node:assert/strict";
import { buildAuthorizeUrl, createSession } from "../app/js/auth.js";

test("buildAuthorizeUrl targets /oauth/authorize with the code flow params", () => {
  const u = new URL(buildAuthorizeUrl({
    base: "https://x.example", clientId: "cid", redirectUri: "https://x.example/app/",
    scope: "read write", state: "st",
  }));
  assert.equal(u.pathname, "/oauth/authorize");
  assert.equal(u.searchParams.get("response_type"), "code");
  assert.equal(u.searchParams.get("client_id"), "cid");
  assert.equal(u.searchParams.get("redirect_uri"), "https://x.example/app/");
  assert.equal(u.searchParams.get("scope"), "read write");
  assert.equal(u.searchParams.get("state"), "st");
});

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

test("createSession round-trips and clears", () => {
  const s = createSession(memStorage());
  assert.equal(s.load(), null);
  s.save({ token: "abc" });
  assert.deepEqual(s.load(), { token: "abc" });
  s.clear();
  assert.equal(s.load(), null);
});
