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
