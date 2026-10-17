import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { htmlFromEditor, textToHtml, htmlToPlain, createRichEditor } from "../app/js/rich-editor.js";

const { document } = parseHTML("<html><body></body></html>");
const root = (html) => { const d = document.createElement("div"); d.innerHTML = html; return d; };
const t = (k) => k;

test("bold, italic and strike-through come out as strong, em and del; text is escaped", () => {
  assert.equal(htmlFromEditor(root("a <b>bold</b> <i>it</i> <strike>gone</strike> &lt;x&gt;")), "a <strong>bold</strong> <em>it</em> <del>gone</del> &lt;x&gt;");
  assert.equal(htmlFromEditor(root("<strong>s</strong><em>e</em><s>x</s><del>d</del>")), "<strong>s</strong><em>e</em><del>x</del><del>d</del>");
});
test("anything else is dropped but its text stays; attributes and scripts never come through", () => {
  assert.equal(htmlFromEditor(root('<span style="color:red" onclick="x()">plain</span><script>alert(1)</script><a href="javascript:1">link</a>')), "plainlink");
  assert.equal(htmlFromEditor(root('<img src=x onerror=alert(1)>text')), "text");
});
test("a span that only carries a style is read as the formatting it stands for", () => {
  assert.equal(htmlFromEditor(root('<span style="font-weight: bold">b</span><span style="font-style:italic">i</span><span style="text-decoration: line-through">s</span>')), "<strong>b</strong><em>i</em><del>s</del>");
});
test("lines (div and br in the editor) become line breaks", () => {
  assert.equal(htmlFromEditor(root("one<div>two</div><div>three</div>")), "one<br>two<br>three");
  assert.equal(htmlFromEditor(root("one<br>two")), "one<br>two");
  assert.equal(htmlFromEditor(root("<div>one</div><div><br></div><div>three</div>")), "one<br><br>three");
});
test("an editor holding only blanks is empty", () => {
  assert.equal(htmlFromEditor(root("<br>")), "");
  assert.equal(htmlFromEditor(root("")), "");
  assert.equal(htmlFromEditor(root("<div><br></div>")), "");
});
test("plain text goes in with its line breaks and nothing is taken for markup", () => {
  assert.equal(textToHtml("a < b & c\nnext"), "a &lt; b &amp; c<br>next");
  assert.equal(textToHtml(""), "");
});
test("going back to plain text keeps the words and the lines", () => {
  assert.equal(htmlToPlain("a <strong>b</strong><br>c &amp; d"), "a b\nc & d");
});

test("the toolbar has bold, italic and strike-through, each running its command", () => {
  const seen = [];
  const doc = parseHTML("<html><body></body></html>").document;
  doc.execCommand = (cmd, ui, val) => { seen.push(cmd); return true; };
  const ed = createRichEditor({ doc, t });
  const buttons = [...ed.toolbar.querySelectorAll("button")];
  assert.deepEqual(buttons.map((b) => b.className.split(" ")[0]), ["bold", "italic", "strike"]);
  for (const b of buttons) b.onmousedown?.({ preventDefault() {} });
  for (const b of buttons) b.onclick();
  assert.deepEqual(seen.filter((c) => c !== "styleWithCSS"), ["bold", "italic", "strikeThrough"]);
  assert.ok(buttons.every((b) => b.getAttribute("aria-label")));
});
test("the editor is an editable area that reports its html, empty state and plain text", () => {
  const doc = parseHTML("<html><body></body></html>").document;
  const ed = createRichEditor({ doc, t });
  assert.equal(ed.element.getAttribute("contenteditable"), "true");
  assert.equal(ed.element.getAttribute("role"), "textbox");
  assert.equal(ed.isEmpty(), true);
  ed.setHtml("hi <b>there</b>");
  assert.equal(ed.html(), "hi <strong>there</strong>");
  assert.equal(ed.plain(), "hi there");
  assert.equal(ed.isEmpty(), false);
  ed.setPlain("a\nb");
  assert.equal(ed.html(), "a<br>b");
  ed.clear();
  assert.equal(ed.isEmpty(), true);
});
test("pasted text is taken as plain text, not as foreign markup", () => {
  const doc = parseHTML("<html><body></body></html>").document;
  const inserted = [];
  doc.execCommand = (cmd, ui, val) => { inserted.push([cmd, val]); return true; };
  const ed = createRichEditor({ doc, t });
  let prevented = false;
  ed.element.onpaste({ preventDefault() { prevented = true; }, clipboardData: { getData: (type) => (type === "text/plain" ? "just <b>text</b>" : "<b>x</b>") } });
  assert.equal(prevented, true);
  assert.deepEqual(inserted.filter(([c]) => c === "insertText"), [["insertText", "just <b>text</b>"]]);
});
