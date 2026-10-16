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
function mount({ api, storage = memStorage(), target = { key: "new" }, onPosted = () => {} }) {
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
