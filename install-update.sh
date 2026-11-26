#!/bin/sh
# Install and update Nightfall on the router (OpenWrt, busybox sh).
#
#   wget -qO- https://raw.githubusercontent.com/jigarvarma2k20/nightfall-openwrt/main/install-update.sh | sh
#   (or curl -fsSL ... | sh)
#
# Options (after "| sh -s --"):
#   --check            only show the installed and the latest version
#   --force            reinstall even if the latest version is already installed
#   --list             show recent versions (then: --version vX.Y.Z)
#   --version vX.Y.Z   install a specific version (including an older one)
#   --activate         make Nightfall the default theme right away
#   --file PATH        install from a local nightfall-root.tar.gz archive (no internet)
#   -h, --help         this help
#
# Manually without internet: put nightfall-root.tar.gz and this script in one folder on the router and run
#   sh install-update.sh
#
# What it does: finds the latest version -> downloads exactly that archive -> verifies sha256 and the signature (usign) ->
# checks that the version inside the archive matches the expected one -> backs up the files being replaced ->
# extracts (restores the previous files on error) -> verifies the version after installation.
# Old archives left in /tmp by previous installs are NOT used.
#
# For tests: NF_ROOT (root instead of /), NF_TMP, NF_API, NF_RAW, NF_DL.

REPO="jigarvarma2k20/nightfall-openwrt"
ROOT=${NF_ROOT:-}
TMP=${NF_TMP:-/tmp}
API=${NF_API:-https://api.github.com/repos/$REPO/releases/latest}
APILIST=${NF_APILIST:-https://api.github.com/repos/$REPO/releases?per_page=15}
RAW=${NF_RAW:-https://raw.githubusercontent.com/$REPO/main}
DL=${NF_DL:-https://github.com/$REPO/releases}
VERF="$ROOT/www/luci-static/nightfall/version.json"
PUB="$ROOT/etc/nightfall-release.pub"
WORK="$TMP/nightfall-install.$$"

say() { echo "$*"; }
die() { echo "ERROR: $*" >&2; exit 1; }
usage() {
	cat <<'EOT'
Install and update Nightfall: wget -qO- https://raw.githubusercontent.com/jigarvarma2k20/nightfall-openwrt/main/install-update.sh | sh
Options (after "| sh -s --"):
  --check            show the installed and the latest version
  --force            reinstall even if the latest version is already installed
  --list             show recent versions (then: --version vX.Y.Z)
  --version vX.Y.Z   install a specific version (including an older one)
  --activate         make Nightfall the default theme right away
  --file PATH        install from a local nightfall-root.tar.gz archive
  -h, --help         this help
EOT
}

FORCE=0; ACTIVATE=0; CHECK=0; LIST=0; WANT=; FILE=
while [ $# -gt 0 ]; do
	case "$1" in
	--force|-f) FORCE=1 ;;
	--activate) ACTIVATE=1 ;;
	--check) CHECK=1 ;;
	--list) LIST=1 ;;
	--version) shift; WANT=$1; [ -n "$WANT" ] || die "--version needs a version number, e.g. v1.16.2" ;;
	--file) shift; FILE=$1; [ -f "$FILE" ] || die "file not found: $FILE" ;;
	-h|--help) usage; exit 0 ;;
	*) die "unknown option: $1 (see --help)" ;;
	esac
	shift
done

rm -rf "$WORK"; mkdir -p "$WORK" || die "failed to create working directory $WORK"
trap 'rm -rf "$WORK"' EXIT

ensure_base64() {
 command -v base64 >/dev/null 2>&1 && return 0
 if command -v busybox >/dev/null 2>&1 && busybox base64 </dev/null >/dev/null 2>&1; then return 0; fi
 say "base64 utility not found. Installing coreutils-base64…"
 if command -v apk >/dev/null 2>&1; then
  apk update >/dev/null 2>&1 && apk add coreutils-base64 >/dev/null 2>&1 || die "failed to install coreutils-base64 with apk. Run: apk update && apk add coreutils-base64"
 elif command -v opkg >/dev/null 2>&1; then
  opkg update >/dev/null 2>&1 && opkg install coreutils-base64 >/dev/null 2>&1 || die "failed to install coreutils-base64 with opkg. Run: opkg update && opkg install coreutils-base64"
 else
  die "base64 not found and neither apk nor opkg is available. Install coreutils-base64 manually"
 fi
 command -v base64 >/dev/null 2>&1 || { command -v busybox >/dev/null 2>&1 && busybox base64 </dev/null >/dev/null 2>&1; } || die "coreutils-base64 is installed, but the base64 command is not available"
}
fetch() { # url out
	if command -v curl >/dev/null 2>&1; then
		curl -fsSL --retry 2 --connect-timeout 15 --max-time 300 -o "$2" "$1"
	elif command -v uclient-fetch >/dev/null 2>&1; then
		uclient-fetch -q -O "$2" "$1"
	elif command -v wget >/dev/null 2>&1; then
		wget -q -O "$2" "$1"
	else
		return 127
	fi
}

json_ver() { sed -n 's/.*"version"[^"]*"\([^"]*\)".*/\1/p' | head -n1; }
installed() { json_ver < "$VERF" 2>/dev/null; }

# version from the archive: version.json is inside, with or without a "./" path prefix
archive_ver() {
	{ tar -xzOf "$1" ./www/luci-static/nightfall/version.json 2>/dev/null || tar -xzOf "$1" www/luci-static/nightfall/version.json 2>/dev/null; } | json_ver
}

latest_tag() {
	t=
	if fetch "$API" "$WORK/api.json" 2>/dev/null; then
		t=$(sed -n 's/.*"tag_name"[^"]*"\([^"]*\)".*/\1/p' "$WORK/api.json" | head -n1)
	fi
	if [ -z "$t" ] && fetch "$RAW/latest.json" "$WORK/latest.json" 2>/dev/null; then
		t=$(json_ver < "$WORK/latest.json")
	fi
	[ -n "$t" ] && echo "v${t#v}"
}

if [ "$LIST" = 1 ]; then
	fetch "$APILIST" "$WORK/list.json" 2>/dev/null || die "failed to get the version list (cannot reach GitHub)"
	v=$(grep -o '"tag_name"[^,}]*' "$WORK/list.json" | sed 's/.*:[ ]*"\([^"]*\)".*/\1/')
	[ -n "$v" ] || die "the version list is empty"
	say "Recent versions (installed: $(installed 2>/dev/null)):"
	echo "$v" | sed 's/^/  /'
	say "To install one: wget -qO- https://raw.githubusercontent.com/$REPO/main/install-update.sh | sh -s -- --version <version>"
	exit 0
fi
OLD=$(installed)
say "Current version: ${OLD:-not installed}"

# --- where the archive comes from ---
ARCH=; TAG=; SRC=remote
if [ -z "$FILE" ]; then
	# archive next to the script (manual install); when run via "| sh", $0 is not a file and /tmp is not scanned
	case "$0" in */*) [ -f "$0" ] && d=$(dirname "$0") && for n in nightfall-root.tar.gz nightfall-root_tar.gz; do
		[ -f "$d/$n" ] && { FILE="$d/$n"; break; }
	done ;; esac
fi
if [ -n "$FILE" ]; then
	SRC=local; ARCH=$FILE
	say "Local archive: $FILE"
else
	if [ -n "$WANT" ]; then
		TAG="v${WANT#v}"
	else
		TAG=$(latest_tag)
		[ -n "$TAG" ] || say "Could not get the latest version from GitHub; using the \"latest\" archive and checking the version from its contents."
	fi
	[ -n "$TAG" ] && say "Latest version: ${TAG#v}"
	if [ "$CHECK" = 1 ]; then
		[ -n "$TAG" ] || die "could not determine the latest version"
		[ "$OLD" = "${TAG#v}" ] && say "No update needed." || say "Update available: ${OLD:-—} -> ${TAG#v}"
		exit 0
	fi
	if [ -n "$TAG" ] && [ "$OLD" = "${TAG#v}" ] && [ "$FORCE" = 0 ]; then
		say "Already installed: version ${OLD}. Add --force to reinstall."
		exit 0
	fi
	if [ -n "$TAG" ]; then BASE="$DL/download/$TAG"; else BASE="$DL/latest/download"; fi
	command -v curl >/dev/null 2>&1 || command -v uclient-fetch >/dev/null 2>&1 || command -v wget >/dev/null 2>&1 \
		|| die "curl or wget not found. Install: apk add curl ca-bundle"
	say "Downloading ${TAG:-the latest release}…"
	ARCH="$WORK/nightfall-root.tar.gz"
	fetch "$BASE/nightfall-root.tar.gz" "$ARCH" \
		|| die "failed to download the archive (${TAG:-latest}). Check the internet connection and HTTPS (apk add curl ca-bundle), or put the archive next to the script."
	fetch "$BASE/nightfall-root.tar.gz.sha256" "$WORK/new.sha256" || die "the release has no checksum file; installation stopped"
	WANTSUM=$(sed -n '1s/[[:space:]].*//p' "$WORK/new.sha256" | tr 'A-F' 'a-f')
	GOTSUM=$(sha256sum "$ARCH" | sed 's/[[:space:]].*//')
	[ -n "$WANTSUM" ] && [ "$WANTSUM" = "$GOTSUM" ] || die "checksum mismatch; the archive was not installed"
	say "Checksum OK."
	if [ -f "$PUB" ]; then
		if command -v usign >/dev/null 2>&1; then
			fetch "$BASE/nightfall-root.tar.gz.sig" "$WORK/new.sig" || die "the release has no signature; installation stopped"
			usign -V -m "$ARCH" -p "$PUB" -x "$WORK/new.sig" >/dev/null 2>&1 || die "the release signature is invalid; the archive was not installed"
			say "Signature verified."
		else
			die "a release verification key is installed, but usign was not found. Installation stopped; reinstall the usign package."
		fi
	fi
fi

# --- archive checks ---
tar -tzf "$ARCH" > "$WORK/all.list" 2>/dev/null || die "the archive is corrupted"
grep -q 'luci-static/nightfall/' "$WORK/all.list" || die "the archive contains no Nightfall theme files"
# Check every path component, including a trailing ".." component.
awk '
{
  p=$0
  if (substr(p,1,1) == "/") bad=1
  if (substr(p,1,2) == "./") p=substr(p,3)
  n=split(p, part, "/")
  for (i=1; i<=n; i++) if (part[i] == "..") bad=1
}
END { exit bad }
' "$WORK/all.list" || die "the archive contains forbidden paths"
# Check entry types: only the 7 standard Nightfall symlinks are allowed.
tar -tvzf "$ARCH" > "$WORK/verbose.list" 2>/dev/null || die "failed to check archive entry types"
# Allow only the standard Nightfall symlinks; any other links and special files are forbidden.
validate_archive_types() {
  awk '
  function allowed(p, t) {
    return (p == "./usr/share/ucode/luci/template/themes/nightfall-dark" && t == "nightfall") ||
           (p == "./usr/share/ucode/luci/template/themes/nightfall-light" && t == "nightfall") ||
           (p == "./www/luci-static/nightfall-dark" && t == "nightfall") ||
           (p == "./www/luci-static/nightfall-light" && t == "nightfall") ||
           (p == "./www/luci-static/nightfall/bg.json" && t == "/etc/nightfall-bg.json") ||
           (p == "./www/luci-static/nightfall/prefs.json" && t == "/etc/nightfall-prefs.json") ||
           (p == "./www/luci-static/nightfall/logo.json" && t == "/etc/nightfall-logo.json")
  }
  {
    type=substr($0,1,1)
    if (type == "-" || type == "d") next
    if (type != "l") { bad=1; next }
    n=split($0, pair, " -> ")
    if (n != 2) { bad=1; next }
    path=pair[1]; sub(/^.* /, "", path)
    target=pair[2]
    if (!allowed(path,target) || seen[path]++) bad=1
  }
  END { exit bad }
  ' "$1"
}
validate_archive_types "$WORK/verbose.list" || die "the archive contains forbidden links or special files"
NEW=$(archive_ver "$ARCH")
[ -n "$NEW" ] || die "the archive has no version file (too old or corrupted)"
if [ -n "$TAG" ] && [ "$NEW" != "${TAG#v}" ]; then
	die "release $TAG contains an archive of version $NEW. Please report this in Issues; installation stopped."
fi
say "Archive version: $NEW"
if [ "$SRC" = local ] && [ "$OLD" = "$NEW" ] && [ "$FORCE" = 0 ]; then
	say "This version is already installed ($NEW). Add --force to reinstall."
	exit 0
fi

# --- runtime dependencies ---
if [ -z "$ROOT" ]; then ensure_base64; fi

# --- stop the collector and the bot before replacing files ---
if [ -z "$ROOT" ]; then
	[ -x /etc/init.d/nightfall-collector ] && /etc/init.d/nightfall-collector stop 2>/dev/null
	for p in /proc/[0-9]*; do
		pid=${p#/proc/}; [ "$pid" = "$$" ] && continue
		cmd=$( { tr '\0' ' ' < "$p/cmdline"; } 2>/dev/null )
		case "$cmd" in "/bin/sh /usr/libexec/nightfall-collector "*|"sh /usr/libexec/nightfall-collector "*|"/bin/sh /usr/libexec/nightfall-bot"*|"sh /usr/libexec/nightfall-bot"*) kill "$pid" 2>/dev/null ;; esac
	done
	sleep 1
fi

# --- back up the files being replaced, to restore everything on failure ---
sed 's|^\./||; /\/$/d; /^$/d' "$WORK/all.list" > "$WORK/files.list"
: > "$WORK/exist.list"; : > "$WORK/added.list"
while IFS= read -r f; do
	if [ -e "$ROOT/$f" ] || [ -L "$ROOT/$f" ]; then echo "$f" >> "$WORK/exist.list"; else echo "$f" >> "$WORK/added.list"; fi
done < "$WORK/files.list"
HAVEBAK=0
if [ -s "$WORK/exist.list" ]; then
	if tar -czf "$WORK/backup.tar.gz" -C "${ROOT:-/}" -T "$WORK/exist.list" 2>/dev/null; then
		HAVEBAK=1
	else
		# The collector and the bot were already stopped before replacing files; restart them since the update is cancelled.
		[ -z "$ROOT" ] && /etc/init.d/nightfall-collector restart 2>/dev/null
		die "failed to back up the current files; update cancelled, the installed version is unchanged"
	fi
fi

[ -n "$ROOT" ] && mkdir -p "$ROOT"
say "Installing version ${NEW}…"
if ! tar -xzf "$ARCH" -C "${ROOT:-/}"; then
	say "Extraction failed, restoring the previous files…"
	while IFS= read -r f; do rm -rf "${ROOT:?}/$f"; done < "$WORK/added.list"
	if [ "$HAVEBAK" = 1 ]; then
		if ! tar -xzf "$WORK/backup.tar.gz" -C "${ROOT:-/}" 2>/dev/null; then
			die "CRITICAL ERROR: the update was not installed, and automatic restore of the previous files failed. Check the files manually and the free space (df -h)."
		fi
		[ -z "$ROOT" ] && /etc/init.d/nightfall-collector restart 2>/dev/null
	fi
	die "failed to extract the archive (no space in /overlay? check: df -h)"
fi

# Verify the result before registering and restarting services. A version mismatch is an installation failure too.
NOW=$(installed)
if [ "$NOW" != "$NEW" ]; then
	say "After extraction the version is ${NOW:-unknown}, expected $NEW. Restoring the previous files…"
	while IFS= read -r f; do rm -rf "${ROOT:-}/$f"; done < "$WORK/added.list"
	if [ "$HAVEBAK" = 1 ]; then
		if ! tar -xzf "$WORK/backup.tar.gz" -C "${ROOT:-/}" 2>/dev/null; then
			die "CRITICAL ERROR: version mismatch, and automatic restore of the previous files failed. Check the files manually and the free space (df -h)."
		fi
	fi
	[ -z "$ROOT" ] && /etc/init.d/nightfall-collector restart 2>/dev/null
	die "post-extraction version check failed; previous version restored"
fi

# --- permissions and registration ---
chmod 755 "$ROOT"/usr/libexec/nightfall-* "$ROOT"/etc/init.d/nightfall-collector 2>/dev/null
rm -f "$ROOT/www/luci-static/resources/view/nightfall/sysauth.js"
if [ -z "$ROOT" ]; then
	for f in /etc/uci-defaults/30_luci-theme-nightfall /etc/uci-defaults/40_nightfall-collector; do
		[ -f "$f" ] && { sh "$f"; rm -f "$f"; }
	done
	if [ "$ACTIVATE" = 1 ]; then
		uci set luci.main.mediaurlbase=/luci-static/nightfall
		uci commit luci
	fi
	rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache 2>/dev/null
	/etc/init.d/rpcd reload 2>/dev/null || /etc/init.d/rpcd restart 2>/dev/null
	/etc/init.d/nightfall-collector restart 2>/dev/null
fi

# --- result: version after installation ---
NOW=$(installed)
if [ "$NOW" != "$NEW" ]; then
	die "after installation the version is ${NOW:-unknown}, expected $NEW. Something went wrong: check the free space (df -h) and retry with --force."
fi
say "Done. Installed version $NOW${OLD:+ (was $OLD)}."
say "Log out of LuCI and log in again (permissions are refreshed at login), then press Ctrl+F5."
say "On iPhone, close the Home Screen app and open it again."
[ -z "$OLD" ] && say "Select the theme in \"System -> System -> Language and Style\" (or run with --activate)."
exit 0
