export const SUPPORTED = ["en", "it"];

export function resolveLang(pref, browserLangs = []) {
  if (SUPPORTED.includes(pref)) return pref;
  for (const tag of browserLangs) {
    const base = String(tag).toLowerCase().split("-")[0];
    if (SUPPORTED.includes(base)) return base;
  }
  return "en";
}

export function createI18n({ catalogs, fallback = "en" }) {
  let lang = fallback;
  return {
    get lang() {
      return lang;
    },
    setLang(pref, browserLangs = globalThis.navigator?.languages ?? []) {
      lang = resolveLang(pref, browserLangs);
      return lang;
    },
    t(key, params = {}) {
      const text = catalogs[lang]?.[key] ?? catalogs[fallback]?.[key] ?? key;
      return text.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m));
    },
  };
}
