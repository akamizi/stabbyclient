import test from "node:test";
import assert from "node:assert/strict";
import { parseShare, leaveUrl, keepShare, takeShare, findReplyTarget } from "../app/js/share-intent.js";

const store = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };

test("a share link gives its text, the post it answers and where to go after", () => {
  assert.deepEqual(parseShare("?share=Hello%20%23ada&inReplyTo=https%3A%2F%2Fh%2Fp%2F1&on-success=https%3A%2F%2Fa.org&on-cancel=(close)"),
    { text: "Hello #ada", inReplyTo: "https://h/p/1", onSuccess: "https://a.org", onCancel: "(close)" });
  assert.deepEqual(parseShare("?share="), { text: "", inReplyTo: "", onSuccess: "", onCancel: "" });
});

test("anything else is not a share link", () => {
  assert.equal(parseShare(""), null);
  assert.equal(parseShare("?code=abc&state=x"), null);
});

test("the way back goes through the server's /leave", () => {
  assert.equal(leaveUrl("https://a.org/x?y=1"), "/leave?to=https%3A%2F%2Fa.org%2Fx%3Fy%3D1");
  assert.equal(leaveUrl(""), "");
});

test("a kept share is read once, and a damaged one is ignored", () => {
  const s = store();
  keepShare(s, { text: "hi", inReplyTo: "", onSuccess: "", onCancel: "" });
  assert.equal(takeShare(s).text, "hi");
  assert.equal(takeShare(s), null);
  s.setItem("stabbyclient.share", "{oops");
  assert.equal(takeShare(s), null);
});

test("the post a reply answers is searched by address, and null when unknown or on error", async () => {
  let args;
  const api = { get: async (p, q) => { args = [p, q]; return { statuses: [{ id: "5" }] }; } };
  assert.equal((await findReplyTarget(api, "https://h/p/1")).id, "5");
  assert.deepEqual(args, ["/api/v2/search", { q: "https://h/p/1", type: "statuses", resolve: "true" }]);
  assert.equal(await findReplyTarget({ get: async () => ({ statuses: [] }) }, "https://h/p/2"), null);
  assert.equal(await findReplyTarget({ get: async () => { throw new Error("x"); } }, "https://h/p/3"), null);
  assert.equal(await findReplyTarget(api, ""), null);
});
