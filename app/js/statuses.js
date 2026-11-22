// Thin calls for one post at a time (like, boost, bookmark, pin, post, upload a picture, ...).
function action(api, id, op) {
  return api.post(`/api/v1/statuses/${encodeURIComponent(id)}/${op}`);
}

export const setFavourite = (api, id, on) => action(api, id, on ? "favourite" : "unfavourite");
export const setDislike = (api, id, on) => action(api, id, on ? "dislike" : "undislike");
export const setBoost = (api, id, on) => action(api, id, on ? "reblog" : "unreblog");
export const setBookmark = (api, id, on) => action(api, id, on ? "bookmark" : "unbookmark");
export const setPin = (api, id, on) => action(api, id, on ? "pin" : "unpin");

// A draft is kept by stabbypossum only for requests that carry its UI marker.
// Addresses of remote pictures are likewise taken only from requests carrying the marker.
// An idempotency key makes stabbypossum do one post per key: a retry with the same key gets the
// post the first try made instead of a second copy (without a key it matches identical texts).
export function postStatus(api, params, { idempotencyKey } = {}) {
  const opts = {};
  if (params.get("stabbypossum_draft") === "true" || params.has("stabbypossum_attachment_urls[]")) opts.ui = true;
  if (idempotencyKey) opts.headers = { "Idempotency-Key": idempotencyKey };
  return Object.keys(opts).length ? api.post("/api/v1/statuses", params, opts) : api.post("/api/v1/statuses", params);
}

// A fresh key for one post (retries of the same post reuse it).
export function newIdempotencyKey() {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof c?.getRandomValues === "function") c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Where the copies of one's own post went (404, so null, when the server kept no receipts for it).
export async function getDeliveries(api, id) {
  try {
    return await api.get(`/api/v1/statuses/${encodeURIComponent(id)}/deliveries`);
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

// The alt text of a picture already uploaded (a post that failed after its pictures went up).
export const setMediaDescription = (api, id, description) =>
  api.putJson(`/api/v1/media/${encodeURIComponent(id)}`, { description });

export function uploadMedia(api, file, alt) {
  const fd = new FormData();
  fd.append("file", file);
  if (alt) fd.append("description", alt);
  return api.postForm("/api/v1/media", fd);
}
