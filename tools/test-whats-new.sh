#!/bin/sh
set -eu
SRC="luci-theme-nightfall/htdocs/luci-static/nightfall/nightfall.js"
grep -q "ACKKEY = 'nightfall-whatsnew-ack-v1'" "$SRC"
grep -q "function versionParts(s)" "$SRC"
grep -q "if (x.pre && !y.pre) return true" "$SRC"
grep -q "var legacy = !ack && !!seen;" "$SRC"
grep -q "lsSet(ACKKEY, cur); lsSet(SEENKEY, cur); closeUpd();" "$SRC"
grep -q "catch(function () { /\* not marked as seen: retry after the next sign-in \*/ });" "$SRC"
node tools/test-whats-new.js
echo "What's new window recovery check passed."
grep -q "function showWhatsNew()" "$SRC"
grep -qF "text: 'What\\'s new', onclick: showWhatsNew" "$SRC"
grep -q "Do not acknowledge: the CHANGELOG may not be published" "$SRC"
VERSION=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' luci-theme-nightfall/htdocs/luci-static/nightfall/version.json)
[ -n "$VERSION" ]
sh tools/check-release.sh "v$VERSION"
if sh tools/check-release.sh v9.9.9 >/dev/null 2>&1; then
  echo "Error: the check accepted a release without a CHANGELOG section" >&2
  exit 1
fi
