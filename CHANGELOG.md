## v1.30.0 · English interface
- [Important] **The whole interface is now in English**: Personalization, Overview widgets, Resource Monitor, sign-in screen, notifications, the Telegram bot and the router scripts. Numbers and dates use the en-US format.
- [Important] **Updates come from the jigarvarma2k20/nightfall-openwrt fork**, which signs releases with its own key.
- [Improved] Traffic history recorded by earlier versions still shows correctly: old app names and events are converted to English.
- [Improved] Device types are still recognized from Russian device names, and guest networks with Russian names are still detected.
- [Fixed] The installer no longer prints garbled characters after the version number when run in some shells.

## v1.29.0 · Router log center and smart diagnostics
- [Added] **Router log center**: recognizes syslog levels and inline message markers (err, warn, notice, info, debug) and visually separates errors, warnings and notices.
- [Added] **Log filters and tools**: quick level filters, search by service and text, manual refresh, auto-refresh, copying entries and CSV export.
- [Added] **Event details**: expand the full entry with the syslog priority, service and original message text.
- [Added] **Grouping repeats**: identical events are merged with a repeat count, the time of each occurrence and the first/last event bounds; grouping can be turned off.
- [Fixed] **Expanded groups**: an open event keeps its state when the log refreshes periodically; the scroll position is not reset.
- [Added] **Smart diagnostics**: pattern-based hints for WAN/internet, DNS, Wi-Fi, VPN/proxy, service restarts and login attempts; selecting a category filters the matching entries.
- [Fixed] **cron classification**: normal crond job-start lines (USER ... cmd ...) are shown as NOTICE, not as a command execution error.
- [Important] Diagnostics analyzes the existing logread output and gives pattern-based hints, not a final diagnosis. No new background services, no persistent log writes to flash and no automatic network, firewall or VPN changes are added.
- [Tests] Added checks for syslog levels, WAN/DNS diagnostics, repeat grouping, preserving the expanded state and responsive log display.

## v1.28.11 · LuCI interface and backup fixes
- [Fixed] **LuCI navigation**: opening another section now correctly closes the previous top menu and updates `aria-expanded`.
- [Fixed] **"Save" button**: improved visibility in the macOS style for the light and dark themes.
- [Fixed] **DHCP tables**: stabilized the width of empty DHCPv4/DHCPv6 tables when the card is first expanded.
- [Fixed] **Port tooltips**: tooltips are no longer clipped by the network interface card borders.
- [Fixed] **Form validation**: fields with errors are more noticeable.
- [Fixed] **Backups**: added a POSIX fallback to `od` and `awk` when the Base64 encoder is missing, fails or outputs an incomplete block; backup file permissions are not changed.
- [Tests] Added regression checks for backup fallback encoding.

## v1.28.10 · Bridge MAC filter fix
- [Fixed] **Device list**: multiple repeater MACs are now correctly passed to the filter as a list; bridge stations confirmed by DHCP are not shown as separate devices for blocking.

## v1.28.9 · Accurate display of clients behind a repeater
- [Fixed] **Device list**: the Wi-Fi bridge MAC is no longer shown as a separate client device with a block button when DHCP and the neighbor table confirm it is an intermediate node.
- [Fixed] **Wi-Fi clients**: end-device IPs from DHCP hints are no longer assigned to bridge stations.
- [Fixed] **Wi-Fi quality and heat map**: the intermediate bridge's signal history is excluded from end-client scores; the bridge is not counted as a separate household member or as a source of weak-signal recommendations.

## v1.28.8 · Fix for the device list behind a repeater
- [Fixed] **Internet access**: if `ip neigh` shows the repeater MAC, the list uses the end device's MAC from the DHCP lease.
- [Fixed] **Duplicate devices**: a shared next-hop MAC is no longer presented as the MAC of several clients when DHCP can't tell them apart.

## v1.28.7 · Device identification and monitor fixes
- [Fixed] **Devices behind a repeater**: DHCP leases are used as the reliable IP-to-MAC mapping; clients behind a bridge are not merged into the repeater's radio MAC.
- [Fixed] **Traffic history**: large daily counters are serialized without truncation.
- [Improved] **Monitor settings**: fixed section header artifacts, overflow of long fields and an extra card border on focus.

## v1.28.6 · Stable release: traffic accuracy, history and backups
- [Fixed] **Device traffic**: IPv4/IPv6 normalization, history matching by MAC with an IP fallback only for old entries without a MAC, aggregation of all device addresses.
- [Fixed] **App traffic**: protection against invalid values, accounting for multiple device addresses and keeping the VPN / direct / unknown route split.
- [Fixed] **Numeric values**: formatters reject `NaN`, infinities and negative volumes instead of printing invalid units.
- [Fixed] **Persistent history**: safe recovery after the drive is disconnected and reconnected; writing to the internal `/overlay` is allowed only with explicit permission and a free-space reserve.
- [Fixed] **Backups**: block transfer checks the read, the size and the Base64; errors in intermediate commands are no longer masked by a successful pipeline.
- [Fixed] **Telegram widget**: no more parallel requests during initialization and the first interaction.
- [Tests] Extended regression checks for traffic, USB/overlay storage, backups and the browser layout of the history.
- [Checks] Full GitHub Actions CI and the build of the release install archive passed.
- [Checks] Tested on a Cudy WR3000U-256MB with OpenWrt 25.12.6: collector, Telegram bot and notifications, device and app statistics, USB history, creating and restoring a backup.
- [Note] Hardware results apply only to the stated configuration; compatibility with other models is confirmed by separate community tests.

## v1.28.5 · Settings layout fix
- [Fixed] **Alert settings cards**: sections are now collapsible cards with their own headers and expand indicators.
- [Fixed] **Telegram settings**: the notification, bot control and connection cards no longer stretch to the height of neighboring columns; large empty areas are gone.
- [Responsive] The settings grid switches to two columns on tablets and one column on narrow screens.
- [Compatibility] Changes are limited to the `monitor.js` interface; configuration, UCI options, backend, Telegram and network settings are unchanged.

## v1.28.3 · Reworked settings in the History tab
- [Improved] **Settings layout**: main options are arranged in two columns, with card heights fitting their content.
- [Improved] **Telegram settings**: separate subsections for notifications, bot control and connection.
- [Improved] **Switches**: 0/1 options are shown as clear toggle switches; saving keeps the existing configuration format.
- [Improved] **Actions and help**: buttons are gathered in a shared panel, technical notes are collapsed.
- [Responsive] On narrow screens the blocks switch to a single column.
- [Compatibility] Existing UCI options, backend, Telegram handlers, diagnostics and backups are preserved.

## v1.28.2 · Log tab fix
- [Fixed] **`undefined` label**: removed an extra empty element in the markup of the Resource Monitor Log tab.
- [Tests] Full CI passed on PR #159 and again on `main`.

## v1.28.1 · Responsive layout of the Traffic tab
- [Fixed] **Chart and legend position**: on desktop screens they are aligned to the top; on mobile screens the vertical layout is kept.
- [Improved] **Responsive distribution card**: the chart and legend are laid out correctly on wide and narrow screens, without the legend shifting due to vertical centering.
- [Improved] **Traffic categories**: a long list collapses into "Other" with the source categories summed correctly.
- [Tests] Desktop/mobile layout checks now use element geometry, not just vertical coordinates; added checks for the legend placed to the right of and below the chart.

## v1.28.0 · App traffic in the Resource Monitor
- [Added] **A separate Traffic tab** in the Resource Monitor: statistics by category, app and domain, without changing the existing tabs.
- [Added] **Period and device filters**: today, 7 or 30 days; a total traffic summary and the VPN / direct / unknown route split.
- [Improved] **Conservative classification**: social networks, messengers, video, shops, games, banks, clouds, system services, ads, CDN, DNS and certificates. Ambiguous IPs and domains stay unrecognized.
- [Compatibility] The tab uses the existing collector and the app history endpoint; no new services, DNS settings, routes, VPN or firewall rules are added or changed.
- [Improved] **Unified look**: cards, colors and controls inherit the active theme and Nightfall personalization settings.
- [Tests] Added checks for counting, the device filter, routes, domain classification and a Playwright smoke test for desktop and mobile screens.

## v1.27.12 · Accurate app and DNS recognition
- [Fixed] **Shared VK CDNs**: `okcdn.ru` is no longer attributed entirely to Odnoklassniki; the confirmed `calls.okcdn.ru` and `videowebrtc.okcdn.ru` are assigned to MAX.
- [Improved] **MAX calls and video**: added narrow patterns `videostun*.okcdn.ru` and `call*-*.vkuser.net`; shared parent domains are not classified as a whole.
- [Added] **Wibes**: a separate category for `wibes.ru` and `wibes.com`, so the service is not mixed with the main Wildberries.
- [Improved] **VK catalog**: added VK CDN, user media and video domains based on public domain lists and observed hosts.
- [Fixed] **IPs without a DNS name**: a specific reason is shown instead of an anonymous "Other". It does not assume the device necessarily uses DoH/DoT.
- [Fixed] **Shared IPs/CDNs**: a conflict between several known apps is marked explicitly and not assigned to the last DNS answer.
- [Improved] **Explanations**: the interface explains a missing DNS name, shared CDNs and ambiguous domains.
- [Tests] Added checks for MAX/OK on shared domains, a missing DNS name, CDN conflicts, keeping Unknown and the explanation markup.
- [Improved] **App catalog**: added confirmed domains for VK, VK Video, MAX, Wildberries, Apple, Mail.ru, Microsoft and Dzen; the dubious `rtbcdn.ru` is no longer attributed to RuTube.
- [Fixed] **DNS reclassification**: domains already collected under "Other" are re-checked against the updated catalog without waiting for a new DNS query.
- [Fixed] **DNS map lifetime**: saving entries no longer artificially refreshes the observation time; the six-hour lifetime now really expires.
- [Improved] **Traffic card**: "Other" details are shown in a separate responsive panel with domain, route, volume and share columns; the unknown route is labeled explicitly.
- [Tests] Added checks for reclassifying old DNS entries, real TTL expiry, confirmed domains and the new card markup.
- [Improved] **App statistics**: fixed domain separation in the "Other" breakdown; VPN/Direct/Unknown volumes are visible directly in the route labels.
- [Fixed] **App DNS map**: IP↔domain entries have a limited lifetime (6 hours); old two-column maps are safely rebuilt from new DNS answers.
- [Tests] Added regressions for DNS/CNAME, stale and conflicting IP mappings, the device filter, routes and the UI breakdown.
- [Fixed] **Static DHCP leases**: long host names and multiple MAC addresses wrap inside the table instead of pushing columns and buttons outside the card.
- [Checks] Tested on a Cudy WR3000U-256MB with OpenWrt 25.12.6: a long name, two MAC addresses, action buttons and the DHCP table on wide and narrow screens.
- [Improved] **App statistics**: fixed domain separation in the "Other" breakdown; VPN/Direct/Unknown volumes are visible directly in the route labels.
- [Fixed] **App DNS map**: IP↔domain entries have a limited lifetime (6 hours); old two-column maps are safely rebuilt from new DNS answers.
- [Tests] Added regressions for DNS/CNAME, stale and conflicting IP mappings, the device filter, routes and the UI breakdown.
- [Fixed] **Static DHCP leases**: long host names and multiple MAC addresses wrap inside the table instead of pushing columns and buttons outside the card.
- [Checks] Tested on a Cudy WR3000U-256MB with OpenWrt 25.12.6: a long name, two MAC addresses, action buttons and the DHCP table on wide and narrow screens.

## v1.27.10 · Change history and the "What's new" dialog
- [Added] **View history manually**: a "What's new" button is available in the theme settings, in the "About" section. The full history dialog can be opened at any time, not only right after an update.
- [Fixed] **Repeated notification**: if CHANGELOG.md is temporarily unavailable or has no section for the installed version yet, the version is not marked as seen. Nightfall tries again at the next sign-in.
- [Improved] **Unified release format**: the changelog is included in the archive automatically and shown in the Nightfall-styled dialog with change cards and a "Got it" button.
- [Release check] Publishing is blocked if the top CHANGELOG.md section does not match the release tag or contains no description of changes.
- [Tests] Added checks for opening the dialog manually, reloading the changelog and the mandatory CHANGELOG section for each release.

## v1.27.9 · Update and backup reliability
- [Fixed] **Update archive checks**: the installer accepts the standard Nightfall symbolic links only from an exact list of allowed paths and targets; foreign links, hard links and special file types are rejected.
- [Fixed] **Safe update rollback**: before replacing files, it checks that the previous version can be saved. If installation fails, the previous files are restored; a critical rollback error is not disguised as an ordinary failure.
- [Fixed] **Backup and restore**: stricter checks of manifest compatibility and archive contents; restore operations prepare the data before applying changes.
- [Fixed] **Service lifecycle**: start, stop and restart checks of the collector and related components are now more robust against repeated calls and incomplete states.
- [Fixed] **History and monitoring**: hardened event collection, temperature history, block schedules and LAN traffic accounting.

## v1.27.8 · "What's new" dialog fix
- [Fixed] **Moving from a test version to a stable one**: version comparison now takes prerelease suffixes into account. The stable `1.27.7` is now correctly considered newer than `1.27.7-alpha…`, so the change history dialog is not skipped.
- [Tests] Added checks for the order of stable and prerelease versions, including the `1.27.7-alpha.1-test5 → 1.27.7` transition.
- [Docs] Updated the Russian and English README, the FAQ and the backup guide: USB/SD storage, the temporary fallback to `/tmp`, archive rotation and safe restore.

## v1.27.7 · Persistent storage reliability
- [Fixed] **Protection against USB disconnects**: the actual mount point is checked before every save, not just whether the directory is accessible.
- [Fixed] If the drive is disconnected, Nightfall no longer creates the directory and temporary files in the underlying `/overlay`; history collection continues in RAM.
- [Added] After the USB drive is reconnected, saving resumes automatically. History from the drive is merged with the data in RAM: time points are deduplicated, daily counters are summed without counting already synced data twice.
- [Security] Writes are performed from inside the mounted file system; the mount is re-checked before a temporary file is published.
- [Tests] Added scenarios for a missing drive at startup, disconnection while running, reconnection, history recovery and the `PERSIST_ANY` mode.
- [Added] Settings backups are now saved by default next to the history on the attached USB/SD drive; if no external drive is available, the temporary `/tmp` directory is used with an explicit warning.
- [Added] Automatic rotation: the last 5 archives are kept by default (configurable range 1–20) via a LuCI setting.
- [Added] Manual creation of a verified local backup directly from the LuCI monitor settings.
- [Fixed] A Telegram backup is now created by the same verified tool and stays saved locally; the Telegram token and proxy are excluded from the archive.

## v1.27.6 · Wired connection detection
- [Fixed] **LAN connection display**: the "Internet access" list shows the physical port (`LAN1`, `LAN2`, etc.) when it can be determined from the bridge FDB.
- [Fixed] The port is determined with `bridge fdb` or with `brctl showmacs` / `brctl showstp`; if the firmware doesn't provide a physical port table, the neutral "online" status remains.
- [Unchanged] Wi-Fi clients are still detected by their active association with the access point and are shown separately; wired devices do not appear in the "Wi-Fi now" list.
- [Tests] Added a check that the LAN port is passed in the device list JSON.

## v1.27.5 · Accurate identification of network clients
- [Fixed] **Wrong device names when a MAC changes or is randomized**: the active MAC of a Wi-Fi client now takes priority over a stale DHCP binding to the same IP.
- [Fixed] Names from DHCP/LuCI are no longer picked by random key order: if several MACs map to one IP, the ambiguous name is not used.
- [Fixed] In the "Top clients" block and the device table, an active Wi-Fi station no longer gets another device's name just because of a reused IP.
- [Important] Old historical counters stay bound to IPs and cannot be reliably re-attributed retroactively. The new identification applies to current data; when ambiguous, the IP is shown instead of a guessed name.

# Nightfall changelog

## v1.27.4 · "What's new" dialog fix
- [Fixed] **Retrying the changelog download**: if \`CHANGELOG.md\` could not be fetched due to a network or HTTP error, the next LuCI load retries the request instead of treating the version as already seen.
- [Fixed] **Seen confirmation**: a version is marked as seen only after the changelog is successfully loaded and parsed and the user presses the "Got it" button.
- [Fixed] Users whose version was marked by the old mechanism without the dialog being shown get a one-time restored notification with the last four history sections.
- [Changed] On a fresh install the "What's new" dialog no longer appears unnecessarily.
- [Tests] Added regression checks for confirmation, reloading after an error and restoring a missed notification.

## v1.27.3 · Device detection, security and traffic accounting
- [Fixed] **Clients behind Wi-Fi repeaters**: DHCP devices whose IP addresses are linked to the MAC address of an actually connected station can now be shown separately. Several devices behind a repeater are no longer merged into one entry just because of a shared proxy MAC.
- [Fixed] The state of such clients is determined from the neighbor NUD state. No made-up signal level or Wi-Fi speed is shown for them; unconfirmed entries are not presented as reliably reachable.
- [Fixed] The SSH check now considers both Dropbear options: \`PasswordAuth\` and \`RootPasswordAuth\`. Password login for root and for other users is assessed separately.
- [Added] The standard LuCI interface cards now have a local custom port label. In the current implementation it is stored in the browser's \`localStorage\` and does not change UCI, DSA, switch or system port names.
- [Added] The interface now explains how hardware Flow Offloading causes differences between WAN counters and conntrack. The traffic accounting algorithm itself is not replaced by this change.
- [Fixed] Device traffic classification no longer relies on the "private IP" flag. Client IPv4 subnets are determined from the connected routes of the main routing table; the WAN subnet is included only when a DHCP client exists, for the "router on a stick" setup.
- [Fixed] The router's own current IPv4 addresses, including WAN and VPN /32, are excluded; LAN↔LAN traffic and traffic to the router itself are no longer counted as client internet traffic.
- [Changed] A one-time \`acct.v=3\` migration clears the previous daily totals and conntrack baselines: the old data could include WAN/VPN addresses and cannot be reliably recalculated retroactively.
- [Tests] Added regression checks for LAN subnet detection, accounting for clients behind a repeater and Dropbear setting variants.

## v1.27.2 · Backup and update reliability
- [Fixed] **Backup transfer on minimal OpenWrt builds**: \`base64\` is now declared a package dependency; the installer checks for the command and installs \`coreutils-base64\` via \`apk\`/\`opkg\` if needed. The backup utility now gives a clear error if the encoder is unavailable, instead of an empty block. The tool version in the manifest was fixed from \`1.27.0\` to \`1.27.2\`.
- [Fixed] **Empty archive when downloading from LuCI**: the browser no longer treats an empty response as the end of the transfer. Before downloading it gets the expected size and SHA-256, then checks each block, the final size and the gzip header; SHA-256 is verified when Web Crypto is available, and supported browsers also check the gzip CRC and the length of the decompressed stream.
- [Fixed] Creating a backup now checks gzip and tar before publishing the file. Creating another backup in the same second no longer overwrites the previous archive.
- [Security] Restore is now transactional: all files and rollback copies are prepared before /etc is changed; if applying fails, the original files are restored. Symbolic links and special types of current target files are rejected.
- [Fixed] The update now stops if the previous files could not be saved for rollback. A failure of the automatic restore after a failed extraction is now explicitly reported as critical.
- [Tests] Added checks for multi-block archive upload/download, size and SHA-256, repeated creation with the same name, rollback of an interrupted restore and refusing an update without a rollback copy.
- [Docs] Updated the backup and restore guide.
- [Release] Prerelease tags like \`v1.27.2-rc.1\` are published as a Pre-release and do not change \`latest.json\`, so they don't reach the automatic update channel of the stable version.
- [Tests] The monitor smoke test now uses deterministic fixtures without background LuCI polling: fixed a race where a periodic rerender replaced the tab DOM during Playwright clicks.
- [Tests] Monitor and security log fixture timestamps are generated relative to the current run, so the last-24-hours checks don't depend on the CI run date.
- [Tests] Fixed the UCI stub for DNS statistics: the \`logqueries\` argument is checked at its actual position in the \`uci -q get\` command.
- [Tests] Fixed heredoc boundaries in the security fixtures: syslog, /proc, UCI and DNS stubs are now created as separate files and executed, instead of ending up inside one test log.
- [Tests] The monitor smoke test runs one controlled refresh cycle after each tab switch: data loads without a background race and without disabling the refresh logic.
- [Tests] Test device discovery times are set relative to the CI run, so new-device cards don't disappear because of outdated dates.
- [Tests] The new-device order check no longer compares an absolute date from an old fixture: it checks the MAC, the label and the actual order of timestamps.
