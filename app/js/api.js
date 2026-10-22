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

// Requests end in an error after timeoutMs (uploads get four times as long).
export function createApi({ fetchFn, getToken, onUnauthorized, timeoutMs = 30000 }) {
  let notified = false;

  async function request(method, path, { params, body, json, ui, upload } = {}) {
    // Only a path on this origin may carry the token: not "//host/…", a full address, a
    // backslash trick, or a path without its leading slash.
    if (typeof path !== "string" || !/^\/(?![\/\\])/.test(path)) throw new TypeError(`refusing a path that is not on this origin: ${String(path).slice(0, 40)}`);
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
    const res = await fetchFn(url, { method, headers, body, cache: "no-store", signal: AbortSignal.timeout(upload ? timeoutMs * 4 : timeoutMs) });
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
      throw err;
    }
    return res;
  }

  return {
    async get(path, params) {
      return (await request("GET", path, { params })).json();
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
