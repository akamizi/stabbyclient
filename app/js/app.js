// The composition root: builds i18n, api, session, timelines, composer, modal, profile and the
// More pages from the other modules and wires them to the page. Anything with logic of its own
// lives in those modules, as a factory taking its dependencies; this file only connects them.
import { BASE_PATH, SCOPES, VERSION } from "./config.js";
import { createDiagnostics, diagnosticLines } from "./diagnostics.js";
import { createApi } from "./api.js";
import { createI18n } from "./i18n.js";
import en from "./locales/en.js";
import it from "./locales/it.js";
import { applyTheme, loadThemePref } from "./theme.js";
import { applyFont, loadFontPref } from "./font.js";
import { loadMe } from "./me.js";
import { expireSession } from "./session-expiry.js";
import { createTimelineCache } from "./cache.js";
import { createTimelineView } from "./timeline.js";
import { showToast } from "./toast.js";
import { safeUrl } from "./sanitize.js";
import { createComposer, clearAllDrafts } from "./composer.js";
import { startPolling } from "./notifications.js";
import { createNotificationsController } from "./notifications-controller.js";
import { renderNotifications } from "./notifications-view.js";
import { replyMentions, mentionText } from "./thread.js";
import { toggleThread, toggleAncestors, insertReply } from "./thread-view.js";
import { THREAD_INITIAL_REPLIES, POLL_MS } from "./config.js";
import { setFavourite, setDislike, setBoost, setBookmark, setPin } from "./statuses.js";
import { attachEmojiPicker } from "./emoji-picker.js";
import { renderAnnouncements, loadDismissed, saveDismissed } from "./announcements.js";
import { createModal } from "./modal.js";
import { personItem } from "./person.js";
import { markActiveTab } from "./tabs.js";
import { createPageTitle } from "./page-title.js";
import { swapCard } from "./card-swap.js";
import { createLightbox } from "./lightbox.js";
import { createInlineForm } from "./inline-form.js";
import { MORE_ENTRIES, createMorePages } from "./more.js";
import { createProfile } from "./profile.js";
import { renderStatusCard, setActionsDisabled, rewrap } from "./status-card.js";
import { beginLogin, completeLogin, createSession, dropLegacyKeys, revokeSession } from "./auth.js";

const i18n = createI18n({ catalogs: { en, it }, fallback: "en" });
const t = i18n.t.bind(i18n);
function langPref() {
  try { return localStorage.getItem("stabbyclient.lang") || "auto"; } catch { return "auto"; }
}
i18n.setLang(langPref());
document.documentElement.lang = i18n.lang;
const setPageTitle = createPageTitle({ doc: document });

applyTheme(document, loadThemePref(localStorage), (q) => matchMedia(q), localStorage);
applyFont(document, loadFontPref(localStorage), localStorage);

function field(labelKey, options, current, onChange) {
  const label = document.createElement("label");
  label.className = "menu-field";
  const text = document.createElement("span");
  text.textContent = t(labelKey);
  const el = document.createElement("select");
  for (const [value, name] of options) {
    const o = document.createElement("option");
    o.value = value;
    o.textContent = name;
    o.selected = value === current;
    el.append(o);
  }
  el.onchange = () => onChange(el.value);
  label.append(text, el);
  return label;
}

// A header button that opens a hidden panel; tapping outside or Esc closes it.
// showLabel: the name of the menu is written next to its glyph (the More menu: "⋯ More").
function makeMenu(glyph, labelKey, onOpen, showLabel = false) {
  const toggle = document.createElement("button");
  toggle.className = "menu-toggle";
  toggle.textContent = showLabel ? `${glyph} ${t(labelKey)}` : glyph;
  toggle.setAttribute("aria-label", t(labelKey));
  toggle.setAttribute("aria-haspopup", "true");
  toggle.setAttribute("aria-expanded", "false");
  const panel = document.createElement("div");
  panel.className = "menu-panel";
  panel.hidden = true;
  const setOpen = (open) => {
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
  };
  toggle.onclick = (e) => { e.stopPropagation(); const was = panel.hidden; closeMenus(); if (was) onOpen?.(); setOpen(was); };
  panel.onclick = (e) => e.stopPropagation();
  menus.push(() => setOpen(false));
  return { toggle, panel, close: () => setOpen(false) };
}
const diag = createDiagnostics();
let diagAccount = "";
const menus = [];
const closeMenus = () => {
  menus.forEach((close) => close());
  document.querySelectorAll(".post-menu").forEach((m) => { m.hidden = true; });
};
document.addEventListener("click", closeMenus);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenus(); });

// The More menu sits next to the settings menu once the user is logged in; the
// handler it calls is set when the pages exist.
let onMoreEntry = () => {};
function renderControls() {
  const box = document.getElementById("controls");
  menus.length = 0;
  const diagBox = document.createElement("div");
  diagBox.className = "menu-diag";
  const { toggle, panel } = makeMenu("\u2630", "menu.label", () => {
    diagBox.replaceChildren(...diagnosticLines({ diag, version: VERSION, account: diagAccount, t }).map((line) => {
      const p = document.createElement("p");
      p.textContent = line;
      return p;
    }));
  });
  const more = makeMenu("\u22EF", "more.label", undefined, true);
  if (session.load()) {
    for (const entry of MORE_ENTRIES) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "more-entry";
      b.textContent = `${entry.icon} ${t(`more.${entry.id}`)}`;
      b.onclick = () => { closeMenus(); onMoreEntry(entry.id); };
      more.panel.append(b);
    }
  }
  panel.append(
    field("theme.label",
      [["auto", t("theme.auto")], ["light", t("theme.light")], ["dark", t("theme.dark")], ["contrast", t("theme.contrast")]],
      loadThemePref(localStorage),
      (v) => applyTheme(document, v, (q) => matchMedia(q), localStorage)),
    field("font.label",
      [["proportional", t("font.proportional")], ["mono", t("font.mono")], ["dyslexic", t("font.dyslexic")]],
      loadFontPref(localStorage),
      (v) => applyFont(document, v, localStorage)),
    field("lang.label",
      [["auto", t("lang.auto")], ["en", "English"], ["it", "Italiano"]],
      langPref(),
      (v) => {
        try { localStorage.setItem("stabbyclient.lang", v); } catch { /* session only */ }
        location.reload();
      }),
  );
  if (session.load()) {
    const out = document.createElement("button");
    out.textContent = t("login.logout");
    out.onclick = async () => {
      out.disabled = true;
      await revokeSession({ fetchFn, storage: localStorage, session });
      session.clear();
      createTimelineCache.clearAll(localStorage);
      clearAllDrafts(localStorage);
      try { localStorage.removeItem("stabbyclient.me"); } catch { /* ignore */ }
      location.reload();
    };
    panel.append(out);
  }
  panel.append(diagBox);
  // The More menu is the first thing on the left of the header (as in stabbypossum's own
  // interface); before login there is no menu, and the app's name stands there.
  const left = document.getElementById("menu-left");
  if (session.load()) {
    left.replaceChildren(more.toggle, more.panel);
  } else {
    const name = document.createElement("span");
    name.className = "title";
    name.textContent = "Stabbyclient";
    left.replaceChildren(name);
  }
  box.replaceChildren(toggle, panel);
}

const root = document.getElementById("app");
dropLegacyKeys(localStorage);
dropLegacyKeys(sessionStorage);
const session = createSession(localStorage);
const redirectUri = location.origin + BASE_PATH;
const fetchFn = (u, o) => fetch(u, o);

function show(text, withLogin) {
  setPageTitle("");
  root.replaceChildren();
  const p = document.createElement("p");
  p.textContent = text;
  root.append(p);
  if (withLogin) {
    const b = document.createElement("button");
    b.classList.add("btn-primary");
    b.textContent = t("login.button");
    b.onclick = login;
    root.append(b);
  }
}

const loginEnv = () => ({
  fetchFn, storage: localStorage, sessionStore: sessionStorage, session, redirectUri, scope: SCOPES,
});

async function login() {
  try {
    location.href = await beginLogin({ ...loginEnv(), newState: () => crypto.randomUUID() });
  } catch (e) {
    show(t(e instanceof TypeError ? "login.offline" : "login.failed", { reason: e.message }), true);
  }
}

// When the instance has sent the browser back: save the token, or say why not.
async function handleReturn() {
  const search = location.search;
  const result = await completeLogin({ ...loginEnv(), search });
  if (result.status !== "none") history.replaceState(null, "", BASE_PATH);
  return result;
}

// What the toast says after a send: a draft and a scheduled post are kept, not shown.
function postedKey(st) {
  if (st?.instance_state === "draft") return "composer.saved_draft";
  if (st?.instance_state === "scheduled" || st?.scheduled_at) return "composer.scheduled";
  return "composer.posted";
}

async function main() {
  renderControls();
  const back = await handleReturn();
  if (back.status === "denied") return show(t("login.denied"), true);
  if (back.status === "failed") return show(t(back.offline ? "login.offline" : "login.failed", { reason: back.reason }), true);
  renderControls();
  const s = session.load();
  if (!s) return show(t("login.not_logged_in"), true);
  const api = createApi({
    fetchFn, getToken: () => s.token,
    onUnauthorized: () => { expireSession({ session, doc: document, storage: localStorage }); show(t("login.expired"), true); },
  });
  try {
    const { me, offline } = await loadMe(api, localStorage, s.token);
    diagAccount = `@${me.acct} (${me.id})`;
    const nav = document.createElement("nav");
    nav.className = "tabs";
    const mkTab = (label) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      return b;
    };
    const homeTab = mkTab(t("nav.home"));
    const notifTab = mkTab(t("nav.notifications"));
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.hidden = true;
    notifTab.append(badge);
    const fedTab = mkTab(t("nav.federated"));
    const groupsTab = mkTab(t("nav.groups"));
    nav.append(homeTab, fedTab, groupsTab, notifTab);
    const homeBox = document.createElement("div");
    const fedBox = document.createElement("div");
    const groupsBox = document.createElement("div");
    const moreBox = document.createElement("div");
    const profileBox = document.createElement("div");
    const profileBody = document.createElement("div");
    const profileBack = document.createElement("button");
    profileBack.type = "button";
    profileBack.className = "back";
    profileBack.textContent = t("nav.back");
    profileBox.append(profileBack, profileBody);
    profileBox.hidden = true;
    const notifBox = document.createElement("div");
    const detailBox = document.createElement("div");
    notifBox.hidden = true;
    detailBox.hidden = true;
    fedBox.hidden = true;
    groupsBox.hidden = true;
    moreBox.hidden = true;
    root.replaceChildren(nav, homeBox, fedBox, groupsBox, moreBox, notifBox, detailBox, profileBox);
    const renderCard = (st, inThread = false) => renderStatusCard(st, { doc: document, t, actions, inThread });
    // Pessimistic update: lock the card's buttons, call the server, then redraw the
    // card from the returned status. On failure nothing changes and a toast shows.
    // Replaces a card with one drawn from an updated status, keeping what it had open.
    function redraw(card, updated) {
      swapCard(card, renderCard(rewrap(card.stabbyInput, updated), card.dataset.inThread === "1"));
    }
    async function toggle(card, call) {
      setActionsDisabled(card, true);
      try {
        redraw(card, await call());
      } catch (e) {
        setActionsDisabled(card, false);
        if (e.status !== 401) showToast(document, t("error.action_failed"));
      }
    }
    const lightbox = createLightbox({ doc: document, win: window, t });
    const sid = (st) => encodeURIComponent(st.id);
    // Runs a one-shot post action; on failure the card stays and a toast says so.
    async function guarded(card, fn, failKey = "error.action_failed") {
      setActionsDisabled(card, true);
      try {
        await fn();
      } catch (e) {
        setActionsDisabled(card, false);
        // The server answers 500 to deleting a post that has replies or likes; say so.
        if (e.status !== 401) showToast(document, t(e.status === 500 ? failKey : "error.action_failed"));
      }
    }
    const openForm = (card, className, opts) => {
      card.querySelector(`:scope > .${className}`)?.remove();
      const form = createInlineForm({ doc: document, t, className, ...opts });
      card.querySelector(":scope > .actions").after(form);
      form.querySelector("textarea, input")?.focus();
    };
    // A new post or a quote is written in a pop-up over the page, clearly apart from what is
    // underneath.
    const modal = createModal({ doc: document, win: window, t });
    // Who liked or boosted a post, in a pop-up; a name opens that profile.
    async function showPeople(st, op, titleKey) {
      if (modal.isOpen) return;
      const wrap = document.createElement("div");
      const title = document.createElement("h2");
      title.className = "modal-title";
      title.textContent = t(titleKey);
      const list = document.createElement("ul");
      list.className = "people";
      const close = document.createElement("button");
      close.type = "button";
      close.textContent = t("status.close");
      close.onclick = () => modal.close();
      wrap.append(title, list, close);
      modal.open(wrap, { label: t(titleKey) });
      try {
        const accounts = await api.get(`/api/v1/statuses/${sid(st)}/${op}`, { limit: "80" });
        for (const a of accounts) list.append(personItem({ doc: document, account: a, onOpen: (acc) => { modal.close(); openProfile(acc); } }));
        if (!accounts.length) {
          const empty = document.createElement("li");
          empty.className = "empty";
          empty.textContent = t("status.nobody");
          list.append(empty);
        }
      } catch (e) {
        if (e.status !== 401) {
          modal.close();
          showToast(document, t("error.action_failed"));
        }
      }
    }
    const actions = {
      onReply(st, card) {
        if (card.querySelector(":scope > .composer")) return;
        const prefill = mentionText(replyMentions(st, null, me.acct));
        const box = createComposer({
          doc: document, api, t, storage: localStorage, accountId: me.id,
          target: { key: `reply:${st.id}`, inReplyToId: st.id, prefill, visibility: st.visibility, canQuote: ["public", "unlisted"].includes(st.visibility) },
          onQuote: (written) => { box.remove(); actions.onQuote(st, written); },
          onPosted: (posted) => {
            box.remove();
            if (!posted?.instance_state && !posted?.scheduled_at) insertReply({ card, reply: posted, renderCard: (x) => renderCard(x, true) });
            showToast(document, t(postedKey(posted)));
          },
          onCancel: () => box.remove(),
        });
        card.querySelector(":scope > .actions").after(box);
        const field = box.querySelector("textarea");
        field.focus();
        field.setSelectionRange(field.value.length, field.value.length);
        // The rest of the thread comes once /context answers; only if nothing was typed meanwhile.
        api.get(`/api/v1/statuses/${sid(st)}/context`).then((context) => {
          const full = mentionText(replyMentions(st, context, me.acct));
          if (field.isConnected && prefill && field.value === prefill && full !== prefill) {
            field.value = full;
            field.setSelectionRange(full.length, full.length);
          }
        }).catch(() => {});
      },
      async onToggleThread(st, card) {
        try {
          await toggleThread({
            doc: document, card, status: st, api, t, initial: THREAD_INITIAL_REPLIES,
            renderCard: (x) => renderCard(x, true),
          });
        } catch (e) {
          if (e.status !== 401) showToast(document, t("error.action_failed"));
        }
      },
      async onToggleAncestors(st, card, { scroll = true } = {}) {
        try {
          const opened = await toggleAncestors({
            doc: document, card, status: st, api, t, initial: THREAD_INITIAL_REPLIES, scroll,
            renderCard: (x) => renderCard(x, true),
          });
          // Only a click says so; opening a post's own page tries this without being asked.
          if (!opened && scroll) showToast(document, t("status.ancestors_missing"));
        } catch (e) {
          if (e.status !== 401) showToast(document, t("error.action_failed"));
        }
      },
      onReact: (st, card) => openForm(card, "react-form", {
        multiline: false, submitLabel: t("status.react"),
        decorate: (field, form) => form.append(attachEmojiPicker({ doc: document, input: field, api, t })),
        onSubmit: async (emoji) => {
          await api.postJson(`/api/v1/statuses/${sid(st)}/react/${encodeURIComponent(emoji)}`, {});
          redraw(card, await api.get(`/api/v1/statuses/${sid(st)}`));
        },
      }),
      // The react call answers with the reaction itself, not the post: read the post again.
      onUnreact: (st, card, name) => toggle(card, async () => {
        await api.postJson(`/api/v1/statuses/${sid(st)}/unreact/${encodeURIComponent(name)}`, {});
        return api.get(`/api/v1/statuses/${sid(st)}`);
      }),
      onHide: (st, card) => {
        if (!confirm(t("status.hide_confirm"))) return;
        return guarded(card, async () => {
          await api.postJson("/api/v1/stabbypossum/hide", { id: st.id });
          card.remove();
          showToast(document, t("status.hidden"));
        });
      },
      async onEdit(st, card) {
        if (card.querySelector(":scope > .edit-form")) return;
        let source;
        try {
          source = await api.get(`/api/v1/statuses/${sid(st)}/source`);
        } catch (e) {
          if (e.status !== 401) showToast(document, t("error.action_failed"));
          return;
        }
        openForm(card, "edit-form", {
          multiline: true, initial: source.text ?? "", submitLabel: t("status.edit_save"),
          onSubmit: async (text) => {
            redraw(card, await api.putJson(`/api/v1/statuses/${sid(st)}`, { status: text }));
            showToast(document, t("status.edited"));
          },
        });
      },
      onDelete: (st, card) => {
        if (!confirm(t("status.delete_confirm"))) return;
        return guarded(card, async () => {
          await api.del(`/api/v1/statuses/${sid(st)}`);
          card.remove();
          showToast(document, t("status.deleted"));
        }, "status.delete_refused");
      },
      onReport: (st, card) => {
        if (!confirm(t("status.report_confirm"))) return;
        return guarded(card, async () => {
          await api.postJson("/api/v1/reports", { account_id: st.account.id, "status_ids[]": [st.id] });
          setActionsDisabled(card, false);
          showToast(document, t("status.reported"));
        });
      },
      // The address the server gives the post: for an own post its public page, for another
      // instance's post that instance's page. If the clipboard is refused, the toast shows it.
      onCopyLink: async (st) => {
        const url = safeUrl(st.url);
        try {
          await navigator.clipboard.writeText(url);
          showToast(document, t("status.link_copied"));
        } catch {
          showToast(document, url, 10000);
        }
      },
      isOwn: (st) => st.account?.id === me.id,
      onBookmark: (st, card) => toggle(card, () => setBookmark(api, st.id, !st.bookmarked)),
      onPin: (st, card) => toggle(card, () => setPin(api, st.id, !st.pinned)),
      async onPublish(st, card) {
        setActionsDisabled(card, true);
        try {
          await api.postJson("/api/v1/stabbypossum/publish-draft", { id: st.id });
          card.remove();
          showToast(document, t("composer.posted"));
        } catch (e) {
          setActionsDisabled(card, false);
          if (e.status !== 401) showToast(document, t("error.action_failed"));
        }
      },
      async onDiscard(st, card) {
        if (!confirm(t("more.discard_confirm"))) return;
        setActionsDisabled(card, true);
        try {
          await api.postJson("/api/v1/stabbypossum/hide", { id: st.id });
          card.remove();
        } catch (e) {
          setActionsDisabled(card, false);
          if (e.status !== 401) showToast(document, t("error.action_failed"));
        }
      },
      onBoost: (st, card) => toggle(card, () => setBoost(api, st.id, !st.reblogged)),
      onZoom: (url, alt) => lightbox.open(url, alt),
      onProfile: (account) => openProfile(account),
      onOpenStatus: (id) => openDetail(id, { tab: activeTab, y: window.scrollY }),
      onVote: (st, choices) => api.postJson(`/api/v1/polls/${encodeURIComponent(st.poll.id)}/votes`, { choices }),
      onQuote(st, written = "") {
        if (modal.isOpen) return;
        const box = createComposer({
          doc: document, api, t, storage: localStorage, accountId: me.id,
          target: { key: `quote:${st.id}`, quote: st, written },
          onPosted: () => { modal.close(); showToast(document, t("composer.quoted")); },
          onCancel: () => modal.close(),
        });
        const wrap = document.createElement("div");
        const title = document.createElement("h2");
        title.className = "modal-title";
        title.textContent = t("status.quote");
        wrap.append(title, box);
        modal.open(wrap, { label: t("status.quote") });
      },
      onLikedBy: (st) => showPeople(st, "favourited_by", "status.liked_by"),
      onBoostedBy: (st) => showPeople(st, "reblogged_by", "status.boosted_by"),
      onFavourite: (st, card) => toggle(card, () => setFavourite(api, st.id, !st.favourited)),
      onDislike: (st, card) => toggle(card, () => setDislike(api, st.id, !st.disliked)),
    };
    // New-posts indicator lives in the header and acts on whichever timeline is showing.
    const newBtn = document.getElementById("new-posts");
    const pendingCount = { home: 0, federated: 0, groups: 0 };
    let activeTab = "home";
    function paintNew() {
      const n = pendingCount[activeTab] || 0;
      newBtn.hidden = n === 0;
      newBtn.textContent = t("timeline.new_posts", { count: n });
    }
    const views = {};
    // The lists keep stale counts (replies, boosts) and deleted posts; the first posts on screen
    // are read again from the post itself, at most every 90 s per list.
    const lastVerify = {};
    async function verifyView(name) {
      const v = views[name];
      if (!v || Date.now() - (lastVerify[name] ?? 0) < 90000) return;
      lastVerify[name] = Date.now();
      try {
        await v.verify({ fetchOne: (id) => api.get(`/api/v1/statuses/${encodeURIComponent(id)}`), limit: 10 });
      } catch { /* the lists are still right enough; try again later */ }
    }
    // "Load older posts" failing is said out loud (a sign-out is already handled elsewhere).
    const moreFailed = (e) => { if (e.status !== 401) showToast(document, t("error.action_failed")); };
    // Runs a load or refresh and notes the outcome for the diagnostic line in the menu.
    async function checked(name, fn) {
      try {
        await fn();
        diag.record(name, { ok: true, at: new Date(), newest: views[name]?.newest, server: views[name]?.lastFetch?.newest, count: views[name]?.lastFetch?.count, pending: pendingCount[name] });
      } catch (e) {
        diag.record(name, { ok: false, at: new Date(), error: e.message || String(e) });
        throw e;
      }
    }
    newBtn.onclick = () => views[activeTab]?.revealPending();
    const view = views.home = createTimelineView({
      doc: document, container: homeBox, api, cache: createTimelineCache(localStorage, me.id), t,
      renderCard, onPending: (n) => { pendingCount.home = n; paintNew(); }, onError: moreFailed,
    });
    // Federated and Groups: plain timelines, fetched the first time their tab opens.
    const lazyTimeline = (name, box, path) => {
      views[name] = createTimelineView({
        doc: document, container: box, api, cache: createTimelineCache(localStorage, me.id, name), t,
        renderCard, path, onPending: (n) => { pendingCount[name] = n; paintNew(); }, onError: moreFailed,
      });
      let loaded = false;
      return async () => {
        if (loaded) return;
        loaded = true;
        try {
          await checked(name, () => views[name].load());
          verifyView(name);
        } catch (e) {
          loaded = false;
          if (e.status !== 401 && e.status !== 422) showToast(document, t("error.offline"));
        }
      };
    };
    const loadFederated = lazyTimeline("federated", fedBox, "/api/v1/timelines/public");
    const loadGroups = lazyTimeline("groups", groupsBox, "/api/v1/stabbypossum/groups");
    try {
      await checked("home", () => view.load());
      verifyView("home");
    } catch (e) {
      // Offline or server hiccup: whatever the cache drew stays on screen.
      if (e.status !== 401 && e.status !== 422) showToast(document, t("error.offline"));
    }
    if (offline) showToast(document, t("error.offline"));
    // Instance announcements sit above the Home timeline until dismissed on this device.
    const announceBox = document.createElement("div");
    homeBox.prepend(announceBox);
    api.get("/api/v1/announcements").then((items) => {
      const dismissed = loadDismissed(localStorage);
      renderAnnouncements({
        doc: document, container: announceBox, items: Array.isArray(items) ? items : [], dismissed, t,
        onDismiss: (key) => { dismissed.add(key); saveDismissed(localStorage, dismissed); },
      });
    }).catch(() => { /* no announcements this time */ });
    const fab = document.createElement("button");
    fab.className = "fab btn-primary";
    fab.textContent = "✎";
    fab.setAttribute("aria-label", t("composer.write"));
    fab.onclick = () => {
      if (modal.isOpen) return;
      const box = createComposer({
        doc: document, api, t, storage: localStorage, accountId: me.id, target: { key: "new" },
        onPosted: (st) => {
          modal.close();
          if (!st?.instance_state && !st?.scheduled_at) { view.prepend(st); window.scrollTo(0, 0); }
          showToast(document, t(postedKey(st)));
        },
        onCancel: () => modal.close(),
      });
      const wrap = document.createElement("div");
      const title = document.createElement("h2");
      title.className = "modal-title";
      title.textContent = t("composer.write");
      wrap.append(title, box);
      modal.open(wrap, { label: t("composer.write") });
    };
    document.body.append(fab);

    // Notifications: polled every POLL_MS while the app is open and visible. The list, the read
    // position and what is done to them live in the controller; the page repaints on change.
    const notifs = createNotificationsController({
      api, storage: localStorage, seenKey: `stabbyclient.notif-seen.${me.id}`, hiddenKey: `stabbyclient.notif-hidden.${me.id}`,
      t, toast: (m) => showToast(document, m), confirm: (m) => confirm(m),
      onChange: () => { paintBadge(); if (!notifBox.hidden) drawNotifications(); },
    });
    function paintBadge() {
      const n = notifs.unread();
      badge.hidden = n === 0;
      badge.textContent = String(n);
    }
    function showTab(name) {
      activeTab = name;
      setPageTitle({ home: t("nav.home"), federated: t("nav.federated"), groups: t("nav.groups"), notifications: t("nav.notifications"), more: t("more.label"), profile: t("nav.profile"), detail: t("nav.post") }[name]);
      markActiveTab({ home: homeTab, federated: fedTab, groups: groupsTab, notifications: notifTab }, name);
      homeBox.hidden = name !== "home";
      fedBox.hidden = name !== "federated";
      groupsBox.hidden = name !== "groups";
      moreBox.hidden = name !== "more";
      profileBox.hidden = name !== "profile";
      notifBox.hidden = name !== "notifications";
      detailBox.hidden = name !== "detail";
      fab.hidden = name !== "home";
      paintBadge();
      paintNew();
    }
    // A post opened on its own (from a notification or a quote), with its thread; Back returns.
    let detailBack = { tab: "home", y: 0 };
    async function openDetail(statusId, back) {
      try {
        const st = await api.get(`/api/v1/statuses/${encodeURIComponent(statusId)}`);
        if (activeTab !== "detail") detailBack = back;
        const backBtn = document.createElement("button");
        backBtn.type = "button";
        backBtn.className = "back";
        backBtn.textContent = t("nav.back");
        backBtn.onclick = () => { showTab(detailBack.tab); window.scrollTo(0, detailBack.y); };
        const detailCard = renderCard(st);
        detailBox.replaceChildren(backBtn, detailCard);
        showTab("detail");
        window.scrollTo(0, 0);
        actions.onToggleThread(st, detailCard);
        if (st.in_reply_to_id) actions.onToggleAncestors(st, detailCard, { scroll: false });
      } catch (e) {
        if (e.status !== 401) showToast(document, t("error.action_failed"));
      }
    }
    function drawNotifications() {
      renderNotifications({
        doc: document, container: notifBox, items: notifs.shown(), t, lastSeenId: notifs.kind() ? undefined : notifs.lastSeen(),
        kind: notifs.kind(), onFilter: notifs.setKind,
        onMarkRead: notifs.markAllRead, onDismiss: notifs.dismiss, onClearAll: notifs.clearAll,
        onOpen: (statusId) => openDetail(statusId, { tab: "notifications", y: 0 }),
        onProfile: (account) => openProfile(account),
      });
    }
    // A profile opens over whatever was on screen; Back returns there, scroll position included.
    let backTo = { tab: "home", y: 0 };
    const profile = createProfile({
      doc: document, container: profileBody, api, t, renderCard, me, toast: (m) => showToast(document, m),
      onZoom: (url, alt) => lightbox.open(url, alt), onProfile: (account) => openProfile(account), createCache: () => ({ read: () => null, write() {} }),
    });
    function openProfile(account) {
      if (activeTab !== "profile") backTo = { tab: activeTab, y: window.scrollY };
      showTab("profile");
      window.scrollTo(0, 0);
      return profile.open(account.id);
    }
    profileBack.onclick = () => { showTab(backTo.tab); window.scrollTo(0, backTo.y); };
    const morePages = createMorePages({
      doc: document, container: moreBox, api, t, renderCard, me, toast: (m) => showToast(document, m), onProfile: (a) => openProfile(a),
      confirm: (m) => confirm(m), createCache: () => ({ read: () => null, write() {} }),
    });
    onMoreEntry = (id) => {
      if (id === "profile") return openProfile({ id: me.id });
      showTab("more");
      window.scrollTo(0, 0);
      morePages.open(id);
    };
    // A timeline looks for newer posts while it is on screen and the app is visible, and
    // again when the app comes back to the foreground; they wait behind the header button.
    async function refreshActive() {
      const v = views[activeTab];
      if (!v || (activeTab !== "home" && !v.loaded)) return;
      try {
        await checked(activeTab, () => v.refresh());
      } catch { /* offline: the next tick tries again */ }
      verifyView(activeTab);
    }
    setInterval(() => { if (document.visibilityState === "visible") refreshActive(); }, POLL_MS);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refreshActive(); });
    showTab("home");
    homeTab.onclick = () => { showTab("home"); refreshActive(); };
    fedTab.onclick = () => { showTab("federated"); refreshActive(); loadFederated(); };
    groupsTab.onclick = () => { showTab("groups"); refreshActive(); loadGroups(); };
    notifTab.onclick = () => { drawNotifications(); showTab("notifications"); };
    startPolling({
      api, intervalMs: POLL_MS, isVisible: () => document.visibilityState === "visible",
      onUpdate: (items) => { notifs.setItems(items); notifs.syncMarker(); },
    });
    notifs.start();
  } catch (e) {
    if (e.status !== 401 && e.status !== 422) {
      show(t("error.generic", { reason: e.message }), false);
      const retry = document.createElement("button");
      retry.classList.add("btn-secondary");
      retry.textContent = t("error.retry");
      retry.onclick = () => location.reload();
      root.append(retry);
    }
  }
}

main();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => { /* the app works without it */ });
}
