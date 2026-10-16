function action(api, id, op) {
  return api.post(`/api/v1/statuses/${encodeURIComponent(id)}/${op}`);
}

export const setFavourite = (api, id, on) => action(api, id, on ? "favourite" : "unfavourite");
export const setDislike = (api, id, on) => action(api, id, on ? "dislike" : "undislike");
