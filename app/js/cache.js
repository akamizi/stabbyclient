const PREFIX = "xenoclient.timeline";

export function createTimelineCache(storage, accountId = "") {
  const KEY = accountId ? `${PREFIX}.${accountId}` : PREFIX;
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

// Logout / expired session: forget every account's cached timeline.
createTimelineCache.clearAll = (storage) => {
  const keys = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k && (k === PREFIX || k.startsWith(`${PREFIX}.`))) keys.push(k);
  }
  keys.forEach((k) => storage.removeItem(k));
};
