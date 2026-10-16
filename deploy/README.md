# Deploying Xenoclient behind the existing nginx

The app is static files served from the **same domain** as the xenomorph instance,
under `/app/`. xenomorph is not involved and is never modified.

1. Make the repository's `app/` folder visible to the nginx container, e.g. add a
   volume `- /path/to/xenoclient/app:/srv/xenoclient/app:ro` to the nginx service.
2. Paste `deploy/nginx-app.conf` into the instance's `server { }` block (adjust the
   `alias` path to the mount point) and reload nginx.
3. Open `https://<instance domain>/app/` on Android Chrome, log in, then use
   Chrome's "Install app" / "Add to Home screen".
4. Updating = replace the files; `sw.js` is served with `no-cache`, so the phone
   picks up the new version on the next online open.

Local trial without touching nginx: `node tools/dev-proxy.mjs https://<instance> 8099`
serves `app/` at `http://localhost:8099/app/` and forwards everything else to the
instance (same-origin emulation).
