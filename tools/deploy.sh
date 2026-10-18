#!/bin/sh
# Publishes app/ to the instance host with the commit stamped into config.js.
# Usage: tools/deploy.sh root@HOST
set -eu
HOST=${1:?usage: tools/deploy.sh root@HOST}
HERE=$(cd "$(dirname "$0")/.." && pwd)
VERSION=$(git -C "$HERE" rev-parse --short HEAD)$(git -C "$HERE" diff --quiet HEAD -- app || echo "+local")
# Scratch files (previews, probes) must never reach the host.
if ls "$HERE"/app/_* >/dev/null 2>&1; then
  echo "refusing to deploy: scratch files in app/: $(ls -d "$HERE"/app/_*)" >&2
  exit 1
fi
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
cp -a "$HERE/app" "$STAGE/app"
sed -i "s|export const VERSION = \"dev\";|export const VERSION = \"$VERSION\";|" "$STAGE/app/js/config.js"
tar -C "$STAGE" -cf - app | ssh "$HOST" 'mkdir -p /var/www/xenoclient && tar -C /var/www/xenoclient -xf - && chown -R www-data:www-data /var/www/xenoclient'
echo "deployed $VERSION"
