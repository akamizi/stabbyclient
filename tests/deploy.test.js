import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function archive(files) {
  const src = mkdtempSync(join(tmpdir(), "xc-src-"));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(src, "app", name.split("/").slice(0, -1).join("/")), { recursive: true });
    writeFileSync(join(src, "app", name), text);
  }
  return spawnSync("tar", ["-C", src, "-cf", "-", "app"], { encoding: "buffer" }).stdout;
}
const install = (base, tarBuffer) => spawnSync("sh", ["tools/remote-install.sh", base], { input: tarBuffer, encoding: "utf8" });

test("installing replaces the app, and a file that is gone from the new version is gone from the host", () => {
  const base = mkdtempSync(join(tmpdir(), "xc-base-"));
  assert.equal(install(base, archive({ "index.html": "v1", "js/old.js": "old", "js/keep.js": "keep" })).status, 0);
  assert.equal(readFileSync(join(base, "app/js/old.js"), "utf8"), "old");
  const r = install(base, archive({ "index.html": "v2", "js/keep.js": "keep2" }));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(join(base, "app/index.html"), "utf8"), "v2");
  assert.equal(existsSync(join(base, "app/js/old.js")), false);
  assert.equal(readFileSync(join(base, "app/js/keep.js"), "utf8"), "keep2");
});
test("the previous version is kept beside it, one back, and nothing is left half-installed", () => {
  const base = mkdtempSync(join(tmpdir(), "xc-base-"));
  install(base, archive({ "index.html": "v1" }));
  install(base, archive({ "index.html": "v2" }));
  assert.equal(readFileSync(join(base, "app.prev/index.html"), "utf8"), "v1");
  install(base, archive({ "index.html": "v3" }));
  assert.equal(readFileSync(join(base, "app.prev/index.html"), "utf8"), "v2");
  assert.deepEqual(readdirSync(base).sort(), ["app", "app.prev"]);
});
test("an archive without app/index.html is refused and the running app is left alone", () => {
  const base = mkdtempSync(join(tmpdir(), "xc-base-"));
  install(base, archive({ "index.html": "good" }));
  const r = install(base, archive({ "readme.txt": "not an app" }));
  assert.notEqual(r.status, 0);
  assert.equal(readFileSync(join(base, "app/index.html"), "utf8"), "good");
  assert.deepEqual(readdirSync(base).sort(), ["app"]);
});
test("deploy.sh sends the installer to the host and refuses scratch files", () => {
  const src = readFileSync("tools/deploy.sh", "utf8");
  assert.match(src, /remote-install\.sh/);
  assert.match(src, /app\/_\*/);
});
