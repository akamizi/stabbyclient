import test from "node:test";
import assert from "node:assert/strict";
import { buildThread, limitVisible } from "../app/js/thread.js";

const root = { id: "r", created_at: "2026-10-16T10:00:00Z" };
const reply = (id, parent, min) => ({ id, in_reply_to_id: parent, created_at: `2026-10-16T10:${String(min).padStart(2, "0")}:00Z` });
const shape = (th) => th.nodes.map((n) => [n.status.id, n.depth]);

test("depth-first order with depths", () => {
  const th = buildThread(root, { ancestors: [], descendants: [reply("r2", "r", 5), reply("r1", "r", 1), reply("r1a", "r1", 2)] });
  assert.deepEqual(shape(th), [["r1", 1], ["r1a", 2], ["r2", 1]]);
});
test("a descendant whose parent is missing is kept at depth 1", () => {
  const th = buildThread(root, { ancestors: [], descendants: [reply("x", "gone", 1)] });
  assert.deepEqual(shape(th), [["x", 1]]);
});
test("self-parented and mutually-parented replies terminate and appear once", () => {
  const th = buildThread(root, { ancestors: [], descendants: [reply("s", "s", 1), reply("a", "b", 2), reply("b", "a", 3), reply("ok", "r", 4)] });
  const ids = th.nodes.map((n) => n.status.id).sort();
  assert.deepEqual(ids, ["a", "b", "ok", "s"]);
});
test("empty descendants give empty nodes and keep ancestors", () => {
  const th = buildThread(root, { ancestors: [{ id: "p" }], descendants: [] });
  assert.deepEqual(th.nodes, []);
  assert.deepEqual(th.ancestors, [{ id: "p" }]);
});
test("a missing context shape does not throw", () => {
  assert.deepEqual(buildThread(root, {}).nodes, []);
});
test("limitVisible hides the rest and reports the count", () => {
  const nodes = Array.from({ length: 8 }, (_, i) => ({ status: { id: String(i) }, depth: 1 }));
  const r = limitVisible(nodes, 5);
  assert.equal(r.visible.length, 5);
  assert.equal(r.hiddenCount, 3);
  assert.equal(limitVisible(nodes, 20).hiddenCount, 0);
});

import { replyMentions, mentionText } from "../app/js/thread.js";
const by = (id, acct) => ({ id, account: { acct } });

test("a reply mentions the author first, then the rest of the thread once each, never the reader", () => {
  const ctx = { ancestors: [by("a", "me"), by("b", "bob@x.org")], descendants: [by("c", "Carla"), by("d", "bob@x.org")] };
  assert.deepEqual(replyMentions(by("s", "ann"), ctx, "me"), ["ann", "bob@x.org", "Carla"]);
});
test("without a context only the author is mentioned; a post of mine mentions nobody", () => {
  assert.deepEqual(replyMentions(by("s", "ann"), null, "me"), ["ann"]);
  assert.deepEqual(replyMentions(by("s", "me"), null, "me"), []);
});
test("the mentions are text with a trailing space, or nothing", () => {
  assert.equal(mentionText(["a", "b@x"]), "@a @b@x ");
  assert.equal(mentionText([]), "");
});
