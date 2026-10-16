function action(api, id, op) {
  return api.post(`/api/v1/statuses/${encodeURIComponent(id)}/${op}`);
}

export const setFavourite = (api, id, on) => action(api, id, on ? "favourite" : "unfavourite");
export const setDislike = (api, id, on) => action(api, id, on ? "dislike" : "undislike");

export const postStatus = (api, params) => api.post("/api/v1/statuses", params);

export function uploadMedia(api, file, alt) {
  const fd = new FormData();
  fd.append("file", file);
  if (alt) fd.append("description", alt);
  return api.postForm("/api/v1/media", fd);
}
