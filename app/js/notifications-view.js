import { describeNotification, unreadCount } from "./notifications.js";

// lastSeenId: the last notification read (null: none yet; undefined: no reading state at all).
export function renderNotifications({ doc, container, items, t, onOpen, lastSeenId, onMarkRead }) {
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
    const label = `${d.icon} ${d.text}`;
    if (d.statusId) {
      const b = doc.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.onclick = () => onOpen(d.statusId);
      li.append(b);
    } else {
      li.textContent = label;
    }
    ul.append(li);
  }
  container.replaceChildren(...bar, ul);
}
