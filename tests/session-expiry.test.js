import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { expireSession } from "../app/js/session-expiry.js";

test("expiry clears the session and removes the write button, nothing else", () => {
  const { document } = parseHTML("<html><body><button class='fab'></button><div id='keep'></div></body></html>");
  let cleared = false;
  expireSession({ session: { clear: () => { cleared = true; } }, doc: document });
  assert.equal(cleared, true);
  assert.equal(document.querySelector(".fab"), null);
  assert.ok(document.getElementById("keep"));
});
