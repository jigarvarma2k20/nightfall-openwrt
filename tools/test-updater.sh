#!/bin/sh
# Isolated LuCI updater tests: update and rollback without OpenWrt/a router.
set -eu
cd "$(dirname "$0")/.." || exit 1
REPO=$(pwd)
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin" "$T/fixtures" "$T/stage/www/luci-static/nightfall" "$T/root/www/luci-static/nightfall" "$T/tmp"

# The archive contains one existing and one new file.
printf '{ "version": "2.0.0" }\n' > "$T/stage/www/luci-static/nightfall/version.json"
printf 'new css\n' > "$T/stage/www/luci-static/nightfall/cascade.css"
printf 'new only\n' > "$T/stage/www/luci-static/nightfall/new-only.txt"
mkdir -p "$T/stage/usr/share/ucode/luci/template/themes" "$T/stage/www/luci-static"
ln -s nightfall "$T/stage/usr/share/ucode/luci/template/themes/nightfall-dark"
ln -s nightfall "$T/stage/usr/share/ucode/luci/template/themes/nightfall-light"
ln -s nightfall "$T/stage/www/luci-static/nightfall-dark"
ln -s nightfall "$T/stage/www/luci-static/nightfall-light"
ln -s /etc/nightfall-bg.json "$T/stage/www/luci-static/nightfall/bg.json"
ln -s /etc/nightfall-prefs.json "$T/stage/www/luci-static/nightfall/prefs.json"
ln -s /etc/nightfall-logo.json "$T/stage/www/luci-static/nightfall/logo.json"
tar -czf "$T/fixtures/nightfall-root.tar.gz" -C "$T/stage" .
(cd "$T/fixtures" && sha256sum nightfall-root.tar.gz > nightfall-root.tar.gz.sha256)

# Simulate the network: the updater gets local fixtures via curl.
cat > "$T/bin/curl" <<'EOF'
#!/bin/sh
out=
url=
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o) out=$2; shift 2 ;;
    -*) shift ;;
    *) url=$1; shift ;;
  esac
done
archive=${NF_TEST_ARCHIVE:-nightfall-root.tar.gz}
case "$url" in
  */nightfall-root.tar.gz.sha256) cp "$NF_TEST_FIXTURES/$archive.sha256" "$out" ;;
  */nightfall-root.tar.gz) cp "$NF_TEST_FIXTURES/$archive" "$out" ;;
  *) exit 22 ;;
esac
EOF
chmod +x "$T/bin/curl"

# Replacing tar makes it possible to reproducibly break the version after extraction
# and separately simulate a failure to restore backup.tar.gz.
cat > "$T/bin/tar" <<'EOF'
#!/bin/sh
if [ "$1" = "-xzf" ] && [ "$2" = "$NF_TEST_TMP/nightfall-update/new.tar.gz" ]; then
  /bin/tar "$@" || exit $?
  shift 2
  while [ "$#" -gt 0 ]; do
    if [ "$1" = "-C" ]; then root=$2; break; fi
    shift
  done
  printf '{ "version": "9.9.9" }\n' > "$root/www/luci-static/nightfall/version.json"
  exit 0
fi
if [ "$1" = "-xzf" ] && [ "$2" = "$NF_TEST_TMP/nightfall-update/backup.tar.gz" ] && [ "$NF_TEST_FAIL_BACKUP" = "1" ]; then
  exit 1
fi
exec /bin/tar "$@"
EOF
chmod +x "$T/bin/tar"

UPDATER="$REPO/luci-app-nightfall-monitor/root/usr/libexec/nightfall-update"
run_case() {
  root=$1; tmp=$2; fail_backup=$3
  mkdir -p "$root/www/luci-static/nightfall" "$tmp"
  printf '{ "version": "1.0.0" }\n' > "$root/www/luci-static/nightfall/version.json"
  printf 'old css\n' > "$root/www/luci-static/nightfall/cascade.css"
  set +e
  PATH="$T/bin:/usr/bin:/bin" \
    NF_ROOT="$root" NF_TMP="$tmp" NF_BASE="https://fixture" NF_NORELOAD=1 \
    NF_TEST_FIXTURES="$T/fixtures" NF_TEST_TMP="$tmp" NF_TEST_FAIL_BACKUP="$fail_backup" NF_TEST_ARCHIVE="${4:-nightfall-root.tar.gz}" \
    sh "$UPDATER" run >/dev/null 2>&1
  rc=$?
  set -e
  [ "$rc" -ne 0 ]
}

echo "== successful rollback after a post-install version check error =="
R="$T/root-ok"; D="$T/tmp-ok"
if run_case "$R" "$D" 0 &&
   grep -q '"state":"rolledback"' "$D/nightfall-update.status" &&
   grep -q '"version": "1.0.0"' "$R/www/luci-static/nightfall/version.json" &&
   [ "$(cat "$R/www/luci-static/nightfall/cascade.css")" = "old css" ] &&
   [ ! -e "$R/www/luci-static/nightfall/new-only.txt" ]; then
  echo "ok   old files restored, new ones deleted, status rolledback"
else
  echo "FAIL successful rollback: $(cat "$D/nightfall-update.status" 2>/dev/null)"
  exit 1
fi

echo "== tar failure while restoring the backup =="
R="$T/root-fail"; D="$T/tmp-fail"
if run_case "$R" "$D" 1 &&
   grep -q '"state":"rollback_failed"' "$D/nightfall-update.status" &&
   grep -q 'CRITICAL ERROR' "$D/nightfall-update.status" &&
   ! grep -q 'the previous files were restored' "$D/nightfall-update.status" &&
   [ ! -e "$R/www/luci-static/nightfall/new-only.txt" ]; then
  echo "ok   rollback error reported as rollback_failed, no false success"
else
  echo "FAIL rollback tar failure: $(cat "$D/nightfall-update.status" 2>/dev/null)"
  exit 1
fi


echo "== standard symlinks accepted, foreign ones rejected =="
mkdir -p "$T/malicious/www/luci-static/nightfall"
cp "$T/stage/www/luci-static/nightfall/version.json" "$T/malicious/www/luci-static/nightfall/version.json"
ln -s ../../../../etc/passwd "$T/malicious/www/luci-static/nightfall/escape"
tar -czf "$T/fixtures/nightfall-malicious.tar.gz" -C "$T/malicious" .
(cd "$T/fixtures" && sha256sum nightfall-malicious.tar.gz > nightfall-malicious.tar.gz.sha256)
R="$T/root-malicious"; D="$T/tmp-malicious"
if run_case "$R" "$D" 0 nightfall-malicious.tar.gz &&
   grep -q '"state":"error"' "$D/nightfall-update.status" &&
   [ ! -e "$R/etc/passwd" ]; then
  echo "ok   archive with symlink rejected before extraction"
else
  echo "FAIL archive with symlink was not safely rejected: $(cat "$D/nightfall-update.status" 2>/dev/null)"
  exit 1
fi

echo "TOTAL: LuCI updater security/rollback tests passed"
