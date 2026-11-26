#!/bin/sh
# Tests for install-update.sh, install.sh and uninstall.sh without a router: the "router" root is a temp folder (NF_ROOT),
# "GitHub" is a local http server. Run from the repository root: sh tools/test-install.sh
cd "$(dirname "$0")/.." || exit 1
REPO=$(pwd)
T=$(mktemp -d); PIDF=$T/srv.pid
trap 'kill $(cat "$PIDF" 2>/dev/null) 2>/dev/null; rm -rf "$T"' EXIT
ok=0; bad=0
pass() { ok=$((ok + 1)); echo "ok   $*"; }
fail() { bad=$((bad + 1)); echo "FAIL $*"; }
check() { # description, command...
	d=$1; shift
	if "$@" >/dev/null 2>&1; then pass "$d"; else fail "$d"; fi
}
has() { grep -q -- "$2" "$1" 2>/dev/null; }

# --- "releases": version N -> archive with version.json and a few files ---
mkrel() { # version [version_inside_archive]
	v=$1; inner=${2:-$1}
	s=$T/stage.$v; rm -rf "$s"
	mkdir -p "$s/www/luci-static/nightfall" "$s/usr/libexec" "$s/etc/init.d" "$s/usr/share/luci/menu.d"
	printf '{ "version": "%s" }\n' "$inner" > "$s/www/luci-static/nightfall/version.json"
	echo "css $v" > "$s/www/luci-static/nightfall/cascade.css"
	printf '#!/bin/sh\necho %s\n' "$v" > "$s/usr/libexec/nightfall-config"
	printf '#!/bin/sh\n' > "$s/etc/init.d/nightfall-collector"
	echo '{}' > "$s/usr/share/luci/menu.d/luci-theme-nightfall.json"
	mkdir -p "$s/usr/share/ucode/luci/template/themes" "$s/www/luci-static"
	ln -s nightfall "$s/usr/share/ucode/luci/template/themes/nightfall-dark"
	ln -s nightfall "$s/usr/share/ucode/luci/template/themes/nightfall-light"
	ln -s nightfall "$s/www/luci-static/nightfall-dark"
	ln -s nightfall "$s/www/luci-static/nightfall-light"
	ln -s /etc/nightfall-bg.json "$s/www/luci-static/nightfall/bg.json"
	ln -s /etc/nightfall-prefs.json "$s/www/luci-static/nightfall/prefs.json"
	ln -s /etc/nightfall-logo.json "$s/www/luci-static/nightfall/logo.json"
	d=$T/www/dl/download/v$v; mkdir -p "$d"
	tar -czf "$d/nightfall-root.tar.gz" -C "$s" .
	( cd "$d" && sha256sum nightfall-root.tar.gz > nightfall-root.tar.gz.sha256 )
}
mkrel 1.0.0; mkrel 2.0.0; mkrel 3.0.0 2.0.0   # release v3.0.0 contains an archive of version 2.0.0 (publishing mistake)
mkdir -p "$T/www/dl/latest"; cp -r "$T/www/dl/download/v2.0.0" "$T/www/dl/latest/download"
printf '{ "tag_name": "v2.0.0", "name": "v2.0.0" }\n' > "$T/www/api.json"
printf '{ "version": "2.0.0" }\n' > "$T/www/latest.json"

PORT=$((20000 + $$ % 20000))
( cd "$T/www" && exec python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 ) &
echo $! > "$PIDF"
i=0; while [ $i -lt 30 ]; do curl -fs "http://127.0.0.1:$PORT/api.json" >/dev/null 2>&1 && break; sleep 0.2; i=$((i + 1)); done
B="http://127.0.0.1:$PORT"

# run like "wget -qO- URL | sh -s -- ...": the script comes from stdin, $0 = sh
run() { # root, options...
	r=$1; shift
	mkdir -p "$r" "$T/tmp"
	cat "$REPO/install-update.sh" | NF_ROOT="$r" NF_TMP="$T/tmp" NF_API="${API:-$B/api.json}" NF_RAW="$B" NF_DL="$B/dl" sh -s -- "$@" 2>&1
}
ver() { sed -n 's/.*"version"[^"]*"\([^"]*\)".*/\1/p' "$1/www/luci-static/nightfall/version.json" 2>/dev/null; }

printf '[ { "tag_name": "v2.0.0" }, { "tag_name": "v1.9.0" } ]\n' > "$T/www/list.json"
echo "== version list =="
out=$(NF_ROOT="$T/rl" NF_TMP="$T/tmp" NF_APILIST="$B/list.json" sh "$REPO/install-update.sh" --list 2>&1)
case "$out" in *v2.0.0*v1.9.0*) pass "--list shows versions" ;; *) fail "--list: $out" ;; esac

echo "== fresh install =="
R=$T/r1
out=$(run "$R"); echo "$out" | sed 's/^/   | /'
[ "$(ver "$R")" = 2.0.0 ] && pass "latest version 2.0.0 is installed" || fail "version after install: $(ver "$R")"
echo "$out" | grep -q "Installed version 2.0.0" && pass "the installed version is reported at the end" || fail "no installed-version line"
[ -x "$R/usr/libexec/nightfall-config" ] && pass "scripts are executable" || fail "no execute permission"

echo "== old archive in /tmp is not used (v1.0.9 from a report) =="
R=$T/r2
mkdir -p "$T/tmp"; cp "$T/www/dl/download/v1.0.0/nightfall-root.tar.gz" "$T/tmp/nightfall-root.tar.gz"; cp "$T/www/dl/download/v1.0.0/nightfall-root.tar.gz" "$T/tmp/nightfall-root_tar.gz"
run "$R" >/dev/null
[ "$(ver "$R")" = 2.0.0 ] && pass "2.0.0 installed despite the old archive in /tmp" || fail "installed $(ver "$R") (old archive used?)"

echo "== rerun and update =="
out=$(run "$R"); echo "$out" | grep -q "Already installed" && pass "rerun: \"already installed\"" || fail "rerun not detected: $out"
R=$T/r3; run "$R" --version v1.0.0 >/dev/null
[ "$(ver "$R")" = 1.0.0 ] && pass "--version v1.0.0 installs the old version" || fail "--version: $(ver "$R")"
out=$(run "$R"); echo "$out" | grep -q "(was 1.0.0)" && [ "$(ver "$R")" = 2.0.0 ] && pass "update 1.0.0 -> 2.0.0 shows \"was 1.0.0\"" || fail "update: $out"
out=$(run "$R" --force); echo "$out" | grep -q "Installed version 2.0.0" && pass "--force reinstalls" || fail "--force: $out"
out=$(run "$R" --check); echo "$out" | grep -q "No update needed" && pass "--check with an up-to-date version" || fail "--check: $out"
out=$(run "$T/r3b" --check); echo "$out" | grep -q "Update available" && pass "--check on a clean system" || fail "--check (clean): $out"

echo "== update when a rollback backup cannot be created =="
R=$T/r10; run "$R" --version v1.0.0 >/dev/null
mkdir -p "$T/failtar"
cat > "$T/failtar/tar" <<'EOF'
#!/bin/sh
case "$1:$2" in
  -czf:*backup.tar.gz) exit 1 ;;
esac
exec /bin/tar "$@"
EOF
chmod +x "$T/failtar/tar"
out=$(cat "$REPO/install-update.sh" | env PATH="$T/failtar:$PATH" NF_ROOT="$R" NF_TMP="$T/tmp" NF_API="$B/api.json" NF_RAW="$B" NF_DL="$B/dl" sh -s -- 2>&1)
echo "$out" | grep -q "update cancelled" && [ "$(ver "$R")" = 1.0.0 ] && pass "a backup error stops the update before files are replaced" || fail "update continued or changed the version: $out"

echo "== rollback on version mismatch after extraction =="
R=$T/r11; run "$R" --version v1.0.0 >/dev/null
mkdir -p "$T/mismatch-tar"
cat > "$T/mismatch-tar/tar" <<'EOF'
#!/bin/sh
case "$1:$2" in
  -xzf:*nightfall-root.tar.gz)
    archive=$2; shift 2
    /bin/tar -xzf "$archive" "$@" || exit $?
    while [ $# -gt 0 ]; do
      if [ "$1" = -C ]; then root=$2; break; fi
      shift
    done
    printf '{ "version": "9.9.9" }\\n' > "$root/www/luci-static/nightfall/version.json"
    exit 0
    ;;
esac
exec /bin/tar "$@"
EOF
chmod +x "$T/mismatch-tar/tar"
out=$(cat "$REPO/install-update.sh" | env PATH="$T/mismatch-tar:$PATH" NF_ROOT="$R" NF_TMP="$T/tmp" NF_API="$B/api.json" NF_RAW="$B" NF_DL="$B/dl" sh -s -- 2>&1)
if [ "$(ver "$R")" = 1.0.0 ] && printf '%s\\n' "$out" | grep -q "previous version restored"; then
  pass "a final version mismatch restores the previous install"
else
  fail "post-install check did not restore the old version: $out"
fi

echo "== protection against broken releases =="
R=$T/r4; run "$R" --version v1.0.0 >/dev/null
out=$(run "$R" --version v3.0.0); echo "$out" | grep -q "contains an archive of version 2.0.0" && [ "$(ver "$R")" = 1.0.0 ] && pass "wrong-version archive rejected, files untouched" || fail "wrong version: $out ($(ver "$R"))"
mkdir -p "$T/bad" && cp -r "$T/www/dl/download/v2.0.0" "$T/www/dl/download/v4.0.0" && echo "0000000000000000000000000000000000000000000000000000000000000000  nightfall-root.tar.gz" > "$T/www/dl/download/v4.0.0/nightfall-root.tar.gz.sha256"
out=$(run "$R" --version v4.0.0); echo "$out" | grep -q "checksum mismatch" && [ "$(ver "$R")" = 1.0.0 ] && pass "wrong sha256 rejected" || fail "sha256: $out"
out=$(run "$R" --version v9.9.9); echo "$out" | grep -q "failed to download" && pass "nonexistent version: clear error" || fail "missing version: $out"

echo "== version sources =="
R=$T/r5; API="$B/missing.json" run "$R" >/dev/null; [ "$(ver "$R")" = 2.0.0 ] && pass "API unavailable -> version from latest.json" || fail "fallback source: $(ver "$R")"
R=$T/r6; API="$B/missing.json" NF_RAW="$B/missing" run "$R" >/dev/null; [ "$(ver "$R")" = 2.0.0 ] && pass "version unknown -> archive from latest, version checked from the archive" || fail "latest/download: $(ver "$R")"

echo "== local file =="
R=$T/r7; mkdir -p "$T/loc"; cp "$T/www/dl/download/v1.0.0/nightfall-root.tar.gz" "$T/loc/"; cp install-update.sh "$T/loc/"
out=$(cd "$T/loc" && NF_ROOT="$R" NF_TMP="$T/tmp" sh ./install-update.sh 2>&1); [ "$(ver "$R")" = 1.0.0 ] && pass "archive next to the script installs without internet" || fail "local install: $out"
R=$T/r8; out=$(NF_ROOT="$R" NF_TMP="$T/tmp" sh install-update.sh --file "$T/www/dl/download/v2.0.0/nightfall-root.tar.gz" 2>&1); [ "$(ver "$R")" = 2.0.0 ] && pass "--file" || fail "--file: $out"

echo "== install.sh (wrapper) =="
R=$T/r9; out=$(NF_ROOT="$R" NF_TMP="$T/tmp" NF_API="$B/api.json" NF_RAW="$B" NF_DL="$B/dl" sh install.sh 2>&1); [ "$(ver "$R")" = 2.0.0 ] && pass "install.sh calls install-update.sh" || fail "install.sh: $out"

echo "== uninstall: real release archive =="
rm -rf dist; VERSION=v9.9.9 sh build-release.sh >/dev/null 2>&1
ARCH=$REPO/dist/nightfall-root.tar.gz
mkfs() { r=$1; rm -rf "$r"; mkdir -p "$r/tmp" "$r/etc"; tar -xzf "$ARCH" -C "$r"; for f in monitor.conf prefs.json logo.json bg.json known.list block.list; do echo x > "$r/etc/nightfall-$f"; done; echo x > "$r/tmp/nightfall-root.tar.gz"; mkdir -p "$r/tmp/nightfall"; }
un() { r=$1; shift; NF_ROOT="$r" sh uninstall.sh "$@" 2>&1; }
left() { find "$1" -iname '*nightfall*' 2>/dev/null | grep -v '/etc/nightfall-'; }

R=$T/u1; mkfs "$R"
[ -n "$(left "$R")" ] && pass "Nightfall files present before uninstall" || fail "test install is empty"
out=$(un "$R"); echo "$out" | sed 's/^/   | /'
[ -z "$(left "$R")" ] && pass "by default ALL theme, monitor, menu and ACL files are removed" || { fail "left after uninstall:"; left "$R"; }
[ -f "$R/etc/nightfall-monitor.conf" ] && pass "settings kept" || fail "settings removed without --wipe"
[ ! -e "$R/usr/share/luci/menu.d/luci-theme-nightfall.json" ] && pass "menu entry \"Nightfall: all elements\" removed" || fail "gallery menu left behind"
[ ! -e "$R/tmp/nightfall-root.tar.gz" ] && pass "old archives in /tmp removed" || fail "archive left in /tmp"
R=$T/u2; mkfs "$R"; un "$R" --wipe >/dev/null
[ -z "$(find "$R" -iname '*nightfall*')" ] && pass "--wipe: nothing left, not even settings" || { fail "--wipe left:"; find "$R" -iname '*nightfall*'; }
R=$T/u3; mkfs "$R"; un "$R" --theme-only >/dev/null
[ -n "$(left "$R")" ] && pass "--theme-only leaves files alone" || fail "--theme-only removed files"
R=$T/u4; mkfs "$R"; un "$R" --purge >/dev/null; [ -z "$(left "$R")" ] && pass "--purge (old name) works as a full uninstall" || fail "--purge"
R=$T/u5; mkfs "$R"; un "$R" >/dev/null; un "$R" >/dev/null && pass "repeated uninstall does not fail" || fail "repeated uninstall"
un "$T/u5" --bogus >/dev/null 2>&1; [ $? -eq 2 ] && pass "unknown option -> exit code 2" || fail "exit code for an unknown option"
echo "== archive safety: standard links allowed, foreign ones rejected =="
R=$T/r12; run "$R" --version v1.0.0 >/dev/null
mkdir -p "$T/malicious/www/luci-static/nightfall"
cp "$T/stage.2.0.0/www/luci-static/nightfall/version.json" "$T/malicious/www/luci-static/nightfall/version.json"
ln -s ../../../../etc/passwd "$T/malicious/www/luci-static/nightfall/escape"
tar -czf "$T/malicious.tar.gz" -C "$T/malicious" .
out=$(run "$R" --file "$T/malicious.tar.gz" 2>&1 || true)
if [ "$(ver "$R")" = 1.0.0 ] && echo "$out" | grep -q "forbidden links or special files"; then
  pass "foreign symlink rejected; standard links did not weaken the check"
else
  fail "archive with a symlink was not rejected: $out (version $(ver "$R"))"
fi

rm -rf dist

echo; echo "TOTAL: ok=$ok, failed=$bad"
[ "$bad" -eq 0 ]
