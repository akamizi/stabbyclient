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
export const postStatus = (api, params) =>
  params.get("stabbypossum_draft") === "true" || params.has("stabbypossum_attachment_urls[]")
    ? api.post("/api/v1/statuses", params, { ui: true })
    : api.post("/api/v1/statuses", params);

// The alt text of a picture already uploaded (a post that failed after its pictures went up).
export const setMediaDescription = (api, id, description) =>
  api.putJson(`/api/v1/media/${encodeURIComponent(id)}`, { description });

export function uploadMedia(api, file, alt) {
  const fd = new FormData();
  fd.append("file", file);
  if (alt) fd.append("description", alt);
  return api.postForm("/api/v1/media", fd);
}
