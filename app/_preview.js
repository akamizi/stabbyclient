import it from "./js/locales/it.js";
const mk = (cls, text, ...kids) => { const e = document.createElement(cls.split(".")[0]); e.className = cls.split(".").slice(1).join(" "); if (text) e.textContent = text; e.append(...kids); return e; };
const field = (label, options) => { const s = document.createElement("select"); for (const o of options) { const op = document.createElement("option"); op.textContent = o; s.append(op); } return mk("label.menu-field", "", mk("span", label), s); };
const panel = mk("div.menu-panel", "", field(it["theme.label"], [it["theme.auto"]]), field(it["font.label"], [it["font.mono"], it["font.proportional"]]), field(it["lang.label"], ["Auto"]), mk("button", it["login.logout"]), mk("div.menu-diag", "", mk("p", "Versione 4872523"), mk("p", "home: controllata alle 16:20:03; a schermo ultimo post 18/10/2026, 16:20:00; il server ha mandato come ultimo 18/10/2026, 16:20:00 (20 post); 0 nuovi in attesa")));
panel.hidden = true;
document.getElementById("menu-left").append(mk("button.menu-toggle", `⋯ ${it["more.label"]}`));
document.getElementById("controls").append(mk("button.menu-toggle", "☰"), panel);
