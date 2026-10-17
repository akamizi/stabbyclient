// Marks which of the four lists (Home, Federated, Groups, Notifications) is showing. On any
// other page (a profile, the More menu, a single post) none of them is marked.
export function markActiveTab(tabs, active) {
  for (const [name, button] of Object.entries(tabs)) {
    const on = name === active;
    button.classList.toggle("active", on);
    if (on) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
}
