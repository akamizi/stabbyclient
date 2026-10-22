import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { createProfile } from "../app/js/profile.js";

const t = (k, p = {}) => k + (p.count !== undefined ? `:${p.count}` : "") + (p.acct ? `:${p.acct}` : "");
const tick = () => new Promise((r) => setTimeout(r, 0));
const acct = (id, over = {}) => ({
  id, acct: `${id}@h`, username: id, display_name: id.toUpperCase(), url: `https://h/@${id}`, avatar: "https://h/a.png",
  header: "https://h/h.png", note: "<p>hello <script>x</script>there</p>", fields: [{ name: "Site", value: "<a href='https://e.example'>e</a>" }],
  statuses_count: 12, following_count: 3, followers_count: 4, ...over,
});

function setup({ account = acct("bob"), relationship = {}, handlers = {}, me = { id: "me" } } = {}) {
  const { document } = parseHTML("<html><body><div id='c'></div></body></html>");
  const container = document.getElementById("c");
  const calls = [];
  const opened = [];
  const posted = [];
  const zoomed = [];
  const answer = (key, dflt) => handlers[key] ? handlers[key]() : dflt;
  const api = {
    get: async (path, params) => {
      calls.push(["get", path, params]);
      if (path === "/api/v1/accounts/relationships") return [{ following: false, blocking: false, ...relationship }];
      if (path === "/api/v1/lists") return answer("lists", []);
      if (path.endsWith("/lists")) return answer("accountLists", []);
      if (path.endsWith("/followers")) return answer("followers", [acct("f1")]);
      if (path.endsWith("/following")) return answer("following", [acct("g1")]);
      if (path.startsWith("/api/v1/accounts/")) return answer("account", account);
      return [];
    },
    getPage: async (path, params) => { calls.push(["getPage", path, params]); return { items: answer("posts", [{ id: "p1" }, { id: "p2" }]), next: null }; },
    postJson: async (path, obj) => { calls.push(["postJson", path, obj]); return answer(path, { following: true, blocking: true, muting: true }); },
    post: async (path, body) => { posted.push([path, Object.fromEntries(body)]); return { id: "dm" }; },
    del: async (path, obj) => { calls.push(["del", path, obj]); return answer(`del ${path}`, {}); },
  };
  const renderCard = (st) => { const a = document.createElement("article"); a.dataset.id = st.id; return a; };
  const profile = createProfile({
    doc: document, container, api, t, renderCard, me, toast() {}, onProfile: (a) => opened.push(a.id), onZoom: (u, alt) => zoomed.push([u, alt]),
    createCache: () => ({ read: () => null, write() {} }),
  });
  return { document, container, calls, opened, posted, zoomed, profile };
}
const ids = (c) => [...c.querySelectorAll("article")].map((a) => a.dataset.id);

test("a profile shows name, handle, a sanitized bio, the fields and the counts", async () => {
  const { container, profile } = setup();
  await profile.open("bob");
  assert.match(container.querySelector(".profile-name").textContent, /BOB/);
  assert.match(container.querySelector(".profile-acct").textContent, /bob@h/);
  assert.match(container.querySelector(".profile-note").textContent, /hello/);
  assert.equal(container.querySelector(".profile-note script"), null);
  assert.match(container.querySelector(".profile-fields").textContent, /Site/);
  assert.equal(container.querySelector(".profile-fields a").getAttribute("href"), "https://e.example");
  assert.equal(container.querySelector("img.profile-header").getAttribute("src"), "https://h/h.png");
  assert.equal(container.querySelector("img.profile-avatar").getAttribute("src"), "https://h/a.png");
  const tabs = [...container.querySelectorAll(".profile-tabs button")].map((b) => b.textContent);
  assert.deepEqual(tabs, ["profile.posts:12", "profile.following:3", "profile.followers:4"]);
});
test("an unsafe avatar or header address is not used", async () => {
  const { container, profile } = setup({ account: acct("bob", { avatar: "javascript:1", header: "data:text/html,x" }) });
  await profile.open("bob");
  assert.equal(container.querySelector("img.profile-avatar"), null);
  assert.equal(container.querySelector("img.profile-header"), null);
});
test("the posts of the account are listed, newest first, from its own route", async () => {
  const { container, calls, profile } = setup();
  await profile.open("bob");
  assert.deepEqual(ids(container), ["p1", "p2"]);
  assert.ok(calls.some((c) => c[0] === "getPage" && c[1] === "/api/v1/accounts/bob/statuses"));
});
test("an account with no posts says so", async () => {
  const { container, profile } = setup({ handlers: { posts: () => [] } });
  await profile.open("bob");
  assert.match(container.textContent, /timeline\.empty/);
});

test("your own profile has no follow, block, mute or message buttons", async () => {
  const { container, profile } = setup({ account: acct("me"), me: { id: "me" } });
  await profile.open("me");
  assert.equal(container.querySelector(".profile-actions"), null);
});
test("another profile can be followed and unfollowed; a pending request is shown", async () => {
  const { container, calls, profile } = setup({ handlers: { "/api/v1/accounts/bob/follow": () => ({ following: true }), "/api/v1/accounts/bob/unfollow": () => ({ following: false }) } });
  await profile.open("bob");
  const btn = container.querySelector("button.follow");
  assert.equal(btn.textContent, "profile.follow");
  await btn.onclick();
  assert.ok(calls.some((c) => c[0] === "postJson" && c[1] === "/api/v1/accounts/bob/follow"));
  assert.equal(container.querySelector("button.follow").textContent, "profile.unfollow");
  await container.querySelector("button.follow").onclick();
  assert.equal(container.querySelector("button.follow").textContent, "profile.follow");
  const pend = setup({ relationship: { requested: true } });
  await pend.profile.open("bob");
  assert.equal(pend.container.querySelector("button.follow").textContent, "profile.requested");
});
test("block and mute toggle with their own calls", async () => {
  const { container, calls, profile } = setup({ handlers: { "/api/v1/accounts/bob/block": () => ({ blocking: true }), "/api/v1/accounts/bob/mute": () => ({ muting: true }) } });
  await profile.open("bob");
  assert.equal(container.querySelector("button.block").textContent, "profile.block");
  await container.querySelector("button.block").onclick();
  assert.equal(container.querySelector("button.block").textContent, "profile.unblock");
  assert.equal(container.querySelector("button.mute").textContent, "profile.mute");
  await container.querySelector("button.mute").onclick();
  assert.ok(calls.some((c) => c[1] === "/api/v1/accounts/bob/mute"));
  assert.equal(container.querySelector("button.mute").textContent, "profile.unmute");
});
test("a failed follow keeps the button as it was", async () => {
  const { container, profile } = setup({ handlers: { "/api/v1/accounts/bob/follow": () => { throw new Error("x"); } } });
  await profile.open("bob");
  await container.querySelector("button.follow").onclick();
  assert.equal(container.querySelector("button.follow").textContent, "profile.follow");
  assert.equal(container.querySelector("button.follow").disabled, false);
});

test("the Following and Followers tabs list people; tapping one opens that profile", async () => {
  const { container, opened, profile } = setup();
  await profile.open("bob");
  const [, following, followers] = container.querySelectorAll(".profile-tabs button");
  await following.onclick();
  assert.equal(container.querySelectorAll("li.person").length, 1);
  container.querySelector("li.person button.open").onclick();
  assert.deepEqual(opened, ["g1"]);
  await followers.onclick();
  assert.match(container.querySelector("li.person").textContent, /F1/);
  assert.equal(ids(container).length, 0);
  await container.querySelector(".profile-tabs button").onclick();
  assert.deepEqual(ids(container), ["p1", "p2"]);
});

test("a direct message starts with the handle and is sent as a direct post", async () => {
  const { container, posted, profile } = setup();
  await profile.open("bob");
  container.querySelector("button.direct").onclick();
  const form = container.querySelector("form.direct-form");
  assert.equal(form.querySelector("textarea").value, "@bob@h ");
  form.querySelector("textarea").value = "@bob@h hi";
  await form.onsubmit({ preventDefault() {} });
  assert.deepEqual(posted[0][1], { status: "@bob@h hi", visibility: "direct" });
});

test("a failing load shows an error line instead of throwing", async () => {
  const { container, profile } = setup({ handlers: { account: () => { throw new Error("boom"); } } });
  await profile.open("bob");
  assert.match(container.textContent, /error\.offline/);
});

test("when the server will not give a list, the tab says it is not available (not that you are offline)", async () => {
  const { container, profile } = setup({ handlers: { following: () => { throw new Error("403"); } } });
  await profile.open("bob");
  await container.querySelector(".profile-tabs button.following").onclick();
  assert.match(container.textContent, /profile\.list_unavailable/);
  assert.doesNotMatch(container.textContent, /error\.offline/);
});

test("the avatar and the banner can be enlarged", async () => {
  const { container, zoomed, profile } = setup();
  await profile.open("bob");
  container.querySelector("button.zoom.profile-avatar-zoom").onclick();
  container.querySelector("button.zoom.profile-header-zoom").onclick();
  assert.deepEqual(zoomed, [["https://h/a.png", "BOB"], ["https://h/h.png", ""]]);
});

test("custom emoji show in the profile's name, bio and fields", async () => {
  const blob = { shortcode: "blob", url: "https://h/blob.png" };
  const { container, profile } = setup({ account: acct("bob", { display_name: "Bob :blob:", note: "<p>bio :blob:</p>", fields: [{ name: "Mood :blob:", value: "<p>fine :blob:</p>" }], emojis: [blob] }) });
  await profile.open("bob");
  assert.equal(container.querySelectorAll(".profile-name img.emoji").length, 1);
  assert.equal(container.querySelectorAll(".profile-note img.emoji").length, 1);
  assert.equal(container.querySelectorAll(".profile-fields img.emoji").length, 2);
});

test("custom emoji show in the names of people in the Following list", async () => {
  const blob = { shortcode: "blob", url: "https://h/blob.png" };
  const { container, profile } = setup({ handlers: { following: () => [acct("g1", { display_name: "Gee :blob:", emojis: [blob] })] } });
  await profile.open("bob");
  await container.querySelector(".profile-tabs button.following").onclick();
  assert.equal(container.querySelectorAll("li.person button.open img.emoji").length, 1);
});

const twoLists = [{ id: "L1", title: "friends" }, { id: "L2", title: "work" }];
test("another profile has a Lists button that shows which lists the person is in", async () => {
  const { container, calls, profile } = setup({ handlers: { lists: () => twoLists, accountLists: () => [{ id: "L2", title: "work" }] } });
  await profile.open("bob");
  assert.equal(container.querySelector(".list-choices"), null);
  await container.querySelector("button.lists").onclick();
  const boxes = [...container.querySelectorAll(".list-choices input[type=checkbox]")];
  assert.deepEqual(boxes.map((b) => b.checked), [false, true]);
  assert.match(container.querySelector(".list-choices").textContent, /friends/);
  assert.ok(calls.some((c) => c[1] === "/api/v1/accounts/bob/lists"));
});
test("ticking a list adds the person to it, unticking takes them out", async () => {
  const { container, calls, profile } = setup({ handlers: { lists: () => twoLists, accountLists: () => [{ id: "L2" }] } });
  await profile.open("bob");
  await container.querySelector("button.lists").onclick();
  const [friends, work] = container.querySelectorAll(".list-choices input[type=checkbox]");
  friends.checked = true;
  await friends.onchange();
  assert.deepEqual(calls.find((c) => c[0] === "postJson" && c[1] === "/api/v1/lists/L1/accounts")[2], { account_ids: ["bob"] });
  work.checked = false;
  await work.onchange();
  assert.deepEqual(calls.find((c) => c[0] === "del" && c[1] === "/api/v1/lists/L2/accounts")[2], { account_ids: ["bob"] });
  assert.equal(friends.disabled, false);
});
test("when the server refuses, the box goes back as it was and the user is told", async () => {
  const { container, profile } = setup({ handlers: { lists: () => twoLists, accountLists: () => [], "/api/v1/lists/L1/accounts": () => { throw new Error("no"); } } });
  await profile.open("bob");
  await container.querySelector("button.lists").onclick();
  const friends = container.querySelector(".list-choices input[type=checkbox]");
  friends.checked = true;
  await friends.onchange();
  assert.equal(friends.checked, false);
  assert.equal(friends.disabled, false);
});
test("with no lists the panel says so; your own profile has no Lists button", async () => {
  const a = setup();
  await a.profile.open("bob");
  await a.container.querySelector("button.lists").onclick();
  assert.match(a.container.querySelector(".list-choices").textContent, /profile\.no_lists/);
  const own = setup({ account: acct("me") });
  await own.profile.open("me");
  assert.equal(own.container.querySelector("button.lists"), null);
});
