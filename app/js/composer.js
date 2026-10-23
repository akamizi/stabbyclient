// The form for writing a post: text (plain or rich), content warning, visibility, attachments,
// poll, draft or scheduled, quoting. Also the text drafts kept per target, and buildStatusParams,
// which turns the form into the request. createComposer takes the target it writes for (a new
// post, a reply, a quote) and calls onPosted with the server's answer.
import { postStatus, uploadMedia, setMediaDescription } from "./statuses.js";
import { quotedLines } from "./quote.js";
import { createRichEditor } from "./rich-editor.js";
import { createEmojiPanel } from "./emoji-panel.js";
import { sanitizeHtml } from "./sanitize.js";

const DRAFT_PREFIX = "stabbyclient.draft.";

export function buildStatusParams({ text, spoiler, visibility, inReplyToId, mediaIds = [], language, group, draft, scheduledAt, poll, quotedStatusId, contentType, remote = [] }) {
  const p = new URLSearchParams();
  if (text) p.set("status", text);
  if (spoiler) p.set("spoiler_text", spoiler);
  if (visibility) p.set("visibility", visibility);
  if (inReplyToId) p.set("in_reply_to_id", inReplyToId);
  if (language) p.set("language", language);
  if (group) p.set("stabbypossum_group", group);
  if (draft) p.set("stabbypossum_draft", "true");
  if (scheduledAt) p.set("scheduled_at", scheduledAt);
  if (quotedStatusId) p.set("quoted_status_id", quotedStatusId);
  if (contentType) p.set("content_type", contentType);
  for (const r of remote) {
    p.append("stabbypossum_attachment_urls[]", r.url);
    p.append("stabbypossum_attachment_descriptions[]", r.alt || "");
  }
  if (poll) {
    for (const o of poll.options) p.append("poll[options][]", o);
    p.set("poll[expires_in]", poll.expiresIn);
    p.set("poll[multiple]", poll.multiple ? "true" : "false");
  }
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

// target: { key: "new" | "reply:<id>" | "quote:<id>", inReplyToId?, visibility?, quote? } — a reply
// starts with the visibility of the post it answers; a quote (the status quoted) starts with
// its text as "> " lines, is sent as Markdown and goes to followers only, like stabbypossum's own.
// A reply to a post anyone may repost (target.canQuote) also has a Quote button, which hands what
// is written so far to onQuote; a quote may start with that text (target.written) under the lines.
export function createComposer({ doc, api, t, storage, target, accountId = "", onPosted, onCancel, onQuote }) {
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
  text.value = loadDraft(storage, draftKey) || (target.quote ? `${quotedLines(target.quote.content, doc)}\n\n${target.written ?? ""}` : "");
  text.oninput = () => saveDraft(storage, draftKey, text.value);
  // The cursor of the text box is only trusted once it has been used; before that, emoji go at the end.
  let cursorKnown = false;
  text.onfocus = text.onclick = text.onkeyup = () => { cursorKnown = true; };

  const vis = doc.createElement("select");
  vis.setAttribute("aria-label", t("composer.visibility"));
  for (const v of VISIBILITIES) {
    const o = doc.createElement("option");
    o.value = v;
    o.textContent = t(`composer.vis.${v}`);
    o.selected = v === (target.quote ? "private" : VISIBILITIES.includes(target.visibility) ? target.visibility : "public");
    vis.append(o);
  }
  if (target.quote) {
    vis.disabled = true;
    text.placeholder = t("composer.quote_placeholder", { acct: target.quote.account?.acct ?? "" });
  }

  // A new post can go to one of the groups the user follows; a group post is public.
  const groupSel = doc.createElement("select");
  groupSel.className = "group";
  groupSel.setAttribute("aria-label", t("composer.group"));
  const noGroup = doc.createElement("option");
  noGroup.value = "";
  noGroup.textContent = t("composer.group_none");
  groupSel.append(noGroup);
  groupSel.onchange = () => {
    if (groupSel.value) for (const o of vis.options) o.selected = o.value === "public";
    vis.disabled = Boolean(groupSel.value);
  };
  if (!target.inReplyToId && !target.quote) {
    (async () => {
      try {
        const groups = await api.get("/api/v1/stabbypossum/groups/followed");
        if (!Array.isArray(groups) || groups.length === 0) return;
        for (const g of groups) {
          const o = doc.createElement("option");
          o.value = g.id;
          o.textContent = g.acct;
          groupSel.append(o);
        }
        vis.after(groupSel);
      } catch { /* no group menu: the post simply goes out on its own */ }
    })();
  }

  const draftLabel = doc.createElement("label");
  draftLabel.className = "draft-option";
  const draft = doc.createElement("input");
  draft.type = "checkbox";
  draft.className = "draft";
  draftLabel.append(draft, doc.createTextNode(` ${t("composer.draft")}`));
  const when = doc.createElement("input");
  when.type = "datetime-local";
  when.className = "schedule";
  when.setAttribute("aria-label", t("composer.schedule"));

  // A poll: four options (two are needed), how long it stays open, one choice or several.
  const pollBox = doc.createElement("div");
  const addPoll = doc.createElement("button");
  addPoll.type = "button";
  addPoll.className = "add-poll";
  addPoll.textContent = t("composer.poll");
  let pollFields = null;
  addPoll.onclick = () => {
    if (pollFields) {
      pollFields.remove();
      pollFields = null;
      return;
    }
    pollFields = doc.createElement("div");
    pollFields.className = "poll-fields";
    for (let i = 1; i <= 4; i++) {
      const input = doc.createElement("input");
      input.type = "text";
      input.placeholder = t("composer.poll_option", { count: i });
      input.setAttribute("aria-label", t("composer.poll_option", { count: i }));
      pollFields.append(input);
    }
    const expiry = doc.createElement("select");
    expiry.setAttribute("aria-label", t("composer.poll_expiry"));
    for (const [seconds, key] of [["300", "5m"], ["3600", "1h"], ["86400", "1d"], ["604800", "1w"]]) {
      const o = doc.createElement("option");
      o.value = seconds;
      o.textContent = t(`composer.poll_${key}`);
      o.selected = seconds === "86400";
      expiry.append(o);
    }
    const multi = doc.createElement("label");
    const check = doc.createElement("input");
    check.type = "checkbox";
    multi.append(check, doc.createTextNode(` ${t("composer.poll_multiple")}`));
    pollFields.append(expiry, multi);
    pollBox.append(pollFields);
  };
  const readPoll = () => {
    if (!pollFields) return null;
    const expiry = pollFields.querySelector("select");
    const selected = [...expiry.options].find((o) => o.selected);
    return {
      options: [...pollFields.querySelectorAll("input[type=text]")].map((i) => i.value.trim()).filter(Boolean),
      expiresIn: selected ? selected.value : "86400",
      multiple: pollFields.querySelector("input[type=checkbox]").checked,
    };
  };

  // Up to four attachments in all, whether uploaded here or taken from a web address.
  const MAX_ATTACHMENTS = 4;
  const files = doc.createElement("input");
  files.type = "file";
  files.accept = "image/*,video/*,audio/*";
  files.multiple = true;
  files.setAttribute("aria-label", t("composer.attach"));
  const attachList = doc.createElement("div");
  const attachments = []; // { file, alt, id?, sentAlt?, row }
  // Files from the picker or pasted into the text. Pictures show a small preview, read as a data:
  // address: an object URL of a pasted file can be shown before its bytes are readable.
  const Reader = doc.defaultView?.FileReader ?? globalThis.FileReader;
  function addFiles(list) {
    let dropped = false;
    for (const file of list) {
      if (!/^(image|video|audio)\//.test(file.type)) continue;
      if (attachments.length >= MAX_ATTACHMENTS) {
        dropped = true;
        continue;
      }
      const entry = { file, alt: "" };
      const row = doc.createElement("div");
      row.className = "attachment-row";
      if (file.type.startsWith("image/") && Reader) {
        const preview = doc.createElement("img");
        preview.className = "attachment-preview";
        preview.alt = "";
        preview.hidden = true;
        const reader = new Reader();
        reader.onload = () => {
          preview.src = reader.result;
          preview.hidden = false;
        };
        reader.readAsDataURL(file);
        row.append(preview);
      }
      const label = doc.createElement("label");
      label.append(doc.createTextNode(`${file.name || t("composer.pasted_image")} — ${t("composer.alt")} `));
      const alt = doc.createElement("input");
      alt.type = "text";
      alt.oninput = () => { entry.alt = alt.value; };
      label.append(alt);
      const remove = doc.createElement("button");
      remove.type = "button";
      remove.className = "remove";
      remove.textContent = t("composer.remove");
      remove.onclick = () => {
        attachments.splice(attachments.indexOf(entry), 1);
        row.remove();
      };
      row.append(label, remove);
      entry.row = row;
      attachments.push(entry);
      attachList.append(row);
    }
    error.textContent = dropped ? t("composer.too_many") : "";
  }
  files.onchange = () => {
    addFiles(files.files ?? []);
    try { files.value = ""; } catch { /* some environments refuse */ }
  };
  // A picture on the clipboard becomes an attachment, in the plain box and in the HTML editor.
  const onPasteFiles = (e) => {
    const pictures = [...(e.clipboardData?.items ?? [])]
      .filter((i) => i.kind === "file" && i.type.startsWith("image/"))
      .map((i) => i.getAsFile())
      .filter(Boolean);
    if (pictures.length === 0) return;
    e.preventDefault();
    addFiles(pictures);
  };
  text.addEventListener("paste", onPasteFiles);

  // Pictures can also be taken from where they already are on the web.
  const urlBox = doc.createElement("div");
  const addUrls = doc.createElement("button");
  addUrls.type = "button";
  addUrls.className = "add-urls";
  addUrls.textContent = t("composer.urls");
  let urlFields = null;
  addUrls.onclick = () => {
    if (urlFields) {
      urlFields.remove();
      urlFields = null;
      return;
    }
    urlFields = doc.createElement("div");
    urlFields.className = "url-fields";
    for (let i = 1; i <= MAX_ATTACHMENTS; i++) {
      const row = doc.createElement("div");
      row.className = "url-row";
      const url = doc.createElement("input");
      url.type = "url";
      url.className = "url";
      url.placeholder = t("composer.url_n", { count: i });
      url.setAttribute("aria-label", t("composer.url_n", { count: i }));
      const alt = doc.createElement("input");
      alt.type = "text";
      alt.className = "alt";
      alt.placeholder = t("composer.alt");
      alt.setAttribute("aria-label", `${t("composer.alt")} ${i}`);
      row.append(url, alt);
      urlFields.append(row);
    }
    urlBox.append(urlFields);
  };
  const readUrls = () => (urlFields
    ? [...urlFields.querySelectorAll(".url-row")]
      .map((r) => ({ url: r.querySelector("input.url").value.trim(), alt: r.querySelector("input.alt").value.trim() }))
      .filter((r) => r.url)
    : []);

  // How the text is read (stabbypossum renders Markdown or HTML, or shows plain text) and its language.
  const format = doc.createElement("select");
  format.className = "format";
  format.setAttribute("aria-label", t("composer.format"));
  for (const [value, key] of [["text/markdown", "markdown"], ["text/plain", "plain"], ["text/html", "html"]]) {
    const o = doc.createElement("option");
    o.value = value;
    o.textContent = t(`composer.format_${key}`);
    o.selected = value === "text/markdown";
    format.append(o);
  }
  if (target.quote) format.disabled = true;
  const language = doc.createElement("input");
  language.type = "text";
  language.className = "language";
  language.maxLength = 12;
  language.placeholder = t("composer.language");
  language.setAttribute("aria-label", t("composer.language"));

  // HTML is written in a minimal editor (bold, italic, strike-through), not as markup.
  const rich = createRichEditor({ doc, t });
  const richBox = doc.createElement("div");
  richBox.className = "rich-box";
  richBox.append(rich.toolbar, rich.element);
  rich.element.addEventListener("paste", onPasteFiles);
  let htmlMode = false;
  const selectedFormat = () => [...format.options].find((o) => o.selected)?.value ?? "text/markdown";
  format.onchange = () => {
    const wantHtml = selectedFormat() === "text/html" && !target.quote;
    if (wantHtml === htmlMode) return;
    if (wantHtml) {
      rich.setPlain(text.value);
      text.hidden = true;
      text.after(richBox);
    } else {
      text.value = rich.plain();
      richBox.remove();
      text.hidden = false;
      saveDraft(storage, draftKey, text.value);
    }
    htmlMode = wantHtml;
  };
  const currentText = () => (htmlMode ? rich.html() : text.value);
  // The words alone, spaces collapsed: how a post sent earlier is recognised again.
  const plainKey = () => (htmlMode ? rich.plain() : text.value).replace(/\s+/g, " ").trim();

  // Emoji: a panel with search and recent ones; the :shortcode: goes where the cursor is.
  const emojiBtn = doc.createElement("button");
  emojiBtn.type = "button";
  emojiBtn.className = "emoji";
  emojiBtn.textContent = "😀";
  emojiBtn.setAttribute("aria-label", t("composer.emoji"));
  emojiBtn.title = t("composer.emoji");
  const emojiBox = doc.createElement("div");
  let emojiPanel = null;
  function insertEmoji(e) {
    const code = `:${e.shortcode}: `;
    if (htmlMode) {
      rich.insertText(code);
      return;
    }
    const value = text.value;
    if (cursorKnown && typeof text.selectionStart === "number") {
      const a = text.selectionStart;
      const b = text.selectionEnd ?? a;
      text.value = value.slice(0, a) + code + value.slice(b);
      const at = a + code.length;
      text.selectionStart = text.selectionEnd = at;
    } else {
      text.value = value + (value && !/\s$/.test(value) ? " " : "") + code;
    }
    saveDraft(storage, draftKey, text.value);
  }
  emojiBtn.onclick = () => {
    if (emojiPanel) {
      emojiPanel.remove();
      emojiPanel = null;
      return;
    }
    emojiPanel = createEmojiPanel({ doc, api, t, storage, onPick: insertEmoji });
    emojiBox.append(emojiPanel);
    emojiPanel.querySelector("input")?.focus?.();
  };

  const error = doc.createElement("p");
  error.className = "error";
  error.setAttribute("role", "alert");

  const send = doc.createElement("button");
  send.type = "submit";
  send.textContent = t("composer.send");

  form.append(cw, text, emojiBtn, emojiBox, vis, format, language, draftLabel, when, addPoll, pollBox, files, attachList, addUrls, urlBox, error, send);
  if (onCancel) {
    const cancel = doc.createElement("button");
    cancel.type = "button";
    cancel.className = "cancel";
    cancel.textContent = t("composer.cancel");
    cancel.onclick = onCancel;
    form.append(cancel);
  }
  if (onQuote && target.canQuote) {
    const quote = doc.createElement("button");
    quote.type = "button";
    quote.className = "quote";
    quote.title = t("composer.quote_hint");
    quote.textContent = t("status.quote");
    quote.onclick = () => onQuote(text.value.trim());
    form.append(quote);
  }

  // When a send ends with no answer at all (network lost, timeout) the post may or may not
  // exist. The next send of the same text first looks for it among the latest posts, so a
  // post is not published twice.
  const plain = (html) => {
    const box = doc.createElement("div");
    box.append(sanitizeHtml(html || "", doc));
    return box.textContent.replace(/\s+/g, " ").trim();
  };
  let unsure = "";
  async function findSent(key) {
    if (!accountId) return null;
    try {
      const recent = await api.get("/api/v1/timelines/home", { limit: "10" });
      return recent.find((s) => s.account?.id === accountId && plain(s.content) === key) ?? null;
    } catch {
      return null;
    }
  }
  function finish(posted) {
    unsure = "";
    text.value = "";
    rich.clear();
    cw.value = "";
    attachments.length = 0;
    language.value = "";
    if (urlFields) addUrls.onclick();
    draft.checked = false;
    when.value = "";
    if (pollFields) addPoll.onclick();
    attachList.replaceChildren();
    saveDraft(storage, draftKey, "");
    onPosted?.(posted);
  }

  form.onsubmit = async (e) => {
    e.preventDefault();
    error.textContent = "";
    const ownText = target.quote ? text.value.replace(/^>.*$/gm, "").trim() : htmlMode ? rich.html() : text.value.trim();
    const remote = readUrls();
    if (!ownText && attachments.length === 0 && remote.length === 0) return;
    const poll = readPoll();
    if (poll && poll.options.length < 2) {
      error.textContent = t("composer.poll_min");
      return;
    }
    if (remote.some((r) => !/^https?:\/\//i.test(r.url))) {
      error.textContent = t("composer.url_invalid");
      return;
    }
    if (attachments.length + remote.length > MAX_ATTACHMENTS) {
      error.textContent = t("composer.too_many");
      return;
    }
    if (poll && (attachments.length > 0 || remote.length > 0)) {
      error.textContent = t("composer.poll_media");
      return;
    }
    send.disabled = true;
    try {
      const key = plainKey();
      if (unsure && unsure === key) {
        const found = await findSent(key);
        if (found) return finish(found);
      }
      for (const a of attachments) {
        if (!a.id) {
          a.id = (await uploadMedia(api, a.file, a.alt)).id;
          a.sentAlt = a.alt;
        } else if (a.alt !== a.sentAlt) {
          // Already up from an earlier try, and the alt text was changed since.
          await setMediaDescription(api, a.id, a.alt);
          a.sentAlt = a.alt;
        }
      }
      const posted = await postStatus(api, buildStatusParams({
        text: currentText(),
        spoiler: cw.value.trim(),
        visibility: target.quote ? "private" : groupSel.value ? "public" : vis.value,
        quotedStatusId: target.quote?.id,
        contentType: target.quote ? "text/markdown" : selectedFormat(),
        language: language.value.trim(),
        remote,
        poll,
        group: groupSel.value,
        draft: draft.checked,
        scheduledAt: when.value ? new Date(when.value).toISOString() : "",
        inReplyToId: target.inReplyToId,
        mediaIds: attachments.map((a) => a.id),
      }));
      finish(posted);
    } catch (err) {
      // No answer at all: the network failed (TypeError from fetch) or the request timed out.
      if (err instanceof TypeError || err?.name === "TimeoutError" || err?.name === "AbortError") {
        unsure = plainKey();
        error.textContent = t("composer.send_unsure");
      } else {
        error.textContent = t("composer.send_failed");
      }
    } finally {
      send.disabled = false;
    }
  };
  return form;
}
