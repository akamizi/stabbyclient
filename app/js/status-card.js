// Draws one post as a card (DOM, never strings of HTML): text, content warning, pictures, poll,
// buttons and the menu. Nothing here talks to the server: the buttons call the functions given
// in `actions`, which app.js supplies.
import { sanitizeHtml, safeUrl } from "./sanitize.js";
import { emojifyText, emojifyNode } from "./emoji-text.js";
import { el } from "./dom.js";


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

// A button label with a count after it when there is one.
const withCount = (icon, n) => (Number(n) > 0 ? `${icon} ${Number(n)}` : icon);

const pct = (poll, o) => (poll.votes_count ? Math.round((Number(o.votes_count || 0) / Number(poll.votes_count)) * 100) : 0);

// With a zoom handler the picture sits in a button that opens it full size.
function zoomable(doc, t, img, fullUrl, alt, actions, stop = false) {
  if (!actions.onZoom) return img;
  const b = el(doc, "button", "zoom");
  b.type = "button";
  b.setAttribute("aria-label", t("status.zoom"));
  b.onclick = (e) => {
    if (stop) e?.stopPropagation?.();
    actions.onZoom(fullUrl, alt);
  };
  b.append(img);
  return b;
}

// A poll: results always, and a vote form while it is open and the user has not voted.
function renderPoll(doc, t, status, poll, actions) {
  const form = el(doc, "form", "poll");
  const type = poll.multiple ? "checkbox" : "radio";
  const mine = new Set(poll.own_votes || []);
  const open = !poll.expired && !poll.voted && Boolean(actions.onVote);
  poll.options.forEach((o, i) => {
    const row = el(doc, "label", `poll-option${mine.has(i) ? " mine" : ""}`);
    if (open) {
      const input = el(doc, "input");
      input.type = type;
      input.name = "poll-choice";
      input.value = String(i);
      row.append(input);
    }
    row.append(el(doc, "span", "poll-title", o.title || ""), el(doc, "span", "poll-votes", ` ${pct(poll, o)}% (${Number(o.votes_count || 0)})`));
    form.append(row);
  });
  let footer = t("status.poll_votes", { count: poll.votes_count || 0 });
  if (poll.expires_at) {
    footer += ` · ${t(poll.expired ? "status.poll_closed" : "status.poll_closes", { date: new Date(poll.expires_at).toLocaleString() })}`;
  }
  form.append(el(doc, "div", "poll-footer", footer));
  const error = el(doc, "p", "error");
  error.setAttribute("role", "alert");
  form.append(error);
  if (open) {
    const vote = el(doc, "button", "btn-primary", t("status.vote"));
    vote.type = "submit";
    form.append(vote);
    form.onsubmit = async (e) => {
      e.preventDefault();
      const choices = [...form.querySelectorAll("input")].filter((x) => x.checked).map((x) => Number(x.value));
      if (!choices.length) return;
      error.textContent = "";
      vote.disabled = true;
      try {
        form.replaceWith(renderPoll(doc, t, status, await actions.onVote(status, choices), actions));
      } catch {
        error.textContent = t("error.action_failed");
        vote.disabled = false;
      }
    };
  }
  return form;
}

// The post a quoting post quotes, as the server took it: author, text (or its warning), first image.
function renderQuote(doc, t, quoted, actions) {
  const box = el(doc, "div", "quote");
  box.onclick = (e) => {
    if (e?.target?.closest?.("a")) return;
    actions.onOpenStatus?.(quoted.id);
  };
  const head = el(doc, "div", "quote-head");
  const avatar = safeUrl(quoted.account.avatar);
  if (avatar) {
    const img = el(doc, "img", "avatar");
    img.src = avatar;
    img.alt = "";
    img.loading = "lazy";
    head.append(img);
  }
  const quoteName = el(doc, "strong");
  quoteName.append(emojifyText(quoted.account.display_name || quoted.account.username || quoted.account.acct || "", quoted.account.emojis, doc));
  head.append(quoteName, el(doc, "span", "acct", ` @${quoted.account.acct || ""}`));
  box.append(head);
  const text = el(doc, "div", "quote-text");
  if (quoted.spoiler_text) text.append(emojifyText(quoted.spoiler_text, quoted.emojis, doc));
  else {
    text.append(sanitizeHtml(quoted.content || "", doc, { dropClasses: ["quote-inline"] }));
    emojifyNode(text, quoted.emojis, doc);
  }
  box.append(text);
  const image = (quoted.media_attachments || []).find((m) => m.type === "image");
  const src = image && !quoted.sensitive ? safeUrl(image.preview_url) || safeUrl(image.url) : null;
  if (src) {
    const img = el(doc, "img", "quote-image");
    img.src = src;
    img.alt = image.description || "";
    img.loading = "lazy";
    box.append(zoomable(doc, t, img, safeUrl(image.url) || src, image.description || "", actions, true));
  }
  return box;
}

// After an action the server answers with the post itself; on a boosted card that must go
// back inside the boost so the "boosted by" line stays.
export function rewrap(previous, updated) {
  if (!previous?.reblog || updated?.reblog) return updated;
  return { ...previous, reblog: updated };
}

export function renderStatusCard(input, { doc, t, actions, inThread = false }) {
  const status = input.reblog || input;
  const account = status.account || {};
  const card = el(doc, "article", "status");
  card.dataset.statusId = status.id;
  card.stabbyInput = input;
  if (inThread) card.dataset.inThread = "1";

  if (input.reblog) {
    const who = input.account?.display_name || input.account?.acct || "";
    card.append(el(doc, "div", "boosted-by", t("status.boosted_by", { name: who })));
  }

  const ancestors = el(doc, "div", "ancestors");
  ancestors.hidden = true;
  card.append(ancestors);

  const head = el(doc, "header", "head");
  // With a profile handler the avatar and the name are buttons that open the profile.
  const toProfile = (node, label) => {
    if (!actions.onProfile) return node;
    const b = el(doc, "button", "author");
    b.type = "button";
    b.setAttribute("aria-label", label);
    b.onclick = () => actions.onProfile(account);
    b.append(node);
    return b;
  };
  if (safeUrl(account.avatar)) {
    const img = el(doc, "img", "avatar");
    img.src = safeUrl(account.avatar);
    img.alt = "";
    img.loading = "lazy";
    head.append(toProfile(img, t("status.open_profile")));
  }
  const who = el(doc, "span", "who");
  const nameEl = el(doc, "strong");
  nameEl.append(emojifyText(account.display_name || account.username || account.acct || "", account.emojis, doc));
  who.append(toProfile(nameEl, t("status.open_profile")));
  who.append(el(doc, "span", "acct", ` @${account.acct || ""}`));
  head.append(who);
  const groups = Array.isArray(status.instance_community) ? status.instance_community : [];
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
  const postLang = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/i.test(status.language ?? "") ? status.language : "";
  if (postLang) body.setAttribute("lang", postLang);
  const quoted = status.quote?.quoted_status;
  const quoteBox = quoted?.account ? renderQuote(doc, t, quoted, actions) : null;
  body.append(sanitizeHtml(status.content || "", doc, quoteBox ? { dropClasses: ["quote-inline"] } : {}));
  emojifyNode(body, status.emojis, doc);
  if (status.spoiler_text) {
    const cwLine = el(doc, "p", "cw");
    if (postLang) cwLine.setAttribute("lang", postLang);
    cwLine.append(emojifyText(status.spoiler_text, status.emojis, doc));
    card.append(cwLine);
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
  if (quoteBox) card.append(quoteBox);

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
        box.append(zoomable(doc, t, img, url, m.description || "", actions));
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

  if (status.poll && Array.isArray(status.poll.options)) card.append(renderPoll(doc, t, status, status.poll, actions));

  const reactions = Array.isArray(status.reactions) ? status.reactions : [];
  if (reactions.length) {
    const box = el(doc, "div", "reactions");
    for (const r of reactions) {
      const chip = el(doc, r.me && actions.onUnreact ? "button" : "span", `reaction${r.me ? " active" : ""}`);
      const image = safeUrl(r.static_url) || safeUrl(r.url);
      if (image) {
        const img = el(doc, "img", "emoji");
        img.src = image;
        img.alt = r.name || "";
        img.title = r.name || "";
        chip.append(img);
      } else {
        chip.append(doc.createTextNode(r.name || ""));
      }
      if (r.count) chip.append(doc.createTextNode(` ${r.count}`));
      if (chip.tagName === "BUTTON") {
        chip.type = "button";
        chip.title = t("status.unreact");
        chip.onclick = () => actions.onUnreact(status, card, r.name);
      }
      box.append(chip);
    }
    card.append(box);
  }

  const row = el(doc, "footer", "actions");
  const state = status.instance_state;
  if (state === "draft" || state === "scheduled") {
    card.append(el(doc, "p", "state", t(state === "draft" ? "status.state_draft" : "status.state_scheduled")));
    if (state === "draft") {
      row.append(button(doc, "publish", "⇪", t("status.publish"), () => actions.onPublish(status, card)));
    }
    row.append(button(doc, "discard", "🗑", t("status.discard"), () => actions.onDiscard(status, card)));
    card.append(row);
    return card;
  }
  row.append(button(doc, "reply btn-quote", "↩", t("status.reply"), () => actions.onReply(status, card)));
  // Previous/next posts of the conversation get a row of their own above the icons, so the
  // icons and the menu never wrap.
  const links = el(doc, "div", "thread-links");
  if (status.in_reply_to_id && !inThread) {
    const up = el(doc, "button", "ancestors-toggle", t("status.ancestors"));
    up.type = "button";
    up.onclick = () => actions.onToggleAncestors?.(status, card);
    links.append(up);
  }
  const count = status.replies_count || 0;
  if (count > 0 && !inThread) {
    const tg = el(doc, "button", "replies-toggle", t("status.replies", { count }));
    tg.type = "button";
    tg.onclick = () => actions.onToggleThread(status, card);
    links.append(tg);
  }
  if (links.childElementCount) card.append(links);
  const like = button(doc, "like", withCount("★", status.favourites_count), t(status.favourited ? "status.unlike" : "status.like"), () => actions.onFavourite(status, card));
  if (status.favourited) like.classList.add("active");
  row.append(like);
  if (actions.onBoost) {
    const boost = button(doc, "boost", withCount("⟳", status.reblogs_count), t(status.reblogged ? "status.unboost" : "status.boost"), () => actions.onBoost(status, card));
    if (status.reblogged) boost.classList.add("active");
    boost.disabled = !["public", "unlisted"].includes(status.visibility);
    row.append(boost);
  }
  // Dislike sits apart on the right, next to the menu, so a thumb aiming at the others misses it.
  const dis = button(doc, "dislike", "💩", t(status.disliked ? "status.undislike" : "status.dislike"), () => actions.onDislike(status, card));
  if (status.disliked) dis.classList.add("active");
  row.append(dis);
  // The hidden menu on the right: only what the handlers support is offered.
  const items = [];
  const item = (cls, text, handler) => {
    const b = el(doc, "button", cls, text);
    b.type = "button";
    b.onclick = () => { menu.hidden = true; more.setAttribute("aria-expanded", "false"); handler(status, card); };
    items.push(b);
  };
  const own = Boolean(actions.isOwn?.(status));
  if (actions.onReact) item("react", t("status.react"), actions.onReact);
  if (actions.onLikedBy) item("liked-by", t("status.liked_by"), actions.onLikedBy);
  if (actions.onBoostedBy) item("boosted-by", t("status.boosted_by"), actions.onBoostedBy);
  if (actions.onQuote && ["public", "unlisted"].includes(status.visibility)) item("quote", t("status.quote"), actions.onQuote);
  if (actions.onBookmark) item(status.bookmarked ? "bookmark active" : "bookmark", t(status.bookmarked ? "status.unbookmark" : "status.bookmark"), actions.onBookmark);
  if (actions.onHide) item("hide", t("status.hide"), actions.onHide);
  if (own && actions.onPin) item(status.pinned ? "pin active" : "pin", t(status.pinned ? "status.unpin" : "status.pin"), actions.onPin);
  if (own && actions.onEdit) item("edit", t("status.edit"), actions.onEdit);
  if (own && actions.onDelete) item("delete", t("status.delete"), actions.onDelete);
  if (!own && actions.onReport) item("report", t("status.report"), actions.onReport);
  const menu = el(doc, "div", "post-menu");
  menu.hidden = true;
  const more = button(doc, "more", "⋯", t("status.more"), null);
  more.setAttribute("aria-haspopup", "true");
  more.setAttribute("aria-expanded", "false");
  if (items.length) {
    menu.append(...items);
    more.onclick = (e) => {
      e?.stopPropagation?.();
      const open = menu.hidden;
      doc.querySelectorAll(".post-menu").forEach((m) => { m.hidden = true; });
      menu.hidden = !open;
      more.setAttribute("aria-expanded", String(open));
    };
    const wrap = el(doc, "span", "more-wrap");
    wrap.append(more, menu);
    row.append(wrap);
  }
  card.append(row);

  const thread = el(doc, "div", "thread");
  thread.hidden = true;
  card.append(thread);
  return card;
}
