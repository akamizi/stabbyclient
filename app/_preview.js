import { renderStatusCard } from "./js/status-card.js";
import it from "./js/locales/it.js";
const t = (k, p = {}) => (it[k] ?? k).replace(/\{(\w+)\}/g, (m, x) => p[x] ?? m);
const acc = (n) => ({ acct: n, display_name: n });
document.getElementById("box").append(renderStatusCard({ id: "1", content: "<p>Perché è già così: àèéìòù “virgolette” — 0O 1lI. <strong>grassetto</strong> e <em>corsivo</em>, per vedere la larghezza dei caratteri.</p>", visibility: "public", created_at: "2026-10-18T10:00:00Z", account: acc("mizi"), favourites_count: 3, reblogs_count: 1, replies_count: 2, media_attachments: [] }, { doc: document, t, actions: { onReply() {}, onFavourite() {}, onDislike() {}, onToggleThread() {} } }));
