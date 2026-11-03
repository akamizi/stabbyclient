// A fixed notice for an account that has moved to another one: the server refuses every write
// (403), so say why once instead of "That did not work". Shown once per page, never removed.
export function showMovedNotice(doc, t, address) {
  if (doc.querySelector(".moved-notice")) return;
  const box = doc.createElement("div");
  box.className = "moved-notice";
  box.setAttribute("role", "alert");
  box.textContent = t("moved.notice", { address });
  doc.body.prepend(box);
}
