const KEY = "xenoclient.theme";
const VALID = ["light", "dark", "auto"];
const watching = new WeakSet();

export function resolveTheme(pref, prefersDark) {
  if (pref === "light" || pref === "dark") return pref;
  return prefersDark ? "dark" : "light";
}

export function loadThemePref(storage) {
  try {
    const v = storage.getItem(KEY);
    return VALID.includes(v) ? v : "auto";
  } catch {
    return "auto";
  }
}

export function applyTheme(doc, pref, matchMediaFn, storage) {
  const mql = matchMediaFn("(prefers-color-scheme: dark)");
  try {
    storage.setItem(KEY, pref);
  } catch { /* storage unavailable: preference lasts for this session only */ }
  doc.documentElement.dataset.theme = resolveTheme(pref, mql.matches);
  if (!watching.has(doc)) {
    watching.add(doc);
    mql.addEventListener("change", () => {
      const current = loadThemePref(storage);
      doc.documentElement.dataset.theme = resolveTheme(current, matchMediaFn("(prefers-color-scheme: dark)").matches);
    });
  }
}
