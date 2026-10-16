// The token is gone. Drafts and cached timelines are keyed per account and stay,
// so nothing the user typed is lost; only the logged-in controls go away.
export function expireSession({ session, doc }) {
  session.clear();
  doc.querySelectorAll(".fab").forEach((el) => el.remove());
}
