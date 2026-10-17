import { sanitizeHtml } from "./sanitize.js";

// The lines a quote starts from: the post's text as "> " lines, ready to write under.
// Servers that do not show quotes add a "RE: link" paragraph; it is left out.
export function quotedLines(html, doc) {
  const box = doc.createElement("div");
  box.append(sanitizeHtml(html || "", doc, { dropClasses: ["quote-inline"] }));
  for (const br of [...box.querySelectorAll("br")]) br.replaceWith("\n");
  const paragraphs = [...box.querySelectorAll("p")];
  const text = paragraphs.length
    ? paragraphs.map((p) => p.textContent.trim()).filter(Boolean).join("\n\n")
    : box.textContent.trim();
  return text.split("\n").map((line) => (line ? `> ${line}` : ">")).join("\n");
}
