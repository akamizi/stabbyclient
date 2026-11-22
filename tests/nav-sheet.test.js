import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import en from "../app/js/locales/en.js";
import it from "../app/js/locales/it.js";

const css = readFileSync(new URL("../app/css/app.css", import.meta.url), "utf8");
const app = readFileSync(new URL("../app/js/app.js", import.meta.url), "utf8");

test("on a phone the bar shows Timeline, Notifications and Search; the four timelines are for the desktop row", () => {
  assert.match(app, /timelineBtn\.classList\.add\("phone"\)/);
  assert.match(app, /searchBtn\.classList\.add\("phone"\)/);
  assert.match(app, /for \(const b of \[homeTab, fedTab, groupsTab\]\) b\.classList\.add\("desk"\)/);
  assert.match(app, /nav\.append\(homeTab, fedTab, groupsTab, timelineBtn, sheet, notifTab, searchBtn\)/);
  assert.match(css, /\.topbar \.tabs \.desk \{ display: none; \}/);
  assert.match(css, /\.topbar \.tabs \.phone, \.topbar \.tabs \.timeline-menu \{ display: none; \}/);
});

test("the Timeline sheet is a two-column grid that stays hidden while closed", () => {
  assert.match(css, /\.topbar \.tabs \.timeline-menu \{ display: grid; grid-template-columns: 1fr 1fr;/);
  assert.match(css, /\.topbar \.tabs \.timeline-menu\[hidden\] \{ display: none; \}/);
  assert.match(app, /sheet\.hidden = true;/);
});

test("Escape and a tap outside close the sheet", () => {
  assert.match(app, /e\.key === "Escape" && !sheet\.hidden/);
  assert.match(app, /if \(!sheet\.hidden && !nav\.contains\(e\.target\)\) setSheet\(false\)/);
});

test("the sheet and the bar labels are in both catalogs", () => {
  for (const key of ["nav.timeline", "nav.timeline_menu"]) {
    assert.ok(en[key], `en ${key}`);
    assert.ok(it[key], `it ${key}`);
  }
});
