import test from "node:test";
import assert from "node:assert/strict";
import { resolveLang, createI18n } from "../app/js/i18n.js";
import en from "../app/js/locales/en.js";
import it from "../app/js/locales/it.js";

test("auto picks the first supported browser language", () => {
  assert.equal(resolveLang("auto", ["it-IT", "en"]), "it");
});
test("auto falls back to English for unsupported languages", () => {
  assert.equal(resolveLang("auto", ["fr"]), "en");
});
test("an explicit choice wins over the browser", () => {
  assert.equal(resolveLang("it", []), "it");
});

const catalogs = { en: { a: "A", only_en: "Only EN", hello: "Hello {name}" }, it: { a: "A-it", hello: "Ciao {name}" } };

test("missing key in Italian falls back to English", () => {
  const i = createI18n({ catalogs, fallback: "en" });
  i.setLang("it", []);
  assert.equal(i.t("a"), "A-it");
  assert.equal(i.t("only_en"), "Only EN");
});
test("unknown key returns the key itself", () => {
  const i = createI18n({ catalogs, fallback: "en" });
  assert.equal(i.t("nope"), "nope");
});
test("params are filled", () => {
  const i = createI18n({ catalogs, fallback: "en" });
  i.setLang("it", []);
  assert.equal(i.t("hello", { name: "A" }), "Ciao A");
});
test("catalog parity: en and it have the same keys", () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(it).sort());
});

test("count === 1 uses the _one variant when it exists", () => {
  const i = createI18n({ catalogs: { en: { r: "{count} replies", r_one: "{count} reply" } }, fallback: "en" });
  assert.equal(i.t("r", { count: 1 }), "1 reply");
  assert.equal(i.t("r", { count: 3 }), "3 replies");
  assert.equal(i.t("r", { count: 0 }), "0 replies");
});
test("a missing _one variant falls back to the base key", () => {
  const i = createI18n({ catalogs: { en: { r: "{count} things" } }, fallback: "en" });
  assert.equal(i.t("r", { count: 1 }), "1 things");
});
