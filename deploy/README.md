# Deploying Xenoclient behind nginx

The app is static files served from the **same domain** as the xenomorph instance,
under `/app/`. xenomorph is not involved and is never modified.

Current production layout (x.y05.eu): nginx runs on the host (not in Docker),
site file `/etc/nginx/sites-available/xenomorph`, files in `/var/www/xenoclient/app/`.

1. Copy the repository's `app/` folder to `/var/www/xenoclient/app/` (owner `www-data`):
   `tar -cf - app | ssh root@HOST 'mkdir -p /var/www/xenoclient && tar -C /var/www/xenoclient -xf - && chown -R www-data:www-data /var/www/xenoclient'`
2. Paste `deploy/nginx-app.conf` into the HTTPS `server { }` block **before**
   `location / {` (adjust the `alias` paths), run `nginx -t`, then reload nginx.
   A user named `app` on the instance would be shadowed by `/app/`.
3. Open `https://<instance domain>/app/` on Android Chrome, log in, then use
   Chrome's "Install app" / "Add to Home screen".
4. Updating = repeat step 1; `sw.js` is served with `no-cache`, so the phone picks up
   the new version on the next online open.

Local trial without touching nginx: `node tools/dev-proxy.mjs https://<instance> 8099`
serves `app/` at `http://localhost:8099/app/` and forwards everything else to the
instance (same-origin emulation). `tools/e2e-smoke.mjs` drives it in headless Chromium;
set `XENO_BASE=https://<instance>` to run it against the deployed app instead.
