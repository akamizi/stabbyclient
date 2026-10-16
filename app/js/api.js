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

export function createApi({ fetchFn, getToken, onUnauthorized }) {
  let notified = false;

  async function request(method, path, { params, body } = {}) {
    let url = path;
    if (params) url += (path.includes("?") ? "&" : "?") + new URLSearchParams(params);
    const headers = {};
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetchFn(url, { method, headers, body });
    if (res.status === 401) {
      if (!notified) {
        notified = true;
        onUnauthorized();
      }
      throw new ApiError(401, "unauthorized");
    }
    if (!res.ok) throw new ApiError(res.status, `HTTP ${res.status}`);
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
    async post(path, body) {
      return (await request("POST", path, { body })).json();
    },
    async postForm(path, formData) {
      return (await request("POST", path, { body: formData })).json();
    },
  };
}
