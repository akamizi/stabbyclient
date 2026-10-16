# Acceptance — 2026-10-16

Run by `tools/e2e-smoke.mjs` in headless Chromium (mobile viewport 420x900) through
`tools/dev-proxy.mjs` against the real instance with the test user, plus 101 unit
tests (`npm test`). **Not run on a real Android device or behind the real nginx.**

| Item | Result | How |
|---|---|---|
| Login (register app → authorize → token → timeline) | pass | e2e, real OAuth round-trip in the browser |
| `code`/`state` removed from the URL after login | pass | e2e |
| Home loads | pass | e2e |
| Dislike on / off | pass | e2e (button class toggles, server state from the returned status) |
| Thread opens in place under the post | pass | e2e (parent with one reply); ≥ 8 replies / "show more" covered by unit tests only |
| New post appears on top | pass | e2e |
| Theme dark | pass | e2e (auto/light covered by unit tests) |
| Language en / it | pass | e2e |
| Logout leaves no session, cache or drafts | pass | e2e |
| Replies, image + alt text via API | pass | curl contract check (Task 8) + unit tests; UI path not driven |
| Cached timeline shown when reopened offline | pass | e2e (browser offline mode + service worker) |
| "New posts" indicator keeping position | not run in a browser | unit/DOM tests only |
| Offline send keeps the text | not run | unit test only |
| Install prompt, standalone launch, `sw.js` update | **not run** | needs Android Chrome behind the real nginx (`deploy/`) |
| 401 → back to login once | not run in a browser | unit test only |
| `disliked` in notifications | not checked | the test user has none |

Bugs found by the browser run and fixed: `renderControls()` ran before `session`
existed (TDZ) and stopped the whole app; "1 risposte" lacked a singular form.

Observation: `disliked` was `false` in `timelines/home` right after a dislike but
`true` on a later fresh load — the server appears to update timeline entries with a
delay. No overlay was added.

Test data left on the instance by the test user: a few "Prova xenoclient…" and
"e2e …" posts, one reply, one post with an image; one registered app.
