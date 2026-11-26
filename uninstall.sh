#!/bin/sh
# Remove Nightfall from the router (OpenWrt, busybox sh). Run it directly on the router:
#
#   wget -qO- https://raw.githubusercontent.com/jigarvarma2k20/nightfall-openwrt/main/uninstall.sh | sh
#   (or curl -fsSL ... | sh)
#
# By default: restores the standard theme and fully removes Nightfall: the theme, the Resource Monitor,
# the Telegram bot, the history collector, menu entries (including "Nightfall: all elements"), rpcd permissions,
# LuCI config entries and the cache. Your SETTINGS and data (/etc/nightfall-*) are kept, so everything
# comes back after a reinstall.
#
# Options (after "| sh -s --"):
#   --theme-only   only restore the standard theme, leave the files
#   --wipe         remove everything, including settings, device lists, the log and the bot token
#   --purge        same as no options (kept for compatibility)
#   -h, --help     this help
#
# For tests: NF_ROOT (root instead of /).

ROOT=${NF_ROOT:-}
THEME_ONLY=0; WIPE=0
for a in "$@"; do
	case "$a" in
	--theme-only) THEME_ONLY=1 ;;
	--wipe|--all) WIPE=1 ;;
	--purge) ;;
	-h|--help)
		cat <<'EOT'
Remove Nightfall: wget -qO- https://raw.githubusercontent.com/jigarvarma2k20/nightfall-openwrt/main/uninstall.sh | sh
Options (after "| sh -s --"):
  --theme-only   only restore the standard theme, leave the files
  --wipe         remove everything, including settings, device lists, the log and the bot token
  --purge        same as no options (for compatibility)
  -h, --help     this help
No options: the theme, monitor, bot, menus, permissions and cache are removed; your settings (/etc/nightfall-*) are kept.
EOT
		exit 0 ;;
	*) echo "ERROR: unknown option: $a (see --help)" >&2; exit 2 ;;
	esac
done
has() { command -v "$1" >/dev/null 2>&1; }

# 1. restore the standard theme if Nightfall is currently selected
if has uci && [ -z "$ROOT" ]; then
	cur=$(uci -q get luci.main.mediaurlbase)
	case "$cur" in
	*[Nn]ightfall*|"")
		if [ -d /www/luci-static/bootstrap ]; then
			new=/luci-static/bootstrap
		else
			new=$(uci -q show luci.themes | grep -v -i nightfall | sed -n "s/.*='\(\/luci-static\/[^']*\)'.*/\1/p" | head -n1)
		fi
		if [ -n "$new" ]; then
			uci set luci.main.mediaurlbase="$new" && uci commit luci && echo "Theme switched to $new"
		else
			echo "Warning: no other theme found; select one in \"System -> System -> Language and Style\"."
		fi ;;
	*) echo "The current theme is not Nightfall ($cur); leaving it unchanged." ;;
	esac
fi

if [ "$THEME_ONLY" = 0 ]; then
	# 2. revert system changes (dnsmasq/sysctl for per-app accounting, block rules)
	if [ -z "$ROOT" ]; then
		[ -x /usr/libexec/nightfall-apps ] && /usr/libexec/nightfall-apps disable >/dev/null 2>&1
		has nft && nft delete table inet nightfall 2>/dev/null
		# 3. stop the collector and the bot (including processes outside procd)
		if [ -x /etc/init.d/nightfall-collector ]; then
			/etc/init.d/nightfall-collector stop 2>/dev/null
			/etc/init.d/nightfall-collector disable 2>/dev/null
		fi
		for p in /proc/[0-9]*; do
			pid=${p#/proc/}; [ "$pid" = "$$" ] && continue
			cmd=$( { tr '\0' ' ' < "$p/cmdline"; } 2>/dev/null )
			case "$cmd" in *"/usr/libexec/nightfall-"*) kill "$pid" 2>/dev/null ;; esac
		done
	fi

	# 4. files
	rm -rf "$ROOT/www/luci-static/nightfall" "$ROOT/www/luci-static/nightfall-light" "$ROOT/www/luci-static/nightfall-dark" \
	       "$ROOT/www/luci-static/resources/menu-nightfall.js" "$ROOT/www/luci-static/resources/nightfall-"*.js \
	       "$ROOT/www/luci-static/resources/view/nightfall" \
	       "$ROOT/usr/share/ucode/luci/template/themes/nightfall" "$ROOT/usr/share/ucode/luci/template/themes/nightfall-light" \
	       "$ROOT/usr/share/ucode/luci/template/themes/nightfall-dark" \
	       "$ROOT"/usr/libexec/nightfall-* "$ROOT/etc/init.d/nightfall-collector" "$ROOT/etc/nightfall-release.pub" \
	       "$ROOT/usr/share/nightfall" \
	       "$ROOT/usr/share/luci/menu.d/luci-app-nightfall-monitor.json" "$ROOT/usr/share/luci/menu.d/luci-theme-nightfall.json" \
	       "$ROOT/usr/share/rpcd/acl.d/luci-app-nightfall-monitor.json" \
	       "$ROOT/etc/uci-defaults/30_luci-theme-nightfall" "$ROOT/etc/uci-defaults/40_nightfall-collector" \
	       "$ROOT/etc/sysctl.d/99-nightfall-acct.conf" "$ROOT/etc/nightfall-apps.prev" "$ROOT"/lib/upgrade/keep.d/nightfall-* \
	       "$ROOT/tmp/nightfall" "$ROOT"/tmp/nightfall-* 2>/dev/null
	if [ "$WIPE" = 1 ]; then
		rm -f "$ROOT"/etc/nightfall-* 2>/dev/null
	fi

	# 5. LuCI config entries
	if has uci && [ -z "$ROOT" ]; then
		uci -q delete luci.themes.Nightfall
		uci -q delete luci.themes.NightfallDark
		uci -q delete luci.themes.NightfallLight
		uci commit luci
	fi
fi

# 6. LuCI cache and permissions
if [ -z "$ROOT" ]; then
	rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache 2>/dev/null
	/etc/init.d/rpcd reload 2>/dev/null || /etc/init.d/rpcd restart 2>/dev/null
fi

# 7. check what is left
if [ "$THEME_ONLY" = 0 ]; then
	left=$(find "$ROOT/www" "$ROOT/usr" "$ROOT/etc" "$ROOT/tmp" \( -name '*[Nn]ightfall*' \) 2>/dev/null | grep -v '^'"$ROOT"'/etc/nightfall-' | head -n 20)
	if [ -n "$left" ]; then
		echo "Warning: Nightfall files remain:"; echo "$left"
	else
		echo "Nightfall files removed."
	fi
	keep=$(ls "$ROOT"/etc/nightfall-* 2>/dev/null | head -n 30)
	if [ -n "$keep" ] && [ "$WIPE" = 0 ]; then
		echo "Your settings and data were kept (for a reinstall). To remove them, add --wipe"
	fi
else
	echo "Theme disabled, files kept. To remove everything, run without --theme-only."
fi
echo "Done. Reload the browser page (Ctrl+F5); if needed, log out of LuCI and log in again."
exit 0
