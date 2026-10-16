import { sanitizeHtml } from "./sanitize.js";

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

export function renderStatusCard(input, { doc, t, actions }) {
  const status = input.reblog || input;
  const account = status.account || {};
  const card = el(doc, "article", "status");
  card.dataset.statusId = status.id;

  if (input.reblog) {
    const who = input.account?.display_name || input.account?.acct || "";
    card.append(el(doc, "div", "boosted-by", t("status.boosted_by", { name: who })));
  }

  const head = el(doc, "header", "head");
  if (account.avatar) {
    const img = el(doc, "img", "avatar");
    img.src = account.avatar;
    img.alt = "";
    img.loading = "lazy";
    head.append(img);
  }
  const who = el(doc, "span", "who");
  who.append(el(doc, "strong", "", account.display_name || account.username || account.acct || ""));
  who.append(el(doc, "span", "acct", ` @${account.acct || ""}`));
  head.append(who);
  if (status.created_at) {
    const time = el(doc, "time", "time", new Date(status.created_at).toLocaleString());
    time.setAttribute("datetime", status.created_at);
    head.append(time);
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
      if (m.type === "image") {
        const img = el(doc, "img", "attachment");
        img.src = m.preview_url || m.url;
        img.alt = m.description || "";
        img.loading = "lazy";
        box.append(img);
      } else if (m.type === "video" || m.type === "gifv") {
        const v = el(doc, "video", "attachment");
        v.src = m.url;
        v.controls = true;
        if (m.type === "gifv") { v.loop = true; v.muted = true; }
        box.append(v);
      } else {
        const a = el(doc, "a", "attachment", m.description || m.url);
        a.href = m.url;
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
  row.append(button(doc, "reply", "↩", t("status.reply"), () => actions.onReply(status)));
  const count = status.replies_count || 0;
  if (count > 0) {
    const tg = el(doc, "button", "replies-toggle", t("status.replies", { count }));
    tg.type = "button";
    tg.onclick = () => actions.onToggleThread(status);
    row.append(tg);
  }
  const repost = button(doc, "repost", "⟳", t("status.boost"), () => actions.onBoost?.(status));
  repost.disabled = !["public", "unlisted"].includes(status.visibility);
  if (status.reblogged) repost.classList.add("active");
  row.append(repost);
  const like = button(doc, "like", "★", t(status.favourited ? "status.unlike" : "status.like"), () => actions.onFavourite(status));
  if (status.favourited) like.classList.add("active");
  row.append(like);
  const dis = button(doc, "dislike", "👎", t(status.disliked ? "status.undislike" : "status.dislike"), () => actions.onDislike(status));
  if (status.disliked) dis.classList.add("active");
  row.append(dis);
  card.append(row);

  const thread = el(doc, "div", "thread");
  thread.hidden = true;
  card.append(thread);
  return card;
}
