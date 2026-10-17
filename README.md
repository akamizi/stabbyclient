# Xenoclient

A web client for xenomorph, the ActivityPub server in Ada derived from snac2. It is a static installable app (PWA, aimed at Android Chrome), written
for the subset of the Mastodon API that xenomorph really implements, and for the
extras xenomorph has and ordinary Mastodon clients do not show: **dislike**, groups,
drafts and scheduled posts, "admirations".

It is not part of xenomorph and needs nothing from it: only static files, served from the
same domain as the instance, under `/app/`.

## What it does

- **Timelines**: Home, Federated and Groups, with a "N new posts" button in the header, a
  check for newer posts every minute while the app is open, and the last timeline shown at
  once on opening (cached on the device).
- **Posts**: like, **dislike**, boost, reply, quote; the post's hidden menu: emoji reaction, save,
  hide, pin, edit, delete, report. Threads open in place (the replies below, the earlier
  posts above); polls can be voted on; pictures open full size; custom emoji are shown.
- **Writing**: text format (Markdown, plain, HTML with a small editor for bold, italic and
  strike-through), content warning, visibility, group, language, draft or scheduled, images,
  video and audio, pictures from a web address, polls, an emoji panel; in a pop-up.
- **More** menu, as in xenomorph's own: search, bookmarks, admirations, drafts, scheduled
  posts, pinned posts, following (and following someone by handle), followers, follow requests,
  followed hashtags, lists.
- **Profiles**: bio, fields, posts, who follows whom; follow, block, mute, direct message.
- **Notifications** with a read position kept on the server (two devices agree), and the
  instance's announcements.
- Light, dark or automatic theme; English and Italian (one catalogue per language in
  `app/js/locales/`; adding a language is adding a catalogue and listing it in `app/js/app.js`).
- A line in the settings menu (☰) with the version and the last check of each timeline, to
  tell at a glance what a device is running.

Not there yet: the RSS/Atom feeds page and xenomorph's Settings pages (profile editing,
advanced, people, instance setup), which are server pages and not API.

## Installing it on an instance

The app must be served **under `/app/` of the instance's own domain**: the API and login are
called with paths from the root of that domain and the login comes back to
`https://<domain>/app/`. See [`deploy/README.md`](deploy/README.md) for the details. In short:

1. Copy `app/` to the host: `tools/deploy.sh root@HOST` (it stamps the commit as the version
   shown in the menu, then does `tar | ssh` and the `chown`; edit the target directory in the
   script if it differs).
2. Add the two `location` blocks of [`deploy/nginx-app.conf`](deploy/nginx-app.conf) to the
   instance's HTTPS `server { }`, before `location / {`, adjusting the `alias` path, then
   `nginx -t` and reload. They set `Cache-Control: no-cache` (otherwise browsers keep old
   scripts for hours) and a strict Content-Security-Policy for `/app/` only.
3. Open `https://<domain>/app/`, log in, then use the browser's "Install app".

An instance user called `app` would be hidden by `/app/`. The server must be xenomorph: the
groups, drafts, admirations and dislike routes do not exist elsewhere.

Updating is repeating step 1; devices pick the new version on their next online open.

## Development

No build step and no runtime dependencies: plain ES modules. A recent Node (with the built-in test runner, `node:test`) is enough.

```sh
npm install        # linkedom, for the tests
npm test           # unit tests (node --test)
```

- `tools/dev-proxy.mjs https://<instance> 8099` serves `app/` at `http://localhost:8099/app/`
  and forwards everything else to the instance, as nginx would. It sends the same
  Content-Security-Policy as `deploy/nginx-app.conf`.
- `tools/e2e-smoke.mjs <user>` drives the app in headless Chromium against a real
  instance (`XENO_TEST_PW` for the password; `XENO_BASE=https://<instance>` to test the
  deployed copy instead of the proxy). Use a **test account**: the run writes and deletes posts.
- `tools/deploy.sh root@HOST` publishes, as above.

Layout: `app/index.html`, `app/js/*.js` (one module per concern: `api.js`, `auth.js`,
`timeline.js`, `status-card.js`, `composer.js`, `more.js`, `profile.js`, …), `app/css/app.css`,
`app/sw.js` (service worker), `app/manifest.webmanifest`, `tests/`, `deploy/`, `tools/`.
Design and plan are in `docs/superpowers/`.

## Things about xenomorph worth knowing

Measured against a real instance; the client works around them where it can.

- Lists (Home, a profile's posts) lag a few seconds behind a new post, keep a post's reply
  and boost counts as they were when it arrived, and keep deleted posts. The client re-reads
  the first ten posts on screen from the post itself to correct this.
- `DELETE /api/v1/statuses/:id` answers 500 for a post that has replies or that its author
  has liked; the client says so.
- `dislikes_count` is always 0 (only "did I dislike it" is known); there is no push and no
  streaming, so notifications come from polling while the app is open.
- Some routes (drafts, scheduled posts, admirations, mute, hide, remote picture addresses)
  answer only to requests carrying the `X-Xenomorph-UI: 1` header; the client sends it on
  exactly those.

## Security notes

The login token is kept in the browser's `localStorage`. Mitigations: all post HTML is
rebuilt through an allow-list sanitizer, addresses used for pictures and links must be
`http(s)`, there are no third-party scripts, and `/app/` has its own strict
Content-Security-Policy. Logging out removes the account's cached timelines and drafts from the device.
