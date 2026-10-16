// A small form that opens inside a post: one text field, Save and Cancel.
export function createInlineForm({ doc, t, className, initial = "", multiline = true, submitLabel, onSubmit }) {
  const form = doc.createElement("form");
  form.className = `inline-form ${className}`;
  const field = doc.createElement(multiline ? "textarea" : "input");
  if (multiline) field.rows = 4;
  else field.type = "text";
  field.value = initial;
  field.setAttribute("aria-label", submitLabel);
  const error = doc.createElement("p");
  error.className = "error";
  error.setAttribute("role", "alert");
  const go = doc.createElement("button");
  go.type = "submit";
  go.textContent = submitLabel;
  const cancel = doc.createElement("button");
  cancel.type = "button";
  cancel.className = "cancel";
  cancel.textContent = t("composer.cancel");
  cancel.onclick = () => form.remove();
  form.append(field, error, go, cancel);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const value = field.value.trim();
    if (!value) return;
    error.textContent = "";
    go.disabled = true;
    try {
      await onSubmit(value, form);
    } catch {
      error.textContent = t("error.action_failed");
    } finally {
      go.disabled = false;
    }
  };
  return form;
}
