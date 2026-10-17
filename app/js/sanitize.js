const ALLOWED = new Set(["p", "br", "a", "span", "strong", "em", "b", "i", "code", "pre", "blockquote", "ul", "ol", "li"]);
// Dropped together with their content; every other unknown element is unwrapped.
const DROP = new Set(["script", "style", "iframe", "object", "embed", "svg", "math", "template", "noscript", "title", "head"]);
const SAFE_HREF = /^(https?:|mailto:)/i;
const SAFE_URL = /^https?:\/\//i;

// Only absolute http(s) URLs may reach href/src attributes built from server data.
export function safeUrl(url) {
  const u = typeof url === "string" ? url.trim() : "";
  return SAFE_URL.test(u) ? u : null;
}

function copy(node, doc, out, dropClasses) {
  for (const child of node.childNodes) {
    if (child.nodeType === 3) {
      out.append(doc.createTextNode(child.textContent));
    } else if (child.nodeType === 1) {
      const tag = child.tagName.toLowerCase();
      if (DROP.has(tag)) continue;
      if (dropClasses.length && dropClasses.some((c) => child.classList?.contains(c))) continue;
      if (!ALLOWED.has(tag)) {
        copy(child, doc, out, dropClasses);
        continue;
      }
      const el = doc.createElement(tag);
      if (tag === "a") {
        const href = (child.getAttribute("href") || "").trim();
        if (SAFE_HREF.test(href)) {
          el.setAttribute("href", href);
          el.setAttribute("rel", "noopener noreferrer nofollow");
          el.setAttribute("target", "_blank");
        }
      }
      copy(child, doc, el, dropClasses);
      out.append(el);
    }
  }
}

// Parses in an inert document (DOMParser), so nothing loads or runs while sanitizing.
export function sanitizeHtml(html, doc, { dropClasses = [] } = {}) {
  const Parser = doc.defaultView?.DOMParser ?? globalThis.DOMParser;
  const parsed = new Parser().parseFromString(`<!doctype html><html><body>${html}</body></html>`, "text/html");
  const frag = doc.createDocumentFragment();
  copy(parsed.body, doc, frag, dropClasses);
  return frag;
}
