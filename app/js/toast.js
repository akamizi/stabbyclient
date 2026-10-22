// A short message shown over the page, removed after a few seconds.
export function showToast(doc, text, ms = 4000) {
  const el = doc.createElement("div");
  el.className = "toast";
  el.setAttribute("role", "status");
  el.textContent = text;
  doc.body.append(el);
  setTimeout(() => el.remove(), ms);
}
