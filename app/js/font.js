// The chosen font (proportional or mono): kept on this device and applied as data-font on the
// document.
const KEY = "stabbyclient.font";
const VALID = ["proportional", "mono"];

// "proportional": Atkinson Hyperlegible (Next). "mono": Atkinson Hyperlegible Mono, the font
// stabbypossum's own interface uses. Both come with the app (app/fonts/).
export function loadFontPref(storage) {
  try {
    const v = storage.getItem(KEY);
    return VALID.includes(v) ? v : "proportional";
  } catch {
    return "proportional";
  }
}

export function applyFont(doc, pref, storage) {
  if (!VALID.includes(pref)) pref = "proportional";
  else {
    try {
      storage.setItem(KEY, pref);
    } catch { /* the choice lasts for this session only */ }
  }
  doc.documentElement.dataset.font = pref;
}
