// Dev-only end-to-end smoke test in headless Chromium through the dev proxy.
// Usage: XENO_TEST_PW=... node tools/e2e-smoke.mjs <user> [shots-dir]
// Requires: node tools/dev-proxy.mjs https://<instance> 8099 running, `chromium` on PATH.
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
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
  await send("Emulation.setDeviceMetricsOverride", { width: 420, height: 640, deviceScaleFactor: 2, mobile: true });
  await send("Page.navigate", { url: `${BASE}/app/_preview.html` });
  await sleep(2500);
  await shot("header-closed");
  await ev(`document.querySelector(".menu-left .menu-panel").hidden = false`);
  await sleep(500);
  await shot("header-open");
} catch (e) { console.log("ERR", e.message); }
finally { ws.close(); chrome.kill(); process.exit(0); }
