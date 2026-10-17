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
  s.setItem("xenoclient.theme", "dark");
  clearAllDrafts(s);
  assert.equal(loadDraft(s, "A.new"), "");
  assert.equal(loadDraft(s, "B.reply:1"), "");
  assert.equal(s.getItem("xenoclient.theme"), "dark");
});

const groupsApi = (list, over = {}) => ({
  get: async () => list, post: async (p, body) => { over.sent = body; return { id: "n" }; }, postForm: async () => ({ id: "m" }),
});
const tick = () => new Promise((r) => setTimeout(r, 0));

test("buildStatusParams sends the chosen group as xenomorph_group", () => {
  assert.equal(buildStatusParams({ text: "x", group: "https://h/g" }).get("xenomorph_group"), "https://h/g");
  assert.equal(buildStatusParams({ text: "x" }).has("xenomorph_group"), false);
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
  assert.equal(over.sent.get("xenomorph_group"), "https://h/g");
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

test("a draft and a schedule are sent as xenomorph_draft and scheduled_at", () => {
  const p = buildStatusParams({ text: "x", draft: true, scheduledAt: "2026-10-20T10:00:00.000Z" });
  assert.equal(p.get("xenomorph_draft"), "true");
  assert.equal(p.get("scheduled_at"), "2026-10-20T10:00:00.000Z");
  const q = buildStatusParams({ text: "x" });
  assert.equal(q.has("xenomorph_draft"), false);
  assert.equal(q.has("scheduled_at"), false);
});
test("saving as a draft posts with the UI marker, says so, and the post is not shown as published", async () => {
  const sent = [];
  const api = { get: async () => [], post: async (path, body, opts) => { sent.push({ path, body, opts }); return { id: "d1", xenomorph_state: "draft" }; }, postForm: async () => ({}) };
  let posted = null;
  const { el, text } = mount({ api, onPosted: (s) => { posted = s; } });
  el.querySelector("input.draft").checked = true;
  text.value = "later";
  await el.onsubmit({ preventDefault() {} });
  assert.equal(sent[0].body.get("xenomorph_draft"), "true");
  assert.deepEqual(sent[0].opts, { ui: true });
  assert.equal(posted.xenomorph_state, "draft");
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
