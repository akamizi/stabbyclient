// Suggestions for custom emoji while a :shortcode is typed in a field.
import { safeUrl } from "./sanitize.js";

const QUERY = /^:([A-Za-z0-9_]{3,}):?$/;
const QUERY_BARE = /^:?([A-Za-z0-9_]{3,}):?$/;

// A list under a text field that suggests custom emoji as a ":shortcode" is typed (three
// characters or more). Choosing one fills the field with ":shortcode:".
// onPick: what to do with the emoji chosen (by default it fills the field). bare: a plain
// search word is enough, no leading colon.
export function attachEmojiPicker({ doc, input, api, t, delay = 175, onPick, bare = false }) {
  const list = doc.createElement("div");
  list.className = "emoji-list";
  list.hidden = true;
  let generation = 0;
  let timer = null;

  const say = (key) => {
    const p = doc.createElement("p");
    p.textContent = t(key);
    list.replaceChildren(p);
    list.hidden = false;
  };
  const show = (emojis) => {
    list.replaceChildren();
    const usable = (Array.isArray(emojis) ? emojis : []).filter((e) => e && typeof e.shortcode === "string");
    if (usable.length === 0) return say("emoji.none");
    for (const e of usable) {
      const b = doc.createElement("button");
      b.type = "button";
      b.className = "emoji-option";
      const src = safeUrl(e.static_url) || safeUrl(e.url);
      if (src) {
        const img = doc.createElement("img");
        img.src = src;
        img.alt = "";
        b.append(img);
      }
      b.append(doc.createTextNode(` :${e.shortcode}:`));
      b.onclick = () => {
        if (onPick) {
          onPick(e);
          return;
        }
        input.value = `:${e.shortcode}:`;
        list.hidden = true;
        input.focus?.();
      };
      list.append(b);
    }
    list.hidden = false;
  };

  input.oninput = () => {
    clearTimeout(timer);
    generation += 1;
    const mine = generation;
    const m = (bare ? QUERY_BARE : QUERY).exec(input.value.trim());
    if (!m) {
      list.hidden = true;
      return;
    }
    timer = setTimeout(async () => {
      try {
        const emojis = await api.get("/api/v1/custom_emojis", { q: m[1] });
        if (mine === generation) show(emojis);
      } catch {
        if (mine === generation) say("emoji.failed");
      }
    }, delay);
  };
  return list;
}
