export function buildAuthorizeUrl({ base = "", clientId, redirectUri, scope, state }) {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope,
    state,
  });
  return `${base}/oauth/authorize?${q}`;
}

export async function registerApp(fetchFn, redirectUri, scope) {
  const res = await fetchFn("/api/v1/apps", {
    method: "POST",
    body: new URLSearchParams({ client_name: "Stabbyclient", redirect_uris: redirectUri, scope }),
  });
  if (!res.ok) throw new Error(`app registration failed: HTTP ${res.status}`);
  const { client_id, client_secret } = await res.json();
  return { client_id, client_secret };
}

export async function exchangeCode(fetchFn, { clientId, clientSecret, redirectUri, code, scope }) {
  const res = await fetchFn("/oauth/token", {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
      scope,
    }),
  });
  if (!res.ok) throw new Error(`token exchange failed: HTTP ${res.status}`);
  return res.json();
}

const KEY = "stabbyclient.session";

// The app was called xenoclient before: what it kept under that name (a token among it) is
// not read any more, so it is dropped instead of left behind.
export function dropLegacyKeys(storage) {
  try {
    const old = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && k.startsWith("xenoclient.")) old.push(k);
    }
    for (const k of old) storage.removeItem(k);
  } catch { /* storage unavailable: nothing to drop */ }
}

export function createSession(storage) {
  return {
    load() {
      try {
        return JSON.parse(storage.getItem(KEY));
      } catch {
        return null;
      }
    },
    save(s) {
      storage.setItem(KEY, JSON.stringify(s));
    },
    clear() {
      storage.removeItem(KEY);
    },
  };
}

const APP_KEY = "stabbyclient.app";
const STATE_KEY = "stabbyclient.state";

// Step one of the login: the app is registered with the instance the first time (and
// again whenever the stored registration was dropped), then the address to send the
// browser to is returned. Network and server errors are thrown for the caller to show.
export async function beginLogin({ fetchFn, storage, sessionStore, redirectUri, scope, newState }) {
  let app = null;
  try {
    app = JSON.parse(storage.getItem(APP_KEY));
  } catch { /* unreadable: register again */ }
  if (!app?.client_id) {
    app = await registerApp(fetchFn, redirectUri, scope);
    storage.setItem(APP_KEY, JSON.stringify(app));
  }
  const state = newState();
  sessionStore.setItem(STATE_KEY, state);
  return buildAuthorizeUrl({ clientId: app.client_id, redirectUri, scope, state });
}

// Logging out: the instance is told to forget the token (and the app registration that came
// with it, which is why the stored one is dropped too). Never throws and never waits long: a
// failed call must not keep anyone logged in, and then the token is simply left to the server.
export async function revokeSession({ fetchFn, storage, session }) {
  try {
    const token = session.load()?.token;
    const app = JSON.parse(storage.getItem(APP_KEY));
    if (!token || !app?.client_id) return false;
    const res = await fetchFn("/oauth/revoke", {
      method: "POST",
      body: new URLSearchParams({ client_id: app.client_id, client_secret: app.client_secret, token }),
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) storage.removeItem(APP_KEY);
    return res.ok;
  } catch {
    return false;
  }
}

// Step two, when the instance sends the browser back: { status } is "none" (not a login
// return), "ok" (the token was saved), "denied" (the user or the server said no) or
// "failed" (with a reason, and offline: true when the network was the problem).
export async function completeLogin({ search, fetchFn, storage, sessionStore, session, redirectUri, scope }) {
  const params = new URLSearchParams(search);
  const code = params.get("code");
  if (params.get("error")) {
    sessionStore.removeItem(STATE_KEY);
    return { status: "denied" };
  }
  if (!code) return { status: "none" };
  const expected = sessionStore.getItem(STATE_KEY);
  sessionStore.removeItem(STATE_KEY);
  if (!expected || params.get("state") !== expected) return { status: "failed", reason: "state mismatch" };
  let app = null;
  try {
    app = JSON.parse(storage.getItem(APP_KEY));
  } catch { /* handled below */ }
  if (!app?.client_id) return { status: "failed", reason: "no app registration" };
  try {
    const tok = await exchangeCode(fetchFn, {
      clientId: app.client_id, clientSecret: app.client_secret, redirectUri, code, scope,
    });
    session.save({ token: tok.access_token });
    return { status: "ok" };
  } catch (e) {
    if (e instanceof TypeError) return { status: "failed", offline: true, reason: e.message };
    // The instance refused the registration (forgotten or changed): register afresh next time.
    storage.removeItem(APP_KEY);
    return { status: "failed", reason: e.message };
  }
}
