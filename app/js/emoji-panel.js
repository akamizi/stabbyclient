// The emoji chooser of the composer: the instance's emoji as a grid of pictures, with a box
// that narrows them down as it is typed in. The list is asked of the server once and filtered
// here; each standard emoji is shown in one drawing style (oneStyle in emoji-picker.js).
import { oneStyle } from "./emoji-picker.js";
import { safeUrl } from "./sanitize.js";
import { EMOJI_STYLES } from "./config.js";

// How many are drawn before a button offers the rest.
export const EMOJI_SHOWN = 300;
const lists = new WeakMap(); // api -> the list already asked for

function allEmoji(api, styles) {
  if (!lists.has(api)) {
    const asked = api.get("/api/v1/custom_emojis").then((emojis) =>
      oneStyle((Array.isArray(emojis) ? emojis : []).filter((e) => e && typeof e.shortcode === "string"), styles)
        .map((e) => ({ emoji: e, src: safeUrl(e.static_url) || safeUrl(e.url), name: e.shortcode.toLowerCase() }))
        .filter((x) => x.src));
    asked.catch(() => lists.delete(api)); // a failure is asked again next time
    lists.set(api, asked);
  }
  return lists.get(api);
}

// onPick gets the chosen emoji (the caller puts its :shortcode: where the text is).
export function createEmojiPanel({ doc, api, t, onPick, styles = EMOJI_STYLES }) {
  const panel = doc.createElement("div");
  panel.className = "emoji-panel";
  const input = doc.createElement("input");
  input.type = "search";
  input.className = "emoji-search";
  input.placeholder = t("emoji.search");
  input.setAttribute("aria-label", t("emoji.search"));
  const grid = doc.createElement("div");
  grid.className = "emoji-grid";
  let all = null;

  const say = (text) => {
    const p = doc.createElement("p");
    p.textContent = text;
    grid.replaceChildren(p);
  };
  const button = (x) => {
    const b = doc.createElement("button");
    b.type = "button";
    b.className = "emoji-option";
    b.title = `:${x.emoji.shortcode}:`;
    b.setAttribute("aria-label", b.title);
    const img = doc.createElement("img");
    img.setAttribute("loading", "lazy");
    img.src = x.src;
    img.alt = "";
    b.append(img);
    b.onclick = () => onPick(x.emoji);
    return b;
  };
  function paint(everything = false) {
    if (!all) return;
    // Every word typed has to be somewhere in the name: "cat joy" finds cat_with_tears_of_joy.
    const words = input.value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const found = words.length ? all.filter((x) => words.every((w) => x.name.includes(w))) : all;
    if (found.length === 0) return say(t("emoji.none"));
    const shown = everything ? found : found.slice(0, EMOJI_SHOWN);
    grid.replaceChildren(...shown.map(button));
    if (shown.length < found.length) {
      const more = doc.createElement("button");
      more.type = "button";
      more.className = "emoji-all btn-secondary";
      more.textContent = t("emoji.all", { count: found.length });
      more.onclick = () => paint(true);
      grid.append(more);
    }
  }

  input.oninput = () => paint();
  say("…");
  panel.ready = allEmoji(api, styles).then(
    (list) => { all = list; paint(); },
    () => say(t("emoji.failed")),
  );
  panel.append(input, grid);
  return panel;
}
