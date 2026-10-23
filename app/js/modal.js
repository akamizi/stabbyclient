// A pop-up over the page for something being written. The page behind is dimmed and does
// not scroll. Escape and the phone's Back button close it; a tap on the dimmed area does
// not, so a half-written post is not lost by accident.
import { trapFocus } from "./focus-scope.js";

export function createModal({ doc, win, t }) {
  let overlay = null;
  let pushed = false;
  let onClose = null;
  let release = null;

  function teardown() {
    overlay?.remove();
    overlay = null;
    release?.();
    release = null;
    doc.body.classList.remove("modal-open");
    win.removeEventListener("keydown", onKey);
    win.removeEventListener("popstate", onPop);
    const done = onClose;
    onClose = null;
    done?.();
  }
  function close() {
    if (!overlay) return;
    teardown();
    if (pushed) {
      pushed = false;
      win.history.back(); // takes our own entry away
    }
  }
  function onKey(e) {
    if (e.key === "Escape") close();
  }
  function onPop() {
    pushed = false;
    teardown();
  }

  function open(content, { label = "", onClose: closed } = {}) {
    if (overlay) {
      pushed = false;
      teardown();
    }
    overlay = doc.createElement("div");
    overlay.className = "modal";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", label || t("modal.label"));
    const panel = doc.createElement("div");
    panel.className = "modal-panel";
    panel.append(content);
    overlay.append(panel);
    onClose = closed ?? null;
    doc.body.append(overlay);
    release = trapFocus(doc, overlay);
    doc.body.classList.add("modal-open");
    win.history.pushState({ modal: true }, "");
    pushed = true;
    win.addEventListener("keydown", onKey);
    win.addEventListener("popstate", onPop);
    const first = content.querySelector?.("textarea");
    if (first) first.focus?.();
    else {
      panel.tabIndex = -1;
      panel.focus?.();
    }
  }
  return { open, close, get isOpen() { return overlay !== null; } };
}
