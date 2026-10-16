import { BASE_PATH, SCOPES } from "./config.js";
import { createApi } from "./api.js";
import { buildAuthorizeUrl, registerApp, exchangeCode, createSession } from "./auth.js";

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
    b.textContent = "Log in";
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
    show(`Login failed: ${e.message}`, true);
    return;
  }
  const s = session.load();
  if (!s) return show("Not logged in.", true);
  const api = createApi({
    fetchFn, getToken: () => s.token,
    onUnauthorized: () => { session.clear(); show("Session expired.", true); },
  });
  try {
    const me = await api.get("/api/v1/accounts/verify_credentials");
    show(`Logged in as ${me.acct}`);
  } catch (e) {
    if (e.status !== 401 && e.status !== 422) show(`Error: ${e.message}`, false);
  }
}

main();
