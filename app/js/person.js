// One row for an account (avatar, name, handle) with optional buttons, used by the people lists.
import { el } from "./dom.js";
import { safeUrl } from "./sanitize.js";
import { emojifyText } from "./emoji-text.js";

// One person in a list: avatar, name (a button that opens the profile; custom emoji shown),
// handle, and any extra buttons after them.
export function personItem({ doc, account, onOpen, buttons = [] }) {
  const li = el(doc, "li", "person");
  const url = safeUrl(account.avatar);
  if (url) {
    const img = el(doc, "img", "avatar");
    img.src = url;
    img.alt = "";
    img.loading = "lazy";
    li.append(img);
  }
  const who = el(doc, "span", "who");
  const name = el(doc, "button", "name open");
  name.type = "button";
  name.onclick = () => onOpen(account);
  name.append(emojifyText(account.display_name || account.username || account.acct || "", account.emojis, doc));
  who.append(name, el(doc, "span", "acct", ` @${account.acct || ""}`));
  li.append(who, ...buttons);
  return li;
}
