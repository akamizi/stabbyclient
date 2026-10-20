import { sanitizeHtml } from "./sanitize.js";

const KEY = "stabbyclient.announcements";

// The server numbers announcements coarsely, so a notice is recognised by its text.
export function announcementKey(a) {
  let h = 5381;
  for (const ch of String(a.content ?? "")) h = ((h * 33) ^ ch.codePointAt(0)) >>> 0;
  return h.toString(36);
}

export function loadDismissed(storage) {
  try {
    const list = JSON.parse(storage.getItem(KEY));
    return new Set(Array.isArray(list) ? list.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

// Only the latest fifty are kept: the server shows one notice at a time.
export function saveDismissed(storage, set) {
  try {
    storage.setItem(KEY, JSON.stringify([...set].slice(-50)));
  } catch { /* a dismissed notice may come back; nothing worse */ }
}

// stabbypossum keeps no per-device "read" for announcements, so dismissing is done here.
export function renderAnnouncements({ doc, container, items, dismissed, onDismiss, t }) {
  container.replaceChildren();
  for (const a of items) {
    const key = announcementKey(a);
    if (dismissed.has(key)) continue;
    const box = doc.createElement("section");
    box.className = "announcement";
    box.setAttribute("role", "note");
    const body = doc.createElement("div");
    body.append(sanitizeHtml(a.content || "", doc));
    const close = doc.createElement("button");
    close.type = "button";
    close.className = "dismiss";
    close.textContent = t("announcement.dismiss");
    close.onclick = () => {
      box.remove();
      onDismiss(key);
    };
    box.append(body, close);
    container.append(box);
  }
}
