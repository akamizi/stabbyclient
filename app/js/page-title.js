// The name of the page being shown, for the tab title and for the hidden main heading, so a
// screen reader user knows where the app is after a switch. Given the document; returns the setter.
export function createPageTitle({ doc, appName = "Stabbyclient" }) {
  return function setPageTitle(label) {
    doc.title = label ? `${label} — ${appName}` : appName;
    const heading = doc.getElementById("view-title");
    if (heading) heading.textContent = label || appName;
  };
}
