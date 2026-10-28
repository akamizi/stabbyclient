// The floating "back to top" button: it shows once the page has been scrolled two screens down,
// and takes the reader back to the top, with the focus on the page heading.
import { el } from "./dom.js";

export function createBackToTop({ doc, win, t, screens = 2 }) {
  const button = el(doc, "button", "top-btn btn-secondary", "↑");
  button.type = "button";
  button.hidden = true;
  button.setAttribute("aria-label", t("nav.top"));
  button.title = t("nav.top");
  const update = () => {
    const far = win.scrollY > screens * (win.innerHeight || 600);
    if (button.hidden === far) button.hidden = !far;
  };
  button.onclick = () => {
    const calm = win.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    win.scrollTo({ top: 0, behavior: calm ? "auto" : "smooth" });
    const heading = doc.getElementById("view-title");
    if (heading) {
      heading.setAttribute("tabindex", "-1");
      heading.focus?.({ preventScroll: true });
    }
  };
  win.addEventListener("scroll", update, { passive: true });
  update();
  return { button, update };
}
