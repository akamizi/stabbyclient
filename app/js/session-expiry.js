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

// Logging out: nothing of the account stays on the device (the session, the app registration
// with its secret, cached lists, drafts, dismissed notifications, recent emoji). Only how the
// app looks is kept: theme, font and language say nothing about who used it.
const KEPT = new Set(["stabbyclient.theme", "stabbyclient.font", "stabbyclient.lang"]);
export function forgetDevice(storage) {
  try {
    const keys = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && k.startsWith("stabbyclient.") && !KEPT.has(k)) keys.push(k);
    }
    keys.forEach((k) => storage.removeItem(k));
  } catch { /* storage unavailable: nothing was kept either */ }
}
