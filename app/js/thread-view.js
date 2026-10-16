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
