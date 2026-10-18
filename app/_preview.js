import { renderNotifications } from "./js/notifications-view.js";
import it from "./js/locales/it.js";
const t = (k, p = {}) => (it[k] ?? k).replace(/\{(\w+)\}/g, (m, x) => p[x] ?? m);
const medal = { shortcode: "medal", url: "https://x.y05.eu/static/xenomorph/emoji-packs/noto/noto_1st_place_medal.png" };
const acc = (n, e = []) => ({ acct: n, display_name: n, emojis: e });
renderNotifications({ doc: document, container: document.getElementById("box"), t, onOpen() {}, onDismiss() {}, onMarkRead() {}, onClearAll() {}, lastSeenId: "4",
  items: [
    { id: "6", type: "mention", account: acc("mizi :medal: ------ :medal:", [medal]), status: { id: "s" } },
    { id: "5", type: "favourite", account: acc("Sir Uriel Fanelli"), status: { id: "s" } },
    { id: "4", type: "follow_repaired", xenomorph_reason: "silent-follow", account: acc("Laeldoo :medal:", [medal]), status: null },
    { id: "3", type: "reblog", account: acc("Sir Uriel Fanelli"), status: { id: "s" } },
    { id: "2", type: "poll", account: acc("x"), status: { id: "s" } },
    { id: "1", type: "follow", account: acc("Giacomo Alessandroni"), status: null },
  ] });
