# Login spike — results (2026-10-16)

Run against `https://x.y05.eu` with the test user, through `tools/dev-proxy.mjs`
(local stand-in for the nginx `/app/` setup) and `curl`. The Chrome extension was
not connected, so the browser flow itself is **not yet verified**; the server side is.

- `POST /api/v1/apps` (client_name, redirect_uris, scope) → ok; any `redirect_uris`
  value is accepted verbatim (`http://localhost:8099/app/` worked).
- `GET /oauth/authorize?response_type=code&client_id&redirect_uri&scope&state` →
  server-rendered login page. The form has a nonce (`xeno_ui_nonce`) and a
  short-lived Secure cookie `xenomorph_gate` (300 s); the form posts to
  `/oauth/x-snac-login` on the instance host. `scope` is not in the form.
- Login → `303` to `redirect_uri?code=…&state=…` (state preserved).
- `POST /oauth/token` (authorization_code + client_id + client_secret +
  redirect_uri + code) → `access_token`, `token_type Bearer`,
  `scope "read write follow"`. Scopes `read write follow` are accepted.
- `verify_credentials` with the token → 200.
- **Quirk:** `verify_credentials` with a missing/invalid token answers **422**, not
  401. `timelines/home` and `notifications` answer 401. The client treats 422 on
  `verify_credentials` as "session invalid" (ruling, with test).
- Responses from xenomorph carry `content-security-policy: default-src 'none'; …`.
  That is on xenomorph's own pages; nginx must not add a global CSP to `/app/`
  (see deploy notes), or the app's scripts would be blocked.

Open: browser/Android check of the redirect round-trip; `disliked` flag in
`/context` and notifications (Task 6).
