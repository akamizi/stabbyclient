import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseHTML } from "linkedom";
import { createComposer } from "../app/js/composer.js";
import { renderStatusCard } from "../app/js/status-card.js";

const css = readFileSync(new URL("../app/css/app.css", import.meta.url), "utf8");
const { document } = parseHTML("<html><body></body></html>");
const t = (k) => k;

test("every kind of button has its rule in the stylesheet", () => {
  for (const kind of ["primary", "secondary", "danger", "quote"]) {
    assert.match(css, new RegExp(`:root button\\.btn-${kind} \\{`), kind);
  }
});
test("the danger kind is the only one coloured red, and the high-contrast theme also marks it by its border", () => {
  const red = css.split("\n").filter((l) => l.startsWith(":root button.btn-") && l.includes("var(--danger)"));
  assert.equal(red.length, 1);
  assert.match(css, /data-theme="contrast"\] button\.btn-danger \{ border-style: dashed/);
});
test("in the composer Send is primary, Cancel and Emoji secondary, Quote its own kind", () => {
  const el = createComposer({ doc: document, api: {}, t, storage: null, target: { key: "reply:1", inReplyToId: "1", canQuote: true }, onQuote() {}, onCancel() {} });
  assert.ok(el.querySelector("button[type=submit]").classList.contains("btn-primary"));
  assert.ok(el.querySelector("button.cancel").classList.contains("btn-secondary"));
  assert.ok(el.querySelector("button.emoji").classList.contains("btn-secondary"));
  assert.ok(el.querySelector("button.quote").classList.contains("btn-quote"));
});
test("on a post, Reply is of the quote kind and Dislike has no special kind", () => {
  const status = {
    id: "1", content: "<p>x</p>", spoiler_text: "", sensitive: false, visibility: "public", created_at: "2026-10-16T10:00:00Z",
    replies_count: 0, reblogs_count: 0, favourites_count: 0, media_attachments: [], reblog: null,
    account: { id: "a", acct: "anna", display_name: "Anna", avatar: "https://h/a.png", url: "https://h/anna" },
  };
  const card = renderStatusCard(status, { doc: document, t, actions: { onReply() {}, onFavourite() {}, onDislike() {}, onToggleThread() {} } });
  assert.ok(card.querySelector("button.reply").classList.contains("btn-quote"));
  assert.equal(card.querySelector("button.dislike").className.includes("btn-"), false);
});

test("the tabs size themselves by their names and wrap rather than being cut off", () => {
  assert.match(css, /\.tabs \{ flex-wrap: wrap; \}/);
  assert.match(css, /\.tabs button \{ flex: 1 1 auto; \}/);
});

test("the tabs are in the header and become a bottom bar on a phone", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("../app/css/app.css", import.meta.url), "utf8");
  const app = readFileSync(new URL("../app/js/app.js", import.meta.url), "utf8");
  const html = readFileSync(new URL("../app/index.html", import.meta.url), "utf8");
  assert.match(css, /@media \(max-width: 40rem\) and \(min-height: 30rem\)/);
  assert.match(css, /\.topbar \.tabs \{ position: fixed;/);
  assert.match(app, /topbar\.append\(nav\)/);
  assert.match(html, /viewport-fit=cover/);
});
