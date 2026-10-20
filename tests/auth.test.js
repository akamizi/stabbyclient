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

import { beginLogin, completeLogin } from "../app/js/auth.js";

function store(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), has: (k) => m.has(k) };
}
const json = (o, status = 200) => new Response(JSON.stringify(o), { status });
const base = (over = {}) => ({
  redirectUri: "https://h/app/", scope: "read write follow", storage: store(), sessionStore: store(),
  session: { saved: null, save(s) { this.saved = s; } }, ...over,
});

test("beginLogin registers the app once, remembers it and returns the authorize address with a state", async () => {
  let registrations = 0;
  const fetchFn = async () => { registrations++; return json({ client_id: "cid", client_secret: "sec" }); };
  const env = base({ fetchFn });
  const url = await beginLogin({ ...env, newState: () => "st1" });
  assert.match(url, /^\/oauth\/authorize\?/);
  assert.match(url, /client_id=cid/);
  assert.match(url, /state=st1/);
  assert.equal(env.sessionStore.getItem("stabbyclient.state"), "st1");
  await beginLogin({ ...env, newState: () => "st2" });
  assert.equal(registrations, 1);
});
test("beginLogin offline leaves nothing half-saved and lets the error out", async () => {
  const env = base({ fetchFn: async () => { throw new TypeError("Failed to fetch"); } });
  await assert.rejects(beginLogin({ ...env, newState: () => "s" }), TypeError);
  assert.equal(env.storage.has("stabbyclient.app"), false);
});
test("a rejected registration is not remembered", async () => {
  const env = base({ fetchFn: async () => json({}, 500) });
  await assert.rejects(beginLogin({ ...env, newState: () => "s" }), /registration/);
  assert.equal(env.storage.has("stabbyclient.app"), false);
});

test("completeLogin with no code and no error does nothing", async () => {
  assert.deepEqual(await completeLogin({ ...base({ fetchFn: async () => json({}) }), search: "" }), { status: "none" });
});
test("completeLogin trades the code for a token and saves it", async () => {
  const env = base({ fetchFn: async () => json({ access_token: "tok" }), storage: store({ "stabbyclient.app": JSON.stringify({ client_id: "c", client_secret: "s" }) }), sessionStore: store({ "stabbyclient.state": "st" }) });
  const r = await completeLogin({ ...env, search: "?code=abc&state=st" });
  assert.deepEqual(r, { status: "ok" });
  assert.deepEqual(env.session.saved, { token: "tok" });
  assert.equal(env.sessionStore.getItem("stabbyclient.state"), null);
});
test("a different state is refused and nothing is saved", async () => {
  const env = base({ fetchFn: async () => json({ access_token: "tok" }), storage: store({ "stabbyclient.app": JSON.stringify({ client_id: "c", client_secret: "s" }) }), sessionStore: store({ "stabbyclient.state": "st" }) });
  const r = await completeLogin({ ...env, search: "?code=abc&state=other" });
  assert.equal(r.status, "failed");
  assert.equal(env.session.saved, null);
});
test("a refusal from the server (?error=access_denied) is reported as cancelled, not as a failure", async () => {
  const env = base({ fetchFn: async () => json({}), sessionStore: store({ "stabbyclient.state": "st" }) });
  const r = await completeLogin({ ...env, search: "?error=access_denied&state=st" });
  assert.deepEqual(r, { status: "denied" });
  assert.equal(env.sessionStore.getItem("stabbyclient.state"), null);
});
test("when the token is refused the stored app registration is dropped so the next login registers again", async () => {
  const env = base({ fetchFn: async () => json({ error: "invalid_client" }, 401), storage: store({ "stabbyclient.app": JSON.stringify({ client_id: "old", client_secret: "s" }) }), sessionStore: store({ "stabbyclient.state": "st" }) });
  const r = await completeLogin({ ...env, search: "?code=abc&state=st" });
  assert.equal(r.status, "failed");
  assert.equal(env.storage.has("stabbyclient.app"), false);
});
test("a network failure while trading the code keeps the registration (it may be fine) and says offline", async () => {
  const env = base({ fetchFn: async () => { throw new TypeError("Failed to fetch"); }, storage: store({ "stabbyclient.app": JSON.stringify({ client_id: "c", client_secret: "s" }) }), sessionStore: store({ "stabbyclient.state": "st" }) });
  const r = await completeLogin({ ...env, search: "?code=abc&state=st" });
  assert.deepEqual(r, { status: "failed", offline: true, reason: "Failed to fetch" });
  assert.equal(env.storage.has("stabbyclient.app"), true);
});
