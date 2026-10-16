// The notifications list is newest first and ids are opaque, so "unread" means
// the items sitting above the last one the user has seen.
export function unreadCount(items, lastSeenId) {
  if (!lastSeenId) return items.length;
  const i = items.findIndex((x) => x.id === lastSeenId);
  return i === -1 ? items.length : i;
}

const KNOWN = new Set(["favourite", "dislike", "reaction", "reblog", "follow", "follow_request", "mention", "status", "poll", "update"]);
const ICONS = { favourite: "★", dislike: "👎", reaction: "☺", reblog: "⟳", follow: "+", follow_request: "+", mention: "@", status: "✎", poll: "☑", update: "✎" };

export function describeNotification(n, t) {
  const name = n.account?.display_name || n.account?.acct || "";
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
