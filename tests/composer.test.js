import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { buildStatusParams, saveDraft, loadDraft, clearAllDrafts, createComposer } from "../app/js/composer.js";
import { postStatus, uploadMedia } from "../app/js/statuses.js";

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

test("buildStatusParams includes only non-empty fields", () => {
  const p = buildStatusParams({ text: "hi", visibility: "public", inReplyToId: "9", spoiler: "", mediaIds: [] });
  assert.equal(p.get("status"), "hi");
  assert.equal(p.get("visibility"), "public");
  assert.equal(p.get("in_reply_to_id"), "9");
  assert.equal(p.has("spoiler_text"), false);
  assert.equal(p.has("media_ids[]"), false);
});
test("two media ids give two media_ids[] entries", () => {
  const p = buildStatusParams({ text: "x", mediaIds: ["a", "b"] });
  assert.deepEqual(p.getAll("media_ids[]"), ["a", "b"]);
});
test("a content warning is sent as spoiler_text", () => {
  assert.equal(buildStatusParams({ text: "x", spoiler: "cw" }).get("spoiler_text"), "cw");
});
test("drafts round-trip per key", () => {
  const s = memStorage();
  saveDraft(s, "new", "one");
  saveDraft(s, "reply:9", "two");
  assert.equal(loadDraft(s, "new"), "one");
  assert.equal(loadDraft(s, "reply:9"), "two");
  assert.equal(loadDraft(s, "none"), "");
});
test("postStatus posts to /api/v1/statuses and rejects on failure", async () => {
  const calls = [];
  const ok = { post: async (p, b) => { calls.push([p, b]); return { id: "1" }; } };
  const params = new URLSearchParams({ status: "x" });
  assert.deepEqual(await postStatus(ok, params), { id: "1" });
  assert.equal(calls[0][0], "/api/v1/statuses");
  await assert.rejects(postStatus({ post: async () => { throw new Error("offline"); } }, params), /offline/);
});
test("uploadMedia sends file and description to /api/v1/media", async () => {
  let seen;
  const api = { postForm: async (p, fd) => { seen = [p, fd]; return { id: "m1" }; } };
  const r = await uploadMedia(api, new File(["x"], "a.png", { type: "image/png" }), "a cat");
  assert.deepEqual(r, { id: "m1" });
  assert.equal(seen[0], "/api/v1/media");
  assert.equal(seen[1].get("description"), "a cat");
  assert.equal(seen[1].get("file").name, "a.png");
});

const t = (k) => k;
function mount({ api, storage = memStorage(), target = { key: "new" }, onPosted = () => {}, doc }) {
  const { document } = parseHTML("<html><body></body></html>");
  const el = createComposer({ doc: document, api, t, storage, target, onPosted });
  document.body.append(el);
  return { document, el, storage, text: el.querySelector("textarea") };
}

test("a failed send keeps the text, keeps the draft and shows an error", async () => {
  const api = { post: async () => { throw new Error("offline"); }, postForm: async () => ({ id: "m" }) };
  const { el, text, storage } = mount({ api });
  text.value = "my words";
  text.oninput?.();
  await el.onsubmit({ preventDefault() {} });
  assert.equal(text.value, "my words");
  assert.equal(loadDraft(storage, "new"), "my words");
  assert.ok(el.querySelector(".error").textContent.includes("composer.send_failed"));
});
test("a successful send clears text and draft and calls onPosted", async () => {
  let posted;
  const api = { post: async () => ({ id: "n1" }), postForm: async () => ({ id: "m" }) };
  const { el, text, storage } = mount({ api, onPosted: (s) => { posted = s; } });
  text.value = "hello";
  text.oninput?.();
  await el.onsubmit({ preventDefault() {} });
  assert.equal(text.value, "");
  assert.equal(loadDraft(storage, "new"), "");
  assert.deepEqual(posted, { id: "n1" });
});
test("an existing draft is restored into the textarea", () => {
  const storage = memStorage();
  saveDraft(storage, "reply:5", "half written");
  const { text } = mount({ api: {}, storage, target: { key: "reply:5", inReplyToId: "5" } });
  assert.equal(text.value, "half written");
});
test("an empty message is not sent", async () => {
  let calls = 0;
  const api = { post: async () => { calls++; return {}; } };
  const { el } = mount({ api });
  await el.onsubmit({ preventDefault() {} });
  assert.equal(calls, 0);
});

test("a cancel button appears only with onCancel and calls it, keeping the draft", () => {
  const storage = memStorage();
  let cancelled = false;
  const { document } = parseHTML("<html><body></body></html>");
  const el = createComposer({ doc: document, api: {}, t, storage, target: { key: "new" }, onCancel: () => { cancelled = true; } });
  const text = el.querySelector("textarea");
  text.value = "keep me";
  text.oninput();
  el.querySelector("button.cancel").onclick();
  assert.equal(cancelled, true);
  assert.equal(loadDraft(storage, "new"), "keep me");
  const plain = createComposer({ doc: document, api: {}, t, storage, target: { key: "new" } });
  assert.equal(plain.querySelector("button.cancel"), null);
});

test("drafts are scoped to the account: another account starts empty", () => {
  const storage = memStorage();
  const { document } = parseHTML("<html><body></body></html>");
  const a = createComposer({ doc: document, api: {}, t, storage, accountId: "A", target: { key: "new" } });
  a.querySelector("textarea").value = "secret of A";
  a.querySelector("textarea").oninput();
  const b = createComposer({ doc: document, api: {}, t, storage, accountId: "B", target: { key: "new" } });
  assert.equal(b.querySelector("textarea").value, "");
  const a2 = createComposer({ doc: document, api: {}, t, storage, accountId: "A", target: { key: "new" } });
  assert.equal(a2.querySelector("textarea").value, "secret of A");
});
test("clearAllDrafts removes every draft and nothing else", () => {
  const storage = new Map();
  const s = { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: (k) => storage.delete(k), get length() { return storage.size; }, key: (i) => [...storage.keys()][i] ?? null };
  saveDraft(s, "A.new", "x");
  saveDraft(s, "B.reply:1", "y");
  s.setItem("stabbyclient.theme", "dark");
  clearAllDrafts(s);
  assert.equal(loadDraft(s, "A.new"), "");
  assert.equal(loadDraft(s, "B.reply:1"), "");
  assert.equal(s.getItem("stabbyclient.theme"), "dark");
});

const groupsApi = (list, over = {}) => ({
  get: async () => list, post: async (p, body) => { over.sent = body; return { id: "n" }; }, postForm: async () => ({ id: "m" }),
});
const tick = () => new Promise((r) => setTimeout(r, 0));

test("buildStatusParams sends the chosen group as stabbypossum_group", () => {
  assert.equal(buildStatusParams({ text: "x", group: "https://h/g" }).get("stabbypossum_group"), "https://h/g");
  assert.equal(buildStatusParams({ text: "x" }).has("stabbypossum_group"), false);
});
test("a new post offers the followed groups; choosing one posts to it, public only", async () => {
  const over = {};
  const { el, text } = mount({ api: groupsApi([{ id: "https://h/g", acct: "g@h" }], over) });
  await tick();
  const group = el.querySelector("select.group");
  assert.ok(group);
  assert.deepEqual([...group.options].map((o) => o.value), ["", "https://h/g"]);
  const vis = el.querySelector("select[aria-label='composer.visibility']");
  vis.options[2].selected = true; // private
  group.options[1].selected = true;
  group.onchange();
  assert.equal(vis.disabled, true);
  text.value = "hi";
  await el.onsubmit({ preventDefault() {} });
  assert.equal(over.sent.get("stabbypossum_group"), "https://h/g");
  assert.equal(over.sent.get("visibility"), "public");
  group.options[0].selected = true;
  group.onchange();
  assert.equal(vis.disabled, false);
});
test("no group menu for a reply, nor when no group is followed or the list fails", async () => {
  const a = mount({ api: groupsApi([{ id: "g", acct: "g@h" }]), target: { key: "reply:1", inReplyToId: "1" } });
  await tick();
  assert.equal(a.el.querySelector("select.group"), null);
  const b = mount({ api: groupsApi([]) });
  await tick();
  assert.equal(b.el.querySelector("select.group"), null);
  const c = mount({ api: { get: async () => { throw new Error("x"); }, post: async () => ({}), postForm: async () => ({}) } });
  await tick();
  assert.equal(c.el.querySelector("select.group"), null);
});

test("a draft and a schedule are sent as stabbypossum_draft and scheduled_at", () => {
  const p = buildStatusParams({ text: "x", draft: true, scheduledAt: "2026-10-20T10:00:00.000Z" });
  assert.equal(p.get("stabbypossum_draft"), "true");
  assert.equal(p.get("scheduled_at"), "2026-10-20T10:00:00.000Z");
  const q = buildStatusParams({ text: "x" });
  assert.equal(q.has("stabbypossum_draft"), false);
  assert.equal(q.has("scheduled_at"), false);
});
test("saving as a draft posts with the UI marker, says so, and the post is not shown as published", async () => {
  const sent = [];
  const api = { get: async () => [], post: async (path, body, opts) => { sent.push({ path, body, opts }); return { id: "d1", instance_state: "draft" }; }, postForm: async () => ({}) };
  let posted = null;
  const { el, text } = mount({ api, onPosted: (s) => { posted = s; } });
  el.querySelector("input.draft").checked = true;
  text.value = "later";
  await el.onsubmit({ preventDefault() {} });
  assert.equal(sent[0].body.get("stabbypossum_draft"), "true");
  assert.deepEqual(sent[0].opts, { ui: true });
  assert.equal(posted.instance_state, "draft");
});
test("a schedule time becomes an ISO scheduled_at; a plain post carries no UI marker", async () => {
  const sent = [];
  const api = { get: async () => [], post: async (path, body, opts) => { sent.push({ body, opts }); return { id: "s1" }; }, postForm: async () => ({}) };
  const a = mount({ api });
  a.el.querySelector("input.schedule").value = "2026-10-20T10:00";
  a.text.value = "soon";
  await a.el.onsubmit({ preventDefault() {} });
  assert.equal(sent[0].body.get("scheduled_at"), new Date("2026-10-20T10:00").toISOString());
  const b = mount({ api });
  b.text.value = "now";
  await b.el.onsubmit({ preventDefault() {} });
  assert.equal(sent[1].body.has("scheduled_at"), false);
  assert.equal(sent[1].opts, undefined);
});

test("a poll is sent as poll[options][], poll[expires_in] and poll[multiple]", () => {
  const p = buildStatusParams({ text: "x", poll: { options: ["a", "b"], expiresIn: "3600", multiple: true } });
  assert.deepEqual(p.getAll("poll[options][]"), ["a", "b"]);
  assert.equal(p.get("poll[expires_in]"), "3600");
  assert.equal(p.get("poll[multiple]"), "true");
  assert.equal(buildStatusParams({ text: "x" }).has("poll[options][]"), false);
});
test("a quote is sent with quoted_status_id and its content type", () => {
  const p = buildStatusParams({ text: "x", quotedStatusId: "9", contentType: "text/markdown", visibility: "private" });
  assert.equal(p.get("quoted_status_id"), "9");
  assert.equal(p.get("content_type"), "text/markdown");
});
function pollMount(api) {
  const m = mount({ api });
  m.el.querySelector("button.add-poll").onclick();
  return m;
}
test("the poll section opens on demand with four option fields", () => {
  const { el } = mount({ api: { get: async () => [], post: async () => ({}) } });
  assert.equal(el.querySelector(".poll-fields"), null);
  el.querySelector("button.add-poll").onclick();
  assert.equal(el.querySelectorAll(".poll-fields input[type=text]").length, 4);
  el.querySelector("button.add-poll").onclick();
  assert.equal(el.querySelector(".poll-fields"), null);
});
test("a post with a poll sends the filled options and the chosen time", async () => {
  const sent = [];
  const api = { get: async () => [], post: async (p, body) => { sent.push(body); return { id: "n" }; }, postForm: async () => ({}) };
  const { el, text } = pollMount(api);
  const inputs = el.querySelectorAll(".poll-fields input[type=text]");
  inputs[0].value = "red";
  inputs[1].value = "  blue ";
  inputs[2].value = "";
  el.querySelector(".poll-fields input[type=checkbox]").checked = true;
  text.value = "pick";
  await el.onsubmit({ preventDefault() {} });
  assert.deepEqual(sent[0].getAll("poll[options][]"), ["red", "blue"]);
  assert.equal(sent[0].get("poll[multiple]"), "true");
  assert.ok(sent[0].get("poll[expires_in]"));
});
test("a poll needs two options and cannot be combined with media", async () => {
  const sent = [];
  const api = { get: async () => [], post: async (p, body) => { sent.push(body); return {}; }, postForm: async () => ({ id: "m" }) };
  const one = pollMount(api);
  one.el.querySelectorAll(".poll-fields input[type=text]")[0].value = "only";
  one.text.value = "x";
  await one.el.onsubmit({ preventDefault() {} });
  assert.deepEqual(sent, []);
  assert.match(one.el.querySelector(".error").textContent, /composer\.poll_min/);
  const two = pollMount(api);
  const ins = two.el.querySelectorAll(".poll-fields input[type=text]");
  ins[0].value = "a";
  ins[1].value = "b";
  two.text.value = "x";
  const file = new File(["x"], "a.png", { type: "image/png" });
  const picker = two.el.querySelector("input[type=file]");
  Object.defineProperty(picker, "files", { value: [file] });
  picker.onchange();
  await two.el.onsubmit({ preventDefault() {} });
  assert.deepEqual(sent, []);
  assert.match(two.el.querySelector(".error").textContent, /composer\.poll_media/);
});
test("a quote composer starts with the quoted text, goes to followers only as Markdown, and carries the id", async () => {
  const sent = [];
  const api = { get: async () => [], post: async (p, body) => { sent.push(body); return { id: "n" }; }, postForm: async () => ({}) };
  const quote = { id: "q9", content: "<p>wise words</p>", account: { acct: "zed@h" }, visibility: "public" };
  const { el, text } = mount({ api, target: { key: "quote:q9", quote } });
  assert.equal(text.value, "> wise words\n\n");
  assert.equal(el.querySelector("select.group"), null);
  text.value = "> wise words\n\nagreed";
  await el.onsubmit({ preventDefault() {} });
  assert.equal(sent[0].get("quoted_status_id"), "q9");
  assert.equal(sent[0].get("visibility"), "private");
  assert.equal(sent[0].get("content_type"), "text/markdown");
  assert.equal(sent[0].has("in_reply_to_id"), false);
});
test("a quote with only the quoted lines and no words of your own is not sent", async () => {
  const sent = [];
  const api = { get: async () => [], post: async (p, body) => { sent.push(body); return {}; }, postForm: async () => ({}) };
  const quote = { id: "q9", content: "<p>wise words</p>", account: { acct: "zed@h" }, visibility: "public" };
  const { el } = mount({ api, target: { key: "quote:q9", quote } });
  await el.onsubmit({ preventDefault() {} });
  assert.deepEqual(sent, []);
});

import { ApiError } from "../app/js/api.js";
function lostMount({ posts, home, accountId = "me" }) {
  const { document } = parseHTML("<html><body></body></html>");
  const calls = { post: 0, home: 0 };
  const api = {
    get: async (p) => { if (p === "/api/v1/timelines/home") { calls.home++; return home(); } return []; },
    post: async () => { calls.post++; return posts(calls.post); },
    postForm: async () => ({ id: "m" }),
  };
  let posted = null;
  const el = createComposer({ doc: document, api, t, storage: memStorage(), accountId, target: { key: "new" }, onPosted: (s) => { posted = s; } });
  document.body.append(el);
  return { el, text: el.querySelector("textarea"), calls, posted: () => posted };
}
const mine = (id, html, acct = "me") => ({ id, content: html, account: { id: acct } });

test("if a send ends without an answer, sending the same text again first looks for the post and does not send it twice", async () => {
  const { el, text, calls, posted } = lostMount({
    posts: () => { throw new TypeError("Failed to fetch"); },
    home: () => [mine("9", "<p>hello  world</p>")],
  });
  text.value = "hello world";
  await el.onsubmit({ preventDefault() {} });
  assert.equal(calls.post, 1);
  assert.match(el.querySelector(".error").textContent, /composer\.send_unsure/);
  await el.onsubmit({ preventDefault() {} });
  assert.equal(calls.post, 1);
  assert.equal(calls.home, 1);
  assert.equal(posted().id, "9");
  assert.equal(text.value, "");
});
test("if it is not there, the second try sends it", async () => {
  const { el, text, calls, posted } = lostMount({
    posts: (n) => { if (n === 1) throw new TypeError("Failed to fetch"); return { id: "new" }; },
    home: () => [mine("5", "<p>something else</p>"), mine("6", "<p>hello world</p>", "someone-else")],
  });
  text.value = "hello world";
  await el.onsubmit({ preventDefault() {} });
  await el.onsubmit({ preventDefault() {} });
  assert.equal(calls.post, 2);
  assert.equal(posted().id, "new");
});
test("a refusal from the server is not 'unsure': no lookup, and the plain error message", async () => {
  const { el, text, calls } = lostMount({
    posts: () => { throw new ApiError(500, "HTTP 500"); },
    home: () => [],
  });
  text.value = "hello";
  await el.onsubmit({ preventDefault() {} });
  assert.match(el.querySelector(".error").textContent, /composer\.send_failed/);
  await el.onsubmit({ preventDefault() {} });
  assert.equal(calls.home, 0);
  assert.equal(calls.post, 2);
});
test("different text after an unsure send is just a new post", async () => {
  const { el, text, calls } = lostMount({
    posts: (n) => { if (n === 1) throw new TypeError("x"); return { id: "n" }; },
    home: () => [mine("9", "<p>hello</p>")],
  });
  text.value = "hello";
  await el.onsubmit({ preventDefault() {} });
  text.value = "goodbye";
  await el.onsubmit({ preventDefault() {} });
  assert.equal(calls.home, 0);
  assert.equal(calls.post, 2);
});

const okApi = (sent = []) => ({ get: async () => [], post: async (p, body, opts) => { sent.push({ body, opts }); return { id: "n" }; }, postForm: async () => ({ id: "m" }) });
const pickFiles = (el, files) => {
  const picker = el.querySelector("input[type=file]");
  Object.defineProperty(picker, "files", { value: files, configurable: true });
  picker.onchange();
};
const png = (n = "a.png") => new File(["x"], n, { type: "image/png" });

test("the text format defaults to Markdown and is sent as content_type; plain text and HTML can be chosen", async () => {
  const sent = [];
  const { el, text } = mount({ api: okApi(sent) });
  const select = el.querySelector("select.format");
  assert.deepEqual([...select.options].map((o) => o.value), ["text/markdown", "text/plain", "text/html"]);
  text.value = "one";
  await el.onsubmit({ preventDefault() {} });
  assert.equal(sent[0].body.get("content_type"), "text/markdown");
  select.options[1].selected = true;
  text.value = "two";
  await el.onsubmit({ preventDefault() {} });
  assert.equal(sent[1].body.get("content_type"), "text/plain");
});
test("a quote is always Markdown, whatever the format menu says", async () => {
  const sent = [];
  const quote = { id: "q9", content: "<p>words</p>", account: { acct: "z@h" }, visibility: "public" };
  const { el, text } = mount({ api: okApi(sent), target: { key: "quote:q9", quote } });
  const select = el.querySelector("select.format");
  assert.equal(select.disabled, true);
  text.value = "> words\n\nmine";
  await el.onsubmit({ preventDefault() {} });
  assert.equal(sent[0].body.get("content_type"), "text/markdown");
});
test("a language can be given and is sent as language; empty sends none", async () => {
  const sent = [];
  const { el, text } = mount({ api: okApi(sent) });
  text.value = "ciao";
  el.querySelector("input.language").value = " it ";
  await el.onsubmit({ preventDefault() {} });
  assert.equal(sent[0].body.get("language"), "it");
  text.value = "again";
  el.querySelector("input.language").value = "";
  await el.onsubmit({ preventDefault() {} });
  assert.equal(sent[1].body.has("language"), false);
});

test("images, video and audio can be attached, at most four, and each can be taken off again", () => {
  const { el } = mount({ api: okApi() });
  const picker = el.querySelector("input[type=file]");
  assert.match(picker.accept, /image\/\*/);
  assert.match(picker.accept, /video\/\*/);
  assert.match(picker.accept, /audio\/\*/);
  pickFiles(el, [png("1.png"), png("2.png"), png("3.png"), png("4.png"), png("5.png")]);
  assert.equal(el.querySelectorAll(".attachment-row").length, 4);
  el.querySelector(".attachment-row button.remove").onclick();
  assert.equal(el.querySelectorAll(".attachment-row").length, 3);
});
test("files beyond the fourth are refused with a message, and a pick that fits clears it", () => {
  const { el } = mount({ api: okApi() });
  pickFiles(el, [png("1.png"), png("2.png"), png("3.png"), png("4.png"), png("5.png")]);
  assert.equal(el.querySelector(".error").textContent, "composer.too_many");
  el.querySelector(".attachment-row button.remove").onclick();
  pickFiles(el, [png("6.png")]);
  assert.equal(el.querySelector(".error").textContent, "");
  assert.equal(el.querySelectorAll(".attachment-row").length, 4);
});
const pasteInto = (node, files) => {
  const e = new node.ownerDocument.defaultView.Event("paste", { cancelable: true });
  e.clipboardData = { items: files.map((f) => ({ kind: "file", type: f.type, getAsFile: () => f })) };
  node.dispatchEvent(e);
  return e;
};
test("a picture pasted into the text becomes an attachment; pasted text is left alone", () => {
  const { el, text } = mount({ api: okApi() });
  const e = pasteInto(text, [new File(["x"], "", { type: "image/png" })]);
  assert.equal(e.defaultPrevented, true);
  assert.equal(el.querySelectorAll(".attachment-row").length, 1);
  assert.match(el.querySelector(".attachment-row label").textContent, /composer\.pasted_image/);
  const plain = pasteInto(text, []);
  assert.equal(plain.defaultPrevented, false);
  assert.equal(el.querySelectorAll(".attachment-row").length, 1);
});
test("a picture pasted into the HTML editor becomes an attachment too", () => {
  const { el } = mount({ api: okApi() });
  const select = el.querySelector("select.format");
  select.options[2].selected = true;
  select.onchange();
  pasteInto(el.querySelector(".rich-box [contenteditable]"), [png("p.png")]);
  assert.equal(el.querySelectorAll(".attachment-row").length, 1);
});
test("a pasted picture counts toward the four", () => {
  const { el, text } = mount({ api: okApi() });
  pickFiles(el, [png("1.png"), png("2.png"), png("3.png"), png("4.png")]);
  pasteInto(text, [png("5.png")]);
  assert.equal(el.querySelectorAll(".attachment-row").length, 4);
  assert.equal(el.querySelector(".error").textContent, "composer.too_many");
});
test("an attached picture shows a preview once it has been read; other media do not", () => {
  const saved = globalThis.FileReader;
  globalThis.FileReader = class { readAsDataURL() { this.result = "data:image/png;base64,eA=="; this.onload(); } };
  try {
    const { el } = mount({ api: okApi() });
    pickFiles(el, [png("1.png"), new File(["x"], "c.mp4", { type: "video/mp4" })]);
    const rows = el.querySelectorAll(".attachment-row");
    const img = rows[0].querySelector("img.attachment-preview");
    assert.equal(img.getAttribute("src"), "data:image/png;base64,eA==");
    assert.equal(img.hidden, false);
    assert.equal(rows[1].querySelector("img"), null);
  } finally {
    globalThis.FileReader = saved;
  }
});
test("only images, video and audio are taken; other files are ignored", () => {
  const { el } = mount({ api: okApi() });
  pickFiles(el, [new File(["x"], "doc.pdf", { type: "application/pdf" }), new File(["x"], "clip.mp4", { type: "video/mp4" })]);
  assert.equal(el.querySelectorAll(".attachment-row").length, 1);
});
test("a removed attachment is not sent", async () => {
  const sent = [];
  const uploaded = [];
  const api = { ...okApi(sent), postForm: async (p, fd) => { uploaded.push(fd.get("file").name); return { id: `m-${fd.get("file").name}` }; } };
  const { el, text } = mount({ api });
  pickFiles(el, [png("keep.png"), png("drop.png")]);
  el.querySelectorAll(".attachment-row button.remove")[1].onclick();
  text.value = "pics";
  await el.onsubmit({ preventDefault() {} });
  assert.deepEqual(uploaded, ["keep.png"]);
  assert.deepEqual(sent[0].body.getAll("media_ids[]"), ["m-keep.png"]);
});

test("pictures can also be attached from their web address, with their alt text, and the post carries the UI marker", async () => {
  const sent = [];
  const { el, text } = mount({ api: okApi(sent) });
  el.querySelector("button.add-urls").onclick();
  const rows = el.querySelectorAll(".url-fields .url-row");
  assert.equal(rows.length, 4);
  rows[0].querySelector("input.url").value = "https://img.example/a.png";
  rows[0].querySelector("input.alt").value = "first";
  rows[2].querySelector("input.url").value = "https://img.example/c.png";
  text.value = "remote";
  await el.onsubmit({ preventDefault() {} });
  assert.deepEqual(sent[0].body.getAll("stabbypossum_attachment_urls[]"), ["https://img.example/a.png", "https://img.example/c.png"]);
  assert.deepEqual(sent[0].body.getAll("stabbypossum_attachment_descriptions[]"), ["first", ""]);
  assert.deepEqual(sent[0].opts, { ui: true });
});
test("an address that is not http(s) is refused before anything is sent", async () => {
  const sent = [];
  const { el, text } = mount({ api: okApi(sent) });
  el.querySelector("button.add-urls").onclick();
  el.querySelector(".url-fields input.url").value = "javascript:alert(1)";
  text.value = "x";
  await el.onsubmit({ preventDefault() {} });
  assert.deepEqual(sent, []);
  assert.match(el.querySelector(".error").textContent, /composer\.url_invalid/);
});
test("files and addresses together are limited to four, and neither mixes with a poll", async () => {
  const sent = [];
  const { el, text } = mount({ api: okApi(sent) });
  pickFiles(el, [png("1.png"), png("2.png"), png("3.png")]);
  el.querySelector("button.add-urls").onclick();
  const urls = el.querySelectorAll(".url-fields input.url");
  urls[0].value = "https://img.example/a.png";
  urls[1].value = "https://img.example/b.png";
  text.value = "x";
  await el.onsubmit({ preventDefault() {} });
  assert.deepEqual(sent, []);
  assert.match(el.querySelector(".error").textContent, /composer\.too_many/);
  urls[1].value = "";
  el.querySelector("button.add-poll").onclick();
  const opts = el.querySelectorAll(".poll-fields input[type=text]");
  opts[0].value = "a";
  opts[1].value = "b";
  await el.onsubmit({ preventDefault() {} });
  assert.deepEqual(sent, []);
  assert.match(el.querySelector(".error").textContent, /composer\.poll_media/);
});

const pickFormat = (el, value) => {
  const select = el.querySelector("select.format");
  for (const o of select.options) o.selected = o.value === value;
  select.onchange?.();
};
const emojiApi = (sent = []) => ({ get: async (p, q) => (p === "/api/v1/custom_emojis" ? [{ shortcode: "noto_cat", url: "https://h/cat.png" }] : []), post: async (p, body, opts) => { sent.push({ body, opts }); return { id: "n" }; }, postForm: async () => ({ id: "m" }) });

test("an emoji button opens a panel; choosing an emoji puts its :shortcode: where the cursor is", async () => {
  const { el, text } = mount({ api: emojiApi() });
  assert.equal(el.querySelector(".emoji-panel"), null);
  el.querySelector("button.emoji").onclick();
  assert.ok(el.querySelector(".emoji-panel"));
  text.value = "hello world";
  text.selectionStart = 6;
  text.selectionEnd = 6;
  text.onfocus?.(); // the cursor is only trusted once the text box has been used
  const search = el.querySelector("input.emoji-search");
  search.value = "cat";
  search.oninput();
  await new Promise((r) => setTimeout(r, 200));
  el.querySelector(".emoji-list button.emoji-option").onclick();
  assert.equal(text.value, "hello :noto_cat: world");
  el.querySelector("button.emoji").onclick();
  assert.equal(el.querySelector(".emoji-panel"), null);
});
test("without a known cursor the emoji goes at the end", async () => {
  const { el, text } = mount({ api: emojiApi() });
  el.querySelector("button.emoji").onclick();
  text.value = "end";
  const search = el.querySelector("input.emoji-search");
  search.value = "cat";
  search.oninput();
  await new Promise((r) => setTimeout(r, 200));
  el.querySelector(".emoji-list button.emoji-option").onclick();
  assert.match(text.value, /^end ?:noto_cat: ?$/);
});

test("choosing HTML swaps the text box for a minimal editor with bold, italic and strike-through", () => {
  const { el, text } = mount({ api: emojiApi() });
  assert.equal(el.querySelector(".rich-editor"), null);
  pickFormat(el, "text/html");
  assert.ok(el.querySelector(".rich-editor"));
  assert.equal(el.querySelectorAll(".rich-toolbar button").length, 3);
  assert.equal(text.hidden, true);
  pickFormat(el, "text/markdown");
  assert.equal(el.querySelector(".rich-editor"), null);
  assert.equal(text.hidden, false);
});
test("what was typed comes along when switching to HTML and back, with its lines", () => {
  const { el, text } = mount({ api: emojiApi() });
  text.value = "one <b>\ntwo & three";
  pickFormat(el, "text/html");
  assert.equal(el.querySelector(".rich-editor").innerHTML, "one &lt;b&gt;<br>two &amp; three");
  el.querySelector(".rich-editor").innerHTML = "one <strong>bold</strong><br>two";
  pickFormat(el, "text/plain");
  assert.equal(text.value, "one bold\ntwo");
});
test("a post written in HTML is sent as the editor's cleaned html with the HTML content type", async () => {
  const sent = [];
  const { el } = mount({ api: emojiApi(sent) });
  pickFormat(el, "text/html");
  el.querySelector(".rich-editor").innerHTML = 'hi <b>there</b> <span style="color:red">x</span><script>alert(1)</script>';
  await el.onsubmit({ preventDefault() {} });
  assert.equal(sent[0].body.get("status"), "hi <strong>there</strong> x");
  assert.equal(sent[0].body.get("content_type"), "text/html");
});
test("an empty HTML editor sends nothing, and after a send it is empty again", async () => {
  const sent = [];
  const { el } = mount({ api: emojiApi(sent) });
  pickFormat(el, "text/html");
  await el.onsubmit({ preventDefault() {} });
  assert.deepEqual(sent, []);
  el.querySelector(".rich-editor").innerHTML = "<b>x</b>";
  await el.onsubmit({ preventDefault() {} });
  assert.equal(sent.length, 1);
  assert.equal(el.querySelector(".rich-editor").innerHTML, "");
});
test("a quote has no editor to choose: its format is fixed", () => {
  const quote = { id: "q9", content: "<p>words</p>", account: { acct: "z@h" }, visibility: "public" };
  const { el } = mount({ api: emojiApi(), target: { key: "quote:q9", quote } });
  assert.equal(el.querySelector("select.format").disabled, true);
  assert.equal(el.querySelector(".rich-editor"), null);
});

test("an alt text changed after the picture went up is sent to it, and the picture is not uploaded again", async () => {
  const sent = [];
  const puts = [];
  let uploads = 0;
  let fail = true;
  const api = {
    post: async (p, body) => { if (fail) { fail = false; throw Object.assign(new Error("x"), { status: 500 }); } sent.push({ p, body }); return { id: "n1" }; },
    postForm: async () => { uploads++; return { id: "m1" }; },
    putJson: async (p, o) => { puts.push([p, o]); return {}; },
  };
  const { el, text } = mount({ api });
  pickFiles(el, [png("a.png")]);
  text.value = "pic";
  await el.onsubmit({ preventDefault() {} });
  const alt = el.querySelector(".attachment-row input");
  alt.value = "a cat";
  alt.oninput();
  await el.onsubmit({ preventDefault() {} });
  assert.equal(uploads, 1);
  assert.deepEqual(puts, [["/api/v1/media/m1", { description: "a cat" }]]);
  assert.deepEqual(sent[0].body.getAll("media_ids[]"), ["m1"]);
});

test("a reply to a post anyone may repost has a Quote button that hands over what is written", () => {
  const { document } = parseHTML("<html><body></body></html>");
  let got = null;
  const el = createComposer({ doc: document, api: {}, t: (k) => k, storage: null, target: { key: "reply:1", inReplyToId: "1", canQuote: true }, onQuote: (w) => { got = w; } });
  el.querySelector("textarea").value = "  my view ";
  el.querySelector("button.quote").onclick();
  assert.equal(got, "my view");
});
test("no Quote button without canQuote or onQuote, and the quote starts with the text already written", () => {
  const { document } = parseHTML("<html><body></body></html>");
  const mk = (target, extra = {}) => createComposer({ doc: document, api: {}, t: (k) => k, storage: null, target, ...extra });
  assert.equal(mk({ key: "reply:1", inReplyToId: "1" }, { onQuote() {} }).querySelector("button.quote"), null);
  assert.equal(mk({ key: "reply:1", inReplyToId: "1", canQuote: true }).querySelector("button.quote"), null);
  const q = mk({ key: "quote:1", quote: { content: "<p>hi</p>", account: { acct: "a" } }, written: "my view" });
  assert.match(q.querySelector("textarea").value, /^> hi\n\nmy view$/);
});
