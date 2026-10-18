const KEY = "xenoclient.font";
const VALID = ["system", "mono"];

// "system": the device's own proportional font. "mono": Atkinson Hyperlegible Mono, the font
// xenomorph's own interface uses (its files are in app/fonts/).
export function loadFontPref(storage) {
  try {
    const v = storage.getItem(KEY);
    return VALID.includes(v) ? v : "system";
  } catch {
    return "system";
  }
}

export function applyFont(doc, pref, storage) {
  if (!VALID.includes(pref)) pref = "system";
  else {
    try {
      storage.setItem(KEY, pref);
    } catch { /* the choice lasts for this session only */ }
  }
  doc.documentElement.dataset.font = pref;
}
