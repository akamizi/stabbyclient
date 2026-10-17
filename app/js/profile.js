import { createTimelineView } from "./timeline.js";
import { createInlineForm } from "./inline-form.js";
import { sanitizeHtml, safeUrl } from "./sanitize.js";

// A user's profile: banner, bio, fields, counts, their posts, the people they follow
// and who follows them, and (for someone else) follow / block / mute / direct message.
export function createProfile({ doc, container, api, t, renderCard, me, toast, onProfile, createCache }) {
  const enc = encodeURIComponent;
  const el = (tag, cls, text) => {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const failed = () => toast(t("error.action_failed"));

  function personRow(account) {
    const li = el("li", "person");
    const url = safeUrl(account.avatar);
    if (url) {
      const img = el("img", "avatar");
      img.src = url;
      img.alt = "";
      img.loading = "lazy";
      li.append(img);
    }
    const open = el("button", "open", account.display_name || account.username || account.acct);
    open.type = "button";
    open.onclick = () => onProfile(account);
    li.append(open, el("span", "acct", ` @${account.acct}`));
    return li;
  }

  async function open(id) {
    container.replaceChildren(el("p", "empty", "…"));
    let account;
    try {
      account = await api.get(`/api/v1/accounts/${enc(id)}`);
    } catch (e) {
      if (e.status !== 401) container.replaceChildren(el("p", "error", t("error.offline")));
      return;
    }
    const own = account.id === me.id;
    const page = el("div", "profile");

    const headerUrl = safeUrl(account.header);
    if (headerUrl) {
      const img = el("img", "profile-header");
      img.src = headerUrl;
      img.alt = "";
      page.append(img);
    }
    const head = el("div", "profile-head");
    const avatarUrl = safeUrl(account.avatar);
    if (avatarUrl) {
      const img = el("img", "profile-avatar");
      img.src = avatarUrl;
      img.alt = "";
      head.append(img);
    }
    const who = el("div", "profile-who");
    who.append(el("h2", "profile-name", account.display_name || account.username || account.acct));
    who.append(el("div", "profile-acct", `@${account.acct}`));
    head.append(who);
    page.append(head);

    if (account.note) {
      const note = el("div", "profile-note");
      note.append(sanitizeHtml(account.note, doc));
      page.append(note);
    }
    if (Array.isArray(account.fields) && account.fields.length) {
      const dl = el("dl", "profile-fields");
      for (const f of account.fields) {
        dl.append(el("dt", "", f.name || ""));
        const dd = el("dd");
        dd.append(sanitizeHtml(f.value || "", doc));
        dl.append(dd);
      }
      page.append(dl);
    }

    if (!own) {
      let relationship = { following: false, blocking: false, requested: false };
      let limited = false;
      try {
        const [rels, lim] = await Promise.all([
          api.get("/api/v1/accounts/relationships", { "id[]": account.id }),
          api.get("/api/v1/xenomorph/limited", { actor: account.url }),
        ]);
        relationship = rels[0] || relationship;
        limited = Boolean(lim?.limited);
      } catch (e) {
        if (e.status === 401) return;
      }
      const actions = el("div", "profile-actions");
      const mk = (cls, run) => {
        const b = el("button", cls);
        b.type = "button";
        b.onclick = async () => {
          b.disabled = true;
          try {
            await run();
          } catch (e) {
            if (e.status !== 401) failed();
          } finally {
            b.disabled = false;
          }
          paint();
        };
        return b;
      };
      const follow = mk("follow", async () => {
        const op = relationship.following || relationship.requested ? "unfollow" : "follow";
        relationship = { ...relationship, ...(await api.postJson(`/api/v1/accounts/${enc(account.id)}/${op}`, {})) };
      });
      const block = mk("block", async () => {
        const op = relationship.blocking ? "unblock" : "block";
        relationship = { ...relationship, ...(await api.postJson(`/api/v1/accounts/${enc(account.id)}/${op}`, {})) };
      });
      const mute = mk("mute", async () => {
        const res = await api.postJson("/api/v1/xenomorph/limit", { actor: account.url, limited: !limited });
        limited = Boolean(res.limited);
      });
      const direct = el("button", "direct", t("profile.direct"));
      direct.type = "button";
      direct.onclick = () => {
        page.querySelector(".direct-form")?.remove();
        const form = createInlineForm({
          doc, t, className: "direct-form", initial: `@${account.acct} `, multiline: true, submitLabel: t("profile.send"),
          onSubmit: async (text, f) => {
            await api.post("/api/v1/statuses", new URLSearchParams({ status: text, visibility: "direct" }));
            f.remove();
            toast(t("profile.direct_sent"));
          },
        });
        actions.after(form);
        form.querySelector("textarea")?.focus();
      };
      const paint = () => {
        follow.textContent = t(relationship.following ? "profile.unfollow" : relationship.requested ? "profile.requested" : "profile.follow");
        block.textContent = t(relationship.blocking ? "profile.unblock" : "profile.block");
        mute.textContent = t(limited ? "profile.unmute" : "profile.mute");
      };
      paint();
      actions.append(follow, block, mute, direct);
      page.append(actions);
    }

    const tabs = el("div", "profile-tabs");
    const body = el("div", "profile-body");
    const tab = (cls, key, count, show) => {
      const b = el("button", cls, t(key, { count }));
      b.type = "button";
      b.onclick = async () => {
        tabs.querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b));
        await show();
      };
      tabs.append(b);
      return b;
    };
    const showPosts = async () => {
      const feed = el("div", "feed");
      body.replaceChildren(feed);
      const view = createTimelineView({
        doc, container: feed, api, cache: createCache(), t, renderCard,
        path: `/api/v1/accounts/${enc(account.id)}/statuses`,
      });
      try {
        await view.load();
        if (!feed.querySelector("article")) feed.prepend(el("p", "empty", t("timeline.empty")));
      } catch (e) {
        if (e.status !== 401) feed.replaceChildren(el("p", "error", t("error.offline")));
      }
    };
    const showPeople = (kind) => async () => {
      const list = el("ul", "people");
      body.replaceChildren(list);
      try {
        const people = await api.get(`/api/v1/accounts/${enc(account.id)}/${kind}`, { limit: "80" });
        if (!people.length) list.append(el("li", "empty", t("profile.nobody")));
        for (const p of people) list.append(personRow(p));
      } catch (e) {
        if (e.status !== 401) list.replaceChildren(el("li", "error", t("profile.list_unavailable")));
      }
    };
    const postsTab = tab("posts active", "profile.posts", account.statuses_count || 0, showPosts);
    tab("following", "profile.following", account.following_count || 0, showPeople("following"));
    tab("followers", "profile.followers", account.followers_count || 0, showPeople("followers"));
    page.append(tabs, body);
    container.replaceChildren(page);
    postsTab.classList.add("active");
    await showPosts();
  }

  return { open };
}
