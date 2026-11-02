// Constants of the client. VERSION is "dev" here: tools/deploy.sh rewrites that exact line with
// the commit on a staging copy, so keep its form.
export const BASE_PATH = "/app/";
export const SCOPES = "read write follow";
// The search service next to the server (search-index/, stabby-search) is kept but not asked: the
// search uses stabbypossum's own, which answers words, pages and addresses. Set to true to ask it first.
export const SEARCH_INDEX = false;
export const POLL_MS = 60000;
export const THREAD_INITIAL_REPLIES = 5;
// Stamped with the commit by tools/deploy.sh; "dev" when served straight from the repo.
export const VERSION = "dev";
