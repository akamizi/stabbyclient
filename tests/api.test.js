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
test("only the routes xenomorph keeps for its own UI carry the UI marker header", async () => {
  const { seen, api } = recorder("[]");
  await api.get("/api/v1/xenomorph/drafts");
  await api.getPage("/api/v1/xenomorph/admirations", { limit: "20" });
  await api.postJson("/api/v1/xenomorph/publish-draft", { id: "1" });
  await api.get("/api/v1/timelines/home");
  assert.equal(seen[0].headers["X-Xenomorph-UI"], "1");
  assert.equal(seen[1].headers["X-Xenomorph-UI"], "1");
  assert.equal(seen[2].headers["X-Xenomorph-UI"], "1");
  assert.equal(seen[3].headers["X-Xenomorph-UI"], undefined);
});

test("post with { ui: true } carries the UI marker even on an ordinary route", async () => {
  const { seen, api } = recorder();
  await api.post("/api/v1/statuses", new URLSearchParams({ a: "b" }), { ui: true });
  await api.post("/api/v1/statuses", new URLSearchParams({ a: "b" }));
  assert.equal(seen[0].headers["X-Xenomorph-UI"], "1");
  assert.equal(seen[1].headers["X-Xenomorph-UI"], undefined);
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
