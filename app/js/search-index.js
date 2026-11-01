// The search service next to the server (stabby-search): posts found by words, newest first, in what
// the signed-in user may see. Missing or unwell, it answers null and the page asks the server as before.
export const INDEX_PATH = "/app/search/v1/search";

const stopped = (e) => e?.name === "AbortError" || e?.name === "TimeoutError";

export async function searchIndex(api, query, { signal } = {}) {
  try {
    const body = await api.get(INDEX_PATH, { q: query, limit: "20" }, { signal, timeoutMs: 10000 });
    if (!body || !Array.isArray(body.statuses) || !Array.isArray(body.accounts)) return null;
    return body;
  } catch (e) {
    if (stopped(e)) throw e;
    return null;
  }
}
