#!/bin/sh
# Pre-release check: ./tools/check.sh [previous_tag]
# Catches truncated CSS/JS, unbalanced braces, JS and sh syntax errors.
cd "$(dirname "$0")/.." || exit 1
fail=0
err() { echo "ERROR: $*"; fail=1; }
T=luci-theme-nightfall/htdocs/luci-static
M=luci-app-nightfall-monitor/htdocs/luci-static
FILES="$T/nightfall/cascade.css $T/nightfall/mobile.css $T/nightfall/nightfall.js $T/nightfall/nightfall-empty.js $T/resources/nightfall-overview.js $M/resources/view/nightfall/monitor.js"

prev=${1:-$(git tag --sort=-v:refname 2>/dev/null | head -1)}
echo "== Sizes (compared with ${prev:-—}) =="
for f in $FILES; do
  [ -f "$f" ] || { err "missing file $f"; continue; }
  now=$(wc -c < "$f")
  old=0
  [ -n "$prev" ] && old=$(git show "$prev:$f" 2>/dev/null | wc -c)
  echo "$f: $now (was $old)"
  # shrinking by more than 10% suggests truncation
  if [ "$old" -gt 0 ] && [ $((now * 100 / old)) -lt 90 ]; then err "$f shrank by more than 10%"; fi
done

echo "== CSS brace balance =="
for f in $T/nightfall/*.css; do
  o=$(tr -cd '{' < "$f" | wc -c); c=$(tr -cd '}' < "$f" | wc -c)
  [ "$o" = "$c" ] && echo "$f: ok ($o)" || err "$f: { = $o, } = $c"
done

echo "== node --check =="
if command -v node >/dev/null; then
  for f in $(find luci-theme-nightfall luci-app-nightfall-monitor -name '*.js'); do
    node --check "$f" 2>/dev/null || {
      # LuCI modules use 'require ...' strings; that is valid JS, so the error is real
      err "JS syntax: $f"; }
  done
fi

echo "== sh -n =="
for f in luci-app-nightfall-monitor/root/usr/libexec/* *.sh; do
  head -1 "$f" | grep -q 'sh' || continue
  sh -n "$f" 2>/dev/null || err "sh: $f"
done

echo "== Monitor options: each one has a default value =="
DEFC=luci-app-nightfall-monitor/root/usr/share/nightfall/nightfall-monitor.conf.default
for k in $(sed -n 's/^KEYS="\(.*\)"/\1/p' luci-app-nightfall-monitor/root/usr/libexec/nightfall-config); do
  grep -q "^$k=" "$DEFC" || err "$DEFC has no $k line (the page would show an empty field and fail to save)"
done

echo "== VPN accounting ==\n"
sh tools/test-vpn-accounting.sh || err "VPN accounting check"

echo "== Application catalog ==\n"
sh tools/test-app-catalog.sh || err "app catalog check"
echo "== DNS app map ==\n"
sh tools/test-dns-map.sh || err "DNS app map check"
if command -v node >/dev/null; then node tools/test-app-traffic-ui.js || err "app statistics UI check"; fi
if command -v node >/dev/null; then node tools/test-app-traffic-monitor.js || err "monitor Traffic tab check"; fi

echo "== Cache version =="
b=$(grep -o '[0-9]\{8\}[a-z]' luci-theme-nightfall/ucode/template/themes/nightfall/header.ut | sort -u)
echo "$b"
[ "$(echo "$b" | wc -l | tr -d " ")" = 1 ] || err "header.ut has mixed cache versions"

echo "== Theme version =="
cv=$(sed -n 's/^## v\([^ ·]*\) ·.*/\1/p' CHANGELOG.md | head -n 1)
vv=$(sed -n 's/.*"version"[^"]*"\([^"]*\)".*/\1/p' luci-theme-nightfall/htdocs/luci-static/nightfall/version.json)
echo "CHANGELOG: $cv, version.json: $vv"
[ -n "$cv" ] && [ "$cv" = "$vv" ] || err "version.json ($vv) does not match the top entry of CHANGELOG.md ($cv)"

[ $fail = 0 ] && echo "ALL OK" || { echo "ERRORS FOUND"; exit 1; }
