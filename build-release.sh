#!/bin/sh
# Builds dist/nightfall-root.tar.gz: the files that install.sh/install-update.sh place on the router.
# Run from the repository root:  sh build-release.sh
set -e
cd "$(dirname "$0")"
OUT=$(pwd)/dist
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
for pkg in luci-theme-nightfall luci-app-nightfall-monitor; do
	[ -d "$pkg/htdocs" ] && { mkdir -p "$STAGE/www"; cp -a "$pkg/htdocs/." "$STAGE/www/"; }
	[ -d "$pkg/root" ]   && cp -a "$pkg/root/." "$STAGE/"
	[ -d "$pkg/ucode" ]  && { mkdir -p "$STAGE/usr/share/ucode/luci"; cp -a "$pkg/ucode/." "$STAGE/usr/share/ucode/luci/"; }
done
# symlinks are not stored in the repository (they break on Windows), so create them here
ln -s nightfall "$STAGE/www/luci-static/nightfall-light"
ln -s nightfall "$STAGE/www/luci-static/nightfall-dark"
ln -s nightfall "$STAGE/usr/share/ucode/luci/template/themes/nightfall-light"
ln -s nightfall "$STAGE/usr/share/ucode/luci/template/themes/nightfall-dark"
ln -s /etc/nightfall-prefs.json "$STAGE/www/luci-static/nightfall/prefs.json"
ln -s /etc/nightfall-logo.json "$STAGE/www/luci-static/nightfall/logo.json"
ln -s /etc/nightfall-bg.json "$STAGE/www/luci-static/nightfall/bg.json"
# theme version for the About page: from the release tag (VERSION=v1.0.4), build = today's date
V=${VERSION#v}
[ -n "$V" ] && printf '{ "version": "%s", "build": "%s" }\n' "$V" "$(date -u +%Y%m%d)" > "$STAGE/www/luci-static/nightfall/version.json"
# asset cache version in header.ut (?v=…) = release number: after an update the browser does not keep old CSS and JS
H="$STAGE/usr/share/ucode/luci/template/themes/nightfall/header.ut"
[ -n "$V" ] && [ -f "$H" ] && sed -i -E "s/[0-9]{8}[a-z]/$V/g" "$H"
# changelog: the theme shows it after an update
[ -f CHANGELOG.md ] && cp CHANGELOG.md "$STAGE/www/luci-static/nightfall/CHANGELOG.md"
# execute permissions (lost in git on Windows)
chmod 755 "$STAGE"/usr/libexec/nightfall-* "$STAGE"/etc/init.d/nightfall-collector "$STAGE"/etc/uci-defaults/* 2>/dev/null || true
mkdir -p "$OUT"
# owner root:root, so files on the router do not get a foreign uid
tar --owner=0 --group=0 --numeric-owner -czf "$OUT/nightfall-root.tar.gz" -C "$STAGE" . 2>/dev/null \
	|| tar -czf "$OUT/nightfall-root.tar.gz" -C "$STAGE" .
# checksum: the in-UI update uses it to verify the archive
( cd "$OUT" && sha256sum nightfall-root.tar.gz > nightfall-root.tar.gz.sha256 )
echo "Done: $OUT/nightfall-root.tar.gz (+ .sha256)"
