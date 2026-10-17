import { sanitizeHtml } from "./sanitize.js";

// A minimal rich-text box for posts written as HTML: bold, italic and strike-through.
// What it produces is rebuilt from its content, never copied: only <strong>, <em>, <del>
// and <br> can come out, whatever was typed or pasted.

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function marks(el) {
  const tag = el.tagName.toLowerCase();
  const out = [];
  if (tag === "b" || tag === "strong") out.push("strong");
  if (tag === "i" || tag === "em") out.push("em");
  if (tag === "s" || tag === "strike" || tag === "del") out.push("del");
  if (tag === "span") {
    const style = (el.getAttribute("style") || "").toLowerCase().replace(/\s+/g, "");
    if (/font-weight:(bold|[6-9]00)/.test(style)) out.push("strong");
    if (/font-style:italic/.test(style)) out.push("em");
    if (/text-decoration[a-z-]*:[^;]*line-through/.test(style)) out.push("del");
  }
  return out;
}

export function htmlFromEditor(root) {
  let html = "";
  const blocks = new Set(["div", "p"]);
  function walk(node) {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) {
        html += esc(child.textContent);
      } else if (child.nodeType === 1) {
        const tag = child.tagName.toLowerCase();
        if (tag === "script" || tag === "style") continue;
        if (tag === "br") {
          html += "<br>";
          continue;
        }
        if (blocks.has(tag)) {
          // each block starts on a new line, unless it is the very first thing
          if (html !== "" && !html.endsWith("<br>")) html += "<br>";
          walk(child);
          continue;
        }
        const m = marks(child);
        for (const tg of m) html += `<${tg}>`;
        walk(child);
        for (const tg of [...m].reverse()) html += `</${tg}>`;
      }
    }
  }
  walk(root);
  // Line breaks the editor leaves at either end carry nothing.
  html = html.replace(/^(<br>)+/, "").replace(/(<br>)+$/, "");
  return html.trim() === "" ? "" : html;
}

export function textToHtml(text) {
  return esc(String(text ?? "")).replace(/\r?\n/g, "<br>");
}

export function htmlToPlain(html) {
  return String(html ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export function createRichEditor({ doc, t }) {
  const element = doc.createElement("div");
  element.className = "rich-editor";
  element.setAttribute("contenteditable", "true");
  element.setAttribute("role", "textbox");
  element.setAttribute("aria-multiline", "true");
  element.setAttribute("aria-label", t("composer.placeholder"));

  const toolbar = doc.createElement("div");
  toolbar.className = "rich-toolbar";
  const run = (cmd) => {
    doc.execCommand?.("styleWithCSS", false, false);
    doc.execCommand?.(cmd, false, null);
    element.focus?.();
  };
  for (const [cls, cmd, glyph, key] of [["bold", "bold", "B", "composer.bold"], ["italic", "italic", "I", "composer.italic"], ["strike", "strikeThrough", "S", "composer.strike"]]) {
    const b = doc.createElement("button");
    b.type = "button";
    b.className = `${cls} rich-button`;
    b.textContent = glyph;
    b.setAttribute("aria-label", t(key));
    b.title = t(key);
    // keep the selection in the text when the button is pressed
    b.onmousedown = (e) => e.preventDefault();
    b.onclick = () => run(cmd);
    toolbar.append(b);
  }
  // Pasted content is taken as plain text, never as someone else's markup.
  element.onpaste = (e) => {
    e.preventDefault();
    const text = e.clipboardData?.getData("text/plain") ?? "";
    if (text) doc.execCommand?.("insertText", false, text);
  };

  const api = {
    element,
    toolbar,
    html: () => htmlFromEditor(element),
    plain: () => htmlToPlain(htmlFromEditor(element)),
    isEmpty: () => htmlFromEditor(element) === "",
    // Content goes in through the cleaning parser or as plain text nodes, never as raw markup.
    setHtml(html) { element.replaceChildren(sanitizeHtml(html, doc)); },
    setPlain(text) {
      element.replaceChildren();
      String(text ?? "").split(/\r?\n/).forEach((line, i) => {
        if (i > 0) element.append(doc.createElement("br"));
        if (line) element.append(doc.createTextNode(line));
      });
    },
    clear() { element.replaceChildren(); },
    focus: () => element.focus?.(),
    insertText(text) {
      element.focus?.();
      if (doc.execCommand?.("insertText", false, text)) return;
      element.append(doc.createTextNode(text));
    },
  };
  return api;
}
