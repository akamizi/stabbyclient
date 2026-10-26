import test from "node:test";
import assert from "node:assert/strict";
import { formatPostTime } from "../app/js/post-time.js";

const t = (k, p = {}) => `${k}|${p.time ?? ""}`;
const now = new Date(2026, 9, 26, 15, 0);
const hm = (d) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

test("a post of today says today and the time", () => {
  const d = new Date(2026, 9, 26, 14, 34);
  assert.equal(formatPostTime(d.toISOString(), t, now), `time.today|${hm(d)}`);
});
test("a post of yesterday says yesterday, even a few minutes after midnight", () => {
  const d = new Date(2026, 9, 25, 23, 3);
  assert.equal(formatPostTime(d.toISOString(), t, now), `time.yesterday|${hm(d)}`);
  const early = new Date(2026, 9, 26, 0, 5);
  assert.match(formatPostTime(early.toISOString(), t, new Date(2026, 9, 26, 0, 10)), /^time\.today/);
});
test("older posts keep the full date, and a bad date is left as it came", () => {
  const d = new Date(2026, 9, 24, 12, 0);
  assert.equal(formatPostTime(d.toISOString(), t, now), d.toLocaleString());
  assert.equal(formatPostTime("nonsense", t, now), "nonsense");
});
