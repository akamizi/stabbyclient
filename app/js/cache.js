const PREFIX = "stabbyclient.timeline";
const VERSION = 2;

export function createTimelineCache(storage, accountId = "", name = "") {
  const base = accountId ? `${PREFIX}.${accountId}` : PREFIX;
  const KEY = name ? `${base}.${name}` : base;
  return {
    read() {
      try {
        const v = JSON.parse(storage.getItem(KEY));
        // v1 caches could hold newer posts after older ones; they are not trusted.
        return v && v.v === VERSION && Array.isArray(v.statuses) ? v : null;
      } catch {
        return null;
      }
    },
    write(statuses) {
      try {
        storage.setItem(KEY, JSON.stringify({ v: VERSION, statuses, savedAt: Date.now() }));
      } catch { /* quota or unavailable: the cache is only a convenience */ }
    },
  };
}

// Logout / expired session: forget every account's cached timeline.
createTimelineCache.clearAll = (storage) => {
  const keys = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k && (k === PREFIX || k.startsWith(`${PREFIX}.`))) keys.push(k);
  }
  keys.forEach((k) => storage.removeItem(k));
};
