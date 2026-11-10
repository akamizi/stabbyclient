// Constants of the client. VERSION is "dev" here: tools/deploy.sh rewrites that exact line with
// the commit on a staging copy, so keep its form.
export const BASE_PATH = "/app/";
export const SCOPES = "read write follow";
// The search service next to the server (search-index/, stabby-search) is kept but not asked: the
// search uses stabbypossum's own, which answers words, pages and addresses. Set to true to ask it first.
export const SEARCH_INDEX = false;
export const POLL_MS = 60000;
// The notifications' read position is asked of the server once every this many polls.
export const MARKER_EVERY = 5;
export const THREAD_INITIAL_REPLIES = 5;
// stabbypossum carries the standard emoji three times over, once per drawing style, told apart by
// the start of the name. Only the first style here is offered; an emoji it lacks comes from the
// next one that has it. The instance's own emoji (any other name) are always offered.
export const EMOJI_STYLES = ["noto", "tw", "om"];
// Stamped with the commit by tools/deploy.sh; "dev" when served straight from the repo.
export const VERSION = "dev";
