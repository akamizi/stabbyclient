// Keeps the keyboard and screen readers inside a pop-up that is open: the rest of the page is
// made inert (messages that announce themselves stay), and when the pop-up closes the focus goes
// back to what had it before. Given the document and the pop-up's element; returns the release.
export function trapFocus(doc, overlay) {
  const opener = doc.activeElement;
  const inerted = [];
  for (const child of doc.body.children) {
    if (child === overlay || child.hasAttribute("inert") || child.matches("script, [role=status], [role=alert]")) continue;
    child.setAttribute("inert", "");
    inerted.push(child);
  }
  return function release() {
    for (const child of inerted) child.removeAttribute("inert");
    if (opener && opener !== doc.body && opener.isConnected !== false) opener.focus?.();
  };
}
