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
  if (actions) for (const form of kept.reverse()) actions.after(form);
  old.replaceWith(fresh);
  return fresh;
}
