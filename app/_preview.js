import { renderNotifications } from "./js/notifications-view.js";
import { renderStatusCard } from "./js/status-card.js";
import it from "./js/locales/it.js";
const t = (k, p = {}) => (it[k] ?? k).replace(/\{(\w+)\}/g, (m, x) => p[x] ?? m);
const acc = (n) => ({ acct: n, display_name: n });
const box = document.getElementById("box");
box.append(renderStatusCard({ id: "1", content: "<p>Un esempio di post: <strong>grassetto</strong>, <em>corsivo</em> e una riga più lunga per vedere la larghezza dei caratteri.</p>", visibility: "public", created_at: "2026-10-18T10:00:00Z", account: acc("mizi"), favourites_count: 3, reblogs_count: 1, replies_count: 2, media_attachments: [] }, { doc: document, t, actions: { onReply() {}, onFavourite() {}, onDislike() {}, onToggleThread() {} } }));
const list = document.createElement("div");
box.append(list);
renderNotifications({ doc: document, container: list, t, onOpen() {}, onDismiss() {}, onMarkRead() {}, onClearAll() {}, lastSeenId: "2",
  items: [{ id: "3", type: "favourite", account: acc("Sir Uriel Fanelli"), status: { id: "s" } }, { id: "2", type: "follow", account: acc("Giacomo Alessandroni"), status: null }] });
