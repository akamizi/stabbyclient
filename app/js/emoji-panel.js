// The button-and-grid emoji chooser for the composer, with the recently used ones kept on this
// device. The suggestions while typing a :shortcode are in emoji-picker.js.
import { attachEmojiPicker } from "./emoji-picker.js";
import { safeUrl } from "./sanitize.js";

const KEY = "stabbyclient.emoji-recent";
const MAX_RECENT = 12;

export function loadRecent(storage) {
  try {
    const list = JSON.parse(storage.getItem(KEY));
    return Array.isArray(list)
      ? list.filter((e) => e && typeof e.shortcode === "string" && safeUrl(e.url)).slice(0, MAX_RECENT)
      : [];
  } catch {
    return [];
  }
}

export function saveRecent(storage, emoji) {
  if (!emoji || typeof emoji.shortcode !== "string") return;
  const url = safeUrl(emoji.static_url) || safeUrl(emoji.url);
  if (!url) return;
  const next = [{ shortcode: emoji.shortcode, url }, ...loadRecent(storage).filter((e) => e.shortcode !== emoji.shortcode)].slice(0, MAX_RECENT);
  try {
    storage.setItem(KEY, JSON.stringify(next));
  } catch { /* the list of recent emoji is a convenience */ }
}

// A search box for the instance's emoji with the recently used ones under it. onPick gets
// the chosen emoji (the caller puts its :shortcode: where the text is).
export function createEmojiPanel({ doc, api, t, storage, onPick, delay = 175 }) {
  const panel = doc.createElement("div");
  panel.className = "emoji-panel";
  const input = doc.createElement("input");
  input.type = "search";
  input.className = "emoji-search";
  input.placeholder = t("emoji.search");
  input.setAttribute("aria-label", t("emoji.search"));
  const recent = doc.createElement("div");
  recent.className = "emoji-recent";

  const pick = (e) => {
    saveRecent(storage, e);
    paintRecent();
    onPick(e);
  };
  function paintRecent() {
    recent.replaceChildren();
    const list = loadRecent(storage);
    if (list.length === 0) {
      const p = doc.createElement("p");
      p.textContent = t("emoji.hint");
      recent.append(p);
      return;
    }
    for (const e of list) {
      const b = doc.createElement("button");
      b.type = "button";
      b.className = "emoji-option";
      const img = doc.createElement("img");
      img.src = e.url;
      img.alt = "";
      b.append(img, doc.createTextNode(` :${e.shortcode}:`));
      b.onclick = () => pick(e);
      recent.append(b);
    }
  }
  const results = attachEmojiPicker({ doc, input, api, t, delay, bare: true, onPick: pick });
  paintRecent();
  panel.append(input, recent, results);
  return panel;
}
