# FAQ: common problems and solutions

[Back to README](README.md)

This page collects questions raised in [Issues](https://github.com/jigarvarma2k20/nightfall-openwrt/issues) and how to solve them. If your problem isn't listed, see [How to report a problem](#how-to-report-a-problem).

> The main confirmed configuration is **Cudy WR3000U-256MB with OpenWrt 25.12.6**. On it, the collector, the Telegram bot and notifications, device and app statistics, saving history to USB, and creating and restoring backups were tested. For other models and OpenWrt versions, hardware compatibility is not confirmed yet.

## Contents

- [Installation and updates](#installation-and-updates)
- [Telegram](#telegram)
- [Theme look and settings](#theme-look-and-settings)
- [Devices and "Internet access"](#devices-and-internet-access)
- [Traffic and charts](#traffic-and-charts)
- [Performance](#performance)
- [How to report a problem](#how-to-report-a-problem)

---

## Installation and updates

### Which devices was the current version tested on?
Nightfall v1.28.6 was tested on a **Cudy WR3000U-256MB with OpenWrt 25.12.6**. Tested: running the collector and the Telegram bot, notifications, device and app statistics, saving history to USB, creating and restoring a backup. This confirms that these scenarios work on that configuration, but it is not a guarantee for every OpenWrt router. On other models compatibility is considered unverified for now.

### How do I install or update the theme?
The easiest way is the "New version available" button in the theme itself (the archive's sha256 and signature are verified, and it rolls back on error). From the router command line:

```sh
wget -qO- https://raw.githubusercontent.com/jigarvarma2k20/nightfall-openwrt/main/install-update.sh | sh
```

The script finds the latest version by itself and prints "Installed version X (was Y)" at the end. To see versions without installing: `... | sh -s -- --check`. To install a specific published version: `... | sh -s -- --version vX.Y.Z` (use an existing release tag). After installation, select the theme in "System → System → Language and Style" (or add `--activate`).

### The script installed an old version (for example, 1.0.9)
That's how `install-update.sh` behaved before v1.16.3: if `/tmp` contained a `nightfall-root.tar.gz` from a previous manual install, it was used instead of a fresh one. Now, when run via "`| sh`", old files in `/tmp` are ignored, and the version is checked before and after installation. If you have the old script, first delete the old archive and run the command again:

```sh
rm -f /tmp/nightfall-root.tar.gz /tmp/nightfall-root_tar.gz
wget -qO- https://raw.githubusercontent.com/jigarvarma2k20/nightfall-openwrt/main/install-update.sh | sh
```

If the version is still wrong, post the script output in an Issue.

### "Failed to download the archive" during installation
Check the internet connection on the router (`ping -c1 github.com`) and HTTPS support: `apk add curl ca-bundle`, then try again. Without internet, download `nightfall-root.tar.gz` on a computer and install it manually (see [README](README.md#installation)).

### No "Resource Monitor" entry after installation
Log out of LuCI and log in again: permissions and menus are read only at login. If the entry is still missing, run on the router:

```sh
rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache
/etc/init.d/rpcd reload
```

and log in to LuCI again.

### How do I restore the standard theme or remove Nightfall?
Directly on the router, over SSH:

```sh
wget -qO- https://raw.githubusercontent.com/jigarvarma2k20/nightfall-openwrt/main/uninstall.sh | sh
```

The script restores the standard theme and removes everything: the theme, the monitor, the bot, the menus (including "Nightfall: all elements"), permissions and the cache. Your settings stay in `/etc/nightfall-*`. To only restore the standard theme without removing files: `... | sh -s -- --theme-only`. To remove the settings too: `... | sh -s -- --wipe`. After removal, reload the browser page (`Ctrl+F5`) and log in to LuCI again.

### The "What's new" dialog didn't appear after an update
The dialog appears after you log in to LuCI again in the same browser profile, if a different version had already been installed and confirmed before. On a fresh install the dialog does not appear. The confirmation is stored separately in each browser and on each device. If you updated from a test build like `1.27.7-alpha…` to the stable `1.27.7`, older theme versions could treat them as equal and skip the dialog; correct prerelease/stable comparison was fixed in `v1.27.8`. Update to it, log out of LuCI and log in again. If the dialog still doesn't appear, check that `/www/luci-static/nightfall/CHANGELOG.md` is reachable from the browser and log in again.

### The page looks "broken" after an update
The browser may have kept the old CSS. Reload the page with a cache refresh (`Ctrl+F5`; on a phone, close and reopen the tab or the app).

---

## Telegram

### "Not sent: no permission to run … or /usr/libexec/nightfall-notify not found" ([#17](https://github.com/Nikolai752/nightfall-openwrt/issues/17), [#85](https://github.com/Nikolai752/nightfall-openwrt/issues/85))
This is a permissions error. What to do:

1. Update the theme to the latest version (see above).
2. **Be sure to log out of LuCI and log in again.** Permissions are read only at login; without this nothing changes.
3. Make sure `curl` is installed: `apk add curl`.
4. If Telegram is blocked for you, set "Telegram proxy" (for example `socks5h://127.0.0.1:1080`) or "VPN interface" (for example `wg0`) in the settings.

If the error persists, attach the output of these commands to an Issue:

```sh
ls -l /usr/libexec/nightfall-notify
grep -c nightfall-notify /usr/share/rpcd/acl.d/luci-app-nightfall-monitor.json
cat /etc/openwrt_release | head -3
```

The file must exist and be executable (`-rwxr-xr-x`), and the second command must print a number greater than zero.

### How do I set up the bot?
Resource Monitor → History → Settings → "Telegram notifications":

1. In Telegram, create a bot with @BotFather (`/newbot`) and paste the token.
2. Open your bot and press Start.
3. Press "Detect chat id", then "Send test".
4. Turn on "Send notifications" and save.

To get the buttons, send the bot `/menu`. The bot answers only its owner, that is, your chat id.

### The "Detect chat id" button finds nothing
First open your bot in Telegram and press Start (or send it any message), then press "Detect chat id" again. If requests to `api.telegram.org` don't get through, set a proxy or a VPN interface (see above).

### Live Status stopped arriving; plain text comes instead
Send the bot `/widget`: it shows whether the "Live widgets in the bot" setting is on, whether this is a private chat (groups have no widgets), whether the template is in place, and what Telegram replied at the last failure. Common causes: a Telegram client update or a temporary API refusal (the widget comes back by itself), a reset setting (turn it on again in "Monitor → History → Settings") and an unreachable `api.telegram.org` (proxy or VPN interface). If the `/widget` reply says `INPUT_MEDIA_WIDGET_NOT_ALLOWED`, that is a refusal by Telegram itself: widgets are rolled out gradually and aren't available to everyone yet. The bot doesn't break anything: the status arrives as text, and the widget returns once Telegram allows it. In all other cases, attach the `/widget` reply to an Issue.

### The backup has no Telegram token or proxy
That's by design: `TG_TOKEN` and `TG_PROXY` are not written to the archive. On restore, both current values are kept from the router configuration, if they were set. When moving an archive to a new router, set the token and proxy manually. Do not extract the archive manually over `/etc` or `/`: use the check and safe restore via Telegram, or the commands `/usr/libexec/nightfall-backup list` and `/usr/libexec/nightfall-backup restore`. Details are in the [backup guide](docs/backup-restore.md).

### How do I restore a backup from Telegram?
1. Press **"Backup"** in the bot menu. The archive arrives as a separate message and also stays in the router's local storage.
2. Under the file, press **"Check and restore"**. The bot checks the archive and shows its contents; if the check fails, restore is not offered.
3. Review the contents and press **"Restore settings"**. The confirmation is valid for 5 minutes. The **"Cancel"** button leaves the current settings unchanged.
4. On success, the bot reports the restore and automatically restarts the collector and the Telegram bot.

The archive contains no OpenWrt network settings. Only Nightfall settings are restored; the current `TG_TOKEN` and `TG_PROXY` are kept. If the archive is old or the local file has already been deleted, create a new backup.

---

## Theme look and settings

### Theme settings are not saved in another browser ([#34](https://github.com/Nikolai752/nightfall-openwrt/issues/34))
Settings are stored on the router and picked up in other browsers after login. Previously, wrong permissions on the settings file got in the way (the web server answered `Forbidden`). Fixed in v1.2.12. What to do:

1. Update to the latest version and log in to LuCI again.
2. "Personalization → More" shows whether the settings are written to the router.
3. If that doesn't help, open `http://ROUTER-IP/luci-static/nightfall/prefs.json` and attach what it shows to an Issue.

### On a computer the "Search" and "Edit" dialogs are narrow and the page has to be scrolled sideways ([#83](https://github.com/Nikolai752/nightfall-openwrt/issues/83))
LuCI dialogs adapt to their content: in v1.15.2 settings forms became wider, and in v1.15.3 the "Found Wi-Fi access points" dialog became full width. Update and reload the page with a cache refresh.

### "No data yet" is not centered in a table
Fully fixed in v1.16.3 (in v1.15.3, for some users the text stayed in the first column). Update and reload the page with a cache refresh.

### The sign-in dialog became wider and the fields are pushed to the left
Fixed in v1.16.3: the sign-in card is 380 px wide again. Update and reload the page with a cache refresh.

### The summary cards are not visible on the sign-in page ([#27](https://github.com/Nikolai752/nightfall-openwrt/issues/27))
The router summary is shown **only to clients on the local network**. If you open the router by its external address or via Tailscale, there are no cards. This is so strangers can't see data about your router. Open the panel at the router's local address.

### The iPhone home screen icon disappeared
If the panel is opened over self-signed HTTPS, iOS may lose the icon. The icon is embedded directly in the page, so update to the latest version; if the icon is still the old one, remove it from the home screen and add it again.

---

## Devices and "Internet access"

### Connected devices are shown as "offline" ([#73](https://github.com/Nikolai752/nightfall-openwrt/issues/73))
- Update to the latest version (fixes in v1.14.1 and v1.15.1) and press "Check now".
- Wi-Fi clients are detected by their association with the access point; others are checked with an ARP request; clients are also taken from DHCP leases.
- Non-standard setups (WAN and LAN on one interface, a separate network segment, a router behind another router) are not tested in every variant. If you have such a setup and the status is wrong, describe it in an Issue: the connection diagram and the output of `ip neigh`.

### A phone is shown as "private MAC" with no vendor
Phones with a "private Wi-Fi address" use a random MAC, so the vendor can't be determined from it. To have the device identified, turn off the private address for your network in the phone's Wi-Fi settings, or give the device a custom name in its card.

---

## Traffic and charts

### "Traffic by month" and the "Daily summary" show different numbers
Fixed in v1.15.1. With hardware packet acceleration (Flow Offloading), the WAN port sees only a small part of the traffic, so if WAN is noticeably too low, the daily total is taken from the device data. Such days are marked in the calendar.

### Traffic by app shows too little or doesn't recognize a service
Limitations: traffic over a VPN and encrypted DNS (DoH/DoT) can't be identified, with Flow Offloading enabled the counters may be too low, and the matching is approximate. Details in the [README](README.md#traffic-by-app).

### No per-device traffic accounting
Check that conntrack accounting is enabled:

```sh
sysctl net.netfilter.nf_conntrack_acct
```

The value must be `1`.

### Charts with "loops" and knots ([#78](https://github.com/Nikolai752/nightfall-openwrt/issues/78))
Fixed in v1.15.0. Please update.

### History disappeared after a reboot
By default the current history is kept in RAM (`/tmp`) and is cleared on reboot. To keep it, point `PERSIST_DIR` to an attached USB/SD drive in the monitor settings. If the drive is disconnected, the collector keeps working in RAM and resumes saving after it is reconnected; it must not write data to the underlying `/overlay`. Details are in the [README](README.md) and the [backup guide](docs/backup-restore.md).

---

## Performance

### My router is weak; can I turn off the extras? ([#72](https://github.com/Nikolai752/nightfall-openwrt/issues/72))
Set `LITE=1` in the monitor settings: the collector will poll the router once every 60 seconds and turn off per-app traffic accounting and Wi-Fi history, reducing CPU and RAM load. Set `LITE=0` again for the full mode. You can also:

- Turn off animations and live backgrounds in Personalization.
- Remove unneeded tiles and cards from the Overview page (the Overview tab in Personalization).
- If you don't need the monitor, stop the history collector:

```sh
/etc/init.d/nightfall-collector stop
/etc/init.d/nightfall-collector disable
```

To turn it back on: `/etc/init.d/nightfall-collector enable && /etc/init.d/nightfall-collector start`.

---

## How to report a problem

Create an [Issue](https://github.com/jigarvarma2k20/nightfall-openwrt/issues/new) and attach:

1. **Theme version**: the "About" block in the Personalization menu (or the file `/www/luci-static/nightfall/version.json` on the router).
2. **Router model and OpenWrt version**: the output of `cat /etc/openwrt_release | head -3`.
3. **A screenshot** of the problem area, preferably with the address bar and the browser window size visible.
4. **Browser** and device (computer, iPhone, Android).
5. **What you already tried**: updating, logging in to LuCI again, clearing the cache.

For bot problems, add the command output from the [Telegram](#telegram) section; for network and device problems, the connection diagram. **Do not post the bot token or passwords in an Issue.**
