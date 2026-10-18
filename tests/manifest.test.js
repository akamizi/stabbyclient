import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import vm from "node:vm";

const manifest = JSON.parse(readFileSync("app/manifest.webmanifest", "utf8"));

test("manifest scope, start_url and display", () => {
  assert.equal(manifest.start_url, "/app/");
  assert.equal(manifest.scope, "/app/");
  assert.equal(manifest.display, "standalone");
});
test("manifest has 192 and 512 png icons that exist", () => {
  const sizes = manifest.icons.map((i) => i.sizes).sort();
  assert.deepEqual(sizes, ["192x192", "512x512"]);
  for (const i of manifest.icons) assert.ok(existsSync(`app/${i.src}`), i.src);
});

const swSource = readFileSync("app/sw.js", "utf8");
function loadSw() {
  const listeners = {};
  const self = { addEventListener: (n, f) => { listeners[n] = f; }, skipWaiting() {}, clients: { claim() {} } };
  const ctx = { self, caches: {}, fetch: async () => ({}), URL, Response, console };
  vm.runInNewContext(swSource, ctx);
  return { listeners, ctx };
}
function fetchEvent(url, method = "GET", mode = "same-origin") {
  const e = { request: { url, method, mode }, responded: false };
  e.respondWith = () => { e.responded = true; };
  return e;
}

test("the service worker never intercepts /api/ or /oauth/", () => {
  const { listeners } = loadSw();
  for (const p of ["/api/v1/timelines/home", "/oauth/token", "/x/y"]) {
    const e = fetchEvent(`https://h.example${p}`);
    listeners.fetch(e);
    assert.equal(e.responded, false, p);
  }
});
test("the service worker handles GETs under /app/ and ignores other methods", () => {
  const { listeners } = loadSw();
  const get = fetchEvent("https://h.example/app/js/app.js");
  listeners.fetch(get);
  assert.equal(get.responded, true);
  const post = fetchEvent("https://h.example/app/js/app.js", "POST");
  listeners.fetch(post);
  assert.equal(post.responded, false);
});
test("every precached file exists and every js/css/locale file is precached", () => {
  const { ctx } = loadSw();
  const list = vm.runInContext("PRECACHE", ctx);
  for (const u of list) {
    const rel = u === "/app/" ? "index.html" : u.replace(/^\/app\//, "");
    assert.ok(existsSync(`app/${rel}`), u);
  }
  const walk = (d) => readdirSync(`app/${d}`, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : [`/app/${d}/${e.name}`]));
  for (const f of [...walk("js"), ...walk("css")]) assert.ok(list.includes(f), `${f} missing from PRECACHE`);
});

test("the service worker revalidates what it fetches instead of trusting the browser's HTTP cache", () => {
  const sw = readFileSync(new URL("../app/sw.js", import.meta.url), "utf8");
  assert.match(sw, /fetch\(req, \{ cache: "no-cache" \}\)/);
  assert.match(sw, /new Request\(u, \{ cache: "reload" \}\)/);
});

test("the /app/ location sets a strict Content-Security-Policy that the page can live with", () => {
  const conf = readFileSync("deploy/nginx-app.conf", "utf8");
  const m = /add_header Content-Security-Policy "([^"]+)"/.exec(conf);
  assert.ok(m, "no Content-Security-Policy in deploy/nginx-app.conf");
  const csp = m[1];
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /script-src 'self'(;|$)/);
  assert.match(csp, /connect-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.doesNotMatch(csp, /unsafe-/);
  const html = readFileSync("app/index.html", "utf8");
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)/i, "inline script");
  assert.doesNotMatch(html, /<style/i, "inline style block");
  assert.doesNotMatch(html, /\sstyle=|\son[a-z]+=/i, "inline style or handler attribute");
});
test("no code builds markup from strings or evaluates text, which that policy would block anyway", () => {
  for (const f of readdirSync("app/js").filter((n) => n.endsWith(".js"))) {
    const src = readFileSync(`app/js/${f}`, "utf8");
    assert.doesNotMatch(src, /\.innerHTML\s*=|insertAdjacentHTML|\beval\(|new Function\(/, f);
  }
});

test("the fonts the stylesheet names exist, are kept for offline use, and the policy allows fonts from /app/ itself", () => {
  const css = readFileSync("app/css/app.css", "utf8");
  const files = [...css.matchAll(/url\("\.\.\/fonts\/([^"]+)"\)/g)].map((m) => m[1]);
  assert.ok(files.length >= 2, "no font files named in the stylesheet");
  const list = JSON.stringify(readFileSync("app/sw.js", "utf8"));
  for (const f of files) {
    assert.ok(existsSync(`app/fonts/${f}`), `${f} is missing`);
    assert.ok(list.includes(`/app/fonts/${f}`), `${f} is not precached`);
  }
  assert.ok(existsSync("app/fonts/AtkinsonHyperlegibleMono-OFL.txt"), "the font's licence must travel with it");
  const conf = readFileSync("deploy/nginx-app.conf", "utf8");
  assert.match(conf, /font-src 'self'/);
});
