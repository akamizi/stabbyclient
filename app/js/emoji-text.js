import { safeUrl } from "./sanitize.js";

const PATTERN = /:([A-Za-z0-9_]{2,}):/g;

function imageFor(doc, emoji, code) {
  const src = safeUrl(emoji.static_url) || safeUrl(emoji.url);
  if (!src) return null;
  const img = doc.createElement("img");
  img.className = "emoji";
  img.src = src;
  img.alt = code;
  img.title = code;
  img.setAttribute("loading", "lazy");
  return img;
}

// Text with every ":shortcode:" the server describes (in an `emojis` list) shown as its picture.
export function emojifyText(text, emojis, doc) {
  const frag = doc.createDocumentFragment();
  const value = String(text ?? "");
  const known = new Map((Array.isArray(emojis) ? emojis : []).filter((e) => e && typeof e.shortcode === "string").map((e) => [e.shortcode, e]));
  if (known.size === 0 || !value.includes(":")) {
    if (value) frag.append(doc.createTextNode(value));
    return frag;
  }
  let last = 0;
  for (const m of value.matchAll(PATTERN)) {
    const emoji = known.get(m[1]);
    const img = emoji ? imageFor(doc, emoji, m[0]) : null;
    if (!img) continue;
    if (m.index > last) frag.append(doc.createTextNode(value.slice(last, m.index)));
    frag.append(img);
    last = m.index + m[0].length;
  }
  if (last < value.length) frag.append(doc.createTextNode(value.slice(last)));
  return frag;
}

// The same for markup already cleaned: only text nodes are changed, links and paragraphs stay.
export function emojifyNode(root, emojis, doc) {
  if (!Array.isArray(emojis) || emojis.length === 0) return root;
  const texts = [];
  const walk = (n) => {
    for (const c of [...n.childNodes]) {
      if (c.nodeType === 3) texts.push(c);
      else if (c.nodeType === 1) walk(c);
    }
  };
  walk(root);
  for (const node of texts) {
    if (!node.textContent.includes(":")) continue;
    node.replaceWith(emojifyText(node.textContent, emojis, doc));
  }
  return root;
}
