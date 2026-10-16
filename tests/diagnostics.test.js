import test from "node:test";
import assert from "node:assert/strict";
import { createDiagnostics, diagnosticLines } from "../app/js/diagnostics.js";

const t = (k, p = {}) => `${k}|${Object.entries(p).map(([a, b]) => `${a}=${b}`).join(",")}`;

test("before any check there is only the version and a note", () => {
  const d = createDiagnostics();
  assert.deepEqual(diagnosticLines({ diag: d, version: "abc1234", t }), ["diag.version|v=abc1234", "diag.none|"]);
});
test("the account the app is signed in as is listed when known", () => {
  const d = createDiagnostics();
  assert.deepEqual(diagnosticLines({ diag: d, version: "v", account: "mizi@x.y05.eu", t })[1], "diag.account|acct=mizi@x.y05.eu");
});
test("the newest post the server sent in the last fetch is listed beside the one on screen", () => {
  const d = createDiagnostics();
  d.record("home", { ok: true, at: new Date(), newest: "2026-10-16T21:21:58Z", server: "2026-10-16T23:31:13Z", count: 20, pending: 0 });
  const line = diagnosticLines({ diag: d, version: "v", t })[1];
  assert.match(line, /server=/);
  assert.match(line, /count=20/);
});
test("a successful check shows the name, the time and the newest post seen", () => {
  const d = createDiagnostics();
  d.record("home", { ok: true, at: new Date("2026-10-17T01:25:03"), newest: "2026-10-16T23:11:00Z", pending: 2 });
  const [, line] = diagnosticLines({ diag: d, version: "v", t });
  assert.match(line, /^diag\.ok\|/);
  assert.match(line, /name=home/);
  assert.match(line, /pending=2/);
  assert.match(line, /time=\d\d:\d\d:\d\d/);
  assert.match(line, /newest=/);
});
test("a failed check shows the reason", () => {
  const d = createDiagnostics();
  d.record("federated", { ok: false, at: new Date("2026-10-17T01:25:03"), error: "HTTP 500" });
  const [, line] = diagnosticLines({ diag: d, version: "v", t });
  assert.match(line, /^diag\.failed\|/);
  assert.match(line, /reason=HTTP 500/);
});
test("each timeline keeps only its latest check, in the order they were first seen", () => {
  const d = createDiagnostics();
  d.record("home", { ok: false, at: new Date(), error: "x" });
  d.record("groups", { ok: true, at: new Date(), pending: 0 });
  d.record("home", { ok: true, at: new Date(), pending: 1 });
  const lines = diagnosticLines({ diag: d, version: "v", t });
  assert.equal(lines.length, 3);
  assert.match(lines[1], /^diag\.ok\|.*name=home/);
  assert.match(lines[2], /name=groups/);
});
test("a missing newest post is written as a dash", () => {
  const d = createDiagnostics();
  d.record("home", { ok: true, at: new Date(), pending: 0 });
  assert.match(diagnosticLines({ diag: d, version: "v", t })[1], /newest=—/);
});
