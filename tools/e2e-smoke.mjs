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

  const cards = await ev(`document.querySelectorAll("#app .status").length`);
  check(`timeline shows posts (${cards})`, cards >= 1);

  // the thread steps need a post with a reply: make one, and reload until the timeline shows it
  const tokOf = `JSON.parse(localStorage.getItem("xenoclient.session")).token`;
  const mkPost = (body) => ev(`(async () => { const r = await fetch("/api/v1/statuses", { method: "POST", headers: { Authorization: "Bearer " + ${tokOf} }, body: new URLSearchParams(${JSON.stringify(body)}) }); return (await r.json()).id; })()`);
  const rootId = await mkPost({ status: `e2e root ${Date.now()}`, visibility: "public" });
  const replyPostId = await mkPost({ status: `e2e reply ${Date.now()}`, visibility: "public", in_reply_to_id: rootId });
  for (let i = 0; i < 8; i++) {
    await send("Page.reload");
    await waitFor(`!!document.querySelector("#app .status")`, "timeline after reload");
    await sleep(1500);
    await ev(`(() => { const b = document.getElementById("new-posts"); if (!b.hidden) b.click(); })()`);
    if (await ev(`!!document.querySelector("#app button.replies-toggle") && !!document.querySelector("#app button.ancestors-toggle")`)) break;
    await sleep(3000);
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
    await waitFor(`document.querySelector('#app [data-status-id="${withReplies}"] .thread .status')`, "replies in place");
    check("replies open under the post, in place", true);
    await shot("2-thread-open");
  } else check("a post with replies exists to test the thread", false);

  // previous posts above a reply, and the date link
  const replyId = await ev(`(() => { const b = document.querySelector("#app > div button.ancestors-toggle, #app button.ancestors-toggle"); if (!b) return null; const c = b.closest(".status"); b.click(); return c.dataset.statusId; })()`);
  if (replyId) {
    await waitFor(`document.querySelector('#app [data-status-id="${replyId}"] > .ancestors .status')`, "ancestors above the reply");
    check("previous posts open above a reply, in place", true);
    await shot("2b-ancestors");
  } else check("a reply exists to test the previous-posts button", false);
  check("the date is a link to the permalink", (await ev(`!!document.querySelector("#app a.permalink[href^='https://']")`)));

  // composer
  const msg = `e2e ${Date.now()}`;
  await ev(`document.querySelector(".fab").click()`);
  await waitFor(`document.querySelector("#app .composer textarea")`, "composer");
  await ev(`(() => { const t = document.querySelector("#app .composer textarea"); t.value = ${JSON.stringify(msg)}; t.dispatchEvent(new Event("input")); document.querySelector("#app .composer").requestSubmit(); })()`);
  await waitFor(`document.querySelector("#app .status")?.textContent.includes(${JSON.stringify(msg)})`, "new post on top");
  check("a new post appears on top of the timeline", true);

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

  await ev(`(async () => { for (const id of [${JSON.stringify(replyPostId)}, ${JSON.stringify(rootId)}]) await fetch("/api/v1/statuses/" + id, { method: "DELETE", headers: { Authorization: "Bearer " + ${tokOf} } }); })()`);

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
  check("the More menu has nine entries", entries === 9);
  for (let i = 0; i < entries; i++) {
    await moreOpen(i);
    await sleep(1800);
    const ok = await ev(`(() => { const p = ${morePage}; return !p.hidden && !!p.querySelector("h2") && !p.querySelector(".error"); })()`);
    check(`More entry ${i} opens a page without an error`, ok);
  }
  // bookmark a post, find it under Bookmarks, then undo
  await ev(`document.querySelectorAll("nav.tabs button")[0].click()`);
  await ev(`document.querySelector("#app .status button.bookmark").click()`);
  await waitFor(`document.querySelector("#app .status button.bookmark.active")`, "bookmark active");
  await moreOpen(1);
  await waitFor(`${morePage}.querySelector("article")`, "bookmarked post listed");
  check("a saved post is listed under Bookmarks", true);
  await ev(`${morePage}.querySelector("button.bookmark.active").click()`);
  await waitFor(`!${morePage}.querySelector("button.bookmark.active")`, "bookmark removed");
  // a draft: save it, see it under Drafts, discard it
  await ev(`window.confirm = () => true`);
  await ev(`document.querySelectorAll("nav.tabs button")[0].click()`);
  await ev(`document.querySelector(".fab").click()`);
  await waitFor(`document.querySelector("#app .composer textarea")`, "composer for a draft");
  await ev(`(() => { const c = document.querySelector("#app .composer"); const t = c.querySelector("textarea"); t.value = "e2e draft ${Date.now()}"; t.dispatchEvent(new Event("input")); c.querySelector("input.draft").checked = true; c.requestSubmit(); })()`);
  await waitFor(`!document.querySelector("#app .composer")`, "draft sent");
  await moreOpen(3);
  await waitFor(`${morePage}.querySelector(".status .state")`, "draft listed");
  check("a draft is listed under Drafts", true);
  await ev(`${morePage}.querySelector(".status button.discard").click()`);
  await waitFor(`!${morePage}.querySelector(".status .state")`, "draft discarded");
  check("a draft can be discarded", true);
  await ev(`document.querySelectorAll("nav.tabs button")[0].click()`);

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
