#!/bin/sh
# Block schedule tests (days of week, multiple windows, overnight windows, groups): sh tools/test-block.sh
cd "$(dirname "$0")/.." || exit 1
B=$(pwd)/luci-app-nightfall-monitor/root/usr/libexec/nightfall-block
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
ok=0; bad=0
export NF_BLOCK=$T/b.list NF_GROUPS=$T/g.list NF_DEVICES=$T/d.list NF_BLOCKLOG=$T/log NF_DIR=$T/dir NF_NFT=true NF_NOTIFY=true NF_PROC=$T/proc NF_LEASES=$T/leases
mkdir -p "$T/dir" "$T/proc/net"; : > "$T/leases"
M=aa:bb:cc:dd:ee:01
run() { sh "$B" "$@"; }
want() { case "$3" in *"$2"*) ok=$((ok+1)); echo "ok   $1" ;; *) bad=$((bad+1)); echo "FAIL $1: expected \"$2\", got \"$3\"" ;; esac; }
# device state on a given day of week and time: sched or empty
st() { NF_DOW=$1 NF_NOW=$2 run list | tr '{' '\n' | grep "\"mac\":\"$M\"" | sed -n 's/.*"reason":"\([a-z]*\)".*/\1/p'; }
chk() { # day time expected(sched|-) description
	r=$(st "$1" "$2"); [ -n "$r" ] || r=-
	[ "$r" = "$3" ] && { ok=$((ok+1)); echo "ok   $4"; } || { bad=$((bad+1)); echo "FAIL $4: day $1, $2 -> \"$r\", expected \"$3\""; }
}

want "invalid days rejected" "days of week" "$(run sched $M 23:00 09:00 Test 89)"
want "identical start and end rejected" "must not be the same" "$(run sched $M 10:00 10:00 Test 5)"
want "sched with days 65 (Fri, Sat)" '"ok":true' "$(run sched $M 23:00 09:00 Test 65)"
want "days normalized in ascending order" "|56|" "$(cat $NF_BLOCK)"
chk 5 2330 sched "Fri 23:30 — Friday night: blocked"
chk 6 0100 sched "Sat 01:00 — continuation of Friday night"
chk 7 0100 sched "Sun 01:00 — continuation of Saturday night"
chk 6 2330 sched "Sat 23:30 — blocked"
chk 7 2330 - "Sun 23:30 — Sunday is not in the list"
chk 5 0100 - "Fri 01:00 — Thursday night is not included"
chk 6 0900 - "Sat 09:00 — the window has ended"
chk 3 1200 - "Wed daytime — free"

want "second window (weekend daytime)" '"ok":true' "$(run sadd $M 10:00 12:00 67)"
want "second window recorded" "10:00-12:00@67" "$(cat $NF_BLOCK)"
chk 6 1100 sched "Sat 11:00 — second window"
chk 7 1130 sched "Sun 11:30 — second window"
chk 5 1100 - "Fri 11:00 — second window does not apply"
chk 6 1200 - "Sat 12:00 — second window has ended"
want "window for every day (1234567 = all)" '"ok":true' "$(run sadd $M 14:00 15:00 7654321)"
chk 3 1430 sched "Wed 14:30 — every-day window"
want "number out of range" "no such window" "$(run sdel $M 9)"
want "no number" "window number" "$(run sdel $M x)"
want "sdel 3" '"ok":true' "$(run sdel $M 3)"
chk 3 1430 - "after deleting the window Wed 14:30 is free"
chk 6 1100 sched "second window remains"
want "replacing the first window keeps the others" "10:00-12:00@67" "$(run sched $M 22:00 06:00 Test 12345 >/dev/null; cat $NF_BLOCK)"
chk 2 2300 sched "new first window: Tue 23:00"
chk 6 2300 - "new first window: Sat 23:00 not included"
want "list returns days and rules" '"rules":"10:00-12:00@67"' "$(run list)"
want "list returns days" '"days":"12345"' "$(run list)"
want "empty days: window every day" '"ok":true' "$(run sched $M 08:00 09:00 Test)"
chk 4 0830 sched "no days — every day"
want "off removes the whole schedule" '"ok":true' "$(run sched $M off)"
chk 6 1100 - "no windows after off"

echo "== groups =="
want "gadd" '"ok":true' "$(run gadd Kids)"
want "meta: device into a group" '"ok":true' "$(run meta $M Test phone Kids)"
want "gsched with days" '"ok":true' "$(run gsched Kids 20:00 22:00 12345)"
want "gsadd" '"ok":true' "$(run gsadd Kids 21:00 23:00 67)"
chk 2 2100 sched "group: Tue 21:00"
chk 6 2200 sched "group: Sat 22:00 (second window)"
chk 6 1900 - "group: Sat 19:00 free"
want "groups returns rules" '"rules":"21:00-23:00@67"' "$(run groups)"
want "gsdel" '"ok":true' "$(run gsdel Kids 2)"
chk 6 2200 - "no second window after gsdel"
want "gsched off" '"ok":true' "$(run gsched Kids off)"
chk 2 2100 - "group schedule removed"


# Check that the physical LAN port from the FDB is passed into the JSON.
PORTMAC=aa:bb:cc:dd:ee:02
printf '%s LAN4\n' "$PORTMAC" > "$T/ports"
printf '192.168.1.20 dev br-lan lladdr %s REACHABLE\n' "$PORTMAC" > "$T/neigh"
export NF_NEIGH=$T/neigh NF_WIFI=$T/wifi NF_PORTMAP=$T/ports NF_IP=true NF_PING=false
: > "$T/wifi"
r=$(run list)
want "LAN port added to JSON" '"connection":"LAN4"' "$r"
unset NF_NEIGH NF_WIFI NF_PORTMAP NF_IP NF_PING

echo; echo "TOTAL: ok=$ok, failed=$bad"
[ "$bad" -eq 0 ]
