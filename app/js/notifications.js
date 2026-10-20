// The notifications list is newest first and ids are opaque, so "unread" means
// the items sitting above the last one the user has seen.
export function unreadCount(items, lastSeenId) {
  if (!lastSeenId) return items.length;
  const i = items.findIndex((x) => x.id === lastSeenId);
  return i === -1 ? items.length : i;
}

const KNOWN = new Set(["favourite", "dislike", "reaction", "reblog", "follow", "follow_request", "mention", "status", "poll", "update", "move", "block", "unfollow"]);
const ICONS = { favourite: "★", dislike: "👎", reaction: "☺", reblog: "⟳", follow: "+", follow_request: "+", mention: "@", status: "✎", poll: "☑", update: "✎", move: "➜", block: "⛔", unfollow: "−", follow_repaired: "+" };

export function describeNotification(n, t) {
  const name = n.account?.display_name || n.account?.acct || "";
  // A follow lost between two servers and asked for again by stabbypossum: say which kind, and why.
  if (n.type === "follow_repaired") {
    const silent = n.instance_reason === "silent-follow";
    return {
      icon: ICONS.follow_repaired,
      text: t(silent ? "notification.follow_repaired_silent" : "notification.follow_repaired", { name }),
      note: t(silent ? "notification.repaired_note_silent" : "notification.repaired_note_lost"),
      statusId: null,
    };
  }
  const known = KNOWN.has(n.type);
  return {
    icon: ICONS[n.type] ?? "•",
    text: known ? t(`notification.${n.type}`, { name }) : t("notification.unknown", { name, type: n.type }),
    statusId: n.status?.id ?? null,
  };
}

export function startPolling({ api, intervalMs, onUpdate, isVisible, setIntervalFn = setInterval, clearIntervalFn = clearInterval }) {
  const tick = async () => {
    if (!isVisible()) return;
    try {
      onUpdate(await api.get("/api/v1/notifications", { limit: "30" }));
    } catch { /* offline or logged out: try again next tick */ }
  };
  const handle = setIntervalFn(tick, intervalMs);
  return () => clearIntervalFn(handle);
}

// stabbypossum cannot dismiss a notification made before it learnt to (404 on dismiss). Those are
// hidden on this device instead: their ids are remembered here and left out of the list.
export function loadHidden(storage, key) {
  try {
    const list = JSON.parse(storage.getItem(key));
    return new Set(Array.isArray(list) ? list.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

export function saveHidden(storage, key, set) {
  try {
    storage.setItem(key, JSON.stringify([...set].slice(-200)));
  } catch { /* the notification may come back; nothing worse */ }
}

export const withoutHidden = (items, hidden) => (hidden.size ? items.filter((x) => !hidden.has(x.id)) : items);
