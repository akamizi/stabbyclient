import { createTimelineView } from "./timeline.js";
import { safeUrl } from "./sanitize.js";

// The entries of xenomorph's own "More" menu, in its order.
export const MORE_ENTRIES = [
  { id: "search", icon: "🔍" },
  { id: "bookmarks", icon: "🔖" },
  { id: "admirations", icon: "☆" },
  { id: "drafts", icon: "✎" },
  { id: "scheduled", icon: "⏰" },
  { id: "pinned", icon: "📌" },
  { id: "follow_requests", icon: "＋" },
  { id: "followed_tags", icon: "#" },
  { id: "lists", icon: "☰" },
];

const FEEDS = {
  bookmarks: "/api/v1/bookmarks",
  admirations: "/api/v1/xenomorph/admirations",
  drafts: "/api/v1/xenomorph/drafts",
  scheduled: "/api/v1/xenomorph/scheduled",
};

// Pages of the More menu. Each `open` call replaces what `container` shows.
export function createMorePages({ doc, container, api, t, renderCard, me, toast, confirm, createCache }) {
  const enc = encodeURIComponent;
  const el = (tag, cls, text) => {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const btn = (cls, text, onclick) => {
    const b = el("button", cls, text);
    b.type = "button";
    b.onclick = onclick;
    return b;
  };
  const heading = (text) => el("h2", "page-title", text);
  const fail = (box) => box.replaceChildren(el("p", "error", t("error.offline")));
  // Runs an action; on failure the page stays as it was and a toast says so.
  async function attempt(fn) {
    try {
      await fn();
    } catch (e) {
      if (e.status !== 401) toast(t("error.action_failed"));
    }
  }
  const person = (account, buttons = []) => {
    const li = el("li", "person");
    const url = safeUrl(account.avatar);
    if (url) {
      const img = el("img", "avatar");
      img.src = url;
      img.alt = "";
      img.loading = "lazy";
      li.append(img);
    }
    const who = el("span", "who");
    who.append(el("strong", "", account.display_name || account.username || account.acct || ""));
    who.append(el("span", "acct", ` @${account.acct || ""}`));
    li.append(who, ...buttons);
    return li;
  };
  const withForm = (placeholder, buttonText, onSubmit) => {
    const form = el("form", "inline-form");
    const input = doc.createElement("input");
    input.type = "text";
    input.placeholder = placeholder;
    input.setAttribute("aria-label", placeholder);
    const go = el("button", "", buttonText);
    go.type = "submit";
    form.append(input, go);
    form.onsubmit = async (e) => {
      e.preventDefault();
      const value = input.value.trim();
      if (!value) return;
      await attempt(async () => {
        await onSubmit(value);
        input.value = "";
      });
    };
    return form;
  };

  async function feedPage(title, path) {
    const box = el("div", "feed");
    container.replaceChildren(heading(title), box);
    const view = createTimelineView({ doc, container: box, api, cache: createCache(), t, renderCard, path });
    try {
      await view.load();
      if (!box.querySelector("article")) box.prepend(el("p", "empty", t("timeline.empty")));
    } catch (e) {
      if (e.status !== 401) fail(box);
    }
  }

  async function pinnedPage() {
    const box = el("div", "feed");
    container.replaceChildren(heading(t("more.pinned")), box);
    try {
      const statuses = await api.get(`/api/v1/accounts/${enc(me.id)}/statuses`, { limit: "40" });
      const pinned = statuses.filter((s) => s.pinned);
      if (!pinned.length) box.append(el("p", "empty", t("timeline.empty")));
      for (const s of pinned) box.append(renderCard(s));
    } catch (e) {
      if (e.status !== 401) fail(box);
    }
  }

  async function requestsPage() {
    const list = el("ul", "people");
    container.replaceChildren(heading(t("more.follow_requests")), list);
    try {
      const requests = await api.get("/api/v1/follow_requests");
      const showEmpty = () => { if (!list.querySelector("li")) list.replaceWith(el("p", "empty", t("more.no_requests"))); };
      if (!requests.length) return showEmpty();
      for (const account of requests) {
        const decide = (op) => (ev) => attempt(async () => {
          ev?.target && (ev.target.disabled = true);
          await api.postJson(`/api/v1/follow_requests/${enc(account.id)}/${op}`, {});
          li.remove();
          showEmpty();
        });
        const yes = btn("authorize", t("more.authorize"), null);
        const no = btn("reject", t("more.reject"), null);
        const li = person(account, [yes, no]);
        yes.onclick = decide("authorize");
        no.onclick = decide("reject");
        list.append(li);
      }
    } catch (e) {
      if (e.status !== 401) fail(list);
    }
  }

  async function tagsPage() {
    const list = el("ul", "rows");
    const form = withForm(t("more.hashtag_placeholder"), t("more.follow"), async (value) => {
      await api.postJson(`/api/v1/tags/${enc(value.replace(/^#/, ""))}/follow`, {});
      await render();
    });
    container.replaceChildren(heading(t("more.followed_tags")), form, list);
    async function render() {
      const tags = await api.get("/api/v1/followed_tags");
      list.replaceChildren();
      if (!tags.length) list.append(el("li", "empty", t("more.no_tags")));
      for (const tag of tags) {
        const li = el("li", "row");
        li.append(btn("open", `#${tag.name}`, () => open("tag", tag.name)));
        li.append(btn("unfollow", t("more.unfollow"), () => attempt(async () => {
          await api.postJson(`/api/v1/tags/${enc(tag.name)}/unfollow`, {});
          li.remove();
        })));
        list.append(li);
      }
    }
    try {
      await render();
    } catch (e) {
      if (e.status !== 401) fail(list);
    }
  }

  async function listsPage() {
    const list = el("ul", "rows");
    const form = withForm(t("more.list_name"), t("more.create"), async (title) => {
      await api.postJson("/api/v1/lists", { title, replies_policy: "list" });
      await render();
    });
    container.replaceChildren(heading(t("more.lists")), form, list);
    async function render() {
      const lists = await api.get("/api/v1/lists");
      list.replaceChildren();
      if (!lists.length) list.append(el("li", "empty", t("more.no_lists")));
      for (const item of lists) {
        const li = el("li", "row");
        li.append(btn("open", item.title, () => open("list", item)));
        li.append(btn("delete", t("more.delete"), () => {
          if (!confirm(t("more.delete_list", { name: item.title }))) return;
          return attempt(async () => {
            await api.del(`/api/v1/lists/${enc(item.id)}`);
            li.remove();
          });
        }));
        list.append(li);
      }
    }
    try {
      await render();
    } catch (e) {
      if (e.status !== 401) fail(list);
    }
  }

  async function listPage(item) {
    const members = el("ul", "people");
    const box = el("div", "feed");
    container.replaceChildren(heading(item.title), members, box);
    try {
      const accounts = await api.get(`/api/v1/lists/${enc(item.id)}/accounts`);
      for (const account of accounts) {
        const li = person(account, [btn("remove", t("more.remove"), () => attempt(async () => {
          await api.del(`/api/v1/lists/${enc(item.id)}/accounts`, { account_ids: [account.id] });
          li.remove();
        }))]);
        members.append(li);
      }
    } catch (e) {
      if (e.status !== 401) fail(members);
    }
    const view = createTimelineView({
      doc, container: box, api, cache: createCache(), t, renderCard,
      path: `/api/v1/timelines/list/${enc(item.id)}`,
    });
    try {
      await view.load();
      if (!box.querySelector("article")) box.prepend(el("p", "empty", t("timeline.empty")));
    } catch (e) {
      if (e.status !== 401) fail(box);
    }
  }

  function searchPage() {
    const results = el("div", "results");
    const form = withForm(t("more.search_placeholder"), t("more.search"), async (query) => {
      results.replaceChildren(el("p", "empty", "…"));
      try {
        const found = await api.get("/api/v2/search", { q: query, resolve: "true", limit: "40" });
        results.replaceChildren();
        if (found.accounts?.length) {
          const ul = el("ul", "people");
          for (const a of found.accounts) ul.append(person(a));
          results.append(el("h3", "", t("more.accounts")), ul);
        }
        if (found.statuses?.length) {
          const feed = el("div", "feed");
          for (const s of found.statuses) feed.append(renderCard(s));
          results.append(el("h3", "", t("more.posts")), feed);
        }
        if (found.hashtags?.length) {
          const ul = el("ul", "rows");
          for (const h of found.hashtags) {
            const li = el("li", "row");
            li.append(btn("open", `#${h.name}`, () => open("tag", h.name)));
            ul.append(li);
          }
          results.append(el("h3", "", t("more.hashtags")), ul);
        }
        if (!results.childNodes.length) results.append(el("p", "empty", t("more.nothing_found")));
      } catch (e) {
        results.replaceChildren();
        throw e;
      }
    });
    container.replaceChildren(heading(t("more.search")), form, results);
  }

  async function open(id, arg) {
    if (FEEDS[id]) return feedPage(t(`more.${id}`), FEEDS[id]);
    switch (id) {
      case "tag": return feedPage(`#${arg}`, `/api/v1/timelines/tag/${enc(arg)}`);
      case "pinned": return pinnedPage();
      case "follow_requests": return requestsPage();
      case "followed_tags": return tagsPage();
      case "lists": return listsPage();
      case "list": return listPage(arg);
      case "search": return searchPage();
      default: return undefined;
    }
  }
  return { open };
}
