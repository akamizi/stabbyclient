import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { swapCard } from "../app/js/card-swap.js";

function dom(inner = "") {
  const { document } = parseHTML(`<html><body><div id="list"><article id="old" class="status">${inner}</article></div></body></html>`);
  const fresh = document.createElement("article");
  fresh.className = "status";
  fresh.innerHTML = '<div class="thread" hidden></div><div class="ancestors" hidden></div><footer class="actions"></footer>';
  return { document, old: document.getElementById("old"), fresh };
}

test("the fresh card takes the old one's place", () => {
  const { document, old, fresh } = dom();
  swapCard(old, fresh);
  assert.equal(document.getElementById("old"), null);
  assert.equal(document.querySelector("#list").firstElementChild, fresh);
});
test("an open thread and open ancestors move over to the fresh card", () => {
  const { old, fresh } = dom('<div class="thread"><article class="reply">r</article></div><div class="ancestors"><article class="up">u</article></div>');
  swapCard(old, fresh);
  assert.ok(fresh.querySelector(":scope > .thread .reply"));
  assert.equal(fresh.querySelector(":scope > .thread").hidden, false);
  assert.ok(fresh.querySelector(":scope > .ancestors .up"));
  assert.equal(fresh.querySelectorAll(":scope > .thread").length, 1);
});
test("a closed thread stays closed and empty", () => {
  const { old, fresh } = dom('<div class="thread" hidden></div>');
  swapCard(old, fresh);
  assert.equal(fresh.querySelector(":scope > .thread").hidden, true);
});
test("a composer or inline form that is open stays under the card", () => {
  const { old, fresh } = dom('<form class="composer"><textarea>half written</textarea></form><form class="inline-form react-form"></form>');
  swapCard(old, fresh);
  assert.equal(fresh.querySelector(":scope > .composer textarea").textContent, "half written");
  assert.ok(fresh.querySelector(":scope > .inline-form"));
});
