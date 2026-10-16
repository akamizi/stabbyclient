import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { sanitizeHtml } from "../app/js/sanitize.js";

const { document } = parseHTML("<html><body></body></html>");
function clean(html) {
  const box = document.createElement("div");
  box.append(sanitizeHtml(html, document));
  return box;
}

test("script elements are removed together with their content", () => {
  const b = clean("<script>alert(1)</script>x");
  assert.equal(b.querySelector("script"), null);
  assert.equal(b.textContent, "x");
});
test("javascript: links lose their href", () => {
  const a = clean('<a href="javascript:alert(1)">l</a>').querySelector("a");
  assert.ok(!a || !(a.getAttribute("href") || "").toLowerCase().includes("javascript"));
});
test("img with onerror is removed entirely", () => {
  const b = clean("<img src=x onerror=alert(1)>");
  assert.equal(b.querySelector("img"), null);
  assert.ok(!b.innerHTML.includes("onerror"));
});
test("a keeps href, drops onclick, gets rel noopener and target _blank", () => {
  const a = clean('<a href="https://e.org" onclick="x()">t</a>').querySelector("a");
  assert.equal(a.getAttribute("href"), "https://e.org");
  assert.equal(a.getAttribute("onclick"), null);
  assert.match(a.getAttribute("rel"), /noopener/);
  assert.equal(a.getAttribute("target"), "_blank");
});
test("allowed formatting survives, unknown wrappers are unwrapped", () => {
  const b = clean("<p>a <strong>b</strong> <custom-x>c</custom-x></p>");
  assert.equal(b.querySelector("strong").textContent, "b");
  assert.equal(b.textContent, "a b c");
});
test("style, iframe and svg are dropped with their content", () => {
  const b = clean("<style>p{}</style><iframe src=//e></iframe><svg><text>t</text></svg>ok");
  assert.equal(b.textContent, "ok");
});
test("mailto links are kept", () => {
  assert.equal(clean('<a href="mailto:a@b.c">m</a>').querySelector("a").getAttribute("href"), "mailto:a@b.c");
});
