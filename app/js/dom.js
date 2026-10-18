// Making an element with a class and some text; elFor(doc) fixes the document.
export function el(doc, tag, cls, text) {
  const e = doc.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export const elFor = (doc) => (tag, cls, text) => el(doc, tag, cls, text);
