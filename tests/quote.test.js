import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { quotedLines } from "../app/js/quote.js";

const { document } = parseHTML("<html><body></body></html>");

test("paragraphs become '> ' lines separated by an empty quote line", () => {
  assert.equal(quotedLines("<p>one</p><p>two</p>", document), "> one\n>\n> two");
});
test("line breaks inside a paragraph are kept as lines", () => {
  assert.equal(quotedLines("<p>one<br>two</p>", document), "> one\n> two");
});
test("the RE: paragraph some servers add is not quoted", () => {
  assert.equal(quotedLines('<p>text</p><p class="quote-inline">RE: link</p>', document), "> text");
});
test("markup is reduced to text, with nothing executable left", () => {
  assert.equal(quotedLines('<p>a <b>bold</b> <img src=x onerror=alert(1)> b</p>', document), "> a bold  b");
});
test("a post with no paragraphs is quoted as its text", () => {
  assert.equal(quotedLines("plain words", document), "> plain words");
});
