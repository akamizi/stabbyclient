import { forgetMe } from "./me.js";
import { createTimelineCache } from "./cache.js";

// The token is gone. Cached timelines go with it (the Home one can hold private posts and
// direct messages, and a shared device must not keep them once the session is over). Drafts
// are keyed per account and stay, so nothing the user typed is lost; the remembered account
// and the logged-in controls go away.
export function expireSession({ session, doc, storage }) {
  session.clear();
  if (storage) {
    forgetMe(storage);
    createTimelineCache.clearAll(storage);
  }
  doc.querySelectorAll(".fab").forEach((el) => el.remove());
}
