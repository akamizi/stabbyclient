import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, symlinkSync, statSync } from "node:fs";
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

test("an archive that carries a symbolic link is refused, and the running app is left alone", () => {
  const base = mkdtempSync(join(tmpdir(), "xc-base-"));
  install(base, archive({ "index.html": "good" }));
  const src = mkdtempSync(join(tmpdir(), "xc-src-"));
  mkdirSync(join(src, "app"));
  writeFileSync(join(src, "app/index.html"), "bad");
  symlinkSync("/etc/passwd", join(src, "app/passwd"));
  const tar = spawnSync("tar", ["-C", src, "-cf", "-", "app"], { encoding: "buffer" }).stdout;
  const r = install(base, tar);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /symbolic link/);
  assert.equal(readFileSync(join(base, "app/index.html"), "utf8"), "good");
});
test("a web root, app or app.prev that is a symbolic link is refused", () => {
  const real = mkdtempSync(join(tmpdir(), "xc-real-"));
  const holder = mkdtempSync(join(tmpdir(), "xc-hold-"));
  symlinkSync(real, join(holder, "root"));
  assert.notEqual(install(join(holder, "root"), archive({ "index.html": "x" })).status, 0);
  const base = mkdtempSync(join(tmpdir(), "xc-base-"));
  symlinkSync(real, join(base, "app"));
  assert.notEqual(install(base, archive({ "index.html": "x" })).status, 0);
  const base2 = mkdtempSync(join(tmpdir(), "xc-base-"));
  symlinkSync(real, join(base2, "app.prev"));
  assert.notEqual(install(base2, archive({ "index.html": "x" })).status, 0);
  assert.deepEqual(readdirSync(real), []);
});
test("the installed files are readable by the web server and writable by nobody but the owner", () => {
  const base = mkdtempSync(join(tmpdir(), "xc-base-"));
  install(base, archive({ "index.html": "x", "js/a.js": "y" }));
  for (const f of ["app", "app/index.html", "app/js", "app/js/a.js"]) {
    const mode = statSync(join(base, f)).mode & 0o777;
    assert.equal(mode & 0o022, 0, `${f} is writable by group or others (${mode.toString(8)})`);
    assert.ok(mode & 0o004, `${f} is not world readable (${mode.toString(8)})`);
  }
});
test("the installer is not written to a shared directory on the host: it is passed as the command itself", () => {
  const src = readFileSync("tools/deploy.sh", "utf8");
  assert.doesNotMatch(src, /\/tmp\//);
  assert.match(src, /sh -c/);
});
