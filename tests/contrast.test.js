import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The colour tokens of app.css, in both themes, checked against the contrast WCAG 2.1 AA asks for.
const css = readFileSync(new URL("../app/css/app.css", import.meta.url), "utf8");
function tokens(selector) {
  const block = css.match(new RegExp(`${selector.replace(/[[\]"]/g, "\\$&")}\\s*\\{([^}]*)\\}`))[1];
  return Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}
const light = tokens(":root");
const dark = { ...light, ...tokens(':root[data-theme="dark"]') };
const resolve = (theme, name) => {
  let v = theme[name];
  while (v && v.startsWith("var(")) v = theme[v.slice(6, -1)];
  return v;
};
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

for (const [name, theme] of [["light", light], ["dark", dark]]) {
  test(`${name}: text and links reach 4.5:1`, () => {
    for (const [fg, bg] of [["fg", "bg"], ["muted", "bg"], ["muted", "card"], ["accent", "bg"], ["accent", "card"], ["danger", "bg"], ["danger", "card"], ["bg", "accent"]]) {
      assert.ok(ratio(resolve(theme, fg), resolve(theme, bg)) >= 4.5, `${fg} on ${bg}`);
    }
  });
  test(`${name}: the edge of a field reaches 3:1 on the page and on a card`, () => {
    for (const bg of ["bg", "card"]) {
      assert.ok(ratio(resolve(theme, "field-border"), resolve(theme, bg)) >= 3, `field-border on ${bg}`);
    }
  });
}
test("every input, select and textarea border in the stylesheet uses the field token", () => {
  const stray = css.split("\n").filter((l) => /(input|select|textarea)[^{]*\{/.test(l) && l.includes("border: 1px solid var(--border)"));
  assert.deepEqual(stray, []);
});
