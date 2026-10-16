// What the app knows about its own freshness, for the line shown in the menu.
export function createDiagnostics() {
  const checks = new Map();
  return {
    record(name, result) {
      checks.set(name, result);
    },
    entries() {
      return [...checks.entries()];
    },
  };
}

const clock = (d) => new Date(d).toLocaleTimeString([], { hour12: false });
const when = (iso) => (iso ? new Date(iso).toLocaleString([], { hour12: false }) : "—");

export function diagnosticLines({ diag, version, t }) {
  const lines = [t("diag.version", { v: version })];
  const entries = diag.entries();
  if (entries.length === 0) lines.push(t("diag.none"));
  for (const [name, r] of entries) {
    lines.push(r.ok
      ? t("diag.ok", { name, time: clock(r.at), newest: when(r.newest), pending: r.pending ?? 0 })
      : t("diag.failed", { name, time: clock(r.at), reason: r.error }));
  }
  return lines;
}
