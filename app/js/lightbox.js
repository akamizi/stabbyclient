import { safeUrl } from "./sanitize.js";

// A picture shown full size over the page. Tap anywhere, the close button, Escape or the
// phone's Back button closes it. Opening adds one history entry so that Back closes the
// picture and not the app; closing by any other way removes that entry again.
export function createLightbox({ doc, win, t }) {
  let overlay = null;
  let pushed = false;

  function teardown() {
    overlay?.remove();
    overlay = null;
    win.removeEventListener("keydown", onKey);
    win.removeEventListener("popstate", onPop);
  }
  function close() {
    if (!overlay) return;
    teardown();
    if (pushed) {
      pushed = false;
      win.history.back(); // pops our own entry
    }
  }
  function onKey(e) {
    if (e.key === "Escape") close();
  }
  function onPop() {
    pushed = false; // Back already removed our entry
    teardown();
  }

  function open(url, alt = "") {
    const src = safeUrl(url);
    if (!src) return;
    if (overlay) {
      teardown();
      pushed = false;
    }
    overlay = doc.createElement("div");
    overlay.className = "lightbox";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", alt || t("lightbox.label"));
    const img = doc.createElement("img");
    img.src = src;
    img.alt = alt;
    const x = doc.createElement("button");
    x.type = "button";
    x.className = "close";
    x.textContent = "✕";
    x.setAttribute("aria-label", t("lightbox.close"));
    overlay.append(img, x);
    overlay.onclick = close;
    doc.body.append(overlay);
    win.history.pushState({ lightbox: true }, "");
    pushed = true;
    win.addEventListener("keydown", onKey);
    win.addEventListener("popstate", onPop);
    x.focus?.();
  }
  return { open, close };
}
