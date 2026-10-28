// A YouTube link in a post gets a neutral box with a Play button under the text. Nothing is
// asked of YouTube until the button is pressed: no thumbnail, no frame. Then the video opens
// in place, from youtube-nocookie.com (the only frame source the CSP allows).
import { el } from "./dom.js";

const ID = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"]);

// The video id of a YouTube address (watch, shorts, live, embed, youtu.be), or null.
export function youtubeId(href) {
  let u;
  try { u = new URL(href); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase();
  let id = null;
  if (host === "youtu.be") id = u.pathname.split("/")[1];
  else if (HOSTS.has(host)) {
    const [, kind, second] = u.pathname.split("/");
    if (kind === "watch") id = u.searchParams.get("v");
    else if (["shorts", "live", "embed", "v"].includes(kind)) id = second;
  }
  return ID.test(id || "") ? id : null;
}

function play(doc, box, id, t) {
  const frame = el(doc, "iframe", "video-frame");
  frame.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
  frame.title = t("video.title");
  frame.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
  frame.setAttribute("allowfullscreen", "");
  frame.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
  frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-presentation");
  box.replaceChildren(frame);
  frame.focus?.();
}

// Adds, at the end of `body`, one box for each distinct YouTube video its links point to (at most two).
export function addVideoEmbeds({ doc, body, t }) {
  const seen = new Set();
  for (const a of body.querySelectorAll("a[href]")) {
    const id = youtubeId(a.getAttribute("href"));
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const box = el(doc, "div", "video-embed");
    const button = el(doc, "button", "btn-secondary", "");
    button.type = "button";
    button.append(el(doc, "span", "", "▶ "), doc.createTextNode(t("video.play")));
    button.onclick = () => play(doc, box, id, t);
    box.append(button, el(doc, "small", "", t("video.note")));
    body.append(box);
    if (seen.size === 2) break;
  }
}
