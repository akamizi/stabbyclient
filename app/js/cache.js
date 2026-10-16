const KEY = "xenoclient.timeline";

export function createTimelineCache(storage) {
  return {
    read() {
      try {
        const v = JSON.parse(storage.getItem(KEY));
        return v && Array.isArray(v.statuses) ? v : null;
      } catch {
        return null;
      }
    },
    write(statuses) {
      try {
        storage.setItem(KEY, JSON.stringify({ statuses, savedAt: Date.now() }));
      } catch { /* quota or unavailable: the cache is only a convenience */ }
    },
  };
}
