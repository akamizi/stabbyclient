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
  

  await ev(`document.querySelectorAll(".controls .menu-toggle")[1].click()`);
  const diagText = await ev(`document.querySelector(".menu-diag").textContent`);
  check("the menu shows the version and the last check of Home", /(Version|Versione) /.test(diagText) && /home: .*(checked|controllata)/.test(diagText));
  await ev(`document.dispatchEvent(new Event("click"))`);


  const out = await ev(`(async () => {
    const tok = JSON.parse(localStorage.getItem("xenoclient.session")).token;
    const h = { Authorization: "Bearer " + tok };
    const ui = { ...h, "X-Xenomorph-UI": "1", "Content-Type": "application/json" };
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const me = await (await fetch("/api/v1/accounts/verify_credentials", { headers: h })).json();
    const stuck = new Set();
    let deleted = 0;
    const seen = [];
    for (let round = 0; round < 12; round++) {
      const list = await (await fetch("/api/v1/accounts/" + me.id + "/statuses?limit=40", { headers: h })).json();
      const home = await (await fetch("/api/v1/timelines/home?limit=10", { headers: h })).json();
      const mine = new Map();
      for (const x of [...list, ...home]) if ((x.reblog || x).account.id === me.id) mine.set(x.id, x);
      const todo = [...mine.values()].filter((x) => !stuck.has(x.id));
      seen.push(todo.length);
      if (!todo.length) break;
      for (const x of todo) {
        if (x.reblog) { await fetch("/api/v1/statuses/" + x.reblog.id + "/unreblog", { method: "POST", headers: h }); continue; }
        const r = await fetch("/api/v1/statuses/" + x.id, { method: "DELETE", headers: h });
        if (r.status === 500) stuck.add(x.id); else deleted++;
      }
      await sleep(2500);
    }
    let drafts = 0;
    for (const route of ["drafts", "scheduled"]) {
      const r = await fetch("/api/v1/xenomorph/" + route + "?limit=40", { headers: ui });
      const items = r.ok ? await r.json() : [];
      for (const x of items) { await fetch("/api/v1/xenomorph/hide", { method: "POST", headers: ui, body: JSON.stringify({ id: x.id }) }); drafts++; }
    }
    const final = await (await fetch("/api/v1/accounts/" + me.id + "/statuses?limit=40", { headers: h })).json();
    return JSON.stringify({ deleted, stuck: stuck.size, drafts, rounds: seen, left: final.map((x) => (x.content || "").replace(/<[^>]+>/g, "").slice(0, 30)) });
  })()`);
  console.log("result", out);
} catch (e) { console.log("ERR", e.message); }
finally { ws.close(); chrome.kill(); process.exit(0); }
