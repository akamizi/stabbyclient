const KEY = "xenoclient.me";

// Account lookup that survives being offline: a network failure (no HTTP status)
// falls back to the last known account; an HTTP error never does.
export async function loadMe(api, storage) {
  try {
    const me = await api.get("/api/v1/accounts/verify_credentials");
    try { storage.setItem(KEY, JSON.stringify(me)); } catch { /* optional */ }
    return { me, offline: false };
  } catch (e) {
    if (e.status) throw e;
    let remembered = null;
    try { remembered = JSON.parse(storage.getItem(KEY)); } catch { /* none */ }
    if (!remembered) throw e;
    return { me: remembered, offline: true };
  }
}
