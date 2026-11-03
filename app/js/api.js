// The only door to the server: fetch with the token, a timeout, Link-header pagination, one
// onUnauthorized call per session and ApiError. Paths must be root-relative on this origin and
// free of dot segments, so the token can never be sent elsewhere. createApi takes fetchFn,
// getToken and onUnauthorized so tests can stand in for all three.
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function parseLinkNext(header) {
  if (!header) return null;
  for (const part of header.split(",")) {
    const m = part.match(/<([^>]+)>\s*;\s*rel="?next"?/);
    if (m) return m[1];
  }
  return null;
}

// Routes stabbypossum answers only to requests carrying its own UI's marker header.
const UI_ONLY_ROUTES = [
  "/api/v1/stabbypossum/admirations",
  "/api/v1/stabbypossum/drafts",
  "/api/v1/stabbypossum/scheduled",
  "/api/v1/stabbypossum/publish-draft",
  "/api/v1/stabbypossum/hide",
  "/api/v1/stabbypossum/feeds",
];

// Requests end in an error after timeoutMs (uploads get four times as long); `get` may also be
// given a signal to stop it sooner, or its own timeout (a slow search waits for the server).
// The 403 stabbypossum gives every write of an account that has moved (FEP-7628): the text is
// "This account has moved to <address> and is read-only."; the address, or null.
export function movedTarget(status, detail) {
  if (status !== 403 || typeof detail !== "string") return null;
  const m = detail.match(/^This account has moved to (\S+) and is read-only\.?$/);
  return m ? m[1] : null;
}

export function createApi({ fetchFn, getToken, onUnauthorized, onMoved, timeoutMs = 30000 }) {
  let notified = false;

  async function request(method, path, { params, body, json, ui, upload, signal, timeoutMs: own } = {}) {
    // Only a path on this origin may carry the token: not "//host/…", a full address, a
    // backslash trick, or a path without its leading slash.
    if (typeof path !== "string" || !/^\/(?![\/\\])/.test(path)) throw new TypeError(`refusing a path that is not on this origin: ${String(path).slice(0, 40)}`);
    // encodeURIComponent leaves dots alone, so an id of ".." would climb a level in the path
    // (and the browser takes a backslash for a slash, so both separate segments here).
    if (path.split(/[?#]/, 1)[0].split(/[\/\\]/).some((seg) => /^(\.|%2e){1,2}$/i.test(seg))) throw new TypeError(`refusing a path with a dot segment: ${path.slice(0, 40)}`);
    let url = path;
    if (params) url += (path.includes("?") ? "&" : "?") + new URLSearchParams(params);
    const headers = {};
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (ui || UI_ONLY_ROUTES.some((r) => path.startsWith(r))) headers["X-Instance-UI"] = "1";
    if (json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(json);
    }
    // Timelines and notifications must come from the server every time, never from the
    // browser's HTTP cache (a 304 would hand back the old list).
    // A caller's own signal (a button that stops the request) ends it as the timeout does.
    const timeout = AbortSignal.timeout(own ?? (upload ? timeoutMs * 4 : timeoutMs));
    const res = await fetchFn(url, { method, headers, body, cache: "no-store", signal: signal && typeof AbortSignal.any === "function" ? AbortSignal.any([signal, timeout]) : timeout });
    // stabbypossum answers 422 (not 401) to verify_credentials with a bad token.
    const isVerify = path.startsWith("/api/v1/accounts/verify_credentials");
    const authFailure = res.status === 401 || (res.status === 422 && isVerify);
    if (authFailure) {
      // A stray 401 on some route must not sign the user out: ask the server whether the token
      // itself is still good before giving up the session.
      if (!notified && !isVerify) {
        let bad = false;
        try {
          const check = await fetchFn("/api/v1/accounts/verify_credentials", { method: "GET", headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
          bad = check.status === 401 || check.status === 422;
        } catch { /* cannot tell: keep the session */ }
        if (!bad) throw new ApiError(403, "refused");
      }
      if (!notified) {
        notified = true;
        onUnauthorized();
      }
      throw new ApiError(res.status, "unauthorized");
    }
    if (!res.ok) {
      const err = new ApiError(res.status, `HTTP ${res.status}`);
      // stabbypossum explains some refusals as {"error": "..."}
      try {
        const body = await res.json();
        if (typeof body?.error === "string") err.detail = body.error;
      } catch { /* no explanation */ }
      const moved = movedTarget(res.status, err.detail);
      if (moved) {
        err.movedTo = moved;
        try { onMoved?.(moved); } catch { /* the notice must not hide the refusal */ }
      }
      throw err;
    }
    return res;
  }

  return {
    async get(path, params, { signal, timeoutMs: own } = {}) {
      return (await request("GET", path, { params, signal, timeoutMs: own })).json();
    },
    async getPage(path, params) {
      const res = await request("GET", path, { params });
      return { items: await res.json(), next: parseLinkNext(res.headers.get("Link")) };
    },
    async post(path, body, opts = {}) {
      return (await request("POST", path, { body, ui: opts.ui })).json();
    },
    async postJson(path, obj) {
      return (await request("POST", path, { json: obj })).json();
    },
    async putJson(path, obj) {
      return (await request("PUT", path, { json: obj })).json();
    },
    async patchJson(path, obj) {
      return (await request("PATCH", path, { json: obj })).json();
    },
    async del(path, obj) {
      const res = await request("DELETE", path, { json: obj });
      return res.json().catch(() => null);
    },
    async postForm(path, formData) {
      return (await request("POST", path, { body: formData, upload: true })).json();
    },
  };
}
