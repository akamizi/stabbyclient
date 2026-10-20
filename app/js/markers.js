// The "read up to here" position of the notifications. stabbypossum keeps it per account
// (the Mastodon markers API), so two devices agree; the device keeps a copy for when the
// server cannot be reached.
export async function loadReadMarker({ api, storage, key }) {
  let local = null;
  try {
    local = storage.getItem(key);
  } catch { /* storage unavailable */ }
  try {
    const found = await api.get("/api/v1/markers", { "timeline[]": "notifications" });
    const id = found?.notifications?.last_read_id;
    if (id) {
      try { storage.setItem(key, String(id)); } catch { /* the server still has it */ }
      return String(id);
    }
  } catch { /* offline: the local copy will do */ }
  return local;
}

// Writes the local copy first, then the server's; false when the server did not take it.
export async function saveReadMarker({ api, storage, key, id }) {
  try { storage.setItem(key, String(id)); } catch { /* the server may still take it */ }
  try {
    await api.postJson("/api/v1/markers", { notifications: { last_read_id: String(id) } });
    return true;
  } catch {
    return false;
  }
}
