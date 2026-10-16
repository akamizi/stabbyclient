import { forgetMe } from "./me.js";

// The token is gone. Drafts and cached timelines are keyed per account and stay,
// so nothing the user typed is lost; the remembered account and the logged-in
// controls go away.
export function expireSession({ session, doc, storage }) {
  session.clear();
  if (storage) forgetMe(storage);
  doc.querySelectorAll(".fab").forEach((el) => el.remove());
}
