# Nightfall backup and restore

Applies to **Nightfall v1.28.6**. The `/usr/libexec/nightfall-backup` utility creates an archive of Nightfall settings, checks its structure and the manifest checksums, shows a preview and performs a transactional restore.

**Hardware testing:** creating and restoring backups was tested on a Cudy WR3000U-256MB with OpenWrt 25.12.6. This guide describes Nightfall features and does not limit their use to this model; on other devices the behavior should be checked separately.

> The archive is meant for moving and restoring Nightfall settings. It is **not an OpenWrt backup** and does not contain the router's network configuration.

## Where archives are stored

If `PERSIST_DIR` in `/etc/nightfall-monitor.conf` points to an actually mounted external USB/SD drive, archives are automatically saved to a separate `nightfall-backups` folder on the same partition.

For example, with:

```sh
PERSIST_DIR=/mnt/sda1/nightfall
```

backups are located in:

```
/mnt/sda1/nightfall-backups/
```

If no external drive is configured or mounted, the temporary directory `/tmp/nightfall-backups` is used. It is in RAM and is cleared on reboot. The utility reports which storage was selected. When the USB/SD drive comes back, new backups are saved to the external drive again.

The number of archives kept on USB/SD is set with `BACKUP_KEEP`: from 1 to 20, 5 by default. Rotation removes only old, completed Nightfall archives of this router. Temporary copies in `/tmp` are not rotated automatically by this rule.

To check the settings and find archives:

```sh
grep -E '^(PERSIST_DIR|BACKUP_KEEP)=' /etc/nightfall-monitor.conf
find /mnt -type f -path '*/nightfall-backups/nightfall-backup-*.tar.gz' -print 2>/dev/null
ls -lh /tmp/nightfall-backups/ 2>/dev/null
```

## Create a backup

### Via Telegram

1. Open the Nightfall Telegram bot and press **"Backup"**.
2. The bot creates and checks the archive, saves a local copy on the router and sends the archive as a separate file message.
3. A **"Check and restore"** button appears under the file. It is used to check the archive and start the restore procedure; creating a backup by itself does not change any settings.

### Via LuCI or SSH

The Resource Monitor settings have a **"Create backup now"** action. It creates a verified archive and shows its path.

Over SSH you can run:

```sh
/usr/libexec/nightfall-backup create
```

The output shows the full path to the archive, the number of files and the selected storage. Before rebooting the router or moving settings, copy the archive from the USB/SD drive to a computer, or keep the file sent by the bot.

## Check an archive

Before restoring, an archive can be checked separately:

```sh
/usr/libexec/nightfall-backup list /PATH/TO/nightfall-backup-NAME.tar.gz
```

The command checks the archive format, the manifest, the checksums and the allowed set of files. It only shows the contents and changes nothing.

## Restore via Telegram

This is the recommended method if the archive was created with the bot button or is available to the bot in local storage.

1. Press **"Check and restore"** under the message with the archive.
2. The bot checks the local archive and shows its manifest and list of files.
3. If the check succeeds, the **"Restore settings"** and **"Cancel"** buttons appear.
4. Press **"Restore settings"** only if you agree to replace the current Nightfall settings with the contents of the archive. The confirmation is valid for 5 minutes.
5. After a successful restore, the bot reports the result and automatically restarts the collector and the Telegram bot.

The **"Cancel"** button cancels the request and leaves the current settings unchanged. If the archive check fails, the bot does not offer to apply it. If the confirmation has expired, run the check again.

## Restore via SSH

First, run a preview:

```sh
/usr/libexec/nightfall-backup restore /PATH/TO/ARCHIVE.tar.gz
```

Make sure the archive contents are what you expect. Then confirm applying it separately:

```sh
/usr/libexec/nightfall-backup restore /PATH/TO/ARCHIVE.tar.gz apply
/etc/init.d/nightfall-collector restart
```

The restore is transactional: before replacing files, the utility prepares the new files and copies of the current settings. If applying fails, it tries to put the original files back. If the rollback also fails, the utility prints a critical error message; check the `/etc` directory manually.

## What the archive contains

The archive contains only the Nightfall files that existed when it was created. Depending on the enabled features, these may be:

- `nightfall-monitor.conf`: monitor, persistent storage and notification settings;
- `nightfall-prefs.json`, `nightfall-logo.json`, `nightfall-bg.json`: personalization;
- lists of devices, groups, blocks, known devices and app rules;
- the Nightfall event log;
- the public key for verifying release signatures.

Always check the actual contents of a specific archive in the output of the `list` command or in the restore preview.

## What the archive does not contain

- OpenWrt network settings: LAN/WAN, DHCP, firewall, Wi-Fi and other system parameters;
- the Telegram secrets `TG_TOKEN` and `TG_PROXY`;
- temporary history data from `/tmp/nightfall`.

On restore, the current `TG_TOKEN` and `TG_PROXY` are kept from the router's active configuration, if they were set. So when restoring on the same router you don't need to enter them again. When moving an archive to a new router, set the Telegram token and proxy in the new device's settings.

The archive may contain device names, groups and logs. Treat it as personal data and do not publish it.

**Important:** do not use `tar -xzf archive.tar.gz -C /` to restore. That bypasses the checks, the preservation of current secrets and the Nightfall rollback mechanism.
