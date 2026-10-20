import { createTimelineView } from "./timeline.js";
import { createInlineForm } from "./inline-form.js";
import { sanitizeHtml, safeUrl } from "./sanitize.js";
import { emojifyText, emojifyNode } from "./emoji-text.js";
import { elFor } from "./dom.js";
import { personItem } from "./person.js";

// A user's profile: banner, bio, fields, counts, their posts, the people they follow
// and who follows them, and (for someone else) follow / block / mute / direct message.
export function createProfile({ doc, container, api, t, renderCard, me, toast, onProfile, onZoom, createCache }) {
  const enc = encodeURIComponent;
  const el = elFor(doc);
  const failed = () => toast(t("error.action_failed"));
  // An image that opens full size when tapped, if a zoom handler was given.
  const zoomable = (img, url, alt, cls) => {
    if (!onZoom) return img;
    const b = el("button", `zoom ${cls}`);
    b.type = "button";
    b.setAttribute("aria-label", t("status.zoom"));
    b.onclick = () => onZoom(url, alt);
    b.append(img);
    return b;
  };

  const personRow = (account) => personItem({ doc, account, onOpen: onProfile });

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
      page.append(zoomable(img, headerUrl, "", "profile-header-zoom"));
    }
    const head = el("div", "profile-head");
    const avatarUrl = safeUrl(account.avatar);
    if (avatarUrl) {
      const img = el("img", "profile-avatar");
      img.src = avatarUrl;
      img.alt = "";
      head.append(zoomable(img, avatarUrl, account.display_name || account.username || account.acct || "", "profile-avatar-zoom"));
    }
    const who = el("div", "profile-who");
    const heading = el("h2", "profile-name");
    heading.append(emojifyText(account.display_name || account.username || account.acct || "", account.emojis, doc));
    who.append(heading);
    who.append(el("div", "profile-acct", `@${account.acct}`));
    head.append(who);
    page.append(head);

    if (account.note) {
      const note = el("div", "profile-note");
      note.append(sanitizeHtml(account.note, doc));
      emojifyNode(note, account.emojis, doc);
      page.append(note);
    }
    if (Array.isArray(account.fields) && account.fields.length) {
      const dl = el("dl", "profile-fields");
      for (const f of account.fields) {
        const dt = el("dt");
        dt.append(emojifyText(f.name || "", account.emojis, doc));
        dl.append(dt);
        const dd = el("dd");
        dd.append(sanitizeHtml(f.value || "", doc));
        emojifyNode(dd, account.emojis, doc);
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
          api.get("/api/v1/stabbypossum/limited", { actor: account.url }),
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
        const res = await api.postJson("/api/v1/stabbypossum/limit", { actor: account.url, limited: !limited });
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
      // Which of the user's lists this person is in, with a box for each.
      const listsBtn = el("button", "lists", t("profile.lists"));
      listsBtn.type = "button";
      let panel = null;
      listsBtn.onclick = async () => {
        if (panel) {
          panel.remove();
          panel = null;
          return;
        }
        panel = el("div", "list-choices");
        panel.append(el("p", "empty", "…"));
        actions.after(panel);
        const mine = panel;
        try {
          const [lists, memberships] = await Promise.all([
            api.get("/api/v1/lists"),
            api.get(`/api/v1/accounts/${enc(account.id)}/lists`),
          ]);
          const inLists = new Set((memberships || []).map((l) => l.id));
          mine.replaceChildren();
          if (!lists.length) mine.append(el("p", "empty", t("profile.no_lists")));
          for (const list of lists) {
            const label = el("label", "list-choice");
            const box = doc.createElement("input");
            box.type = "checkbox";
            box.checked = inLists.has(list.id);
            box.onchange = async () => {
              box.disabled = true;
              try {
                const path = `/api/v1/lists/${enc(list.id)}/accounts`;
                if (box.checked) await api.postJson(path, { account_ids: [account.id] });
                else await api.del(path, { account_ids: [account.id] });
              } catch (e) {
                box.checked = !box.checked;
                if (e.status !== 401) failed();
              } finally {
                box.disabled = false;
              }
            };
            label.append(box, doc.createTextNode(` ${list.title}`));
            mine.append(label);
          }
        } catch (e) {
          if (e.status !== 401) mine.replaceChildren(el("p", "error", t("error.offline")));
        }
      };
      const paint = () => {
        follow.textContent = t(relationship.following ? "profile.unfollow" : relationship.requested ? "profile.requested" : "profile.follow");
        block.textContent = t(relationship.blocking ? "profile.unblock" : "profile.block");
        mute.textContent = t(limited ? "profile.unmute" : "profile.mute");
      };
      paint();
      actions.append(follow, block, mute, direct, listsBtn);
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
        onError: (e) => { if (e.status !== 401) failed(); },
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
