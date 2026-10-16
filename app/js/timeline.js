// Status ids on xenomorph are opaque (not ordered), so "new" means: sitting above
// the first fresh post that is already on screen.
export function mergeFresh(shown, fresh) {
  if (shown.length === 0) return { toShow: fresh, pendingNew: [] };
  const known = new Set(shown.map((s) => s.id));
  const firstKnown = fresh.findIndex((s) => known.has(s.id));
  const pendingNew = firstKnown === -1 ? fresh : fresh.slice(0, firstKnown);
  return { toShow: shown, pendingNew };
}

function relPath(url) {
  const u = new URL(url, "http://x");
  return u.pathname + u.search;
}

// Home timeline view: cache first, then fresh; older pages on demand; a "new posts"
// button instead of pushing fresh posts above what is being read.
export function createTimelineView({ doc, container, api, cache, renderCard, t, path = "/api/v1/timelines/home", onPending = () => {} }) {
  let shown = [];
  let next = null;
  let pending = [];
  let loaded = false;
  const list = doc.createElement("div");
  const more = doc.createElement("button");
  more.hidden = true;
  more.textContent = t("timeline.older");
  container.replaceChildren(list, more);

  function append(items) {
    for (const s of items) list.append(renderCard(s));
  }
  function revealPending() {
    shown = [...pending, ...shown];
    list.replaceChildren();
    append(shown);
    pending = [];
    onPending(0);
    cache.write(shown);
    doc.defaultView?.scrollTo?.(0, 0);
  }
  more.onclick = async () => {
    if (!next) return;
    more.disabled = true;
    try {
      const page = await api.getPage(relPath(next));
      const seen = new Set(shown.map((s) => s.id));
      const items = page.items.filter((s) => !seen.has(s.id));
      shown = [...shown, ...items];
      append(items);
      next = page.next;
      more.hidden = !next;
    } finally {
      more.disabled = false;
    }
  };

  return {
    async load() {
      const cached = cache.read();
      if (cached) {
        shown = cached.statuses;
        append(shown);
      }
      const page = await api.getPage(path, { limit: "20" });
      if (shown.length === 0) {
        shown = page.items;
        append(shown);
        next = page.next;
        more.hidden = !next;
      } else {
        const r = mergeFresh(shown, page.items);
        pending = r.pendingNew;
        onPending(pending.length);
        // Without the cache we would not know where older pages continue; keep the
        // fresh page's cursor when the cached list is the same page.
        next = next ?? page.next;
        more.hidden = !next;
      }
      cache.write(shown.concat(pending));
      loaded = true;
    },
    // Looks for newer posts without moving what is on screen: they wait in `pending`.
    async refresh() {
      const page = await api.getPage(path, { limit: "20" });
      if (shown.length === 0) {
        shown = page.items;
        append(shown);
        next = next ?? page.next;
        more.hidden = !next;
        cache.write(shown);
        return;
      }
      pending = mergeFresh(shown, page.items).pendingNew;
      onPending(pending.length);
    },
    get loaded() {
      return loaded;
    },
    prepend(status) {
      shown = [status, ...shown];
      list.prepend(renderCard(status));
      cache.write(shown);
    },
    revealPending,
    get pendingCount() {
      return pending.length;
    },
  };
}
