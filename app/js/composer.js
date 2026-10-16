import { postStatus, uploadMedia } from "./statuses.js";

const DRAFT_PREFIX = "xenoclient.draft.";

export function buildStatusParams({ text, spoiler, visibility, inReplyToId, mediaIds = [], language }) {
  const p = new URLSearchParams();
  if (text) p.set("status", text);
  if (spoiler) p.set("spoiler_text", spoiler);
  if (visibility) p.set("visibility", visibility);
  if (inReplyToId) p.set("in_reply_to_id", inReplyToId);
  if (language) p.set("language", language);
  for (const id of mediaIds) p.append("media_ids[]", id);
  return p;
}

export function saveDraft(storage, key, text) {
  try {
    if (text) storage.setItem(DRAFT_PREFIX + key, text);
    else storage.removeItem(DRAFT_PREFIX + key);
  } catch { /* a draft is a convenience */ }
}

// Logout / expired session: forget every drafted text, whoever wrote it.
export function clearAllDrafts(storage) {
  try {
    const keys = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && k.startsWith(DRAFT_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => storage.removeItem(k));
  } catch { /* nothing to clear */ }
}

export function loadDraft(storage, key) {
  try {
    return storage.getItem(DRAFT_PREFIX + key) ?? "";
  } catch {
    return "";
  }
}

const VISIBILITIES = ["public", "unlisted", "private", "direct"];

// target: { key: "new" | "reply:<id>", inReplyToId?, visibility? } — a reply
// starts with the visibility of the post it answers.
export function createComposer({ doc, api, t, storage, target, accountId = "", onPosted, onCancel }) {
  const draftKey = accountId ? `${accountId}.${target.key}` : target.key;
  const form = doc.createElement("form");
  form.className = "composer";

  const cw = doc.createElement("input");
  cw.type = "text";
  cw.placeholder = t("composer.cw");
  cw.setAttribute("aria-label", t("composer.cw"));

  const text = doc.createElement("textarea");
  text.rows = 4;
  text.placeholder = t("composer.placeholder");
  text.setAttribute("aria-label", t("composer.placeholder"));
  text.value = loadDraft(storage, draftKey);
  text.oninput = () => saveDraft(storage, draftKey, text.value);

  const vis = doc.createElement("select");
  vis.setAttribute("aria-label", t("composer.visibility"));
  for (const v of VISIBILITIES) {
    const o = doc.createElement("option");
    o.value = v;
    o.textContent = t(`composer.vis.${v}`);
    o.selected = v === (VISIBILITIES.includes(target.visibility) ? target.visibility : "public");
    vis.append(o);
  }

  const files = doc.createElement("input");
  files.type = "file";
  files.accept = "image/*";
  files.multiple = true;
  files.setAttribute("aria-label", t("composer.attach"));
  const attachList = doc.createElement("div");
  const attachments = []; // { file, alt, id? }
  files.onchange = () => {
    for (const file of files.files ?? []) {
      const entry = { file, alt: "" };
      attachments.push(entry);
      const row = doc.createElement("label");
      row.className = "attachment-row";
      row.append(doc.createTextNode(`${file.name} — ${t("composer.alt")} `));
      const alt = doc.createElement("input");
      alt.type = "text";
      alt.oninput = () => { entry.alt = alt.value; };
      row.append(alt);
      attachList.append(row);
    }
  };

  const error = doc.createElement("p");
  error.className = "error";
  error.setAttribute("role", "alert");

  const send = doc.createElement("button");
  send.type = "submit";
  send.textContent = t("composer.send");

  form.append(cw, text, vis, files, attachList, error, send);
  if (onCancel) {
    const cancel = doc.createElement("button");
    cancel.type = "button";
    cancel.className = "cancel";
    cancel.textContent = t("composer.cancel");
    cancel.onclick = onCancel;
    form.append(cancel);
  }

  form.onsubmit = async (e) => {
    e.preventDefault();
    error.textContent = "";
    if (!text.value.trim() && attachments.length === 0) return;
    send.disabled = true;
    try {
      for (const a of attachments) {
        if (!a.id) a.id = (await uploadMedia(api, a.file, a.alt)).id;
      }
      const posted = await postStatus(api, buildStatusParams({
        text: text.value,
        spoiler: cw.value.trim(),
        visibility: vis.value,
        inReplyToId: target.inReplyToId,
        mediaIds: attachments.map((a) => a.id),
      }));
      text.value = "";
      cw.value = "";
      attachments.length = 0;
      attachList.replaceChildren();
      saveDraft(storage, draftKey, "");
      onPosted?.(posted);
    } catch {
      error.textContent = t("composer.send_failed");
    } finally {
      send.disabled = false;
    }
  };
  return form;
}
