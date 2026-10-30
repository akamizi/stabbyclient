// The mark next to the date of one's own post: where the copies sent to the other servers went.
// stabbypossum answers with a count per state and a colour; a post sent to nobody remote (or from
// before the server kept receipts) answers 404 and gets no mark. The colour is never the only
// signal: each mark has a shape and a spoken text with the counts.
const STATES = ["sent", "rate", "tarpit", "retry", "sending", "failed"];
const WAITING = ["sending", "rate", "tarpit", "retry"];
const SHAPE = { green: "✔︎", yellow: "✔︎", red: "✖︎" };
const DAY = 86400000;

export function deliveryText(counts, t) {
  return STATES.filter((s) => counts[s] > 0).map((s) => t(`delivery.${s}`, { count: counts[s] })).join(", ");
}

// Without `load` (or with one that fails) the mark stays hidden. While some copy still waits the
// server is asked again once a day, and only while the mark is on the page.
export function createDeliveryMark({ doc, win, t, load, id }) {
  const mark = doc.createElement("span");
  mark.className = "delivery";
  mark.hidden = true;
  const ask = async () => {
    let counts;
    try { counts = await load(id); } catch { return; }
    if (!counts || !/^[a-z]+$/.test(counts.colour || "")) return;
    mark.className = `delivery delivery-${counts.colour}`;
    mark.textContent = SHAPE[counts.colour] || "◔";
    const text = deliveryText(counts, t);
    mark.title = text;
    mark.setAttribute("role", "img");
    mark.setAttribute("aria-label", `${t("delivery.label")}: ${text}`);
    mark.hidden = false;
    if (WAITING.some((s) => counts[s] > 0)) {
      win?.setTimeout(() => { if (mark.isConnected) ask(); }, DAY);
    }
  };
  ask();
  return mark;
}
