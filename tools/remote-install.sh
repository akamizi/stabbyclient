#!/bin/sh
# Runs on the host. Installs the app/ tree that arrives as a tar stream on stdin under the web
# root given as $1, replacing the old one as a whole (so a file removed from the app is removed
# from the host too) and keeping the version before it in app.prev, one back.
set -eu
base=${1:?usage: remote-install.sh WEB_ROOT < app.tar}
mkdir -p "$base"
incoming="$base/.incoming.$$"
rm -rf "$incoming"
mkdir "$incoming"
trap 'rm -rf "$incoming"' EXIT
tar -C "$incoming" -xf -
if [ ! -f "$incoming/app/index.html" ]; then
  echo "refusing to install: no app/index.html in the archive" >&2
  exit 1
fi
if [ "$(id -u)" = 0 ]; then chown -R www-data:www-data "$incoming/app"; fi
rm -rf "$base/app.prev"
if [ -d "$base/app" ]; then mv "$base/app" "$base/app.prev"; fi
mv "$incoming/app" "$base/app"
