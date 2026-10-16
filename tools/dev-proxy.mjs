// Dev-only: serves app/ under /app/ and forwards everything else to the instance,
// emulating the same-origin nginx setup. Usage: node tools/dev-proxy.mjs https://host [port]
import http from "node:http";
import https from "node:https";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const target = new URL(process.argv[2]);
const port = Number(process.argv[3] || 8099);
const root = join(fileURLToPath(new URL("..", import.meta.url)), "app");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png" };

http.createServer(async (req, res) => {
  const path = req.url.split("?")[0];
  if (path.startsWith("/app/") || path === "/app") {
    let rel = normalize(path.slice(5)).replace(/^(\.\.[/\\])+/, "") || "index.html";
    if (rel === ".") rel = "index.html";
    if (rel.endsWith("/")) rel += "index.html";
    try {
      const data = await readFile(join(root, rel));
      res.writeHead(200, { "content-type": types[extname(rel)] || "application/octet-stream", "cache-control": "no-cache" });
      return res.end(data);
    } catch {
      res.writeHead(404);
      return res.end("not found");
    }
  }
  const headers = { ...req.headers, host: target.host };
  delete headers["accept-encoding"];
  const up = https.request({ host: target.hostname, port: 443, path: req.url, method: req.method, headers }, (r) => {
    const h = { ...r.headers };
    if (h["set-cookie"]) h["set-cookie"] = h["set-cookie"].map((c) => c.replace(/;\s*Domain=[^;]*/i, ""));
    if (h.location) h.location = h.location.replace(target.origin, `http://localhost:${port}`);
    if (String(h["content-type"] || "").startsWith("text/html")) {
      // Keep forms/links on the proxy host so cookies and redirects stay same-origin.
      const chunks = [];
      r.on("data", (c) => chunks.push(c));
      r.on("end", () => {
        const body = Buffer.from(Buffer.concat(chunks).toString("utf8").replaceAll(target.origin, `http://localhost:${port}`));
        h["content-length"] = body.length;
        res.writeHead(r.statusCode, h);
        res.end(body);
      });
      return;
    }
    res.writeHead(r.statusCode, h);
    r.pipe(res);
  });
  up.on("error", (e) => { res.writeHead(502); res.end(String(e)); });
  req.pipe(up);
}).listen(port, () => console.log(`http://localhost:${port}/app/`));
