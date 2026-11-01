// The line shown while a search runs: a turning mark, how long it has been going, a note when the
// server is slow and a button to stop. `stop()` freezes it and says how long it took.
import { el } from "./dom.js";

const SLOW_AFTER_S = 8;

export function createSearchStatus({ doc, t, query, onCancel, timers = { setInterval, clearInterval }, now = () => Date.now() }) {
  const box = el(doc, "div", "search-status");
  box.setAttribute("role", "status");
  const spinner = el(doc, "span", "spinner");
  spinner.setAttribute("aria-hidden", "true");
  const text = el(doc, "span", "search-text");
  const slow = el(doc, "span", "search-slow");
  const cancel = el(doc, "button", "btn-secondary", t("more.search_cancel"));
  cancel.type = "button";
  cancel.onclick = () => onCancel();
  box.append(spinner, text, slow, cancel);

  const started = now();
  const seconds = () => Math.floor((now() - started) / 1000);
  const draw = () => {
    const s = seconds();
    text.textContent = t("more.searching", { query, seconds: s });
    slow.textContent = s >= SLOW_AFTER_S ? t("more.search_slow") : "";
  };
  draw();
  const timer = timers.setInterval(draw, 1000);

  return {
    el: box,
    seconds,
    // Ends the run: the mark and the button go, `message` (if any) takes the place of the count.
    stop(message) {
      timers.clearInterval(timer);
      spinner.remove();
      cancel.remove();
      slow.remove();
      text.textContent = message ?? t("more.search_done", { seconds: ((now() - started) / 1000).toFixed(1) });
      box.classList.add("ended");
    },
  };
}
