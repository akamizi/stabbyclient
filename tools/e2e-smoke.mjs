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
const BASE = "http://localhost:8099";
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

  const cards = await ev(`document.querySelectorAll("#app .status").length`);
  check(`timeline shows posts (${cards})`, cards >= 1);

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

  // composer
  const msg = `e2e ${Date.now()}`;
  await ev(`document.querySelector(".fab").click()`);
  await waitFor(`document.querySelector("#app .composer textarea")`, "composer");
  await ev(`(() => { const t = document.querySelector("#app .composer textarea"); t.value = ${JSON.stringify(msg)}; t.dispatchEvent(new Event("input")); document.querySelector("#app .composer").requestSubmit(); })()`);
  await waitFor(`document.querySelector("#app .status")?.textContent.includes(${JSON.stringify(msg)})`, "new post on top");
  check("a new post appears on top of the timeline", true);

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
