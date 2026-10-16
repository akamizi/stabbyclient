import test from "node:test";
import assert from "node:assert/strict";
import { setFavourite, setDislike } from "../app/js/statuses.js";

function fakeApi(result = { id: "7", disliked: true }) {
  const calls = [];
  return { calls, post: async (path, body) => { calls.push([path, body]); return result; } };
}

test("setDislike(true) posts to /dislike and returns the updated status", async () => {
  const api = fakeApi();
  const st = await setDislike(api, "7", true);
  assert.equal(api.calls[0][0], "/api/v1/statuses/7/dislike");
  assert.deepEqual(st, { id: "7", disliked: true });
});
test("setDislike(false) posts to /undislike", async () => {
  const api = fakeApi();
  await setDislike(api, "7", false);
  assert.equal(api.calls[0][0], "/api/v1/statuses/7/undislike");
});
test("setFavourite uses favourite / unfavourite", async () => {
  const api = fakeApi();
  await setFavourite(api, "7", true);
  await setFavourite(api, "7", false);
  assert.deepEqual(api.calls.map((c) => c[0]), ["/api/v1/statuses/7/favourite", "/api/v1/statuses/7/unfavourite"]);
});
test("a failing post rejects so the UI can report it", async () => {
  const api = { post: async () => { throw new Error("offline"); } };
  await assert.rejects(setDislike(api, "7", true), /offline/);
});
test("ids are URL-encoded", async () => {
  const api = fakeApi();
  await setDislike(api, "a/b", true);
  assert.equal(api.calls[0][0], "/api/v1/statuses/a%2Fb/dislike");
});
