import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { createDeliveryMark, deliveryText } from "../app/js/delivery-mark.js";
import { getDeliveries } from "../app/js/statuses.js";
import { renderStatusCard } from "../app/js/status-card.js";
import { ApiError } from "../app/js/api.js";

const t = (k, p = {}) => k + (p.count !== undefined ? `:${p.count}` : "");
const tick = () => new Promise((r) => setTimeout(r, 0));
const make = (load, win) => {
  const { document } = parseHTML("<html><body></body></html>");
  const mark = createDeliveryMark({ doc: document, win, t, load, id: "7" });
  document.body.append(mark);
  return mark;
};

test("a mark stays hidden until the server answers, then shows colour, shape and counts", async () => {
  const mark = make(async () => ({ sent: 12, failed: 1, rate: 0, tarpit: 0, retry: 0, sending: 0, colour: "yellow" }));
  assert.equal(mark.hidden, true);
  await tick();
  assert.equal(mark.hidden, false);
  assert.ok(mark.classList.contains("delivery-yellow"));
  assert.equal(mark.getAttribute("aria-label"), "delivery.label: delivery.sent:12, delivery.failed:1");
  assert.equal(mark.title, "delivery.sent:12, delivery.failed:1");
});

test("no receipts, an error or an odd colour leave no mark", async () => {
  for (const load of [async () => null, async () => { throw new Error("x"); }, async () => ({ colour: "x y" })]) {
    const mark = make(load);
    await tick();
    assert.equal(mark.hidden, true);
  }
});

test("while a copy waits the server is asked again in a day, and not once the mark is gone", async () => {
  let asked = 0;
  const timers = [];
  const win = { setTimeout: (fn, ms) => timers.push([fn, ms]) };
  const mark = make(async () => (asked++, { sent: 0, rate: 2, colour: "purple" }), win);
  await tick();
  assert.deepEqual(timers.map((x) => x[1]), [86400000]);
  timers[0][0]();
  await tick();
  assert.equal(asked, 2);
  mark.remove();
  timers.at(-1)[0]();
  await tick();
  assert.equal(asked, 2);
});

test("a finished delivery is not asked again", async () => {
  const timers = [];
  make(async () => ({ sent: 3, colour: "green" }), { setTimeout: (...a) => timers.push(a) });
  await tick();
  assert.equal(timers.length, 0);
});

test("deliveryText lists only the states that have copies", () => {
  assert.equal(deliveryText({ sent: 1, rate: 0, retry: 2 }, t), "delivery.sent:1, delivery.retry:2");
});

test("getDeliveries gives null on 404 and passes other errors on", async () => {
  assert.equal(await getDeliveries({ get: async () => { throw new ApiError(404, "x"); } }, "5"), null);
  await assert.rejects(getDeliveries({ get: async () => { throw new ApiError(500, "x"); } }, "5"));
  let path;
  await getDeliveries({ get: async (p) => { path = p; return {}; } }, "a/b");
  assert.equal(path, "/api/v1/statuses/a%2Fb/deliveries");
});

test("only one's own posts, and boosts, get the mark in a card", () => {
  const { document } = parseHTML("<html><body></body></html>");
  const calls = [];
  const actions = { isOwn: (s) => s.account.id === "me", loadDeliveries: async (id) => (calls.push(id), null) };
  const post = (over) => ({ id: "1", content: "<p>x</p>", created_at: "2026-10-16T10:00:00Z", media_attachments: [], reblog: null, visibility: "public", account: { id: "me", acct: "me" }, ...over });
  const own = renderStatusCard(post({}), { doc: document, t, actions });
  const other = renderStatusCard(post({ id: "2", account: { id: "x", acct: "x" } }), { doc: document, t, actions });
  const boost = renderStatusCard(post({ id: "3", reblog: post({ id: "9", account: { id: "x", acct: "x" } }) }), { doc: document, t, actions });
  assert.ok(own.querySelector(".delivery"));
  assert.equal(other.querySelector(".delivery"), null);
  assert.ok(boost.querySelector(".delivery"));
  assert.deepEqual(calls, ["1", "3"]);
});
