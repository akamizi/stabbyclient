# Xenoclient Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static installable PWA (Android Chrome) that reads the home timeline, likes/dislikes, replies/posts, and expands threads in place, against one fixed xenomorph instance.

**Architecture:** Plain ES modules, no build step, served by nginx under `/app/` on the same origin as the instance (so no CORS, `location.origin` is the instance). Logic lives in small pure modules (tested with `node --test`); DOM rendering is thin and built on those modules. The server is never modified.

**Tech Stack:** Vanilla JavaScript (ES modules), HTML/CSS, service worker + web manifest. Dev-only: Node 24 (`node --test`) and `linkedom` for DOM tests (never shipped; **[scelta mia]**).

**Spec:** `docs/superpowers/specs/2026-10-16-xenoclient-design.md` (read it; this plan only fixes names and order).

## Global Constraints

- No build step, no third-party scripts or libraries at runtime; assets vendored.
- No server changes, no new endpoints. Same domain as the instance, under a dedicated path (`/app/`), served by nginx without going through xenomorph.
- Target: Android Chrome. iOS is not a goal.
- Theme selector with three values: `light`, `dark`, `auto` (default `auto`, follows the system); choice remembered on the device.
- UI languages: English (default) and Italian. No hardcoded visible strings: all come from per-language catalogs; a missing key falls back to English. Language is `auto` (browser, fallback English) or chosen by hand.
- `dislikes_count` is always 0: show only whether the user has disliked (`disliked`), never a count.
- Dislike: `POST /api/v1/statuses/:id/dislike` and `…/undislike`.
- Thread: `GET /api/v1/statuses/:id/context` → flat `{"ancestors":[…],"descendants":[…]}`; the client builds the tree from `in_reply_to_id`; show the first replies, then a "show more" button.
- Timeline: cache one page; show the cache at open, then load fresh; new posts never shift what is being read — show a "new posts" indicator instead. Pagination via the `Link` header.
- Notifications: poll every 60 s only while the app is open; unread badge; unknown types shown generically; opening one opens the post and its thread.
- Composer v1: text, content warning, visibility, images **with alt text** via `POST /api/v1/media`. Quotes (`quoted_status_id`) are out of v1.
- Out of scope: admin, groups, drafts/scheduled, emoji reactions, profiles, search, lists, bookmarks, other timelines, settings.
- Commit messages must not mention Claude (documentation-only commits may; when in doubt, omit).
- Tests run against the real instance with a test user the owner creates; a fake server is for fast UI tests only.

## Review Focus

1. **Hostile post HTML** (script tags, `on*` handlers, `javascript:` links) — the app shares an origin with the instance's session cookie; content must be sanitized. Owned by Task 5.
2. **Broken threads**: replies whose parent is missing, a self-parented/cyclic reply, an empty `descendants`. Must render without hanging or dropping visible posts. Task 7.
3. **Expired or revoked token** (HTTP 401 on any call): return to login once, no redirect loop. Task 1.
4. **Offline or failing send** (post, dislike, upload): no silent loss; error shown, composer text kept. Tasks 6 and 8.
5. **Odd status shapes**: boosts (`reblog`), content warning/sensitive media, missing `disliked` (e.g. in notifications), deleted parent. Task 5.

---

## File structure

```
app/index.html            shell, loads js/app.js as a module
app/manifest.webmanifest  install metadata (name, start_url /app/, icons)
app/sw.js                 service worker: cache app shell only, never /api or /oauth
app/css/app.css           light/dark via CSS variables
app/icons/                192 and 512 png (generated, simple)
app/js/config.js          constants
app/js/api.js             fetch wrapper, Link parsing, ApiError
app/js/auth.js            app registration, OAuth code flow, session storage
app/js/i18n.js            catalog lookup, language resolution
app/js/locales/en.js, it.js
app/js/theme.js           theme resolution and apply
app/js/sanitize.js        allowlist HTML sanitizer
app/js/thread.js          context → ordered nodes with depth
app/js/cache.js           one-page timeline cache
app/js/statuses.js        like/dislike/post/upload calls
app/js/status-card.js     status → DOM
app/js/composer.js        form model + DOM
app/js/notifications.js   polling, unread count
app/js/app.js             boot, routing between views
deploy/nginx-app.conf     location snippet for /app/
tests/*.test.js
```

---

### Task 1: Scaffold, API client and login (the login spike comes first)

**Files:**
- Create: `package.json` (`"type":"module"`, script `test`: `node --test tests/`, devDependency `linkedom`), `app/index.html`, `app/js/config.js`, `app/js/api.js`, `app/js/auth.js`, `app/js/app.js`
- Test: `tests/api.test.js`, `tests/auth.test.js`

**Interfaces:**
- Produces:
  - `config.js`: `BASE_PATH = "/app/"`, `SCOPES = "read write follow"` (verify against the server, see Step 6), `POLL_MS = 60000`, `THREAD_INITIAL_REPLIES = 5`
  - `api.js`: `parseLinkNext(header: string|null): string|null`; `class ApiError extends Error { status: number }`; `createApi({fetchFn, getToken, onUnauthorized}): { get(path, params?), post(path, body?), postForm(path, formData) }` — all return parsed JSON, plus `.next` (from `Link`) on list responses via `getPage(path, params): {items, next}`; on HTTP 401 call `onUnauthorized()` once and throw `ApiError`
  - `auth.js`: `buildAuthorizeUrl({clientId, redirectUri, scope, state}): string`; `registerApp(fetchFn, redirectUri): Promise<{client_id, client_secret}>`; `exchangeCode(fetchFn, {clientId, clientSecret, redirectUri, code}): Promise<{access_token}>`; `createSession(storage): {load(), save(s), clear()}` (storage is any `{getItem,setItem,removeItem}`)

- [ ] **Step 1: Write failing tests** — `api.test.js`: `parseLinkNext('<https://h/x?max_id=5>; rel="next", <https://h/y>; rel="prev"')` returns `https://h/x?max_id=5`; `null` header returns `null`. A fake `fetchFn` returning 401 calls `onUnauthorized` exactly once across two calls and throws `ApiError` with `status === 401`. `auth.test.js`: `buildAuthorizeUrl` yields `/oauth/authorize` with `response_type=code`, the given `client_id`, `redirect_uri`, `scope`, `state`; `createSession` round-trips `save`/`load` and `clear` empties it.
- [ ] **Step 2: Run** `npm install && npm test` — expect FAIL (modules missing).
- [ ] **Step 3: Implement** `api.js`, `auth.js`, `config.js` to the signatures above. The redirect target is `location.origin + BASE_PATH`; the `state` is random and checked on return.
- [ ] **Step 4: Run** `npm test` — expect PASS.
- [ ] **Step 5: Wire `app.js` + `index.html`**: no session → register app (once, store `client_id/secret`) → redirect to authorize → on return with `?code=` verify `state`, exchange, save, `GET /api/v1/accounts/verify_credentials`, show the account name on screen.
- [ ] **Step 6: Live login check (spike gate).** Serve `app/` under `/app/` via nginx (Task 9's snippet, temporary), log in on Android Chrome with the test user. Record in `docs/superpowers/notes/login-spike.md`: scopes the server accepted, whether `/oauth/token` worked same-origin, anything that differs from the spec. **If login fails, stop and report to the owner before building further** (fallback in spec: pasted token).
- [ ] **Step 7: Commit** (`git add -A && git commit -m "Scaffold, API client and OAuth login"`).

### Task 2: Internationalisation (en default, it)

**Files:** Create `app/js/i18n.js`, `app/js/locales/en.js`, `app/js/locales/it.js`; Test `tests/i18n.test.js`

**Interfaces:**
- Produces: `resolveLang(pref: "auto"|"en"|"it", browserLangs: string[]): "en"|"it"`; `createI18n({catalogs, fallback}): { t(key: string, params?: object): string, setLang(pref), lang: string }`. Catalogs are plain objects `{key: "text with {name}"}`.

- [ ] **Step 1: Failing tests:** `resolveLang("auto", ["it-IT","en"])` → `"it"`; `resolveLang("auto", ["fr"])` → `"en"`; `resolveLang("it", [])` → `"it"`; `t("missing.only.in.en")` in Italian returns the English text; unknown key returns the key itself; `t("hello", {name:"A"})` fills `{name}`; **catalog parity:** every key in `en.js` exists in `it.js` and vice-versa.
- [ ] **Step 2:** Run `npm test` — FAIL. **Step 3:** Implement. Keys are namespaced (`timeline.empty`, `status.dislike`, `status.undislike`, `composer.send`, …); add keys as later tasks need them, keeping parity. **Step 4:** PASS. **Step 5:** Commit.

### Task 3: Theme (light / dark / auto)

**Files:** Create `app/js/theme.js`, `app/css/app.css`; Test `tests/theme.test.js`

**Interfaces:** Produces `resolveTheme(pref: "light"|"dark"|"auto", prefersDark: boolean): "light"|"dark"`; `applyTheme(doc, pref, matchMediaFn, storage): void` (sets `data-theme` on `<html>`, persists the preference under key `xenoclient.theme`, updates when the system changes while `auto`).

- [ ] **Step 1: Failing tests:** `resolveTheme("auto", true)` → `"dark"`; `("light", true)` → `"light"`; `applyTheme` with a fake storage persists the pref and sets `data-theme`; an invalid stored value falls back to `auto`.
- [ ] **Step 2–4:** run FAIL; implement (CSS variables for both palettes in `app.css`, readable contrast); PASS. **Step 5:** add a three-way selector control in the top bar (label strings via i18n, keys `theme.light|dark|auto`); Commit.

### Task 4: Timeline with one-page cache and "new posts" indicator

**Files:** Create `app/js/cache.js`, `app/js/timeline.js`; Test `tests/cache.test.js`, `tests/timeline.test.js`

**Interfaces:**
- Consumes: `createApi(...).getPage` (Task 1)
- Produces: `createTimelineCache(storage): { read(): {statuses, savedAt}|null, write(statuses): void }` (key `xenoclient.timeline`, ignores corrupt JSON, drops over-size writes silently); `mergeFresh(shown: Status[], fresh: Status[]): { toShow: Status[], pendingNew: Status[] }` — statuses already shown are never reordered; ids not yet shown that are newer go to `pendingNew`.

- [ ] **Step 1: Failing tests:** cache write→read returns the same statuses; corrupt stored JSON → `read()` returns `null`; `mergeFresh` with `fresh` containing 2 new ids keeps `shown` unchanged and `pendingNew.length === 2`; with identical lists `pendingNew` is empty.
- [ ] **Step 2–4:** FAIL; implement; PASS.
- [ ] **Step 5:** `timeline.js` view: show cache immediately, fetch `GET /api/v1/timelines/home`, append older pages on scroll using `next`; "N new posts" button inserts pending posts at top on tap and keeps scroll anchor otherwise. Verify manually on the test instance (scroll position unchanged when fresh posts arrive).
- [ ] **Step 6:** Commit.

### Task 5: Sanitizer and status card (incl. odd shapes)

**Files:** Create `app/js/sanitize.js`, `app/js/status-card.js`; Test `tests/sanitize.test.js`, `tests/status-card.test.js` (use `linkedom`)

**Interfaces:**
- Produces: `sanitizeHtml(html: string, doc: Document): DocumentFragment` — allowlist: `p br a span strong em b i code pre blockquote ul ol li`; `a` keeps only `href` (http/https/mailto) plus forced `rel="noopener noreferrer nofollow" target="_blank"`; all other tags/attributes/`on*`/`javascript:` removed; `renderStatusCard(status: Status, ctx: {doc, t, actions}): HTMLElement`, where `actions = { onReply(status), onFavourite(status), onDislike(status), onToggleThread(status) }`.
- Consumes: `t` from Task 2.

- [ ] **Step 1: Failing tests (sanitize):** `<script>alert(1)</script>x` → no `script` element, text safe; `<a href="javascript:alert(1)">l</a>` → no `javascript:` href; `<img src=x onerror=alert(1)>` → no `img`; `<a href="https://e.org" onclick="x()">` keeps `href`, drops `onclick`, has `rel` containing `noopener`.
- [ ] **Step 2: Failing tests (card):** a boost (`reblog` non-null) renders the boosted status's text and a "boosted by" label; a status with `spoiler_text` hides the body behind a button with `aria-expanded="false"`; a status with `disliked: true` renders the dislike button with class `active` and the `status.undislike` label; a status **without** `disliked` renders as not disliked without throwing; no element shows a dislike *count*.
- [ ] **Step 3–5:** FAIL; implement; PASS. Card layout: avatar, display name, time, body, media, action row (reply, repost, like, dislike 💩 "Hate" label per i18n, more). Repost is shown but only enabled for `public`/`unlisted`. **Step 6:** Commit.

### Task 6: Like and dislike actions

**Files:** Create `app/js/statuses.js`; Test `tests/statuses.test.js`

**Interfaces:**
- Produces: `setFavourite(api, id: string, on: boolean): Promise<Status>`; `setDislike(api, id: string, on: boolean): Promise<Status>` — POST to `/api/v1/statuses/${id}/dislike` or `/undislike` (and `favourite`/`unfavourite`); returns the updated status from the response.

- [ ] **Step 1: Failing tests** with a fake `api.post`: `setDislike(api,"7",true)` calls path `/api/v1/statuses/7/dislike`; `false` calls `/undislike`; same for favourite. A rejecting `api.post` makes the promise reject (so the UI can revert).
- [ ] **Step 2–4:** FAIL; implement; PASS. **Step 5:** In the card, apply optimistic toggle, revert and show a toast (`error.action_failed`) on failure (Review Focus 4). **Step 6: Live check:** dislike a post on the test instance, reload — `disliked` persists; also open the same post inside a thread and in a notification and confirm the flag appears (spec Section 9 open item); note results in `docs/superpowers/notes/login-spike.md`. **Step 7:** Commit.

### Task 7: Thread expanded in place

**Files:** Create `app/js/thread.js`; Test `tests/thread.test.js`

**Interfaces:**
- Produces: `buildThread(root: Status, context: {ancestors: Status[], descendants: Status[]}): { ancestors: Status[], nodes: Array<{status: Status, depth: number}> }` — `nodes` in depth-first order by creation time, `depth` capped for display at 2 by the caller; `limitVisible(nodes, n: number): { visible, hiddenCount }`.

- [ ] **Step 1: Failing tests:** two replies to root and one reply to the first → order `[r1(depth1), r1a(depth2), r2(depth1)]`; a descendant whose `in_reply_to_id` is not in the set is placed at depth 1 (not dropped); a reply whose `in_reply_to_id` equals its own id, or two replies pointing at each other, terminate and each appears exactly once; empty `descendants` → empty `nodes`; `limitVisible(nodes, 5)` on 8 nodes → 5 visible, `hiddenCount` 3.
- [ ] **Step 2–4:** FAIL; implement with a visited set; PASS.
- [ ] **Step 5:** Tapping the reply counter on a card fetches `GET /api/v1/statuses/:id/context` and inserts `visible` nodes right under the post (indented per depth, max 2), with a "show more" button using `THREAD_INITIAL_REPLIES`; tapping again collapses. Scroll position of everything above is unchanged. Manual check on a thread with ≥ 8 replies from the test instance. **Step 6:** Commit.

### Task 8: Composer (reply and new post)

**Files:** Create `app/js/composer.js`; Modify `app/js/statuses.js`; Test `tests/composer.test.js`

**Interfaces:**
- Produces in `composer.js`: `buildStatusParams({text, spoiler, visibility, inReplyToId, mediaIds, language}): URLSearchParams` (only includes non-empty fields; keys `status`, `spoiler_text`, `visibility`, `in_reply_to_id`, `media_ids[]`, `language`); `saveDraft(storage, key, text)` / `loadDraft(storage, key): string`. In `statuses.js`: `postStatus(api, params: URLSearchParams): Promise<Status>`; `uploadMedia(api, file: File, alt: string): Promise<{id: string}>` (POST `/api/v1/media`, fields `file`, `description`).

- [ ] **Step 1: Failing tests:** `buildStatusParams({text:"hi", visibility:"public", inReplyToId:"9"})` has `status=hi`, `visibility=public`, `in_reply_to_id=9` and no `spoiler_text`; two media ids produce two `media_ids[]`; `saveDraft`/`loadDraft` round-trip, per key; `postStatus` with a rejecting `api.post` rejects and does **not** clear the draft.
- [ ] **Step 2–4:** FAIL; implement; PASS.
- [ ] **Step 5:** UI: floating "write" button and reply box under a card; fields text, optional content warning, visibility select, image picker with an alt-text field per image; draft saved on input per target (new post / reply-to id); on send failure keep the text and show `error.send_failed`. Replies inherit the replied-to visibility by default **[scelta mia]**. **Step 6: Live check:** post, reply with an image + alt text, post while offline (airplane mode) and confirm the text survives. **Step 7:** Commit.

### Task 9: PWA install, service worker and nginx

**Files:** Create `app/manifest.webmanifest`, `app/sw.js`, `app/icons/icon-192.png`, `app/icons/icon-512.png`, `deploy/nginx-app.conf`, `deploy/README.md`; Modify `app/index.html`; Test `tests/manifest.test.js`

**Interfaces:** `sw.js` precaches the app shell (index, css, js, locales, icons) under cache name `xenoclient-v1` and serves them cache-first; it must **never** intercept requests outside `/app/` (so `/api/` and `/oauth/` always go to the network). Manifest: `start_url "/app/"`, `scope "/app/"`, `display "standalone"`, both icons, `theme_color`/`background_color` that suit both themes.

- [ ] **Step 1: Failing test:** parse the manifest; assert `start_url`, `scope`, `display` and the two icon sizes; assert `sw.js` source contains no cache handling for paths starting `/api/` or `/oauth/` (use a fetch-event unit test with a fake event if easier).
- [ ] **Step 2–4:** FAIL; implement; PASS.
- [ ] **Step 5:** `deploy/nginx-app.conf` is a `location /app/ { alias <dir>/app/; try_files $uri $uri/ /app/index.html; }` snippet with `Cache-Control: no-cache` for `sw.js`, plus `deploy/README.md` explaining how to mount the folder into the existing nginx container. The owner applies it to their nginx; do not edit their server config.
- [ ] **Step 6: Live check on Android Chrome:** the install prompt appears, the installed app opens standalone, an update to `sw.js` reaches the device after reload. **Step 7:** Commit.

### Task 10: Notifications

**Files:** Create `app/js/notifications.js`; Test `tests/notifications.test.js`

**Interfaces:** Produces `unreadCount(items: Notification[], lastSeenId: string|null): number`; `describeNotification(n: Notification, t): { icon: string, text: string, statusId: string|null }` — unknown `type` returns generic text key `notification.unknown`; `startPolling({api, intervalMs, onUpdate, isVisible}): () => void` (returns stop; skips a tick when `isVisible()` is false).

- [ ] **Step 1: Failing tests:** `unreadCount` with ids newer than `lastSeenId` counts them; `null` last-seen counts all; `describeNotification({type:"zzz"})` returns the generic key without throwing; a `favourite` notification returns the status id so the app can open the post with its thread; `startPolling` with a fake timer calls `onUpdate` per tick and not after stop.
- [ ] **Step 2–4:** FAIL; implement; PASS. **Step 5:** badge on the notifications tab; marks seen when the tab is opened. **Step 6:** Commit.

### Task 11: Acceptance on the real instance

**Files:** Create `docs/superpowers/notes/acceptance.md`

- [ ] **Step 1:** On Android, with the test user, walk the checklist and record pass/fail with a line each: login; home loads; cached timeline shows at second open; "new posts" indicator keeps position; dislike on/off persists after reload; thread expands in place with "show more"; reply; new post with image + alt text; offline send keeps text; theme light/dark/auto; language en/it/auto; install and standalone open; 401 (revoke the token on the server side, reload) returns to login once.
- [ ] **Step 2:** Fix anything that fails with a failing test first where logic is involved. **Step 3:** Commit notes.

---

## Self-review (done)

- **Spec coverage:** goals 1–4 → Tasks 4, 6, 8, 7; installable + cache → 9, 4; show only supported features → 5, 8 (no quote, no counts); theme → 3; i18n → 2; same-domain nginx → 9; login spike first → 1; notifications → 10; commit rule → Global Constraints; real-instance tests → 6, 8, 11.
- **Type consistency:** `getPage`, `setDislike`, `buildThread`, `limitVisible`, `renderStatusCard.actions` are named identically where consumed.
- **Proportion:** interfaces and assertions only; bodies left to the implementer.
