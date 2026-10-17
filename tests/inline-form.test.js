import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { createInlineForm } from "../app/js/inline-form.js";

const t = (k) => k;
const tick = () => new Promise((r) => setTimeout(r, 0));
function mk(over = {}) {
  const { document } = parseHTML("<html><body></body></html>");
  const submitted = [];
  const form = createInlineForm({
    doc: document, t, className: "edit", initial: "old", multiline: true, submitLabel: "save",
    onSubmit: async (v) => { submitted.push(v); if (over.fail) throw new Error("no"); }, ...over,
  });
  document.body.append(form);
  return { document, form, submitted };
}

test("it starts with the given text and submits the trimmed value", async () => {
  const { form, submitted } = mk();
  const field = form.querySelector("textarea");
  assert.equal(field.value, "old");
  field.value = "  new text ";
  await form.onsubmit({ preventDefault() {} });
  assert.deepEqual(submitted, ["new text"]);
});
test("an empty value is not submitted", async () => {
  const { form, submitted } = mk();
  form.querySelector("textarea").value = "   ";
  await form.onsubmit({ preventDefault() {} });
  assert.deepEqual(submitted, []);
});
test("cancel removes the form; a failure keeps it and shows an error", async () => {
  const a = mk();
  a.form.querySelector("button.cancel").onclick();
  assert.equal(a.document.querySelector("form"), null);
  const b = mk({ fail: true });
  await b.form.onsubmit({ preventDefault() {} });
  assert.ok(b.document.querySelector("form"));
  assert.match(b.form.querySelector(".error").textContent, /error\.action_failed/);
});
test("single-line mode uses an input", () => {
  const { form } = mk({ multiline: false, initial: "" });
  assert.ok(form.querySelector("input[type=text]"));
  assert.equal(form.querySelector("textarea"), null);
});

test("a decorate hook can add something to the form, given the field", () => {
  const { document } = parseHTML("<html><body></body></html>");
  const seen = [];
  const form = createInlineForm({ doc: document, t, className: "x", multiline: false, submitLabel: "go", onSubmit() {}, decorate: (field, f) => { seen.push(field.tagName); f.append(document.createElement("aside")); } });
  assert.deepEqual(seen, ["INPUT"]);
  assert.ok(form.querySelector("aside"));
});
