#!/bin/sh
# Install Nightfall. Kept for compatibility: install-update.sh does everything (install and update
# are now one script, the version is detected automatically). Same options: --activate, --force, --file, --help.
#   From the internet:  wget -qO- https://raw.githubusercontent.com/jigarvarma2k20/nightfall-openwrt/main/install-update.sh | sh
#   Manually:           put nightfall-root.tar.gz next to the scripts and run  sh install.sh [--activate]
DIR=$(cd "$(dirname "$0")" && pwd)
if [ -f "$DIR/install-update.sh" ]; then
	exec sh "$DIR/install-update.sh" "$@"
fi
S=/tmp/nightfall-install-update.$$.sh
trap 'rm -f "$S"' EXIT
URL=https://raw.githubusercontent.com/jigarvarma2k20/nightfall-openwrt/main/install-update.sh
{ wget -qO "$S" "$URL" || curl -fsSL -o "$S" "$URL"; } 2>/dev/null || { echo "Failed to download install-update.sh. Download it manually and put it next to this file."; exit 1; }
sh "$S" "$@"
