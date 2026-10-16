import { sanitizeHtml, safeUrl } from "./sanitize.js";

function el(doc, tag, cls, text) {
  const e = doc.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(doc, cls, icon, label, onclick) {
  const b = el(doc, "button", cls, icon);
  b.type = "button";
  b.setAttribute("aria-label", label);
  b.title = label;
  b.onclick = onclick;
  return b;
}

// Locks or unlocks only this card's own action row (not buttons of an open thread).
export function setActionsDisabled(card, disabled) {
  card.querySelectorAll(":scope > .actions button").forEach((b) => { b.disabled = disabled; });
}

export function renderStatusCard(input, { doc, t, actions, inThread = false }) {
  const status = input.reblog || input;
  const account = status.account || {};
  const card = el(doc, "article", "status");
  card.dataset.statusId = status.id;
  if (inThread) card.dataset.inThread = "1";

  if (input.reblog) {
    const who = input.account?.display_name || input.account?.acct || "";
    card.append(el(doc, "div", "boosted-by", t("status.boosted_by", { name: who })));
  }

  const ancestors = el(doc, "div", "ancestors");
  ancestors.hidden = true;
  card.append(ancestors);

  const head = el(doc, "header", "head");
  if (safeUrl(account.avatar)) {
    const img = el(doc, "img", "avatar");
    img.src = safeUrl(account.avatar);
    img.alt = "";
    img.loading = "lazy";
    head.append(img);
  }
  const who = el(doc, "span", "who");
  who.append(el(doc, "strong", "", account.display_name || account.username || account.acct || ""));
  who.append(el(doc, "span", "acct", ` @${account.acct || ""}`));
  head.append(who);
  const groups = Array.isArray(status.xenomorph_community) ? status.xenomorph_community : [];
  if (groups.length) {
    const names = groups.slice(0, 2).join(",") + (groups.length > 2 ? "..." : "");
    head.append(el(doc, "span", "via", t("status.via", { groups: names })));
  }
  if (status.created_at) {
    const time = el(doc, "time", "time", new Date(status.created_at).toLocaleString());
    time.setAttribute("datetime", status.created_at);
    const href = safeUrl(status.url);
    if (href) {
      const link = el(doc, "a", "permalink");
      link.href = href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.append(time);
      head.append(link);
    } else {
      head.append(time);
    }
  }
  card.append(head);

  const body = el(doc, "div", "body");
  body.append(sanitizeHtml(status.content || "", doc));
  if (status.spoiler_text) {
    card.append(el(doc, "p", "cw", status.spoiler_text));
    const toggle = el(doc, "button", "cw-toggle", t("status.cw_show"));
    toggle.type = "button";
    toggle.setAttribute("aria-expanded", "false");
    body.hidden = true;
    toggle.onclick = () => {
      const open = toggle.getAttribute("aria-expanded") !== "true";
      toggle.setAttribute("aria-expanded", String(open));
      body.hidden = !open;
    };
    card.append(toggle);
  }
  card.append(body);

  const media = status.media_attachments || [];
  if (media.length) {
    const box = el(doc, "div", "media");
    for (const m of media) {
      const url = safeUrl(m.url);
      const preview = safeUrl(m.preview_url) || url;
      if (!url) {
        box.append(el(doc, "span", "attachment", m.description || ""));
      } else if (m.type === "image") {
        const img = el(doc, "img", "attachment");
        img.src = preview;
        img.alt = m.description || "";
        img.loading = "lazy";
        box.append(img);
      } else if (m.type === "video" || m.type === "gifv") {
        const v = el(doc, "video", "attachment");
        v.src = url;
        v.controls = true;
        if (m.type === "gifv") { v.loop = true; v.muted = true; }
        box.append(v);
      } else {
        const a = el(doc, "a", "attachment", m.description || url);
        a.href = url;
        a.rel = "noopener noreferrer";
        box.append(a);
      }
    }
    if (status.sensitive) {
      box.hidden = true;
      const show = el(doc, "button", "media-toggle", t("status.show_media"));
      show.type = "button";
      show.onclick = () => { box.hidden = false; show.hidden = true; };
      card.append(show);
    }
    card.append(box);
  }

  const row = el(doc, "footer", "actions");
  const state = status.xenomorph_state;
  if (state === "draft" || state === "scheduled") {
    card.append(el(doc, "p", "state", t(state === "draft" ? "status.state_draft" : "status.state_scheduled")));
    if (state === "draft") {
      row.append(button(doc, "publish", "⇪", t("status.publish"), () => actions.onPublish(status, card)));
    }
    row.append(button(doc, "discard", "🗑", t("status.discard"), () => actions.onDiscard(status, card)));
    card.append(row);
    return card;
  }
  row.append(button(doc, "reply", "↩", t("status.reply"), () => actions.onReply(status, card)));
  if (status.in_reply_to_id && !inThread) {
    const up = el(doc, "button", "ancestors-toggle", t("status.ancestors"));
    up.type = "button";
    up.onclick = () => actions.onToggleAncestors?.(status, card);
    row.append(up);
  }
  const count = status.replies_count || 0;
  if (count > 0 && !inThread) {
    const tg = el(doc, "button", "replies-toggle", t("status.replies", { count }));
    tg.type = "button";
    tg.onclick = () => actions.onToggleThread(status, card);
    row.append(tg);
  }
  const like = button(doc, "like", "★", t(status.favourited ? "status.unlike" : "status.like"), () => actions.onFavourite(status, card));
  if (status.favourited) like.classList.add("active");
  row.append(like);
  const dis = button(doc, "dislike", "👎", t(status.disliked ? "status.undislike" : "status.dislike"), () => actions.onDislike(status, card));
  if (status.disliked) dis.classList.add("active");
  row.append(dis);
  const saved = button(doc, "bookmark", "🔖", t(status.bookmarked ? "status.unbookmark" : "status.bookmark"), () => actions.onBookmark(status, card));
  if (status.bookmarked) saved.classList.add("active");
  row.append(saved);
  if (actions.isOwn?.(status)) {
    const pin = button(doc, "pin", "📌", t(status.pinned ? "status.unpin" : "status.pin"), () => actions.onPin(status, card));
    if (status.pinned) pin.classList.add("active");
    row.append(pin);
  }
  card.append(row);

  const thread = el(doc, "div", "thread");
  thread.hidden = true;
  card.append(thread);
  return card;
}
