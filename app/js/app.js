import { BASE_PATH, SCOPES } from "./config.js";
import { createApi } from "./api.js";
import { createI18n } from "./i18n.js";
import en from "./locales/en.js";
import it from "./locales/it.js";
import { applyTheme, loadThemePref } from "./theme.js";
import { createTimelineCache } from "./cache.js";
import { createTimelineView } from "./timeline.js";
import { showToast } from "./toast.js";
import { createComposer } from "./composer.js";
import { toggleThread } from "./thread-view.js";
import { THREAD_INITIAL_REPLIES } from "./config.js";
import { setFavourite, setDislike } from "./statuses.js";
import { renderStatusCard } from "./status-card.js";
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
      location.reload();
    };
    box.append(out);
  }
}
renderControls();

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
  try {
    await handleReturn();
  } catch (e) {
    show(t("login.failed", { reason: e.message }), true);
    return;
  }
  const s = session.load();
  if (!s) return show(t("login.not_logged_in"), true);
  const api = createApi({
    fetchFn, getToken: () => s.token,
    onUnauthorized: () => { session.clear(); createTimelineCache.clearAll(localStorage); show(t("login.expired"), true); },
  });
  try {
    const me = await api.get("/api/v1/accounts/verify_credentials");
    root.replaceChildren();
    const renderCard = (st, inThread = false) => renderStatusCard(st, { doc: document, t, actions, inThread });
    // Pessimistic update: lock the card's buttons, call the server, then redraw the
    // card from the returned status. On failure nothing changes and a toast shows.
    async function toggle(status, call) {
      const card = root.querySelector(`[data-status-id="${CSS.escape(status.id)}"]`);
      card?.querySelectorAll("button").forEach((b) => { b.disabled = true; });
      try {
        const updated = await call();
        if (card) {
          const fresh = renderCard(updated, card.dataset.inThread === "1");
          const open = card.querySelector(":scope > .thread");
          if (open && !open.hidden) fresh.querySelector(".thread").replaceWith(open);
          card.replaceWith(fresh);
        }
      } catch (e) {
        card?.querySelectorAll("button").forEach((b) => { b.disabled = false; });
        if (e.status !== 401) showToast(document, t("error.action_failed"));
      }
    }
    const actions = {
      onReply(st) {
        const card = root.querySelector(`[data-status-id="${CSS.escape(st.id)}"]`);
        if (!card || card.querySelector(":scope > .composer")) return;
        const box = createComposer({
          doc: document, api, t, storage: localStorage,
          target: { key: `reply:${st.id}`, inReplyToId: st.id, visibility: st.visibility },
          onPosted: () => { box.remove(); showToast(document, t("composer.posted")); },
          onCancel: () => box.remove(),
        });
        card.querySelector(":scope > .actions").after(box);
        box.querySelector("textarea").focus();
      },
      async onToggleThread(st) {
        const card = root.querySelector(`[data-status-id="${CSS.escape(st.id)}"]`);
        try {
          await toggleThread({
            doc: document, card, status: st, api, t, initial: THREAD_INITIAL_REPLIES,
            renderCard: (x) => renderCard(x, true),
          });
        } catch (e) {
          if (e.status !== 401) showToast(document, t("error.action_failed"));
        }
      },
      onFavourite: (st) => toggle(st, () => setFavourite(api, st.id, !st.favourited)),
      onDislike: (st) => toggle(st, () => setDislike(api, st.id, !st.disliked)),
    };
    const view = createTimelineView({
      doc: document, container: root, api, cache: createTimelineCache(localStorage, me.id), t,
      renderCard,
    });
    await view.load();
    const fab = document.createElement("button");
    fab.className = "fab";
    fab.textContent = "✎";
    fab.setAttribute("aria-label", t("composer.write"));
    fab.onclick = () => {
      if (document.querySelector("main > .composer")) return;
      const box = createComposer({
        doc: document, api, t, storage: localStorage, target: { key: "new" },
        onPosted: (st) => { box.remove(); view.prepend(st); window.scrollTo(0, 0); showToast(document, t("composer.posted")); },
        onCancel: () => box.remove(),
      });
      root.prepend(box);
      box.querySelector("textarea").focus();
    };
    document.body.append(fab);
  } catch (e) {
    if (e.status !== 401 && e.status !== 422) show(t("error.generic", { reason: e.message }), false);
  }
}

main();
