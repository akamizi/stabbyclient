// The time shown on a post: "today at 14:34" or "yesterday at 23:03" for the last two days,
// the full date and time for anything older.
export function formatPostTime(iso, t, now = new Date()) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso ?? "");
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((day(now) - day(d)) / 86400000);
  const hm = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (days === 0) return t("time.today", { time: hm });
  if (days === 1) return t("time.yesterday", { time: hm });
  return d.toLocaleString();
}
