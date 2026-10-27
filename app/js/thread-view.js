// Opens and closes a post's replies and its ancestors inside its own card, in place.
import { buildThread, limitVisible } from "./thread.js";

// Opens or closes the replies of `status` inside its own card, in place.
export async function toggleThread({ doc, card, status, api, renderCard, t, initial }) {
  const box = card.querySelector(":scope > .thread") ?? card.querySelector(".thread");
  if (!box.hidden) {
    box.hidden = true;
    box.replaceChildren();
    return;
  }
  const context = await api.get(`/api/v1/statuses/${encodeURIComponent(status.id)}/context`);
  const { nodes } = buildThread(status, context);

  function draw(count) {
    const { visible, hiddenCount } = limitVisible(nodes, count);
    box.replaceChildren();
    for (const { status: st, depth } of visible) {
      const el = renderCard(st);
      el.classList.add(`depth-${Math.min(depth, 2)}`);
      box.append(el);
    }
    if (hiddenCount > 0) {
      const more = doc.createElement("button");
      more.type = "button";
      more.className = "more";
      more.textContent = t("thread.more", { count: hiddenCount });
      more.onclick = () => draw(nodes.length);
      box.append(more);
    }
  }
  draw(initial);
  box.hidden = false;
}

// Opens or closes the posts this one answers, above it, in place. The server
// returns them oldest first; the nearest few show, earlier ones on demand. With `scroll` the
// page moves to the first post shown (and again when the earlier ones are added). Answers false
// when the server has no ancestors to show (the post answered is gone, private or not known
// here), so the caller can say so instead of leaving the click without an effect.
export async function toggleAncestors({ doc, card, status, api, renderCard, t, initial, scroll = false }) {
  const box = card.querySelector(":scope > .ancestors");
  if (!box.hidden) {
    box.hidden = true;
    box.replaceChildren();
    return true;
  }
  const context = await api.get(`/api/v1/statuses/${encodeURIComponent(status.id)}/context`);
  const all = context?.ancestors ?? [];
  if (all.length === 0) return false;

  function draw(count) {
    const shown = all.slice(Math.max(0, all.length - count));
    box.replaceChildren();
    if (shown.length < all.length) {
      const more = doc.createElement("button");
      more.type = "button";
      more.className = "earlier";
      more.textContent = t("thread.earlier", { count: all.length - shown.length });
      more.onclick = () => { draw(all.length); if (scroll) box.scrollIntoView?.({ block: "start" }); };
      box.append(more);
    }
    for (const st of shown) box.append(renderCard(st));
  }
  draw(initial);
  box.hidden = false;
  // Opened by the reader: bring the start of the conversation into view.
  if (scroll) box.scrollIntoView?.({ block: "start" });
  return true;
}

// A reply just written goes into the open thread at once (the server's context lags).
// Under the post it answers when that one sits inside a thread, else at the thread's end.
// Nothing is added when no thread is open.
export function insertReply({ card, reply, renderCard }) {
  const own = card.querySelector(":scope > .thread");
  const depthOf = (el) => Number((/depth-(\d)/.exec(el.className) ?? [])[1] ?? 0);
  const inside = card.parentElement?.classList?.contains("thread") ? card : null;
  const box = inside ? card.parentElement : own;
  if (!box || (!inside && own.hidden)) return;
  if (box.querySelector(`[data-status-id="${reply.id}"]`)) return;
  const el = renderCard(reply);
  el.classList.add(`depth-${Math.min(depthOf(card) + 1, 2)}`);
  if (inside) card.after(el);
  else box.append(el);
}
