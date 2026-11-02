// A link like /app/?share=<text>&inReplyTo=<address>&on-success=<address>&on-cancel=<address>, the
// same as stabbypossum's own /share (FEP-3b86): the text waits in the compose box and nothing goes
// out until the user presses Post. The post it answers is found by its address; where to go after a
// post or a cancel is shown by the server's /leave, never followed blindly.
const KEY = "stabbyclient.share";

// What the link asks for, or null when it is not a share link. `share` may be empty.
export function parseShare(search) {
  const p = new URLSearchParams(search);
  if (!p.has("share")) return null;
  return {
    text: p.get("share") || "",
    inReplyTo: p.get("inReplyTo") || "",
    onSuccess: p.get("on-success") || "",
    onCancel: p.get("on-cancel") || "",
  };
}

export const leaveUrl = (target) => (target ? `/leave?${new URLSearchParams({ to: target })}` : "");

// The link is kept across the login, which sends the browser away and back, and is read once.
export function keepShare(storage, share) {
  try { storage.setItem(KEY, JSON.stringify(share)); } catch { /* the share is lost, nothing else */ }
}

export function takeShare(storage) {
  try {
    const raw = storage.getItem(KEY);
    storage.removeItem(KEY);
    const s = raw ? JSON.parse(raw) : null;
    return s && typeof s.text === "string" ? s : null;
  } catch {
    return null;
  }
}

// The status a reply answers, from the address in the link; null when the server does not know it.
export async function findReplyTarget(api, address) {
  if (!address) return null;
  try {
    const found = await api.get("/api/v2/search", { q: address, type: "statuses", resolve: "true" });
    return found?.statuses?.[0] ?? null;
  } catch {
    return null;
  }
}
