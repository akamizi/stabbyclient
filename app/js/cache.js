// The last-seen timeline, kept in localStorage per account (and per list) so a page opens with
// something to show before the network answers. Versioned: an older layout is ignored.
const PREFIX = "stabbyclient.timeline";
const VERSION = 2;
// Only the top of a list is kept: one read far back would otherwise be written whole at every
// refresh and drawn whole at the next launch. Older posts come back with "older posts".
export const MAX_CACHED = 40;

export function createTimelineCache(storage, accountId = "", name = "") {
  const base = accountId ? `${PREFIX}.${accountId}` : PREFIX;
  const KEY = name ? `${base}.${name}` : base;
  let written = null; // what this cache last stored, so an unchanged list is not written again
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
        const text = JSON.stringify(statuses.slice(0, MAX_CACHED));
        if (text === written) return;
        storage.setItem(KEY, `{"v":${VERSION},"statuses":${text},"savedAt":${Date.now()}}`);
        written = text;
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
