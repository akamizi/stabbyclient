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

import { swapCard } from "./card-swap.js";

// What on a post can change after it was drawn (likes, boosts, counts, reactions, poll).
const STATE_FIELDS = ["favourited", "favourites_count", "reblogged", "reblogs_count", "replies_count", "disliked", "bookmarked", "pinned"];
const stateOf = (s) => JSON.stringify([STATE_FIELDS.map((k) => s[k]), s.reactions ?? null, s.poll ?? null]);

// Home timeline view: cache first, then fresh; older pages on demand; a "new posts"
// button instead of pushing fresh posts above what is being read.
export function createTimelineView({ doc, container, api, cache, renderCard, t, path = "/api/v1/timelines/home", onPending = () => {}, onError = () => {} }) {
  let shown = [];
  let next = null;
  let pending = [];
  let loaded = false;
  let lastFetch = null;
  const cards = new Map(); // id -> { el, s }
  const list = doc.createElement("div");
  const more = doc.createElement("button");
  more.hidden = true;
  more.textContent = t("timeline.older");
  container.replaceChildren(list, more);

  function append(items) {
    for (const s of items) {
      const el = renderCard(s);
      cards.set(s.id, { el, s });
      list.append(el);
    }
  }
  // Posts already on screen whose state the server now reports differently (a like or a
  // boost made elsewhere, new counts) are redrawn in place.
  function applyFresh(items) {
    for (const item of items) {
      const known = cards.get(item.id);
      if (!known || stateOf(known.s) === stateOf(item)) continue;
      const el = swapCard(known.el, renderCard(item));
      cards.set(item.id, { el, s: item });
      shown = shown.map((x) => (x.id === item.id ? item : x));
    }
  }
  function revealPending() {
    shown = [...pending, ...shown];
    list.replaceChildren();
    cards.clear();
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
    } catch (e) {
      onError(e);
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
      lastFetch = { newest: page.items[0]?.created_at ?? null, count: page.items.length };
      if (shown.length === 0) {
        shown = page.items;
        append(shown);
        next = page.next;
        more.hidden = !next;
      } else {
        const r = mergeFresh(shown, page.items);
        applyFresh(page.items);
        pending = r.pendingNew;
        onPending(pending.length);
        // Without the cache we would not know where older pages continue; keep the
        // fresh page's cursor when the cached list is the same page.
        next = next ?? page.next;
        more.hidden = !next;
      }
      // Only what is on screen is saved: pending posts saved after it would come back, next
      // launch, at the bottom, already "known" and so never announced.
      cache.write(shown);
      loaded = true;
    },
    // Looks for newer posts without moving what is on screen: they wait in `pending`.
    async refresh() {
      const page = await api.getPage(path, { limit: "20" });
      lastFetch = { newest: page.items[0]?.created_at ?? null, count: page.items.length };
      if (shown.length === 0) {
        shown = page.items;
        append(shown);
        next = next ?? page.next;
        more.hidden = !next;
        cache.write(shown);
        return;
      }
      applyFresh(page.items);
      pending = mergeFresh(shown, page.items).pendingNew;
      onPending(pending.length);
      if (shown.length) cache.write(shown);
    },
    get newest() {
      return shown[0]?.created_at ?? null;
    },
    get lastFetch() {
      return lastFetch;
    },
    get loaded() {
      return loaded;
    },
    prepend(status) {
      shown = [status, ...shown];
      const el = renderCard(status);
      cards.set(status.id, { el, s: status });
      list.prepend(el);
      cache.write(shown);
    },
    revealPending,
    get pendingCount() {
      return pending.length;
    },
  };
}
