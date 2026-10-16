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
import { toggleThread } from "./thread-view.js";
import { THREAD_INITIAL_REPLIES, POLL_MS } from "./config.js";
import { setFavourite, setDislike } from "./statuses.js";
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

function select(labelKey, options, current, onChange) {
  const el = document.createElement("select");
  el.setAttribute("aria-label", t(labelKey));
  for (const [value, label] of options) {
    const o = document.createElement("option");
    o.value = value;
    o.textContent = label;
    o.selected = value === current;
    el.append(o);
  }
  el.onchange = () => onChange(el.value);
  return el;
}

function renderControls() {
  const box = document.getElementById("controls");
  box.replaceChildren(
    select("theme.label",
      [["auto", t("theme.auto")], ["light", t("theme.light")], ["dark", t("theme.dark")]],
      loadThemePref(localStorage),
      (v) => applyTheme(document, v, (q) => matchMedia(q), localStorage)),
    select("lang.label",
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
    box.append(out);
  }
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
    onUnauthorized: () => { expireSession({ session, doc: document }); show(t("login.expired"), true); },
  });
  try {
    const { me, offline } = await loadMe(api, localStorage);
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
    nav.append(homeTab, notifTab);
    const homeBox = document.createElement("div");
    const notifBox = document.createElement("div");
    const detailBox = document.createElement("div");
    notifBox.hidden = true;
    detailBox.hidden = true;
    root.replaceChildren(nav, homeBox, notifBox, detailBox);
    const renderCard = (st, inThread = false) => renderStatusCard(st, { doc: document, t, actions, inThread });
    // Pessimistic update: lock the card's buttons, call the server, then redraw the
    // card from the returned status. On failure nothing changes and a toast shows.
    async function toggle(card, call) {
      setActionsDisabled(card, true);
      try {
        const updated = await call();
        {
          const fresh = renderCard(updated, card.dataset.inThread === "1");
          const open = card.querySelector(":scope > .thread");
          if (open && !open.hidden) fresh.querySelector(".thread").replaceWith(open);
          card.replaceWith(fresh);
        }
      } catch (e) {
        setActionsDisabled(card, false);
        if (e.status !== 401) showToast(document, t("error.action_failed"));
      }
    }
    const actions = {
      onReply(st, card) {
        if (card.querySelector(":scope > .composer")) return;
        const box = createComposer({
          doc: document, api, t, storage: localStorage, accountId: me.id,
          target: { key: `reply:${st.id}`, inReplyToId: st.id, visibility: st.visibility },
          onPosted: () => { box.remove(); showToast(document, t("composer.posted")); },
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
      onFavourite: (st, card) => toggle(card, () => setFavourite(api, st.id, !st.favourited)),
      onDislike: (st, card) => toggle(card, () => setDislike(api, st.id, !st.disliked)),
    };
    const view = createTimelineView({
      doc: document, container: homeBox, api, cache: createTimelineCache(localStorage, me.id), t,
      renderCard,
    });
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
        onPosted: (st) => { box.remove(); view.prepend(st); window.scrollTo(0, 0); showToast(document, t("composer.posted")); },
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
      homeBox.hidden = name !== "home";
      notifBox.hidden = name !== "notifications";
      detailBox.hidden = name !== "detail";
      fab.hidden = name !== "home";
      if (name === "notifications" && latest[0]) {
        try { localStorage.setItem(seenKey, latest[0].id); } catch { /* badge resets next time */ }
      }
      paintBadge();
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
          } catch (e) {
            if (e.status !== 401) showToast(document, t("error.action_failed"));
          }
        },
      });
    }
    homeTab.onclick = () => showTab("home");
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
