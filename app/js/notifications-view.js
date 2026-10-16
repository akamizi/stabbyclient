import { describeNotification } from "./notifications.js";

export function renderNotifications({ doc, container, items, t, onOpen }) {
  if (items.length === 0) {
    const p = doc.createElement("p");
    p.textContent = t("notifications.empty");
    container.replaceChildren(p);
    return;
  }
  const ul = doc.createElement("ul");
  ul.className = "notifications";
  for (const n of items) {
    const d = describeNotification(n, t);
    const li = doc.createElement("li");
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
  container.replaceChildren(ul);
}
