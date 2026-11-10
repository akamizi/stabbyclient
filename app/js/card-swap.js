// Puts a freshly drawn card where the old one is, keeping what the user has open on it:
// a thread, the posts above, a half-written reply or an inline form.
export function swapCard(old, fresh) {
  for (const sel of [":scope > .thread", ":scope > .ancestors"]) {
    const open = old.querySelector(sel);
    const target = fresh.querySelector(sel);
    if (open && !open.hidden && target) target.replaceWith(open);
  }
  const actions = fresh.querySelector(":scope > .actions");
  const kept = [...old.querySelectorAll(":scope > .composer, :scope > .inline-form")];
  // Moving a form takes the focus out of the field being typed in: remember it, and put it
  // back where the caret was, without letting the browser scroll to it.
  const active = old.ownerDocument?.activeElement;
  const typing = active && kept.some((form) => form.contains(active)) ? active : null;
  const caret = typing && "selectionStart" in typing ? [typing.selectionStart, typing.selectionEnd, typing.selectionDirection] : null;
  if (actions) for (const form of kept.reverse()) actions.after(form);
  old.replaceWith(fresh);
  if (typing && typing.isConnected) {
    typing.focus({ preventScroll: true });
    if (caret) { try { typing.setSelectionRange(...caret); } catch { /* not a text field */ } }
  }
  return fresh;
}
