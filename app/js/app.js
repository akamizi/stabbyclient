import { BASE_PATH, SCOPES } from "./config.js";
import { createApi } from "./api.js";
import { createI18n } from "./i18n.js";
import en from "./locales/en.js";
import it from "./locales/it.js";
import { applyTheme, loadThemePref } from "./theme.js";
import { loadMe } from "./me.js";
import { expireSession } from "./session-expiry.js";
import { createTimelineCache } from "./cache.js";
import { createTimelineView } from "./timeline.js";
import { showToast } from "./toast.js";
import { createComposer, clearAllDrafts } from "./composer.js";
import { unreadCount, startPolling } from "./notifications.js";
import { renderNotifications } from "./notifications-view.js";
import { toggleThread, toggleAncestors } from "./thread-view.js";
import { THREAD_INITIAL_REPLIES, POLL_MS } from "./config.js";
import { setFavourite, setDislike, setBoost, setBookmark, setPin } from "./statuses.js";
import { createInlineForm } from "./inline-form.js";
import { MORE_ENTRIES, createMorePages } from "./more.js";
import { renderStatusCard, setActionsDisabled } from "./status-card.js";
import { buildAuthorizeUrl, registerApp, exchangeCode, createSession } from "./auth.js";

const i18n = createI18n({ catalogs: { en, it }, fallback: "en" });
const t = i18n.t.bind(i18n);
function langPref() {
  try { return localStorage.getItem("xenoclient.lang") || "auto"; } catch { return "auto"; }
}
i18n.setLang(langPref());
document.documentElement.lang = i18n.lang;

applyTheme(document, loadThemePref(localStorage), (q) => matchMedia(q), localStorage);

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
function makeMenu(glyph, labelKey) {
  const toggle = document.createElement("button");
  toggle.className = "menu-toggle";
  toggle.textContent = glyph;
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
  toggle.onclick = (e) => { e.stopPropagation(); const was = panel.hidden; closeMenus(); setOpen(was); };
  panel.onclick = (e) => e.stopPropagation();
  menus.push(() => setOpen(false));
  return { toggle, panel, close: () => setOpen(false) };
}
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
  const { toggle, panel } = makeMenu("\u2630", "menu.label");
  const more = makeMenu("\u22EF", "more.label");
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
      [["auto", t("theme.auto")], ["light", t("theme.light")], ["dark", t("theme.dark")]],
      loadThemePref(localStorage),
      (v) => applyTheme(document, v, (q) => matchMedia(q), localStorage)),
    field("lang.label",
      [["auto", t("lang.auto")], ["en", "English"], ["it", "Italiano"]],
      langPref(),
      (v) => {
        try { localStorage.setItem("xenoclient.lang", v); } catch { /* session only */ }
        location.reload();
      }),
  );
  if (session.load()) {
    const out = document.createElement("button");
    out.textContent = t("login.logout");
    out.onclick = () => {
      session.clear();
      createTimelineCache.clearAll(localStorage);
      clearAllDrafts(localStorage);
      try { localStorage.removeItem("xenoclient.me"); } catch { /* ignore */ }
      location.reload();
    };
    panel.append(out);
  }
  box.replaceChildren(...(session.load() ? [more.toggle, more.panel] : []), toggle, panel);
}

const root = document.getElementById("app");
const session = createSession(localStorage);
const redirectUri = location.origin + BASE_PATH;
const fetchFn = (u, o) => fetch(u, o);

function show(text, withLogin) {
  root.replaceChildren();
  const p = document.createElement("p");
  p.textContent = text;
  root.append(p);
  if (withLogin) {
    const b = document.createElement("button");
    b.textContent = t("login.button");
    b.onclick = login;
    root.append(b);
  }
}

async function login() {
  let appReg = JSON.parse(localStorage.getItem("xenoclient.app") || "null");
  if (!appReg) {
    appReg = await registerApp(fetchFn, redirectUri, SCOPES);
    localStorage.setItem("xenoclient.app", JSON.stringify(appReg));
  }
  const state = crypto.randomUUID();
  sessionStorage.setItem("xenoclient.state", state);
  location.href = buildAuthorizeUrl({
    clientId: appReg.client_id, redirectUri, scope: SCOPES, state,
  });
}

async function handleReturn() {
  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  if (!code) return;
  const expected = sessionStorage.getItem("xenoclient.state");
  history.replaceState(null, "", BASE_PATH);
  if (!expected || params.get("state") !== expected) throw new Error("state mismatch");
  const appReg = JSON.parse(localStorage.getItem("xenoclient.app"));
  const tok = await exchangeCode(fetchFn, {
    clientId: appReg.client_id, clientSecret: appReg.client_secret,
    redirectUri, code, scope: SCOPES,
  });
  session.save({ token: tok.access_token });
}

// What the toast says after a send: a draft and a scheduled post are kept, not shown.
function postedKey(st) {
  if (st?.xenomorph_state === "draft") return "composer.saved_draft";
  if (st?.xenomorph_state === "scheduled" || st?.scheduled_at) return "composer.scheduled";
  return "composer.posted";
}

async function main() {
  renderControls();
  try {
    await handleReturn();
  } catch (e) {
    show(t("login.failed", { reason: e.message }), true);
    return;
  }
  renderControls();
  const s = session.load();
  if (!s) return show(t("login.not_logged_in"), true);
  const api = createApi({
    fetchFn, getToken: () => s.token,
    onUnauthorized: () => { expireSession({ session, doc: document, storage: localStorage }); show(t("login.expired"), true); },
  });
  try {
    const { me, offline } = await loadMe(api, localStorage, s.token);
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
    const notifBox = document.createElement("div");
    const detailBox = document.createElement("div");
    notifBox.hidden = true;
    detailBox.hidden = true;
    fedBox.hidden = true;
    groupsBox.hidden = true;
    moreBox.hidden = true;
    root.replaceChildren(nav, homeBox, fedBox, groupsBox, moreBox, notifBox, detailBox);
    const renderCard = (st, inThread = false) => renderStatusCard(st, { doc: document, t, actions, inThread });
    // Pessimistic update: lock the card's buttons, call the server, then redraw the
    // card from the returned status. On failure nothing changes and a toast shows.
    // Replaces a card with one drawn from an updated status, keeping what it had open.
    function redraw(card, updated) {
      const fresh = renderCard(updated, card.dataset.inThread === "1");
      const open = card.querySelector(":scope > .thread");
      if (open && !open.hidden) fresh.querySelector(".thread").replaceWith(open);
      const above = card.querySelector(":scope > .ancestors");
      if (above && !above.hidden) fresh.querySelector(":scope > .ancestors").replaceWith(above);
      card.replaceWith(fresh);
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
    const sid = (st) => encodeURIComponent(st.id);
    // Runs a one-shot post action; on failure the card stays and a toast says so.
    async function guarded(card, fn) {
      setActionsDisabled(card, true);
      try {
        await fn();
      } catch (e) {
        setActionsDisabled(card, false);
        if (e.status !== 401) showToast(document, t("error.action_failed"));
      }
    }
    const openForm = (card, className, opts) => {
      card.querySelector(`:scope > .${className}`)?.remove();
      const form = createInlineForm({ doc: document, t, className, ...opts });
      card.querySelector(":scope > .actions").after(form);
      form.querySelector("textarea, input")?.focus();
    };
    const actions = {
      onReply(st, card) {
        if (card.querySelector(":scope > .composer")) return;
        const box = createComposer({
          doc: document, api, t, storage: localStorage, accountId: me.id,
          target: { key: `reply:${st.id}`, inReplyToId: st.id, visibility: st.visibility },
          onPosted: (st) => { box.remove(); showToast(document, t(postedKey(st))); },
          onCancel: () => box.remove(),
        });
        card.querySelector(":scope > .actions").after(box);
        box.querySelector("textarea").focus();
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
      async onToggleAncestors(st, card) {
        try {
          await toggleAncestors({
            doc: document, card, status: st, api, t, initial: THREAD_INITIAL_REPLIES,
            renderCard: (x) => renderCard(x, true),
          });
        } catch (e) {
          if (e.status !== 401) showToast(document, t("error.action_failed"));
        }
      },
      onReact: (st, card) => openForm(card, "react-form", {
        multiline: false, submitLabel: t("status.react"),
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
          await api.postJson("/api/v1/xenomorph/hide", { id: st.id });
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
        });
      },
      onReport: (st, card) => {
        if (!confirm(t("status.report_confirm"))) return;
        return guarded(card, async () => {
          await api.postJson("/api/v1/reports", { account_id: st.account.id, "status_ids[]": [st.id] });
          setActionsDisabled(card, false);
          showToast(document, t("status.reported"));
        });
      },
      isOwn: (st) => st.account?.id === me.id,
      onBookmark: (st, card) => toggle(card, () => setBookmark(api, st.id, !st.bookmarked)),
      onPin: (st, card) => toggle(card, () => setPin(api, st.id, !st.pinned)),
      async onPublish(st, card) {
        setActionsDisabled(card, true);
        try {
          await api.postJson("/api/v1/xenomorph/publish-draft", { id: st.id });
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
          await api.postJson("/api/v1/xenomorph/hide", { id: st.id });
          card.remove();
        } catch (e) {
          setActionsDisabled(card, false);
          if (e.status !== 401) showToast(document, t("error.action_failed"));
        }
      },
      onBoost: (st, card) => toggle(card, () => setBoost(api, st.id, !st.reblogged)),
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
    newBtn.onclick = () => views[activeTab]?.revealPending();
    const view = views.home = createTimelineView({
      doc: document, container: homeBox, api, cache: createTimelineCache(localStorage, me.id), t,
      renderCard, onPending: (n) => { pendingCount.home = n; paintNew(); },
    });
    // Federated and Groups: plain timelines, fetched the first time their tab opens.
    const lazyTimeline = (name, box, path) => {
      views[name] = createTimelineView({
        doc: document, container: box, api, cache: createTimelineCache(localStorage, me.id, name), t,
        renderCard, path, onPending: (n) => { pendingCount[name] = n; paintNew(); },
      });
      let loaded = false;
      return async () => {
        if (loaded) return;
        loaded = true;
        try {
          await views[name].load();
        } catch (e) {
          loaded = false;
          if (e.status !== 401 && e.status !== 422) showToast(document, t("error.offline"));
        }
      };
    };
    const loadFederated = lazyTimeline("federated", fedBox, "/api/v1/timelines/public");
    const loadGroups = lazyTimeline("groups", groupsBox, "/api/v1/xenomorph/groups");
    try {
      await view.load();
    } catch (e) {
      // Offline or server hiccup: whatever the cache drew stays on screen.
      if (e.status !== 401 && e.status !== 422) showToast(document, t("error.offline"));
    }
    if (offline) showToast(document, t("error.offline"));
    const fab = document.createElement("button");
    fab.className = "fab";
    fab.textContent = "✎";
    fab.setAttribute("aria-label", t("composer.write"));
    fab.onclick = () => {
      if (homeBox.querySelector(":scope > .composer")) return;
      const box = createComposer({
        doc: document, api, t, storage: localStorage, accountId: me.id, target: { key: "new" },
        onPosted: (st) => {
          box.remove();
          if (!st?.xenomorph_state && !st?.scheduled_at) { view.prepend(st); window.scrollTo(0, 0); }
          showToast(document, t(postedKey(st)));
        },
        onCancel: () => box.remove(),
      });
      homeBox.prepend(box);
      box.querySelector("textarea").focus();
    };
    document.body.append(fab);

    // Notifications: polled every POLL_MS while the app is open and visible.
    const seenKey = `xenoclient.notif-seen.${me.id}`;
    const lastSeen = () => { try { return localStorage.getItem(seenKey); } catch { return null; } };
    let latest = [];
    function paintBadge() {
      const n = notifBox.hidden ? unreadCount(latest, lastSeen()) : 0;
      badge.hidden = n === 0;
      badge.textContent = String(n);
    }
    function showTab(name) {
      activeTab = name;
      homeBox.hidden = name !== "home";
      fedBox.hidden = name !== "federated";
      groupsBox.hidden = name !== "groups";
      moreBox.hidden = name !== "more";
      notifBox.hidden = name !== "notifications";
      detailBox.hidden = name !== "detail";
      fab.hidden = name !== "home";
      if (name === "notifications" && latest[0]) {
        try { localStorage.setItem(seenKey, latest[0].id); } catch { /* badge resets next time */ }
      }
      paintBadge();
      paintNew();
    }
    function drawNotifications() {
      renderNotifications({
        doc: document, container: notifBox, items: latest, t,
        onOpen: async (statusId) => {
          try {
            const st = await api.get(`/api/v1/statuses/${encodeURIComponent(statusId)}`);
            const back = document.createElement("button");
            back.type = "button";
            back.textContent = t("nav.back");
            back.onclick = () => showTab("notifications");
            const detailCard = renderCard(st);
            detailBox.replaceChildren(back, detailCard);
            showTab("detail");
            actions.onToggleThread(st, detailCard);
            if (st.in_reply_to_id) actions.onToggleAncestors(st, detailCard);
          } catch (e) {
            if (e.status !== 401) showToast(document, t("error.action_failed"));
          }
        },
      });
    }
    const morePages = createMorePages({
      doc: document, container: moreBox, api, t, renderCard, me, toast: (m) => showToast(document, m),
      confirm: (m) => confirm(m), createCache: () => ({ read: () => null, write() {} }),
    });
    onMoreEntry = (id) => { showTab("more"); window.scrollTo(0, 0); morePages.open(id); };
    homeTab.onclick = () => showTab("home");
    fedTab.onclick = () => { showTab("federated"); loadFederated(); };
    groupsTab.onclick = () => { showTab("groups"); loadGroups(); };
    notifTab.onclick = () => { drawNotifications(); showTab("notifications"); };
    const onNotifs = (items) => { latest = items; paintBadge(); if (!notifBox.hidden) drawNotifications(); };
    startPolling({ api, intervalMs: POLL_MS, onUpdate: onNotifs, isVisible: () => document.visibilityState === "visible" });
    api.get("/api/v1/notifications", { limit: "30" }).then(onNotifs).catch(() => {});
  } catch (e) {
    if (e.status !== 401 && e.status !== 422) {
      show(t("error.generic", { reason: e.message }), false);
      const retry = document.createElement("button");
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
