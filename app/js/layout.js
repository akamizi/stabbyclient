// The chosen layout of posts: "top" (the avatar in the header line, next to the name) or "side"
// (the avatar in a column on the left and the text lined up beside it). Kept on this device and
// applied as data-layout on the document.
const KEY = "stabbyclient.layout";
const VALID = ["top", "side"];

export function loadLayoutPref(storage) {
  try {
    const v = storage.getItem(KEY);
    return VALID.includes(v) ? v : "top";
  } catch {
    return "top";
  }
}

export function applyLayout(doc, pref, storage) {
  if (!VALID.includes(pref)) pref = "top";
  else {
    try {
      storage.setItem(KEY, pref);
    } catch { /* the choice lasts for this session only */ }
  }
  doc.documentElement.dataset.layout = pref;
}
