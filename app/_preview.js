import it from "./js/locales/it.js";
import { MORE_ENTRIES } from "./js/more.js";
const mk = (cls, text, ...kids) => { const e = document.createElement(cls.split(".")[0]); e.className = cls.split(".").slice(1).join(" "); e.textContent = text; e.append(...kids); return e; };
const panel = mk("div.menu-panel", "");
panel.hidden = true;
for (const en of MORE_ENTRIES) panel.append(mk("button.more-entry", `${en.icon} ${it["more." + en.id]}`));
document.getElementById("menu-left").append(mk("button.menu-toggle", `⋯ ${it["more.label"]}`), panel);
document.getElementById("controls").append(mk("button.menu-toggle", "☰"));
