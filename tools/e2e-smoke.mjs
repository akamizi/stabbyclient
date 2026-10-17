// Dev-only end-to-end smoke test in headless Chromium through the dev proxy.
// Usage: XENO_TEST_PW=... node tools/e2e-smoke.mjs <user> [shots-dir]
// Requires: node tools/dev-proxy.mjs https://<instance> 8099 running, `chromium` on PATH.
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const user = process.argv[2];
const shots = process.argv[3] || ".";
const pw = process.env.XENO_TEST_PW;
const BASE = process.env.XENO_BASE || "http://localhost:8099";
const PORT = 9333;
mkdirSync(shots, { recursive: true });

const chrome = spawn("chromium", [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "xc-"))}`,
  "--no-sandbox", "--window-size=420,900", "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function targetWs() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://localhost:${PORT}/json`)).json();
      const p = list.find((x) => x.type === "page");
      if (p) return p.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error("chromium did not start");
}

const ws = new WebSocket(await targetWs());
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
};
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails));
  return r.result.result.value;
};
async function waitFor(expr, label, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { if (await ev(expr)) return; } catch { /* page navigating */ } await sleep(250); }
  throw new Error(`timeout waiting for: ${label}`);
}
async function shot(name) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(shots, `${name}.png`), Buffer.from(r.result.data, "base64"));
}
let failures = 0;
function check(name, ok) { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) failures++; }

try {
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 420, height: 900, deviceScaleFactor: 2, mobile: true });
  await send("Page.navigate", { url: `${BASE}/app/` });
  await waitFor(`!!document.querySelector("#app button")`, "login button");
  check("login button shown when logged out", true);
  await ev(`document.querySelector("#app button").click()`);
  await waitFor(`location.pathname === "/oauth/authorize" && !!document.querySelector("input[name=login]")`, "authorize page");
  check("redirected to the instance login page", true);
  await ev(`(() => { document.querySelector("input[name=login]").value = ${JSON.stringify(user)}; document.querySelector("input[name=passwd]").value = ${JSON.stringify(pw)}; document.querySelector("form").submit(); })()`);
  await waitFor(`location.pathname === "/app/" && !!document.querySelector(".status")`, "timeline after login", 30000);
  check("back on /app/ with the timeline rendered", true);
  check("code/state removed from the URL", (await ev(`location.search`)) === "");
  await shot("1-timeline-light");

  await ev(`document.querySelectorAll(".controls .menu-toggle")[1].click()`);
  const diagText = await ev(`document.querySelector(".menu-diag").textContent`);
  check("the menu shows the version and the last check of Home", /(Version|Versione) /.test(diagText) && /home: .*(checked|controllata)/.test(diagText));
  await ev(`document.dispatchEvent(new Event("click"))`);

  // leftovers of earlier (aborted) runs would pile into this one: remove the test user's e2e posts first
  const removed = await ev(`(async () => {
    const tok = JSON.parse(localStorage.getItem("xenoclient.session")).token;
    const h = { Authorization: "Bearer " + tok };
    let total = 0;
    for (let round = 0; round < 6; round++) {
      const me = await (await fetch("/api/v1/accounts/verify_credentials", { headers: h })).json();
      const home = await (await fetch("/api/v1/timelines/home?limit=10", { headers: h })).json();
      const mine = home.filter((x) => !x.reblog && x.account.id === me.id && /e2e/.test(x.content));
      if (!mine.length) break;
      for (const x of mine) { await fetch("/api/v1/statuses/" + x.id, { method: "DELETE", headers: h }); total++; }
      await new Promise((r) => setTimeout(r, 2500));
    }
    return total;
  })()`);
  console.log("cleaned up leftovers:", removed);
  await send("Page.reload");
  await waitFor(`!!document.querySelector("#app .status") || !!document.querySelector("#app p")`, "page after cleanup");

  const cards = await ev(`document.querySelectorAll("#app .status").length`);
  check(`timeline shows posts (${cards})`, cards >= 1);

  // the thread steps need a post with a reply: make one, and reload until the timeline shows it
  const tokOf = `JSON.parse(localStorage.getItem("xenoclient.session")).token`;
  const mkPost = (body) => ev(`(async () => { const r = await fetch("/api/v1/statuses", { method: "POST", headers: { Authorization: "Bearer " + ${tokOf} }, body: new URLSearchParams(${JSON.stringify(body)}) }); return (await r.json()).id; })()`);
  const rootId = await mkPost({ status: `e2e root ${Date.now()}`, visibility: "public" });
  const replyPostId = await mkPost({ status: `e2e reply ${Date.now()}`, visibility: "public", in_reply_to_id: rootId });
  const imgPostId = await ev(`(async () => {
    const tok = ${tokOf};
    const c = document.createElement("canvas"); c.width = 64; c.height = 64; c.getContext("2d").fillRect(0, 0, 64, 64);
    const blob = await new Promise((r) => c.toBlob(r, "image/png"));
    const fd = new FormData(); fd.append("file", blob, "e2e.png"); fd.append("description", "e2e picture");
    const m = await (await fetch("/api/v1/media", { method: "POST", headers: { Authorization: "Bearer " + tok }, body: fd })).json();
    const r = await fetch("/api/v1/statuses", { method: "POST", headers: { Authorization: "Bearer " + tok }, body: new URLSearchParams({ status: "e2e picture post", visibility: "public", "media_ids[]": m.id }) });
    return (await r.json()).id;
  })()`);
  for (let i = 0; i < 8; i++) {
    await send("Page.reload");
    await waitFor(`!!document.querySelector("#app .status")`, "timeline after reload");
    await sleep(1500);
    await ev(`(() => { const b = document.getElementById("new-posts"); if (!b.hidden) b.click(); })()`);
    if (await ev(`!!document.querySelector("#app button.replies-toggle") && !!document.querySelector("#app button.ancestors-toggle")`)) break;
    await sleep(3000);
  }

  // the picture opens full size, and Back / Escape / a tap close it
  const zoomIdx = await ev(`[...document.querySelectorAll("#app .status")].findIndex((c) => c.querySelector("button.zoom img.attachment"))`);
  check("a post with a picture is on the timeline", zoomIdx >= 0);
  if (zoomIdx >= 0) {
    const open = () => ev(`document.querySelectorAll("#app .status")[${zoomIdx}].querySelector("button.zoom").click()`);
    await open();
    await waitFor(`!!document.querySelector(".lightbox img")`, "lightbox");
    check("tapping a picture enlarges it", (await ev(`document.querySelector(".lightbox img").alt`)) === "e2e picture");
    await shot("lightbox");
    await ev(`history.back()`);
    await waitFor(`!document.querySelector(".lightbox")`, "lightbox closed by Back");
    check("Back closes the enlarged picture and stays in the app", (await ev(`location.pathname`)) === "/app/" && (await ev(`!!document.querySelector(".tabs")`)));
    await open();
    await waitFor(`!!document.querySelector(".lightbox img")`, "lightbox again");
    await ev(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))`);
    await waitFor(`!document.querySelector(".lightbox")`, "lightbox closed by Escape");
    check("Escape closes the enlarged picture", true);
    await open();
    await waitFor(`!!document.querySelector(".lightbox img")`, "lightbox third time");
    await ev(`document.querySelector(".lightbox").click()`);
    await waitFor(`!document.querySelector(".lightbox")`, "lightbox closed by tap");
    check("a tap closes the enlarged picture", true);
  }

  // dislike on the first card
  const firstId = await ev(`document.querySelector("#app .status").dataset.statusId`);
  await ev(`document.querySelector('#app [data-status-id="${firstId}"] button.dislike').click()`);
  await waitFor(`document.querySelector('#app [data-status-id="${firstId}"] button.dislike')?.classList.contains("active")`, "dislike active");
  check("dislike turns the button active", true);
  await ev(`document.querySelector('#app [data-status-id="${firstId}"] button.dislike').click()`);
  await waitFor(`!document.querySelector('#app [data-status-id="${firstId}"] button.dislike').classList.contains("active")`, "dislike removed");
  check("a second tap removes the dislike", true);

  // thread in place
  const withReplies = await ev(`(() => { const b = document.querySelector("#app button.replies-toggle"); if (!b) return null; const c = b.closest(".status"); b.click(); return c.dataset.statusId; })()`);
  if (withReplies) {
    // the server updates reply counts and contexts with a delay: a miss here is reported, not fatal
    let opened = true;
    try { await waitFor(`document.querySelector('#app [data-status-id="${withReplies}"] .thread .status')`, "replies in place"); } catch { opened = false; }
    check("replies open under the post, in place", opened);
    await shot("2-thread-open");
  } else check("a post with replies exists to test the thread", false);

  // previous posts above a reply, and the date link
  const replyId = await ev(`(() => { const b = document.querySelector("#app > div button.ancestors-toggle, #app button.ancestors-toggle"); if (!b) return null; const c = b.closest(".status"); b.click(); return c.dataset.statusId; })()`);
  if (replyId) {
    let above = true;
    try { await waitFor(`document.querySelector('#app [data-status-id="${replyId}"] > .ancestors .status')`, "ancestors above the reply"); } catch { above = false; }
    check("previous posts open above a reply, in place", above);
    await shot("2b-ancestors");
  } else check("a reply exists to test the previous-posts button", false);
  check("the date is a link to the permalink", (await ev(`!!document.querySelector("#app a.permalink[href^='https://']")`)));

  // the active list is marked; the new-post composer is a pop-up
  check("the selected list is marked in the tab bar", (await ev(`document.querySelectorAll("nav.tabs button.active").length === 1 && document.querySelector("nav.tabs button.active").getAttribute("aria-current") === "page"`)));
  await ev(`document.querySelector(".fab").click()`);
  await waitFor(`!!document.querySelector(".modal .composer textarea")`, "composer pop-up");
  await shot("composer-popup");
  check("the new-post composer opens as a pop-up over the page", (await ev(`document.body.classList.contains("modal-open") && !!document.querySelector(".modal[role=dialog]")`)));
  await ev(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))`);
  await waitFor(`!document.querySelector(".modal")`, "pop-up closed by Escape");
  check("Escape closes the pop-up and the page scrolls again", (await ev(`!document.body.classList.contains("modal-open")`)));

  // composer
  const msg = `e2e ${Date.now()}`;
  await ev(`document.querySelector(".fab").click()`);
  await waitFor(`document.querySelector(".modal .composer textarea")`, "composer");
  await ev(`(() => { const t = document.querySelector(".modal .composer textarea"); t.value = ${JSON.stringify(msg)}; t.dispatchEvent(new Event("input")); document.querySelector(".modal .composer").requestSubmit(); })()`);
  await waitFor(`document.querySelector("#app .status")?.textContent.includes(${JSON.stringify(msg)})`, "new post on top");
  check("a new post appears on top of the timeline", true);

  // a boost made from another client shows up on a post already on screen. (Not a like:
  // xenomorph cannot delete a post its owner has liked, it answers 500, so a like would leave
  // an undeletable post behind on every run.)
  // a top-level card of the Home list (not one inside an opened thread)
  const topCards = `document.querySelectorAll("#app > div:nth-child(2) > div:nth-child(2) > article.status")`;
  // one of the posts made at the start of the run, which still exist (those from steps above are deleted)
  const boostedId = await ev(`[...${topCards}].find((c) => c.textContent.includes("e2e root"))?.dataset.statusId`);
  await ev(`(async () => { const tok = JSON.parse(localStorage.getItem("xenoclient.session")).token; await fetch("/api/v1/statuses/" + ${JSON.stringify(boostedId)} + "/reblog", { method: "POST", headers: { Authorization: "Bearer " + tok } }); })()`);
  for (let i = 0; i < 12 && !(await ev(`!![...${topCards}].find((c) => c.dataset.statusId === ${JSON.stringify(boostedId)})?.querySelector("button.boost.active")`)); i++) {
    await ev(`document.dispatchEvent(new Event("visibilitychange"))`);
    await sleep(2500);
  }
  check("a boost made elsewhere appears on the post, with its count", (await ev(`(() => { const b = [...${topCards}].find((c) => c.dataset.statusId === ${JSON.stringify(boostedId)}).querySelector("button.boost"); return b.classList.contains("active") && /[0-9]/.test(b.textContent); })()`)));
  await ev(`(async () => { const tok = JSON.parse(localStorage.getItem("xenoclient.session")).token; await fetch("/api/v1/statuses/" + ${JSON.stringify(boostedId)} + "/unreblog", { method: "POST", headers: { Authorization: "Bearer " + tok } }); })()`);

  // the post menu: react, edit, delete on the post just written
  await ev(`window.confirm = () => true`);
  const top = `document.querySelector("#app .status")`;
  await ev(`${top}.querySelector("button.boost").click()`);
  await waitFor(`${top}.querySelector("button.boost.active")`, "boost active");
  check("a boost turns the button active", true);
  await ev(`${top}.querySelector("button.boost.active").click()`);
  await waitFor(`!${top}.querySelector("button.boost.active") && !${top}.querySelector("button.boost").disabled`, "boost removed");
  check("a second tap removes the boost", true);
  await ev(`${top}.querySelector("button.more").click()`);
  check("the post menu opens", (await ev(`!${top}.querySelector(".post-menu").hidden`)));
  await shot("post-menu");
  await ev(`${top}.querySelector(".post-menu button.react").click()`);
  await waitFor(`${top}.querySelector(".react-form input")`, "reaction form");
  await ev(`(() => { const f = ${top}.querySelector(".react-form"); f.querySelector("input").value = "\u{1F389}"; f.requestSubmit(); })()`);
  await waitFor(`${top}.querySelector(".reactions button.reaction")`, "reaction shown");
  check("an emoji reaction appears on the post", true);
  await ev(`${top}.querySelector(".reactions button.reaction").click()`);
  await waitFor(`!${top}.querySelector(".reactions")`, "reaction removed");
  check("the reaction can be taken back", true);
  await ev(`${top}.querySelector("button.more").click()`);
  await ev(`${top}.querySelector(".post-menu button.edit").click()`);
  await waitFor(`${top}.querySelector(".edit-form textarea")`, "edit form");
  await ev(`(() => { const f = ${top}.querySelector(".edit-form"); f.querySelector("textarea").value = "e2e edited ${Date.now()}"; f.requestSubmit(); })()`);
  await waitFor(`${top}.textContent.includes("e2e edited")`, "edited text");
  check("a post can be edited", true);
  await ev(`${top}.querySelector("button.more").click()`);
  await ev(`${top}.querySelector(".post-menu button.delete").click()`);
  await waitFor(`!document.querySelector("#app .status")?.textContent.includes("e2e edited")`, "post deleted");
  check("a post can be deleted", true);

  // composer extras: format, language, pictures from a web address
  await ev(`document.querySelectorAll("nav.tabs button")[0].click()`);
  await ev(`document.querySelector(".fab").click()`);
  await waitFor(`document.querySelector(".modal .composer textarea")`, "composer for extras");
  check("the composer offers a text format, a language and video/audio files", (await ev(`(() => { const c = document.querySelector(".modal .composer"); return c.querySelectorAll("select.format option").length === 3 && !!c.querySelector("input.language") && /video/.test(c.querySelector("input[type=file]").accept); })()`)));
  await ev(`(() => { const c = document.querySelector(".modal .composer"); const t = c.querySelector("textarea"); t.value = "e2e remote picture ${Date.now()}"; t.dispatchEvent(new Event("input")); c.querySelector("input.language").value = "en"; c.querySelector("button.add-urls").click(); const u = c.querySelector(".url-fields .url-row"); u.querySelector("input.url").value = location.origin + "/app/icons/icon-192.png"; u.querySelector("input.alt").value = "e2e icon"; c.requestSubmit(); })()`);
  await waitFor(`document.querySelector("#app .status")?.textContent.includes("e2e remote picture")`, "remote picture post");
  const remoteId = await ev(`document.querySelector("#app .status").dataset.statusId`);
  const remoteMedia = await ev(`(async () => { const tok = JSON.parse(localStorage.getItem("xenoclient.session")).token; const r = await fetch("/api/v1/statuses/" + ${JSON.stringify(remoteId)}, { headers: { Authorization: "Bearer " + tok } }); const j = await r.json(); return JSON.stringify({ n: (j.media_attachments || []).length, lang: j.language }); })()`);
  console.log("remote picture post:", remoteMedia);
  check("a picture taken from a web address is attached to the post", JSON.parse(remoteMedia).n === 1);
  await ev(`(async () => { const tok = JSON.parse(localStorage.getItem("xenoclient.session")).token; await fetch("/api/v1/statuses/" + ${JSON.stringify(remoteId)}, { method: "DELETE", headers: { Authorization: "Bearer " + tok } }); })()`);
  // the emoji list under the reaction field
  await ev(`document.querySelectorAll("#app .status")[3].querySelector("button.more").click()`);
  await ev(`document.querySelectorAll("#app .status")[3].querySelector(".post-menu button.react").click()`);
  await waitFor(`document.querySelector("#app .react-form input")`, "reaction field");
  await ev(`(() => { const i = document.querySelector("#app .react-form input"); i.value = ":abc"; i.dispatchEvent(new Event("input")); })()`);
  await waitFor(`document.querySelector("#app .react-form .emoji-list") && !document.querySelector("#app .react-form .emoji-list").hidden`, "emoji list");
  check("typing a shortcode in the reaction field lists emoji (or says there is none)", true);
  await ev(`document.querySelector("#app .react-form button.cancel").click()`);

  // a post that appears elsewhere reaches the open app through the header button
  const tokExpr = `JSON.parse(localStorage.getItem("xenoclient.session")).token`;
  const outsideId = await ev(`(async () => { const r = await fetch("/api/v1/statuses", { method: "POST", headers: { Authorization: "Bearer " + ${tokExpr} }, body: new URLSearchParams({ status: "e2e outside ${Date.now()}", visibility: "public" }) }); return (await r.json()).id; })()`);
  // the server may take a moment to put the post on the home timeline: resume until it shows
  for (let i = 0; i < 12 && (await ev(`document.getElementById("new-posts").hidden`)); i++) {
    await ev(`document.dispatchEvent(new Event("visibilitychange"))`);
    await sleep(2500);
  }
  await waitFor(`!document.getElementById("new-posts").hidden`, "new-posts button after resume", 3000);
  check("a post made elsewhere shows up behind the header button", true);
  await ev(`document.getElementById("new-posts").click()`);
  await waitFor(`document.getElementById("new-posts").hidden && document.querySelector("#app .status")?.textContent.includes("e2e outside")`, "post revealed");
  check("tapping the header button shows it on top", true);
  await ev(`fetch("/api/v1/statuses/" + ${JSON.stringify(outsideId)}, { method: "DELETE", headers: { Authorization: "Bearer " + ${tokExpr} } })`);


  // a poll, then a quote of it; both deleted again through the API
  await ev(`document.querySelectorAll("nav.tabs button")[0].click()`);
  await ev(`document.querySelector(".fab").click()`);
  await waitFor(`document.querySelector(".modal .composer textarea")`, "composer for a poll");
  await ev(`(() => { const c = document.querySelector(".modal .composer"); const t = c.querySelector("textarea"); t.value = "e2e poll ${Date.now()}"; t.dispatchEvent(new Event("input")); c.querySelector("button.add-poll").click(); const o = c.querySelectorAll(".poll-fields input[type=text]"); o[0].value = "red"; o[1].value = "blue"; c.requestSubmit(); })()`);
  await waitFor(`document.querySelector("#app > div:nth-child(2) > div:nth-child(2) > article.status:first-child .poll")`, "poll on the timeline");
  check("a post with a poll shows its options", (await ev(`document.querySelectorAll("#app > div:nth-child(2) > div:nth-child(2) > article.status:first-child .poll .poll-option").length`)) === 2);
  const pollPostId = await ev(`document.querySelector("#app > div:nth-child(2) > div:nth-child(2) > article.status:first-child .poll").closest(".status").dataset.statusId`);
  await ev(`document.querySelector("#app > div:nth-child(2) > div:nth-child(2) > article.status:first-child .poll").closest(".status").querySelector("button.more").click()`);
  await ev(`document.querySelector("#app > div:nth-child(2) > div:nth-child(2) > article.status:first-child .poll").closest(".status").querySelector(".post-menu button.quote").click()`);
  await waitFor(`document.querySelector("#app .composer textarea")?.value.startsWith("> ")`, "quote composer with quoted lines");
  check("Quote opens a composer that starts with the quoted lines", true);
  await ev(`(() => { const c = document.querySelector("#app .composer"); const t = c.querySelector("textarea"); t.value += "e2e agreed"; c.requestSubmit(); })()`);
  await waitFor(`!document.querySelector("#app .composer")`, "quote sent");
  let quoteOk = false;
  let quoteId = null;
  for (let i = 0; i < 20 && !quoteOk; i++) {
    const r = await ev(`(async () => { const tok = JSON.parse(localStorage.getItem("xenoclient.session")).token; const me = JSON.parse(localStorage.getItem("xenoclient.me") || "{}"); const l = await (await fetch("/api/v1/timelines/home?limit=10", { headers: { Authorization: "Bearer " + tok } })).json(); const q = l.find((x) => x.quote && x.quote.quoted_status && x.quote.quoted_status.id === ${JSON.stringify(pollPostId)}); return q ? q.id : null; })()`);
    if (r) { quoteOk = true; quoteId = r; } else await sleep(2000);
  }
  check("the quote reached the server tied to the poll post", quoteOk);
  await ev(`(async () => { const tok = JSON.parse(localStorage.getItem("xenoclient.session")).token; for (const id of [${JSON.stringify(quoteId)}, ${JSON.stringify(pollPostId)}]) if (id) await fetch("/api/v1/statuses/" + id, { method: "DELETE", headers: { Authorization: "Bearer " + tok } }); })()`);

  // federated and groups tabs
  await ev(`document.querySelectorAll("nav.tabs button")[1].click()`);
  await waitFor(`document.querySelector("#app > div:nth-child(3) .status")`, "federated posts");
  check("the federated tab lists posts", true);
  await ev(`document.querySelectorAll(".toast").forEach((e) => e.remove())`);
  await ev(`document.querySelectorAll("nav.tabs button")[2].click()`);
  await new Promise((r) => setTimeout(r, 2500));
  check("the groups tab opens without an error", (await ev(`!document.querySelector("#app > div:nth-child(4)").hidden && !document.querySelector(".toast")`)));
  await ev(`document.querySelectorAll("nav.tabs button")[0].click()`);

  // More menu: every entry opens a page without an error
  const moreOpen = (i) => ev(`document.querySelectorAll(".more-entry")[${i}].click()`);
  const morePage = `document.querySelector("#app > div:nth-child(5)")`;
  const entries = await ev(`document.querySelectorAll(".more-entry").length`);
  check("the More menu has twelve entries", entries === 12);
  for (let i = 1; i < entries; i++) {
    await moreOpen(i);
    await sleep(1800);
    const ok = await ev(`(() => { const p = ${morePage}; return !p.hidden && !!p.querySelector("h2") && !p.querySelector(".error"); })()`);
    check(`More entry ${i} opens a page without an error`, ok);
  }
  // profiles: from a post's author, and the user's own from the More menu; Back returns
  await ev(`document.querySelectorAll("nav.tabs button")[0].click()`);
  await sleep(500);
  // another person's profile (the user's own has no follow buttons and would not catch a session problem)
  // the test user follows nobody, so another person comes from Search (the instance's own admin account)
  await moreOpen(1);
  await waitFor(`${morePage}.querySelector("form input")`, "search form");
  await ev(`(() => { const f = ${morePage}.querySelector("form"); f.querySelector("input").value = "oh_pyt@x.y05.eu"; f.requestSubmit(); })()`);
  await waitFor(`${morePage}.querySelector("li.person button.name")`, "search result");
  check("search finds another person", true);
  const someAuthor = await ev(`${morePage}.querySelector("li.person button.name").textContent`);
  await ev(`${morePage}.querySelector("li.person button.name").click()`);
  await waitFor(`!!document.querySelector("#app .profile .profile-name")`, "profile page");
  check("tapping a person opens their profile", (await ev(`document.querySelector("#app .profile .profile-name").textContent`)) === someAuthor);
  await waitFor(`!!document.querySelector("#app .profile .profile-actions button.follow")`, "profile actions");
  check("another person's profile has follow, block and mute buttons", (await ev(`!!document.querySelector("#app .profile-actions button.block") && !!document.querySelector("#app .profile-actions button.mute")`)));
  check("opening a profile does not end the session", (await ev(`!!document.querySelector(".tabs") && !document.body.textContent.includes("Sessione scaduta") && !document.body.textContent.includes("Session expired")`)));
  await ev(`document.querySelector("#app .profile-tabs button.following").click()`);
  await sleep(2500);
  check("the Following tab answers (a list or a notice) and the session stays", (await ev(`!!document.querySelector("#app .profile .profile-body li, #app .profile .profile-body .empty") && !!document.querySelector(".tabs")`)));
  await ev(`document.querySelector("#app button.back").click()`);
  check("Back returns to where the profile was opened from", (await ev(`!document.querySelector("#app > div:nth-child(5)").hidden`)));
  await moreOpen(0);
  await waitFor(`document.querySelector("#app .profile .profile-name")?.textContent === "test"`, "own profile");
  check("My profile opens the user's own profile without follow buttons", (await ev(`!document.querySelector("#app .profile .profile-actions")`)));
  await ev(`document.querySelectorAll("nav.tabs button")[0].click()`);

  // bookmark a post, find it under Bookmarks, then undo
  await ev(`document.querySelectorAll("nav.tabs button")[0].click()`);
  // not the first card: the post written elsewhere a moment ago has been deleted again
  const bmId = await ev(`[...document.querySelectorAll("#app > div:nth-child(2) > div:nth-child(2) > article.status")].find((c) => c.textContent.includes("e2e root"))?.dataset.statusId`);
  await ev(`[...document.querySelectorAll("#app > div:nth-child(2) > div:nth-child(2) > article.status")].find((c) => c.dataset.statusId === ${JSON.stringify(bmId)}).querySelector("button.bookmark").click()`);
  await waitFor(`[...document.querySelectorAll("#app > div:nth-child(2) > div:nth-child(2) > article.status")].find((c) => c.dataset.statusId === ${JSON.stringify(bmId)})?.querySelector("button.bookmark.active")`, "bookmark active");
  await moreOpen(2);
  await waitFor(`${morePage}.querySelector("article")`, "bookmarked post listed");
  check("a saved post is listed under Bookmarks", true);
  await ev(`${morePage}.querySelector("button.bookmark.active").click()`);
  await waitFor(`!${morePage}.querySelector("button.bookmark.active")`, "bookmark removed");
  // a draft: save it, see it under Drafts, discard it
  await ev(`window.confirm = () => true`);
  await ev(`document.querySelectorAll("nav.tabs button")[0].click()`);
  await ev(`document.querySelector(".fab").click()`);
  await waitFor(`document.querySelector(".modal .composer textarea")`, "composer for a draft");
  await ev(`(() => { const c = document.querySelector(".modal .composer"); const t = c.querySelector("textarea"); t.value = "e2e draft ${Date.now()}"; t.dispatchEvent(new Event("input")); c.querySelector("input.draft").checked = true; c.requestSubmit(); })()`);
  await waitFor(`!document.querySelector(".modal .composer")`, "draft sent");
  await moreOpen(4);
  await waitFor(`${morePage}.querySelector(".status .state")`, "draft listed");
  check("a draft is listed under Drafts", true);
  await ev(`${morePage}.querySelector(".status button.discard").click()`);
  await waitFor(`!${morePage}.querySelector(".status .state")`, "draft discarded");
  check("a draft can be discarded", true);
  await ev(`document.querySelectorAll("nav.tabs button")[0].click()`);

  await ev(`(async () => { for (const id of [${JSON.stringify(replyPostId)}, ${JSON.stringify(rootId)}, ${JSON.stringify(imgPostId)}]) await fetch("/api/v1/statuses/" + id, { method: "DELETE", headers: { Authorization: "Bearer " + ${tokOf} } }); })()`);

  // the read position is kept by the server (markers API) so devices agree
  const marker = await ev(`(async () => {
    const tok = JSON.parse(localStorage.getItem("xenoclient.session")).token;
    const h = { Authorization: "Bearer " + tok, "Content-Type": "application/json" };
    const before = await (await fetch("/api/v1/markers?timeline[]=notifications", { headers: h })).json();
    await fetch("/api/v1/markers", { method: "POST", headers: h, body: JSON.stringify({ notifications: { last_read_id: "e2e-marker-1" } }) });
    const after = await (await fetch("/api/v1/markers?timeline[]=notifications", { headers: h })).json();
    const restore = before?.notifications?.last_read_id;
    if (restore) await fetch("/api/v1/markers", { method: "POST", headers: h, body: JSON.stringify({ notifications: { last_read_id: restore } }) });
    return after?.notifications?.last_read_id;
  })()`);
  check("the server keeps the notifications read position", marker === "e2e-marker-1");

  // theme + language
  await ev(`(() => { const s = document.querySelectorAll(".controls select")[0]; s.value = "dark"; s.dispatchEvent(new Event("change")); })()`);
  check("dark theme applied", (await ev(`document.documentElement.dataset.theme`)) === "dark");
  await shot("3-dark");
  for (const [lang, label] of [["en", "Write a post"], ["it", "Scrivi un post"]]) {
    await ev(`(() => { const s = document.querySelectorAll(".controls select")[1]; s.value = ${JSON.stringify(lang)}; s.dispatchEvent(new Event("change")); })()`);
    await waitFor(`document.documentElement.lang === ${JSON.stringify(lang)} && document.querySelector(".fab")?.getAttribute("aria-label") === ${JSON.stringify(label)}`, `${lang} UI`);
    check(`UI switches to ${lang}`, true);
  }
  await shot("4-italiano");

  // reopen while offline: the cached timeline must still be shown
  await send("Network.enable");
  await sleep(1500); // let the service worker finish installing
  await send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await send("Page.reload");
  await waitFor(`document.querySelectorAll("#app .status").length >= 1 && !!document.querySelector(".toast")`, "cached timeline while offline", 20000);
  check("offline reopen shows the cached timeline and a notice", true);
  await shot("5-offline");
  await send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await send("Page.reload");
  await waitFor(`document.querySelectorAll("#app .status").length >= 1`, "back online");

  // logout clears cache and drafts
  await ev(`[...document.querySelectorAll(".controls button")].at(-1).click()`);
  await waitFor(`!!document.querySelector("#app button")`, "login button after logout");
  const leftover = await ev(`Object.keys(localStorage).filter((k) => k.startsWith("xenoclient.timeline") || k.startsWith("xenoclient.draft") || k === "xenoclient.session")`);
  check(`logout leaves no session/cache/draft (${JSON.stringify(leftover)})`, leftover.length === 0);
} catch (e) {
  console.log("ERROR", e.message);
  failures++;
  try { await shot("error"); } catch { /* ignore */ }
} finally {
  ws.close();
  chrome.kill();
}
console.log(failures ? `${failures} FAILED` : "ALL PASSED");
process.exit(failures ? 1 : 0);
