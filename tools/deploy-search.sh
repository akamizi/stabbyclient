#!/bin/sh
# Builds the search service here and installs it on the instance host as a systemd service.
# Usage: tools/deploy-search.sh root@HOST
# nginx is not touched: the location is a manual step (deploy/README.md).
set -eu
HOST=${1:?usage: tools/deploy-search.sh root@HOST}
HERE=$(cd "$(dirname "$0")/.." && pwd)
MANIFEST="$HERE/search-index/Cargo.toml"
cargo build --release --manifest-path "$MANIFEST"
TARGET=$(cargo metadata --manifest-path "$MANIFEST" --format-version 1 --no-deps | python3 -c 'import json,sys;print(json.load(sys.stdin)["target_directory"])')
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
cp "$TARGET/release/stabby-search" "$STAGE/stabby-search"
cp "$HERE/search-index/deploy/stabby-search.service" "$STAGE/stabby-search.service"
# Runs as root on the host, reads the two files from a tar stream on stdin (as tools/deploy.sh does).
REMOTE=$(base64 -w0 <<'SCRIPT'
set -eu
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
tar --no-same-owner -C "$tmp" -xf -
# systemd takes a group by name only: the container's gid 10001 has none on the host.
getent group 10001 >/dev/null || groupadd --gid 10001 xenomorph-data
id stabbysearch >/dev/null 2>&1 || useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin stabbysearch
install -o root -g root -m 755 "$tmp/stabby-search" /usr/local/bin/stabby-search
install -o root -g root -m 644 "$tmp/stabby-search.service" /etc/systemd/system/stabby-search.service
systemctl daemon-reload
systemctl enable stabby-search
systemctl restart stabby-search
sleep 2
systemctl --no-pager --lines=5 status stabby-search || true
SCRIPT
)
tar -C "$STAGE" -cf - stabby-search stabby-search.service | ssh "$HOST" "sh -c \"\$(echo $REMOTE | base64 -d)\" install-search"
echo "installed the search service on $HOST"
