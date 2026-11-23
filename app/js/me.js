// The signed-in account, loaded from verify_credentials. A copy is kept for the case where the
// network is down, tied to a hash of the token so it is never used for another login.
const KEY = "stabbyclient.me";

async function fingerprint(token) {
  const bytes = new TextEncoder().encode(String(token));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function forgetMe(storage) {
  try { storage.removeItem(KEY); } catch { /* nothing to forget */ }
}

// Account lookup that survives being offline: a network failure (no HTTP status)
// falls back to the account remembered for THIS token; an HTTP error never does,
// and an account remembered for another token is never used.
export async function loadMe(api, storage, token) {
  const fp = await fingerprint(token);
  try {
    const me = await api.get("/api/v1/accounts/verify_credentials");
    try { storage.setItem(KEY, JSON.stringify({ fp, me })); } catch { /* optional */ }
    return { me, offline: false };
  } catch (e) {
    if (e.status) throw e;
    let remembered = null;
    try { remembered = JSON.parse(storage.getItem(KEY)); } catch { /* none */ }
    if (!remembered || remembered.fp !== fp) throw e;
    return { me: remembered.me, offline: true };
  }
}

// The server does not say who its administrator is, but it names the account to contact about the
// instance, which is the administrator's. A failed read is "not the administrator": the server
// refuses the administrator's calls to anyone else anyway.
export async function isInstanceAdmin(api, me) {
  try {
    const info = await api.get("/api/v1/instance");
    const contact = info?.contact_account?.id;
    return Boolean(contact) && Boolean(me?.id) && String(contact) === String(me.id);
  } catch {
    return false;
  }
}
