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
    body: new URLSearchParams({ client_name: "Xenoclient", redirect_uris: redirectUri, scope }),
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

const KEY = "xenoclient.session";

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
