import test from "node:test";
import assert from "node:assert/strict";
import { parseLinkNext, createApi, ApiError } from "../app/js/api.js";

test("parseLinkNext returns the rel=next url", () => {
  const h = '<https://h/x?max_id=5>; rel="next", <https://h/y>; rel="prev"';
  assert.equal(parseLinkNext(h), "https://h/x?max_id=5");
});

test("parseLinkNext returns null for a null header", () => {
  assert.equal(parseLinkNext(null), null);
});

test("a 401 calls onUnauthorized once across two calls and throws ApiError", async () => {
  let calls = 0;
  const fetchFn = async () => new Response("{}", { status: 401 });
  const api = createApi({ fetchFn, getToken: () => "t", onUnauthorized: () => { calls++; } });
  for (let i = 0; i < 2; i++) {
    await assert.rejects(api.get("/api/v1/x"), (e) => e instanceof ApiError && e.status === 401);
  }
  assert.equal(calls, 1);
});

test("getPage returns items and the next link", async () => {
  const fetchFn = async () =>
    new Response("[1,2]", { status: 200, headers: { Link: '<https://h/n>; rel="next"' } });
  const api = createApi({ fetchFn, getToken: () => "t", onUnauthorized() {} });
  assert.deepEqual(await api.getPage("/api/v1/timelines/home"), { items: [1, 2], next: "https://h/n" });
});

test("a 422 on verify_credentials counts as unauthorized (server quirk)", async () => {
  let calls = 0;
  const fetchFn = async () => new Response("{}", { status: 422 });
  const api = createApi({ fetchFn, getToken: () => "t", onUnauthorized: () => { calls++; } });
  await assert.rejects(api.get("/api/v1/accounts/verify_credentials"), (e) => e.status === 422);
  assert.equal(calls, 1);
});

test("a 422 elsewhere does not log the user out", async () => {
  let calls = 0;
  const fetchFn = async () => new Response("{}", { status: 422 });
  const api = createApi({ fetchFn, getToken: () => "t", onUnauthorized: () => { calls++; } });
  await assert.rejects(api.post("/api/v1/statuses", new URLSearchParams()), (e) => e.status === 422);
  assert.equal(calls, 0);
});

function recorder(body = "{}") {
  const seen = [];
  const fetchFn = async (url, o) => { seen.push({ url, ...o }); return new Response(body, { status: 200 }); };
  return { seen, api: createApi({ fetchFn, getToken: () => "t", onUnauthorized() {} }) };
}

test("postJson sends a JSON body with its content type", async () => {
  const { seen, api } = recorder();
  await api.postJson("/api/v1/lists", { title: "x" });
  assert.equal(seen[0].method, "POST");
  assert.equal(seen[0].headers["Content-Type"], "application/json");
  assert.equal(seen[0].body, '{"title":"x"}');
});
test("del sends DELETE, with an optional JSON body", async () => {
  const { seen, api } = recorder();
  await api.del("/api/v1/lists/1");
  await api.del("/api/v1/lists/1/accounts", { account_ids: ["2"] });
  assert.equal(seen[0].method, "DELETE");
  assert.equal(seen[0].body, undefined);
  assert.equal(seen[1].body, '{"account_ids":["2"]}');
  assert.equal(seen[1].headers["Content-Type"], "application/json");
});
test("del answers null when the server sends no JSON", async () => {
  const { api } = recorder("");
  assert.equal(await api.del("/api/v1/lists/1"), null);
});
test("only the routes stabbypossum keeps for its own UI carry the UI marker header", async () => {
  const { seen, api } = recorder("[]");
  await api.get("/api/v1/stabbypossum/drafts");
  await api.getPage("/api/v1/stabbypossum/admirations", { limit: "20" });
  await api.postJson("/api/v1/stabbypossum/publish-draft", { id: "1" });
  await api.get("/api/v1/stabbypossum/limited", { actor: "https://h/@bob" });
  await api.postJson("/api/v1/stabbypossum/limit", { actor: "x", limited: true });
  await api.get("/api/v1/timelines/home");
  assert.equal(seen[3].headers["X-Instance-UI"], "1");
  assert.equal(seen[4].headers["X-Instance-UI"], "1");
  assert.equal(seen[0].headers["X-Instance-UI"], "1");
  assert.equal(seen[1].headers["X-Instance-UI"], "1");
  assert.equal(seen[2].headers["X-Instance-UI"], "1");
  assert.equal(seen[5].headers["X-Instance-UI"], undefined);
});

test("post with { ui: true } carries the UI marker even on an ordinary route", async () => {
  const { seen, api } = recorder();
  await api.post("/api/v1/statuses", new URLSearchParams({ a: "b" }), { ui: true });
  await api.post("/api/v1/statuses", new URLSearchParams({ a: "b" }));
  assert.equal(seen[0].headers["X-Instance-UI"], "1");
  assert.equal(seen[1].headers["X-Instance-UI"], undefined);
});

test("putJson sends PUT with a JSON body", async () => {
  const { seen, api } = recorder();
  await api.putJson("/api/v1/statuses/1", { status: "x" });
  assert.equal(seen[0].method, "PUT");
  assert.equal(seen[0].body, '{"status":"x"}');
});

test("every request bypasses the browser's HTTP cache, so a 304 can never serve an old timeline", async () => {
  const { seen, api } = recorder("[]");
  await api.get("/api/v1/timelines/home");
  await api.getPage("/api/v1/timelines/home", { limit: "20" });
  await api.postJson("/api/v1/lists", {});
  assert.deepEqual(seen.map((c) => c.cache), ["no-store", "no-store", "no-store"]);
});

test("every request can time out, so a lost connection ends in an error instead of waiting forever", async () => {
  const { seen, api } = recorder("[]");
  await api.get("/api/v1/timelines/home");
  await api.postJson("/api/v1/lists", {});
  await api.postForm("/api/v1/media", new FormData());
  assert.ok(seen.every((c) => c.signal instanceof AbortSignal));
});
test("a request that never answers is cut off with a timeout error", async () => {
  const fetchFn = (url, o) => new Promise((_, reject) => o.signal.addEventListener("abort", () => reject(o.signal.reason)));
  const api = createApi({ fetchFn, getToken: () => "t", onUnauthorized() {}, timeoutMs: 20 });
  await assert.rejects(api.get("/api/v1/x"), (e) => e.name === "TimeoutError");
});

test("a refusal carries the server's own explanation when it gives one", async () => {
  const fetchFn = async () => new Response(JSON.stringify({ error: "not a feed" }), { status: 422, headers: { "Content-Type": "application/json" } });
  const api = createApi({ fetchFn, getToken: () => "t", onUnauthorized() {} });
  await assert.rejects(api.postJson("/api/v1/stabbypossum/feeds/create", { url: "x" }), (e) => e.status === 422 && e.detail === "not a feed");
  const plain = createApi({ fetchFn: async () => new Response("oops", { status: 500 }), getToken: () => "t", onUnauthorized() {} });
  await assert.rejects(plain.get("/api/v1/x"), (e) => e.status === 500 && e.detail === undefined);
});
test("the feeds routes of stabbypossum carry the UI marker", async () => {
  const { seen, api } = recorder("[]");
  await api.get("/api/v1/stabbypossum/feeds");
  await api.postJson("/api/v1/stabbypossum/feeds/create", { url: "x" });
  await api.postJson("/api/v1/stabbypossum/feeds/delete", { id: "1" });
  assert.ok(seen.every((c) => c.headers["X-Instance-UI"] === "1"));
});

test("a path that could leave this origin is refused before anything is sent, so the token cannot follow it", async () => {
  const { seen, api } = recorder("[]");
  for (const bad of ["//evil.example/x", "https://evil.example/x", "api/v1/x", "\\\\evil.example/x", "/\\evil.example/x", ""]) {
    await assert.rejects(api.get(bad), (e) => e instanceof TypeError, JSON.stringify(bad));
  }
  assert.equal(seen.length, 0);
  await api.get("/api/v1/timelines/home?limit=1");
  assert.equal(seen.length, 1);
});

function probing(statuses) {
  const seen = [];
  const fetchFn = async (url) => {
    seen.push(url);
    const status = url.startsWith("/api/v1/accounts/verify_credentials") ? statuses.probe : statuses.call;
    if (status === "throw") throw new TypeError("offline");
    return new Response("{}", { status });
  };
  let signedOut = 0;
  return { seen, api: createApi({ fetchFn, getToken: () => "t", onUnauthorized: () => { signedOut++; } }), signedOut: () => signedOut };
}

test("a 401 on an ordinary call signs the user out only when the token itself is found to be bad", async () => {
  const bad = probing({ call: 401, probe: 401 });
  await assert.rejects(bad.api.get("/api/v1/timelines/home"), (e) => e.status === 401);
  assert.equal(bad.signedOut(), 1);
  assert.ok(bad.seen.some((u) => u.startsWith("/api/v1/accounts/verify_credentials")));
  const stray = probing({ call: 401, probe: 200 });
  await assert.rejects(stray.api.get("/api/v1/stabbypossum/limited"), (e) => e.status === 403);
  assert.equal(stray.signedOut(), 0);
  const odd = probing({ call: 401, probe: 422 });
  await assert.rejects(odd.api.get("/api/v1/x"));
  assert.equal(odd.signedOut(), 1);
});
test("if the check itself cannot be made, nobody is signed out on a stray 401", async () => {
  const p = probing({ call: 401, probe: "throw" });
  await assert.rejects(p.api.get("/api/v1/x"), (e) => e.status === 403);
  assert.equal(p.signedOut(), 0);
});
test("a 401 on verify_credentials itself needs no second check", async () => {
  const p = probing({ call: 401, probe: 401 });
  await assert.rejects(p.api.get("/api/v1/accounts/verify_credentials"), (e) => e.status === 401);
  assert.equal(p.signedOut(), 1);
  assert.equal(p.seen.length, 1);
});
