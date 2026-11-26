# Nightfall for OpenWrt

[FAQ: common problems](FAQ.md)

[![Latest Release](https://img.shields.io/github/v/release/jigarvarma2k20/nightfall-openwrt?style=flat-square&color=0078d4&label=release)](https://github.com/jigarvarma2k20/nightfall-openwrt/releases)
[![OpenWrt 25.12.6](https://img.shields.io/badge/OpenWrt-25.12.6-00a3b5?style=flat-square&logo=openwrt)](https://openwrt.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=flat-square)](https://opensource.org/licenses/MIT)

A LuCI theme in the style of Windows 11 and Liquid Glass, plus a **Resource Monitor** page with history, charts, per-device and per-app traffic accounting, Telegram notifications and one-click updates. Target platform: **OpenWrt 25.12**. The installer checks for `coreutils-base64` (needed for backups) and installs it if necessary (`curl` is only needed for updates and Telegram).

## Screenshots

> **Test screenshots.** The three large screenshots at the top and the phone on the left in the bottom row were taken on a demo page with made-up data (the devices, traffic and numbers are not real) to show what the theme looks like. The "Resource Monitor" and "Overview" screenshots and the two phones on the right were taken on a real router.

![Light theme, "Mesh" background (test screenshot)](docs/demo/desktop-light.png)

![Dark theme, "Aurora" background (test screenshot)](docs/demo/desktop-dark.png)

![Nord preset theme and the Personalization menu (test screenshot)](docs/demo/desktop-nord.png)


![Resource Monitor](docs/monitor.png)

![Overview](docs/overview.png)

<p align="center">
  <img src="docs/demo/mobile-dark.png" width="30%" alt="Phone, dark theme, &quot;Neon&quot; background (test screenshot)">
  <img src="docs/mobile.png" width="30%" alt="Mobile view: Resource Monitor">
  <img src="docs/mobile1.png" width="30%" alt="Mobile view: Overview">
</p>

<p align="center"><sub>Left: test screenshot; the two on the right are from a real router.</sub></p>

## Features

**Theme**
- Two styles: Windows 11 (Mica, cards) and Liquid Glass (translucent cards with blur).
- Light and dark themes, switching automatically with the system or on a schedule.
- 12 accent colors plus a custom color.
- **One-click preset themes:** Nord, Dracula, Tokyo Night, Gruvbox, Catppuccin, Rosé Pine, OLED, Terminal, Paper, plus Night, Aurora, Graphite and Sakura.
- **Live backgrounds:** Mica, dots, grid, stars, aurora, waves, "Mesh", "Particles", "Neon", "Sunset", "Ocean", "Snow", "Rain", "Time of day" and "Weather" (a background that matches your local weather; data comes from Open-Meteo or wttr.in, directly in the browser, no API key needed; in Russia a VPN on the device may be required). Animated "constellations".
- **Charts:** area, line, bars, steps; 10 palettes, line width, grid, line color by load (green, yellow, red), a moving highlight, smoothly "rolling" numbers. Memory and storage usage bars are colored by level.
- Animations: smooth page transitions, a pulsing "Online" dot, a ripple on buttons (all can be turned off in Personalization).
- The Personalization menu is split into tabs: Theme, Look, Sign-in, Overview, More. Settings are stored on the router and picked up in other browsers.
- Collapsible menu, page search (`Ctrl+K` or `/`), a quick theme-switch button.
- Mobile view: a bottom section bar, settings shown as cards, a compact one-line "Apply / Save / Reset" bar (sizes adapt to the phone screen).
- A sign-in screen styled like a lock screen, with a router summary (only for clients on the local network).
- Can be installed on the phone home screen as an app. Look settings are stored on the router and survive a browser change.
- The "System → Nightfall: all elements" page: every button, form, table and notification in one place, to quickly check how the theme looks on a phone and a computer.

**Overview**
- The "Now" strip: internet, WAN traffic, CPU, temperature, memory, and optionally connections, uptime and the number of Wi-Fi clients. Tiles expand into charts for an hour, a day, a week, a month and 3 months. Numbers "roll" smoothly on update.
- **One-click layouts:** "Standard" (internet, traffic, CPU, temperature, memory; the default), "Home" (internet, traffic, daily traffic, clients, uptime, temperature), "Minimal" (internet, traffic, CPU in two columns) and "Admin" (12 tiles in two even rows).
- Tiles: internet, WAN traffic, CPU, temperature, memory, connections, uptime, Wi-Fi clients, packet loss, Wi-Fi signal, daily traffic, storage. Each one opens on tap: a chart for an hour, a day, a week, a month and 3 months, or details (reboots, Wi-Fi clients, daily totals, flash memory). Which tiles are shown, and in what order, is chosen in "Personalization → Overview".
- Cards: router status, Wi-Fi clients and signal level, an event feed, top devices by traffic, **traffic by app**, quick actions. In "Top clients" every row has a mini chart (speed over the last minutes or hourly traffic for the day), a device type icon and the vendor. Cards can be dragged, pinned and hidden; on wide screens they are laid out in two columns.

**Resource Monitor** (Status → Resource Monitor)
- Tabs: Overview, Network, Wi‑Fi, Devices, Programs, Services, Diagnostics, Security, Log, History.
- **Wi‑Fi:** clients, link quality, hourly signal, channel utilization and a channel recommendation.
- **Devices:** "Internet access" (blocking, limits, per-day schedules, groups) and per-device traffic.
- **Diagnostics:** ping, traceroute, DNS, speed tests and a "Check everything" button (gateway, internet, DNS).
- **Security:** failed and successful SSH and LuCI logins, frequent addresses, open router ports, port forwards, new devices, versions. It only shows what is already in the router log and settings, and changes nothing.
- **A calm Overview:** a one-line summary at the top, details on tap, card dragging only in "Look → Edit layout" mode.
- **Per-program memory over a period** with possible leaks flagged (Programs tab) and pinning entries in the Log.
- **Who's home** and **unusual activity** in Devices; per-hop loss, a bufferbloat test and check history in Diagnostics; the WAN address with a CGNAT indicator in Network.
- **Wi‑Fi (extra):** a 2.4/5 GHz band comparison, recommendations for weak signal and frequent disconnects, a log of client connects and disconnects.
- **Settings checks** in Security: root password, Wi‑Fi encryption, SSH password login, HTTPS for LuCI. Period selection and CSV export in the Log; a per-service log in Services.
- **Log:** events, outages, reboots and blocks in one feed with search and filters, plus the "Router log" (logread) with search and filters.
- **Blocking offenders:** in Security, a "Block for 24 h" button next to persistent addresses (nft, table `nightfall_ban`, until the router reboots), a list of blocked addresses and an "Unblock" button. The bot reports bursts of failed logins in Telegram (`TG_SEC`).
- **DNS statistics** in the Network tab (requires `dhcp.@dnsmasq[0].logqueries=1`) and a **device card** when you tap a row in Devices.
- CPU, temperature, memory, flash memory, cores, per-program memory.
- Network tab: interface speeds, connections, per-device traffic for today and yesterday, Wi-Fi clients with a signal-level chart when you tap a row.
- **Device identification by MAC:** the address is matched against the router neighbor table (this finds devices with no DHCP name and with temporary IPv6 addresses). For an unnamed device the type (phone, TV, computer…) and the vendor are shown, based on the first three bytes of the MAC and a built-in table of common vendors. Phones with a "private Wi-Fi address" use a random MAC: the vendor cannot be determined from it, and this is honestly labeled "private MAC".
- History tab: charts for 1 hour, 24 hours, 7, 30 and 90 days, link quality, a log of outages and reboots, alert and notification settings.
- **Long history:** besides the detailed series (7 days), the collector keeps a series with a 30-minute step for 7–90 days (the "Long history" setting, 30 by default). It takes about 300 KB for 90 days and survives a reboot if a USB drive is attached. Based on it, "Compare periods" also shows link quality: average ping, loss, peak load, CPU and temperature.
- **Hourly Wi-Fi signal:** a "client × hour" heat map (24 hours or 7 days) colored by average signal: you can see at once whose connection is always bad and whose is bad only at certain hours.
- **Wi-Fi channel utilization:** at the press of a button the router scans the air, shows neighboring networks and the load on each channel, and suggests a free one (1, 6 and 11 on 2.4 GHz; non-DFS channels on 5 GHz). A scan distracts the radio for a few seconds, so it runs on demand rather than continuously.
- Services tab: the state of router services, start, stop and restart. Services that are enabled at boot but not running are marked red. Key services (network, web server, SSH, firewall) cannot be stopped from here, so you don't lose access.
- An internet speed test run by the router itself in multiple streams (enough for fast connections): Cloudflare, Yandex Mirror, Hetzner, OVH or a custom URL, manual and automatic runs.
- Alerts even when the page is closed: overheating, low memory, full flash memory, high load, internet loss, new devices on the network.

**Daily traffic**
- Monitor → History → "Traffic by month": a calendar of daily WAN totals, a limit and a forecast. Tap a day for a report of how much each device downloaded and uploaded (per-device totals are kept for up to 90 days). The daily total is taken from the WAN port counters; if the router uses hardware packet acceleration (MediaTek, Qualcomm, etc.), the port sees only part of the traffic, so the theme automatically uses the per-device sum instead (without the router's own traffic); such days are marked.

**Traffic by app**
- Comparison of the week and month with previous ones, and CSV export of traffic, apps, charts and the log (Monitor → History).
- How much YouTube, Telegram, Netflix, Google, Yandex and other services downloaded: today, 7 and 30 days, in total or per device. Details in the section below.

**Nightfall backup:** a verified archive of settings and personalization, a preview and transactional restore. If `PERSIST_DIR` points to an attached USB/SD drive, backups are saved to a sibling `nightfall-backups` folder; otherwise `/tmp/nightfall-backups` is used temporarily. The number of kept backups is configurable (`BACKUP_KEEP`, 1–20; 5 by default). Guide: [backup and restore](docs/backup-restore.md).

**Telegram notifications and bot**
- Messages about internet loss and recovery, overheating, low memory, reboots and new devices; a bot with buttons (status, clients, traffic, device blocking, Wake-on-LAN, reboot) and a daily report. Details in the section below.

**Appearance.** Windows 11, Liquid Glass and macOS styles, one-click appearance presets (Night, Aurora, Graphite, Sakura), a **custom theme editor** (colors, corner radius, font, shadows; a theme can be shared as an NF1:… text code), chart styles (area, line, bars, steps, 10 palettes), line icons for devices and apps. Overview cards can be dragged and **resized by the corner**. On the sign-in screen: a time-of-day background, rain, sunset, animations and **your own photo** (stored on the router in `/etc/nightfall-bg.json`).

**Devices and groups** (Status → Devices)
- Network map: the router in the center with devices around it; dashed lines for Wi-Fi, solid for cable; a line comes alive and shows the speed when data is flowing. Tap a device to open its card.
- Device card: custom name, icon, group, traffic today and right now, Wi-Fi signal, internet cut-off, schedule and daily limit.
- Groups ("Kids", "Guests", "Smart home"): rules apply to all devices in the group at once: disable, a "from … to …" schedule, a daily limit for each device. Groups can also be managed from the bot.

**Internet access**
- A card on the Overview page and buttons in the bot: cut off a device's internet manually, on a schedule with a choice of weekdays and several windows (for example, for a child from 23:00 to 07:00), or by a daily traffic limit. There is a block log.
- "All / Online / Offline / With rules" tabs plus per-group tabs, search, and a "Check now" button. "Online" is detected reliably: Wi-Fi devices by their association with the access point, wired devices by their reply to an ARP request (idle phones drop out of the ARP table, so it can't be relied on alone).

**Sign-in screen**
- Three summary cards (internet, current speed, speed test, uptime, firmware, temperature, load, memory, number of devices) are chosen in "Personalization → Sign-in screen". You can also upload your own image instead of the logo there. The summary is shown only on the local network.

**Backup**
- A button in the bot creates a verified local archive and sends it to Telegram; the backup also stays in the router storage. Telegram secrets and OpenWrt network settings are not included in the archive. You can create an archive in LuCI; to get it as a separate file and safely restore settings, use the Telegram bot or SSH.

**Update from the UI**
- A "New version available" dialog, one-click install with sha256 and signature verification, rollback on error, a list of changes after sign-in. Details in the [Update](#update) section.

Current data is collected in RAM (`/tmp`). To make history survive a reboot, point `PERSIST_DIR` to a USB/SD card: Nightfall then saves the detailed series, the long history (up to 90 days), the hourly Wi-Fi signal and hourly traffic. Backups are then automatically placed in a separate `nightfall-backups` folder on the same external drive. If the drive is not mounted, history saving is paused without writing to the underlying `/overlay`, and backups temporarily go to `/tmp`.

### Lite mode for low-end routers
The `LITE` setting in Resource Monitor → settings. `LITE=0` (the default) is the full mode: the collector polls every 15 seconds, and per-app accounting and Wi‑Fi history are available. `LITE=1` is Lite: polling once every 60 seconds, no per-app accounting or Wi‑Fi history, noticeably less CPU and memory load. The mode actually running on the router is shown in the monitor header and in the "Router status" card ("Mode: Full" or "Mode: Lite"); this reflects what is really running, not just what is written in the settings.

### Traffic by app

The "Traffic by app" card on the Overview page shows how much YouTube, Telegram, Netflix and other services downloaded (today, 7 and 30 days, in total or per device). Under the "Other" row you can see the heaviest unrecognized domains.

It is turned on with a button in the card itself: the theme enables the DNS log in dnsmasq (the file `/tmp/nightfall-dns.log` in RAM, up to 1 MB) and conntrack counters. The router matches connection addresses with the names from DNS queries. Turning it off restores the previous dnsmasq settings. Built-in rules are in `/usr/share/nightfall/apps.list`; add your own to `/etc/nightfall-apps.list` in the format `Name|space-separated domains|IP prefixes` (they are checked first).

Limitations: traffic over a VPN and encrypted DNS (DoH/DoT) cannot be identified, with Flow Offloading enabled the counters may be too low, and the accuracy is approximate.

### Telegram notifications and bot

The monitor can message you in Telegram: internet lost or back, overheating, low memory, a reboot, and an unknown device appearing on the network (it also goes to the event feed even without Telegram). No more than 30 messages per hour.

**Setup:** Resource Monitor → History → Settings → "Telegram notifications".
1. In Telegram, create a bot with @BotFather (`/newbot`) and paste the token.
2. Open your bot and press Start.
3. Press "Detect chat id", then "Send test".
4. Turn on "Send notifications" and save.

**Bot with buttons** (in a private chat it answers the owner, the configured `TG_CHAT`; control is available to the administrator). Send `/menu`. The main menu has: **Status**, **Clients**, **Traffic**, **Apps**, **Speed**, **Blocking**, **Guest Wi-Fi**, **Wake device** (Wake-on-LAN), **Backup**, **Services**, **Reboot**, **Clear chat** and **Updates**. The Blocking section has devices, groups and the log. Restarting services and rebooting require a separate confirmation. Commands: `/menu`, `/help`, `/status`, `/clients`, `/traffic`, `/apps`, `/speed`, `/block`, `/bl` (block log), `/wake`, `/guest`, `/svc`, `/restart`, `/report`, `/update`, `/widget`. Disable it with `TG_BOT=0`.

**Device blocking.** The "Blocking" button lists devices (🟢 online, 🔴 blocked, ⏰ has a schedule): tapping one cuts off or restores its internet. The same, plus a "from … to …" schedule (it can span midnight), is available in the "Internet access" card on the Overview page. Only internet access is cut off, by MAC address (a separate nft table `inet nightfall`); the router and the local network stay reachable. Phones with a random Wi-Fi address are better restricted in the phone's own settings. The list is stored in `/etc/nightfall-block.list`.

**Limits and log.** In the "Internet access" card (the ⏰ button next to a device) you can set a daily traffic limit: once the device downloads more, its internet is cut off until the end of the day, and Telegram gets a "Restore for today" button. "Restore" also works for schedules: the rule is skipped until the end of the day. The log records who was blocked, when and why (`/etc/nightfall-block.log`).

**A new device** is reported in Telegram with "It's mine" and "Block" buttons.

**Groups in the bot.** In the Blocking section, the "👥 Groups" button: tapping a group cuts off or restores internet for the whole group (🟢 active, 🔴 blocked, ⏰ schedule, 📉 limit). Groups are created on the Devices page. A device can be restored individually ("Restore" in its card), but if the group was blocked manually, restore the group first. Files: `/etc/nightfall-devices.list` (names, icons, groups) and `/etc/nightfall-groups.list` (group rules); both are included in the backup.

**Backup and restore.** The "Backup" button creates a verified archive, saves it on the router and sends it to Telegram as a separate file. Under the file, press **"Check and restore"**: the bot checks the archive and shows its contents. Only after the check does a separate **"Restore settings"** confirmation appear (valid for 5 minutes), or "Cancel". After a successful restore the bot reports the result and restarts the collector and itself. OpenWrt network settings are not included in the archive; `TG_TOKEN` and `TG_PROXY` are not archived but kept from the router's current configuration. Do not extract the archive manually over `/` or `/etc`. Details: [backup and restore](docs/backup-restore.md).

**Updates.** Every 6 hours the bot checks whether a new theme version is out and sends a notification with "Install", "Later" and "Skip version" buttons (the "Updates" menu button and the `/update` command work the same way). Installation verifies sha256 and the signature and rolls back on error; only administrators can install. Disable it with `TG_UPDATES=0`.

**Clean chat.** The bot cleans up after itself: your command and previous replies are deleted, and the new reply is always at the bottom and visible right away (in a private chat; turned off with the "Bot cleans up after itself" setting). The "🧹 Clear chat" button deletes the bot's replies and your commands. Router alerts and backups are kept.

**Live Status (preview).** If you turn on "Live widgets in the bot" (`TG_WIDGETS`), "📊 Status" arrives as an interactive message (Telegram Bot API 10.4): the CPU, memory and storage rings, temperature, ping and speed update by themselves while the message is on screen. Works only in a private chat; older clients and groups get plain text. If the widget doesn't arrive, the `/widget` command shows why (whether the setting is on, whether it's a private chat, what Telegram replied).

**Speed test, guest Wi-Fi, services.** "⚡ Speed → Test now" runs a speed test and shows the result in the same message. "📶 Guest Wi-Fi" turns on the guest network for 1 hour, 4 hours or a day (requires a separate Wi-Fi network with "guest" (or its Russian equivalent) in its name, or a disabled network). "🔁 Services" restarts Wi-Fi, DHCP and DNS, the firewall or the network.

**Reboot** and service restarts from the bot require confirmation with a button (valid for one minute).

**Bot in a group.** If "Chat id" is a group (the id starts with "-"), only the people listed in "Who can control the bot in a group" (`TG_USERS`, comma-separated ids) can control the bot (blocking, groups, Wake-on-LAN, backup, reboot); other members can only view. If you message the bot without being on the list, it replies with your id.

**Daily report.** In the settings, set "Daily report time" (for example `21:00`): at that time you get the day's traffic, top devices and apps, alerts and the maximum temperature. Empty = off.

**curl** is required (`apk add curl`). If `api.telegram.org` is blocked for you, set "Telegram proxy" (for example `socks5h://127.0.0.1:1080`) or "VPN interface" (for example `wg0`): requests to Telegram will go through them. Known devices are stored in `/etc/nightfall-known.list`; phones with a random Wi-Fi address may be considered new. The bot token is stored in `/etc/nightfall-monitor.conf` (mode 600) and is not shown in the UI.

## Support the project

If the theme is useful to you, you can buy the author a cup of tea. It's voluntary and doesn't affect anything.

[![Support via CloudTips](docs/donate.png)](https://pay.cloudtips.ru/p/7e7fa6da)

## Installation

You need SSH access to the router.

**With one command** (the router needs internet access):
```sh
wget -qO- https://raw.githubusercontent.com/jigarvarma2k20/nightfall-openwrt/main/install-update.sh | sh
```
The script finds the latest version, downloads its archive, verifies the checksum and the signature, and reports at the end which version was installed. If `wget` can't handle HTTPS, use `curl -fsSL URL | sh` (`apk add curl ca-bundle`).

Options go after `sh -s --`, for example `... | sh -s -- --activate`:

| Option | What it does |
| --- | --- |
| `--activate` | make Nightfall the default theme right away |
| `--check` | only show the installed and the latest version |
| `--force` | reinstall even if the latest version is already installed |
| `--list` | show recent versions so you can pick one |
| `--version vX.Y.Z` | install a specific published version tag |
| `--file PATH` | install from a local archive |

**Manually, without internet on the router:** download `nightfall-root.tar.gz` from [Releases](https://github.com/jigarvarma2k20/nightfall-openwrt/releases/latest) and `install-update.sh`, put them together and run:
```sh
scp -O nightfall-root.tar.gz install-update.sh root@192.168.1.1:/tmp/
ssh root@192.168.1.1 "cd /tmp && sh install-update.sh --activate"
```
Without `--activate`, select the theme in System → System → Language and Style. Old archives accidentally left in `/tmp` are not used when installing "from the internet".

After installation, log out of LuCI and log in again, then press `Ctrl+F5`. After an update, a "What's new" dialog with sections from `CHANGELOG.md` appears in the same browser; it is marked as seen after you press "Got it". On a fresh install this dialog is not shown. On iPhone, close the Home Screen app and open it again.

## Update

Use the same command as for installation. Settings are kept. If the latest version is already installed, the script says so (`--force` reinstalls).

### Update from the UI

When a new version is released, the theme shows a "New version available" dialog. Press "Update": the router downloads the release, verifies its sha256 checksum and installs it; on error the files are restored from a backup. Since v1.0.11 releases are also signed with a usign key: the router verifies the signature with the public key `/etc/nightfall-release.pub` and does not install an archive with an invalid signature. After installation the session restarts. After you sign in again in the same browser, a "What's new" dialog with the changes from `CHANGELOG.md` appears, unless this version was already confirmed with the "Got it" button. On a fresh install the dialog is not shown; if the changelog file is temporarily unavailable, it will try again at the next sign-in.

Downloading on the router requires **curl** (`apk add curl`; on older versions `opkg install curl`), and signature verification requires `usign` (already included in OpenWrt 25.12). See the change history in [CHANGELOG.md](CHANGELOG.md).

The first update to a signed version (v1.0.11) is installed with sha256 verification and brings the public key; from then on the signature is always verified. If a release is unsigned or the signature is invalid, the update stops.

## Uninstall

Directly on the router (over SSH), with one command:
```sh
wget -qO- https://raw.githubusercontent.com/jigarvarma2k20/nightfall-openwrt/main/uninstall.sh | sh
```
The script restores the standard theme and removes everything: the theme, the Resource Monitor, the bot, the history collector, menu entries (including "Nightfall: all elements"), rpcd permissions, LuCI config entries and the cache. Your settings (`/etc/nightfall-*`) are kept, so everything comes back after a reinstall. Options (after `sh -s --`):

- `--wipe` remove absolutely everything, including settings, device lists, the log and the bot token;
- `--theme-only` only restore the standard theme, leave the files.

If LuCI doesn't open at all: `uci set luci.main.mediaurlbase=/luci-static/bootstrap; uci commit luci`.

## Configuration

- Theme look: the Personalization button at the bottom left. Colors and sizes are at the top of `cascade.css` (`--nf-accent`, `--nf-bg`, `--nf-radius`).
- Alerts, internet check addresses, history folder: Monitor → History → "Alert settings", or the file `/etc/nightfall-monitor.conf`.
- Collector service: `/etc/init.d/nightfall-collector start|stop|restart|enable|disable`. Without it, history, traffic accounting and the Telegram bot don't work (the bot is started by the same service).
- Per-device traffic accounting requires `net.netfilter.nf_conntrack_acct=1`:
  `echo "net.netfilter.nf_conntrack_acct=1" >> /etc/sysctl.conf && sysctl -p`.
  With flow offloading enabled, part of the traffic is invisible and the numbers may be too low.
- "Wake device" requires the `etherwake` package. If the temperature isn't shown, send the output of `ls /sys/class/thermal/*/type /sys/class/hwmon/*/name`.

## Requirements and compatibility

- **Target platform: OpenWrt 25.12 with LuCI.** Actual hardware testing of the current line was done on a Cudy WR3000U-256MB with OpenWrt 25.12.6. On 23.05 and 24.10 the LuCI templates and menus may differ; compatibility there is not confirmed. 21.02 and older are not supported.
- **CPU architecture doesn't matter:** the theme contains no compiled programs, only CSS, JS, templates and shell scripts.
- **Space:** after installation the theme takes about 1.4 MB. On routers with 4–8 MB of flash this may be a lot; with 16 MB or more there's no problem. If space is tight, you can remove the iPhone splash screens (`/www/luci-static/nightfall/splash`).
- **RAM:** history is stored in `/tmp`. On routers with 64 MB or less it takes a noticeable share of memory.
- **Temperature** is read from `/sys/class/thermal` and `/sys/class/hwmon`. If a model has no such sensors, temperature isn't shown; everything else works.
- **Per-device and per-app traffic accounting** requires `nf_conntrack` (see [Configuration](#configuration)).
- **Updating from the UI and Telegram** require `curl`; signature verification requires `usign`.

## Status

**Confirmed hardware configuration:** Cudy WR3000U-256MB with OpenWrt 25.12.6. On this device the following were tested: running the collector and the Telegram bot, notifications, device and app statistics, saving history to USB, creating and restoring a backup. This does not mean that every third-party LuCI page or additional package (for example, adblock and sqm) has been tested. For other models and OpenWrt versions there are no confirmed hardware results yet; consider compatibility unverified until reports come in.

If you installed the theme on another router, tell us in [Issues](https://github.com/jigarvarma2k20/nightfall-openwrt/issues) how it went: model, OpenWrt version, what works and what doesn't. That way the list of tested devices will grow. Found a bug or want an improvement? Same place.

## Repository structure

- `luci-theme-nightfall/`: the theme: CSS, JS, templates.
- `luci-app-nightfall-monitor/`: the monitor, history collector, per-app accounting, Telegram bot, updates, menus, access permissions.
- `CHANGELOG.md`: change history (the "What's new" dialog after an update); `FAQ.md`: answers to common questions; `docs/backup-restore.md`: a detailed backup guide.
- `install-update.sh` (install and update), `install.sh` (wrapper), `uninstall.sh`: install, update, uninstall.
- `build-release.sh`: builds `dist/nightfall-root.tar.gz`.

## Releasing a version

Releases are signed with a [usign](https://git.openwrt.org/project/usign.git) key. Create the key once on any router: `usign -G -c "Nightfall release key" -s nf.sec -p nf.pub`, put the contents of `nf.pub` into `luci-theme-nightfall/root/etc/nightfall-release.pub`, and the contents of `nf.sec` into the repository secret `NIGHTFALL_SIGN_KEY` (Settings → Secrets and variables → Actions).

The theme version is stored in `luci-theme-nightfall/htdocs/luci-static/nightfall/version.json` (the About page shows it); before a release keep it equal to the number in the top line of `CHANGELOG.md`, which `tools/check.sh` verifies. You don't need to change the asset cache version (`?v=…` in `header.ut`) manually for a release: `build-release.sh` sets it to the release number.

Then create a release with a tag like `vX.Y.Z` (on the Releases page or with `gh release create`). GitHub Actions builds `nightfall-root.tar.gz`, signs it, attaches the `.sha256` and `.sig` files, and updates `latest.json`. Don't forget to add an entry to `CHANGELOG.md`.

The repository contains no symbolic links (`nightfall-light`, `nightfall-dark`, `prefs.json`): `build-release.sh` creates them. To build an `.apk` with the SDK, create them manually.
