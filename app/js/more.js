import { createTimelineView } from "./timeline.js";
import { safeUrl, sanitizeHtml } from "./sanitize.js";
import { elFor } from "./dom.js";
import { personItem } from "./person.js";

// The entries of stabbypossum's own "More" menu, in its order.
export const MORE_ENTRIES = [
  { id: "profile", icon: "👤" },
  { id: "edit_profile", icon: "✏️" },
  { id: "aliases", icon: "@" },
  { id: "search", icon: "🔍" },
  { id: "bookmarks", icon: "🔖" },
  { id: "admirations", icon: "☆" },
  { id: "drafts", icon: "✎" },
  { id: "scheduled", icon: "⏰" },
  { id: "pinned", icon: "📌" },
  { id: "following", icon: "→" },
  { id: "followers", icon: "←" },
  { id: "mutes", icon: "🔇" },
  { id: "blocks", icon: "🚫" },
  { id: "follow_requests", icon: "＋" },
  { id: "followed_tags", icon: "#" },
  { id: "lists", icon: "☰" },
  { id: "messages", icon: "✉" },
  { id: "feeds", icon: "⌁" },
  { id: "about", icon: "ℹ️" },
];

const FEEDS = {
  bookmarks: "/api/v1/bookmarks",
  admirations: "/api/v1/stabbypossum/admirations",
  drafts: "/api/v1/stabbypossum/drafts",
  scheduled: "/api/v1/stabbypossum/scheduled",
};

// Pages of the More menu. Each `open` call replaces what `container` shows.
export function createMorePages({ doc, container, api, t, renderCard, me, toast, confirm, createCache, onProfile }) {
  const enc = encodeURIComponent;
  const el = elFor(doc);
  const btn = (cls, text, onclick) => {
    const b = el("button", cls, text);
    b.type = "button";
    b.onclick = onclick;
    return b;
  };
  const failedMore = (e) => { if (e.status !== 401) toast(t("error.action_failed")); };
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
  const person = (account, buttons = []) => personItem({ doc, account, onOpen: onProfile, buttons });
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
    const view = createTimelineView({ doc, container: box, api, cache: createCache(), t, renderCard, path, onError: failedMore });
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

  // Lists of people. Each can take the person off it again, except the followers.
  const PEOPLE = {
    following: { path: () => `/api/v1/accounts/${enc(me.id)}/following`, undo: "unfollow", label: "profile.unfollow", empty: "more.no_following" },
    followers: { path: () => `/api/v1/accounts/${enc(me.id)}/followers`, empty: "more.no_followers" },
    mutes: { path: () => "/api/v1/mutes", undo: "unmute", label: "profile.unmute", empty: "more.no_mutes" },
    blocks: { path: () => "/api/v1/blocks", undo: "unblock", label: "profile.unblock", empty: "more.no_blocks" },
  };

  // People you follow (with Unfollow and a form to follow a handle), who follow you, or whom
  // you mute or block.
  async function peoplePage(kind) {
    const spec = PEOPLE[kind];
    const mine = kind === "following";
    const list = el("ul", "people");
    const more = btn("load-more", t("timeline.older"), null);
    more.hidden = true;
    let next = null;
    const pathOf = (url) => { const u = new URL(url, "http://x"); return u.pathname + u.search; };
    const row = (account) => {
      const buttons = spec.undo ? [btn(spec.undo, t(spec.label), () => attempt(async () => {
        await api.postJson(`/api/v1/accounts/${enc(account.id)}/${spec.undo}`, {});
        li.remove();
        if (!list.querySelector("li")) list.append(el("li", "empty", t(spec.empty)));
      }))] : [];
      const li = person(account, buttons);
      return li;
    };
    const fill = (page) => {
      list.querySelector(".empty")?.remove();
      for (const a of page.items) list.append(row(a));
      if (!list.querySelector("li")) list.append(el("li", "empty", t(spec.empty)));
      next = page.next;
      more.hidden = !next;
    };
    const load = async () => fill(await api.getPage(spec.path(), { limit: "80" }));
    more.onclick = () => attempt(async () => fill2(await api.getPage(pathOf(next))));
    const fill2 = (page) => {
      for (const a of page.items) list.append(row(a));
      next = page.next;
      more.hidden = !next;
    };
    const parts = [heading(t(`more.${kind}`))];
    if (mine) {
      parts.push(withForm(t("more.handle_placeholder"), t("more.follow"), async (handle) => {
        // The server's own lookup first; a remote handle it does not know is searched for.
        let account = await api.get("/api/v1/accounts/lookup", { acct: handle.replace(/^@/, "") }).catch((e) => {
          if (e.status === 401) throw e;
          return null;
        });
        if (!account?.id) {
          const found = await api.get("/api/v2/search", { q: handle, resolve: "true", limit: "1" });
          account = found.accounts?.[0];
        }
        if (!account) {
          toast(t("more.not_found"));
          return;
        }
        await api.postJson(`/api/v1/accounts/${enc(account.id)}/follow`, {});
        toast(t("more.following_now", { acct: account.acct }));
        list.replaceChildren();
        await load();
      }));
    }
    container.replaceChildren(...parts, list, more);
    try {
      await load();
    } catch (e) {
      if (e.status !== 401) fail(list);
    }
  }

  // RSS and Atom sources: up to eight, the newest article of each is posted at every check.
  async function feedsPage() {
    const MAX_FEEDS = 8;
    const list = el("ul", "rows");
    const note = el("p", "empty", t("more.feeds_hint"));
    const form = el("form", "inline-form");
    const url = doc.createElement("input");
    url.type = "url";
    url.placeholder = "https://example.net/feed.xml";
    url.setAttribute("aria-label", t("more.feed_url"));
    const nsfwLabel = el("label", "feed-nsfw");
    const nsfw = doc.createElement("input");
    nsfw.type = "checkbox";
    nsfwLabel.append(nsfw, doc.createTextNode(" NSFW"));
    const go = el("button", "", t("more.subscribe"));
    go.type = "submit";
    form.append(url, nsfwLabel, go);
    container.replaceChildren(heading(t("more.feeds")), note, form, list);

    const show = (feeds) => {
      list.replaceChildren();
      if (!feeds.length) list.append(el("li", "empty", t("more.no_feeds")));
      for (const feed of feeds) {
        const li = el("li", "feed");
        const safe = safeUrl(feed.url);
        const title = feed.title || feed.url || "";
        let head;
        if (safe) {
          head = el("a", "feed-title", title);
          head.href = safe;
          head.target = "_blank";
          head.rel = "noopener noreferrer";
        } else {
          head = el("span", "feed-title", title);
        }
        li.append(head, el("span", "feed-url", ` ${feed.url ?? ""}${feed.nsfw ? " · NSFW" : ""}`));
        li.append(btn("remove", t("more.delete"), () => attempt(async () => show(await api.postJson("/api/v1/stabbypossum/feeds/delete", { id: feed.id })))));
        list.append(li);
      }
      const full = feeds.length >= MAX_FEEDS;
      go.disabled = full;
      form.querySelector(".feeds-full")?.remove();
      if (full) form.append(el("p", "feeds-full empty", t("more.feeds_full")));
    };
    form.onsubmit = async (e) => {
      e.preventDefault();
      const address = url.value.trim();
      if (!address) return;
      go.disabled = true;
      try {
        show(await api.postJson("/api/v1/stabbypossum/feeds/create", { url: address, nsfw: nsfw.checked }));
        url.value = "";
        nsfw.checked = false;
        toast(t("more.feed_added"));
      } catch (err) {
        go.disabled = false;
        if (err.status !== 401) toast(err.detail || t("error.action_failed"));
      }
    };
    try {
      show(await api.get("/api/v1/stabbypossum/feeds"));
    } catch (e) {
      if (e.status !== 401) fail(list);
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
      doc, container: box, api, cache: createCache(), t, renderCard, onError: failedMore,
      path: `/api/v1/timelines/list/${enc(item.id)}`,
    });
    try {
      await view.load();
      if (!box.querySelector("article")) box.prepend(el("p", "empty", t("timeline.empty")));
    } catch (e) {
      if (e.status !== 401) fail(box);
    }
  }

  // Direct conversations, newest first; each can be deleted.
  // Read-only: what the instance says about itself, and the hosts it talks to.
  async function aboutPage() {
    container.replaceChildren(heading(t("more.about")));
    try {
      const [about, peers] = await Promise.all([
        api.get("/api/v1/instance/extended_description"),
        api.get("/api/v1/instance/peers"),
      ]);
      const text = el("div", "about");
      text.append(sanitizeHtml(about?.content || "", doc));
      const hosts = el("ul", "rows peers");
      for (const host of Array.isArray(peers) ? peers : []) hosts.append(el("li", "row", String(host)));
      container.append(text, el("h3", "", t("more.peers", { count: hosts.children.length })), hosts);
    } catch {
      container.append(el("p", "error", t("error.offline")));
    }
  }

  async function messagesPage() {
    const list = el("ul", "rows messages");
    const more = btn("load-more", t("timeline.older"), null);
    more.hidden = true;
    let next = null;
    const pathOf = (url) => { const u = new URL(url, "http://x"); return u.pathname + u.search; };
    const row = (conv) => {
      const li = el("li", "message");
      const who = (conv.accounts || []).map((a) => a.display_name || a.acct).join(", ");
      li.append(el("p", "message-with", who));
      if (conv.last_status) li.append(renderCard(conv.last_status));
      li.append(btn("delete", t("more.delete"), () => {
        if (!confirm(t("more.delete_message"))) return undefined;
        return attempt(async () => {
          await api.del(`/api/v1/conversations/${enc(conv.id)}`);
          li.remove();
          if (!list.querySelector("li")) list.append(el("li", "empty", t("more.no_messages")));
        });
      }));
      return li;
    };
    const fill = (page) => {
      list.querySelector(".empty")?.remove();
      for (const c of page.items) list.append(row(c));
      if (!list.querySelector("li")) list.append(el("li", "empty", t("more.no_messages")));
      next = page.next;
      more.hidden = !next;
    };
    more.onclick = () => attempt(async () => fill(await api.getPage(pathOf(next))));
    container.replaceChildren(heading(t("more.messages")), list, more);
    try {
      fill(await api.getPage("/api/v1/conversations", { limit: "20" }));
    } catch (e) {
      if (e.status !== 401) fail(list);
    }
  }

  // The account's name, bio and the two switches stabbypossum takes from update_credentials.
  async function editProfilePage() {
    const form = el("form", "profile-form");
    container.replaceChildren(heading(t("more.edit_profile")), form);
    let cred;
    try {
      cred = await api.get("/api/v1/accounts/verify_credentials");
    } catch (e) {
      if (e.status !== 401) fail(form);
      return;
    }
    const field = (labelKey, control) => {
      const label = el("label", "menu-field");
      label.append(el("span", "", t(labelKey)), control);
      return label;
    };
    const name = doc.createElement("input");
    name.type = "text";
    name.value = cred.display_name ?? "";
    const bio = doc.createElement("textarea");
    bio.rows = 6;
    bio.value = cred.source?.note ?? "";
    const check = (labelKey, on) => {
      const box = doc.createElement("input");
      box.type = "checkbox";
      box.checked = Boolean(on);
      const label = el("label", "feed-nsfw");
      label.append(box, doc.createTextNode(` ${t(labelKey)}`));
      return { box, label };
    };
    const locked = check("more.profile_locked", cred.locked);
    const bot = check("more.profile_bot", cred.source?.bot ?? cred.bot);
    const save = el("button", "", t("more.save"));
    save.type = "submit";
    form.append(field("more.profile_name", name), field("more.profile_bio", bio), locked.label, bot.label, save);
    form.onsubmit = async (e) => {
      e.preventDefault();
      save.disabled = true;
      try {
        await api.patchJson("/api/v1/accounts/update_credentials", {
          display_name: name.value, note: bio.value, locked: locked.box.checked, bot: bot.box.checked,
        });
        toast(t("more.profile_saved"));
      } catch (err) {
        if (err.status !== 401) toast(err.detail || t("error.action_failed"));
      } finally {
        save.disabled = false;
      }
    };
  }

  // Other handles that lead to this account. The server gives the list only as the answer to an
  // add or a remove, never on its own, so it is shown from the first change on.
  function aliasesPage() {
    const list = el("ul", "rows");
    const note = el("p", "empty", t("more.aliases_hint"));
    const show = (aliases) => {
      list.replaceChildren();
      if (!Array.isArray(aliases)) return;
      if (!aliases.length) list.append(el("li", "empty", t("more.no_aliases")));
      for (const alias of aliases) {
        const li = el("li", "row");
        li.append(el("code", "", `@${alias}`));
        li.append(btn("remove", t("more.remove"), () => attempt(async () => {
          show(await api.postJson("/api/v1/stabbypossum/webfinger-aliases/delete", { alias }));
        })));
        list.append(li);
      }
    };
    const form = withForm(t("more.alias_placeholder"), t("more.add"), async (alias) => {
      try {
        show(await api.postJson("/api/v1/stabbypossum/webfinger-aliases/create", { alias: alias.replace(/^@/, "") }));
        toast(t("more.alias_added"));
      } catch (e) {
        if (e.status === 422) toast(e.detail || t("more.alias_refused"));
        else throw e;
      }
    });
    container.replaceChildren(heading(t("more.aliases")), note, form, list);
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
      case "profile": return onProfile({ id: me.id });
      case "tag": return feedPage(`#${arg}`, `/api/v1/timelines/tag/${enc(arg)}`);
      case "pinned": return pinnedPage();
      case "following": return peoplePage("following");
      case "followers": return peoplePage("followers");
      case "mutes": return peoplePage("mutes");
      case "blocks": return peoplePage("blocks");
      case "messages": return messagesPage();
      case "edit_profile": return editProfilePage();
      case "aliases": return aliasesPage();
      case "follow_requests": return requestsPage();
      case "feeds": return feedsPage();
      case "about": return aboutPage();
      case "followed_tags": return tagsPage();
      case "lists": return listsPage();
      case "list": return listPage(arg);
      case "search": return searchPage();
      default: return undefined;
    }
  }
  return { open };
}
