// Draws the notifications list: the type filter, one row per notification (swipe to dismiss),
// the unread divider, and the mark-as-read and clear buttons.
import { describeNotification, unreadCount } from "./notifications.js";
import { makeSwipeable } from "./swipe.js";
import { emojifyText } from "./emoji-text.js";

// lastSeenId: the last notification read (null: none yet; undefined: no reading state at all).
export const FILTER_KINDS = ["mention", "reblog", "favourite", "follow"];

// With onFilter the list can be narrowed to one kind; kind is the one now chosen.
export function renderNotifications({ doc, container, items, t, onOpen, lastSeenId, onMarkRead, onDismiss, onClearAll, kind = null, onFilter }) {
  let picker = null;
  if (onFilter) {
    picker = doc.createElement("select");
    picker.className = "notif-filter";
    picker.setAttribute("aria-label", t("notifications.filter"));
    for (const k of ["", ...FILTER_KINDS]) {
      const o = doc.createElement("option");
      o.value = k;
      o.textContent = t(k ? `notifications.kind_${k}` : "notifications.kind_all");
      o.selected = (kind || "") === k;
      picker.append(o);
    }
    picker.onchange = () => onFilter(picker.value);
  }
  if (items.length === 0) {
    const p = doc.createElement("p");
    p.textContent = t("notifications.empty");
    container.replaceChildren(...(picker ? [picker] : []), p);
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
  if (onClearAll) {
    const all = doc.createElement("button");
    all.type = "button";
    all.className = "clear-all";
    all.textContent = t("notifications.clear_all");
    all.onclick = onClearAll;
    bar.push(all);
  }
  for (const [index, n] of items.entries()) {
    const d = describeNotification(n, t);
    const li = doc.createElement("li");
    if (index < unread) li.classList.add("unread");
    // Sweeping a row sideways dismisses it, like its ✕ button.
    const swipe = onDismiss ? makeSwipeable(li, { onSwipe: () => onDismiss(n) }) : null;
    // The line: the text (with custom emoji as pictures) and its note, in one block; the ✕ is
    // a separate button at the end of the row.
    const main = doc.createElement("div");
    main.className = "main";
    const label = emojifyText(`${d.icon} ${d.text}`, n.account?.emojis, doc);
    if (d.statusId) {
      const b = doc.createElement("button");
      b.type = "button";
      b.append(label);
      b.onclick = () => { if (!swipe?.wasDragged()) onOpen(d.statusId); };
      main.append(b);
    } else {
      const line = doc.createElement("span");
      line.className = "line";
      line.append(label);
      main.append(line);
    }
    if (d.note) main.append(Object.assign(doc.createElement("p"), { className: "note", textContent: d.note }));
    li.append(main);
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
  container.replaceChildren(...(picker ? [picker] : []), ...bar, ul);
}
