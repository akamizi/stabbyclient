#!/bin/sh
# Runs on the host. Installs the app/ tree that arrives as a tar stream on stdin under the web
# root given as $1, replacing the old one as a whole (so a file removed from the app is removed
# from the host too) and keeping the version before it in app.prev, one back.
#
# It runs as root, so it takes care that nobody else can steer it: the web root is made
# root-owned and closed to others, the staging directory is private and made by mktemp, the
# files are installed root-owned and read-only to the web server (nginx only reads them), and
# symbolic links are refused (as the web root, as app or app.prev, and inside the archive).
set -eu
umask 022
base=${1:?usage: remote-install.sh WEB_ROOT < app.tar}
refuse() { echo "refusing to install: $1" >&2; exit 1; }
[ ! -L "$base" ] || refuse "$base is a symbolic link"
mkdir -p "$base"
if [ "$(id -u)" = 0 ]; then
  chown root:root "$base"
  chmod 755 "$base"
fi
for p in "$base/app" "$base/app.prev"; do
  [ ! -L "$p" ] || refuse "$p is a symbolic link"
done
incoming=$(mktemp -d "$base/.incoming.XXXXXX")
trap 'rm -rf "$incoming"' EXIT
tar --no-same-owner -C "$incoming" -xf -
[ -f "$incoming/app/index.html" ] || refuse "no app/index.html in the archive"
[ -z "$(find "$incoming" -type l -print -quit)" ] || refuse "the archive holds a symbolic link"
chmod -R u=rwX,go=rX "$incoming/app"
if [ "$(id -u)" = 0 ]; then chown -R root:root "$incoming/app"; fi
rm -rf "$base/app.prev"
if [ -d "$base/app" ]; then mv "$base/app" "$base/app.prev"; fi
mv "$incoming/app" "$base/app"
