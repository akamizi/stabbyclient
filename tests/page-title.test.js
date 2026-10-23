import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { createPageTitle } from "../app/js/page-title.js";

function setup() {
  const { document } = parseHTML("<html><head><title>Stabbyclient</title></head><body><h1 id='view-title'>Stabbyclient</h1></body></html>");
  return { document, set: createPageTitle({ doc: document }) };
}

test("the tab title and the main heading follow the page being shown", () => {
  const { document, set } = setup();
  set("Notifiche");
  assert.equal(document.title, "Notifiche — Stabbyclient");
  assert.equal(document.getElementById("view-title").textContent, "Notifiche");
});
test("an empty name goes back to the app's own", () => {
  const { document, set } = setup();
  set("Home");
  set("");
  assert.equal(document.title, "Stabbyclient");
  assert.equal(document.getElementById("view-title").textContent, "Stabbyclient");
});
