# Deploying Stabbyclient behind nginx

The app is static files served from the **same domain** as the stabbypossum instance,
under `/app/`. stabbypossum is not involved and is never modified.

Current production layout (x.y05.eu): nginx runs on the host (not in Docker),
site file `/etc/nginx/sites-available/xenomorph`, files in `/var/www/xenoclient/app/`.

1. Install the repository's `app/` folder on the host: `tools/deploy.sh root@HOST`. It stamps the
   commit as the version shown in the app's menu, then sends the archive together with
   `tools/remote-install.sh`, which runs as root on the host: it replaces `/var/www/xenoclient/app`
   as a whole (so a file removed from the app is removed from the host), keeps the previous version
   in `app.prev` beside it, makes the files root-owned and read-only for the web server, and refuses
   symbolic links. The web root `/var/www/xenoclient` is made root-owned and closed to others.
2. Paste `deploy/nginx-app.conf` into the HTTPS `server { }` block **before**
   `location / {` (adjust the `alias` paths), run `nginx -t`, then reload nginx.
   A user named `app` on the instance would be shadowed by `/app/`.
3. Optional, and off by default (`SEARCH_INDEX` in `app/js/config.js`; the app uses the server's own search, which now answers words quickly and pages): the search service. `tools/deploy-search.sh root@HOST` builds
   `search-index/` here and installs it as the systemd service `stabby-search` (user
   `stabbysearch`, reads `/srv/xenomorph/data` read-only, listens on 127.0.0.1:8002 only). nginx is
   a manual step: the `location /app/search/` block of `deploy/nginx-app.conf` (before
   `location /app/`), `nginx -t`, reload. `curl -s http://127.0.0.1:8002/v1/status` on the host
   shows the counts and `"format":"ok"`; if the service is missing or down the app searches
   through the server as before.
4. Open `https://<instance domain>/app/` on Android Chrome, log in, then use
   Chrome's "Install app" / "Add to Home screen".
5. Updating = repeat step 1. Everything under `/app/` is served with `no-cache` (and the
   service worker revalidates what it fetches), so a device picks up the new version on
   the next online open; the menu's version line says which one it is running.

Local trial without touching nginx: `node tools/dev-proxy.mjs https://<instance> 8099`
serves `app/` at `http://localhost:8099/app/` and forwards everything else to the
instance (same-origin emulation). `tools/e2e-smoke.mjs` drives it in headless Chromium;
set `STABBY_BASE=https://<instance>` to run it against the deployed app instead.
