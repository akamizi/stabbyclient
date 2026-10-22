import { unreadCount, loadHidden, saveHidden, withoutHidden } from "./notifications.js";
import { loadReadMarker, saveReadMarker } from "./markers.js";

// The notifications and what is done to them: the list, the read position (the server's, so two
// devices agree), dismissing one, clearing all. The page is told through onChange whenever
// anything it shows has changed (and also when a failed action leaves things as they were, so a
// row swiped aside is drawn back).
export function createNotificationsController({ api, storage, seenKey, hiddenKey, t, toast, confirm, onChange }) {
  const hidden = loadHidden(storage, hiddenKey);
  let latest = [];
  let lastSeen = null;
  let marking = null;
  // A kind picked to look at (null: all). Its list comes from the server, since the 30 latest of
  // everything may hold few of that kind; the unread count always follows the whole list.
  let kind = null;
  let ofKind = [];
  const say = (key) => toast(t(key));

  const ctl = {
    items: () => latest,
    // What the page shows: the whole list, or the chosen kind's.
    shown: () => (kind ? ofKind : latest),
    kind: () => kind,

    async setKind(type) {
      kind = type || null;
      ofKind = [];
      if (kind) {
        try {
          ofKind = withoutHidden(await api.get("/api/v1/notifications", { "types[]": kind, limit: "30" }), hidden);
        } catch (e) {
          kind = null;
          if (e.status !== 401) say("notifications.filter_failed");
        }
      }
      onChange();
    },

    lastSeen: () => lastSeen,
    unread: () => unreadCount(latest, lastSeen),

    setItems(items) {
      latest = withoutHidden(items, hidden);
      onChange();
    },

    async start() {
      lastSeen = await loadReadMarker({ api, storage, key: seenKey });
      try {
        ctl.setItems(await api.get("/api/v1/notifications", { limit: "30" }));
      } catch { /* offline: the next poll tries again */ }
      onChange();
    },

    // Another device may have read more since: take the server's position, unless we are saving ours.
    async syncMarker() {
      const id = await loadReadMarker({ api, storage, key: seenKey });
      if (marking || id === lastSeen) return;
      lastSeen = id;
      onChange();
    },

    async markAllRead() {
      if (!latest[0]) return;
      lastSeen = latest[0].id;
      onChange();
      marking = saveReadMarker({ api, storage, key: seenKey, id: lastSeen });
      const saved = await marking;
      marking = null;
      if (!saved) say("notifications.mark_failed");
    },

    // One notification goes away, on the server too. The read position must not be left pointing
    // at a notification that is gone: it moves to the one just below it.
    async dismiss(n) {
      try {
        await api.postJson(`/api/v1/notifications/${encodeURIComponent(n.id)}/dismiss`, {});
      } catch (e) {
        if (e.status === 404) {
          // Made before the server could dismiss: hide it on this device only.
          hidden.add(n.id);
          saveHidden(storage, hiddenKey, hidden);
          say("notifications.hidden_here");
        } else {
          if (e.status !== 401) say("notifications.dismiss_failed");
          onChange();
          return;
        }
      }
      const i = latest.findIndex((x) => x.id === n.id);
      if (i === -1) return;
      if (n.id === lastSeen && latest[i + 1]) {
        lastSeen = latest[i + 1].id;
        saveReadMarker({ api, storage, key: seenKey, id: lastSeen });
      }
      latest = latest.filter((x) => x.id !== n.id);
      ofKind = ofKind.filter((x) => x.id !== n.id);
      onChange();
    },

    // Every notification goes, on the server too (asked first: it cannot be undone).
    async clearAll() {
      if (!confirm(t("notifications.clear_confirm"))) return;
      try {
        await api.postJson("/api/v1/notifications/clear", {});
      } catch (e) {
        if (e.status !== 401) say("notifications.clear_failed");
        return;
      }
      latest = [];
      ofKind = [];
      hidden.clear();
      saveHidden(storage, hiddenKey, hidden);
      onChange();
    },
  };
  return ctl;
}
