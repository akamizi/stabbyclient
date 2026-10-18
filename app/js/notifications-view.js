import { describeNotification, unreadCount } from "./notifications.js";
import { makeSwipeable } from "./swipe.js";

// lastSeenId: the last notification read (null: none yet; undefined: no reading state at all).
export function renderNotifications({ doc, container, items, t, onOpen, lastSeenId, onMarkRead, onDismiss }) {
  if (items.length === 0) {
    const p = doc.createElement("p");
    p.textContent = t("notifications.empty");
    container.replaceChildren(p);
    return;
  }
  const ul = doc.createElement("ul");
  ul.className = "notifications";
  const unread = lastSeenId === undefined ? 0 : unreadCount(items, lastSeenId);
  const bar = [];
  if (unread > 0 && onMarkRead) {
    const mark = doc.createElement("button");
    mark.type = "button";
    mark.className = "mark-read";
    mark.textContent = t("notifications.mark_read", { count: unread });
    mark.onclick = onMarkRead;
    bar.push(mark);
  }
  for (const [index, n] of items.entries()) {
    const d = describeNotification(n, t);
    const li = doc.createElement("li");
    if (index < unread) li.classList.add("unread");
    // Sweeping a row sideways dismisses it, like its ✕ button.
    const swipe = onDismiss ? makeSwipeable(li, { onSwipe: () => onDismiss(n) }) : null;
    const label = `${d.icon} ${d.text}`;
    if (d.statusId) {
      const b = doc.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.onclick = () => { if (!swipe?.wasDragged()) onOpen(d.statusId); };
      li.append(b);
    } else {
      li.textContent = label;
    }
    if (d.note) li.append(Object.assign(doc.createElement("p"), { className: "note", textContent: d.note }));
    if (onDismiss) {
      const x = doc.createElement("button");
      x.type = "button";
      x.className = "dismiss";
      x.textContent = "✕";
      x.setAttribute("aria-label", t("notifications.dismiss"));
      x.title = t("notifications.dismiss");
      x.onclick = () => onDismiss(n);
      li.append(x);
    }
    ul.append(li);
  }
  container.replaceChildren(...bar, ul);
}
