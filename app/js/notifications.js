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
  // A follow lost between two servers and asked for again by xenomorph: say which kind, and why.
  if (n.type === "follow_repaired") {
    const silent = n.xenomorph_reason === "silent-follow";
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
