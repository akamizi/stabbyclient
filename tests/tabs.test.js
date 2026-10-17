import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { markActiveTab } from "../app/js/tabs.js";

function tabs() {
  const { document } = parseHTML("<html><body></body></html>");
  const make = () => document.createElement("button");
  return { home: make(), federated: make(), groups: make(), notifications: make() };
}

test("the selected list is marked and announced; the others are not", () => {
  const t = tabs();
  markActiveTab(t, "federated");
  assert.equal(t.federated.classList.contains("active"), true);
  assert.equal(t.federated.getAttribute("aria-current"), "page");
  for (const k of ["home", "groups", "notifications"]) {
    assert.equal(t[k].classList.contains("active"), false, k);
    assert.equal(t[k].getAttribute("aria-current"), null, k);
  }
});
test("switching moves the mark", () => {
  const t = tabs();
  markActiveTab(t, "home");
  markActiveTab(t, "notifications");
  assert.equal(t.home.classList.contains("active"), false);
  assert.equal(t.home.getAttribute("aria-current"), null);
  assert.equal(t.notifications.classList.contains("active"), true);
});
test("on a page that is not one of the four lists (a profile, More, a single post) none is marked", () => {
  const t = tabs();
  markActiveTab(t, "home");
  markActiveTab(t, "profile");
  assert.ok(Object.values(t).every((b) => !b.classList.contains("active") && b.getAttribute("aria-current") === null));
});
