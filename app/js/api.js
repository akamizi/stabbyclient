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

// Routes xenomorph answers only to requests carrying its own UI's marker header.
const UI_ONLY_ROUTES = [
  "/api/v1/xenomorph/admirations",
  "/api/v1/xenomorph/drafts",
  "/api/v1/xenomorph/scheduled",
  "/api/v1/xenomorph/publish-draft",
  "/api/v1/xenomorph/hide",
  "/api/v1/xenomorph/limited",
  "/api/v1/xenomorph/limit",
  "/api/v1/xenomorph/feeds",
];

// Requests end in an error after timeoutMs (uploads get four times as long).
export function createApi({ fetchFn, getToken, onUnauthorized, timeoutMs = 30000 }) {
  let notified = false;

  async function request(method, path, { params, body, json, ui, upload } = {}) {
    let url = path;
    if (params) url += (path.includes("?") ? "&" : "?") + new URLSearchParams(params);
    const headers = {};
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (ui || UI_ONLY_ROUTES.some((r) => path.startsWith(r))) headers["X-Xenomorph-UI"] = "1";
    if (json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(json);
    }
    // Timelines and notifications must come from the server every time, never from the
    // browser's HTTP cache (a 304 would hand back the old list).
    const res = await fetchFn(url, { method, headers, body, cache: "no-store", signal: AbortSignal.timeout(upload ? timeoutMs * 4 : timeoutMs) });
    // xenomorph answers 422 (not 401) to verify_credentials with a bad token.
    const authFailure = res.status === 401 ||
      (res.status === 422 && path.startsWith("/api/v1/accounts/verify_credentials"));
    if (authFailure) {
      if (!notified) {
        notified = true;
        onUnauthorized();
      }
      throw new ApiError(res.status, "unauthorized");
    }
    if (!res.ok) {
      const err = new ApiError(res.status, `HTTP ${res.status}`);
      // xenomorph explains some refusals as {"error": "..."}
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
    async del(path, obj) {
      const res = await request("DELETE", path, { json: obj });
      return res.json().catch(() => null);
    },
    async postForm(path, formData) {
      return (await request("POST", path, { body: formData, upload: true })).json();
    },
  };
}
