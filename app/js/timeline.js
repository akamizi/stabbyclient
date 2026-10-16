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
export function createTimelineView({ doc, container, api, cache, renderCard, t }) {
  let shown = [];
  let next = null;
  let pending = [];
  const list = doc.createElement("div");
  const banner = doc.createElement("button");
  const more = doc.createElement("button");
  banner.hidden = true;
  more.hidden = true;
  more.textContent = t("timeline.older");
  container.replaceChildren(banner, list, more);

  function append(items) {
    for (const s of items) list.append(renderCard(s));
  }
  function showBanner() {
    banner.hidden = pending.length === 0;
    banner.textContent = t("timeline.new_posts", { count: pending.length });
  }
  banner.onclick = () => {
    shown = [...pending, ...shown];
    list.replaceChildren();
    append(shown);
    pending = [];
    showBanner();
    cache.write(shown);
    doc.defaultView?.scrollTo?.(0, 0);
  };
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
      const page = await api.getPage("/api/v1/timelines/home", { limit: "20" });
      if (shown.length === 0) {
        shown = page.items;
        append(shown);
        next = page.next;
        more.hidden = !next;
      } else {
        const r = mergeFresh(shown, page.items);
        pending = r.pendingNew;
        showBanner();
        // Without the cache we would not know where older pages continue; keep the
        // fresh page's cursor when the cached list is the same page.
        next = next ?? page.next;
        more.hidden = !next;
      }
      cache.write(shown.concat(pending));
    },
    prepend(status) {
      shown = [status, ...shown];
      list.prepend(renderCard(status));
      cache.write(shown);
    },
    get pendingCount() {
      return pending.length;
    },
  };
}
