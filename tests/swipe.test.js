import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { makeSwipeable } from "../app/js/swipe.js";

function setup(opts = {}) {
  const { document } = parseHTML("<html><body><li id='row'>x</li></body></html>");
  const el = document.getElementById("row");
  el.setPointerCapture = () => {};
  const swiped = [];
  const handle = makeSwipeable(el, { onSwipe: () => swiped.push(1), ...opts });
  const ev = (type, x, y = 0, extra = {}) => el[`on${type}`]({ pointerId: 1, button: 0, clientX: x, clientY: y, ...extra });
  return { el, swiped, handle, ev };
}

test("dragging a row sideways beyond the threshold and letting go dismisses it", () => {
  const { el, swiped, ev } = setup();
  ev("pointerdown", 200);
  ev("pointermove", 150);
  assert.match(el.style.transform, /translateX\(-50px\)/);
  ev("pointermove", 90);
  ev("pointerup", 90);
  assert.equal(swiped.length, 1);
  assert.match(el.style.transform, /translateX\(-100%\)/);
});
test("it works to the right as well", () => {
  const { swiped, ev } = setup();
  ev("pointerdown", 20);
  ev("pointermove", 80);
  ev("pointermove", 140);
  ev("pointerup", 140);
  assert.equal(swiped.length, 1);
});
test("a short drag snaps back and dismisses nothing", () => {
  const { el, swiped, ev } = setup();
  ev("pointerdown", 200);
  ev("pointermove", 160);
  ev("pointerup", 160);
  assert.equal(swiped.length, 0);
  assert.equal(el.style.transform, "");
});
test("a mostly vertical movement is a scroll, not a swipe", () => {
  const { el, swiped, ev } = setup();
  ev("pointerdown", 200, 100);
  ev("pointermove", 120, 300);
  ev("pointerup", 120, 300);
  assert.equal(swiped.length, 0);
  assert.equal(el.style.transform, "");
});
test("cancelling the touch puts the row back", () => {
  const { el, swiped, ev } = setup();
  ev("pointerdown", 200);
  ev("pointermove", 100);
  ev("pointercancel", 100);
  assert.equal(swiped.length, 0);
  assert.equal(el.style.transform, "");
});
test("a drag is told apart from a tap, so the tap that follows a drag does not open anything", () => {
  const { handle, ev } = setup();
  ev("pointerdown", 200);
  ev("pointerup", 200);
  assert.equal(handle.wasDragged(), false);
  ev("pointerdown", 200);
  ev("pointermove", 170);
  ev("pointerup", 170);
  assert.equal(handle.wasDragged(), true);
  ev("pointerdown", 200);
  assert.equal(handle.wasDragged(), false);
});
test("a right-button press and a threshold of one's own are respected", () => {
  const { swiped, ev } = setup({ threshold: 30 });
  ev("pointerdown", 200, 0, { button: 2 });
  ev("pointermove", 100);
  ev("pointerup", 100);
  assert.equal(swiped.length, 0);
  ev("pointerdown", 200);
  ev("pointermove", 165);
  ev("pointerup", 165);
  assert.equal(swiped.length, 1);
});
