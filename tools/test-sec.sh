#!/bin/sh
# nightfall-sec test ("Security" tab): sign-in log, ports, forwards, new devices. No router needed, uses stubs.
cd "$(dirname "$0")/.." || exit 1
S="$PWD/luci-app-nightfall-monitor/root/usr/libexec/nightfall-sec"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
ok=0; bad=0
want() { case "$3" in *"$2"*) ok=$((ok + 1)); echo "ok  $1" ;; *) bad=$((bad + 1)); echo "FAIL: $1 — no \"$2\" in: $3" ;; esac; }
nowant() { case "$3" in *"$2"*) bad=$((bad + 1)); echo "FAIL: $1 — unexpected \"$2\"" ;; *) ok=$((ok + 1)); echo "ok  $1" ;; esac; }

T=$T . "$PWD/tools/sec-fixtures.sh" "$T"
export NF_SHADOW="$T/shadow" NF_DIR="$T/d"
export NF_LOGREAD="$T/logread" NF_PROC="$T/proc" NF_KNOWN="$T/known" NF_UCI="$T/uci" NF_UPDATEBIN="$T/upd"
out=$(sh "$S" summary)
echo "$out" | node -e 'JSON.parse(require("fs").readFileSync(0,"utf8"))' 2>/dev/null && { ok=$((ok + 1)); echo "ok  summary — valid JSON"; } || { bad=$((bad + 1)); echo "FAIL: summary is not JSON: $out"; }
want "failed SSH sign-ins: 3" '"failed_ssh":3' "$out"
want "failed LuCI sign-ins: 1" '"failed_luci":1' "$out"
want "most frequent offending address" '["203.0.113.5",2]' "$out"
want "successful sign-in is visible" '"ssh",1,"root","192.168.1.10"' "$out"
want "LuCI: sign-in recorded" '"luci",0,"root","203.0.113.9"' "$out"
printf '%s' "$out" | node -e '
const d = JSON.parse(require("fs").readFileSync(0, "utf8"));
const rows = d.newdev || [];
if (rows.length < 2 || rows[0][0] !== "aa:bb:cc:dd:ee:02" || rows[0][1] !== "Camera" || rows[1][0] !== "aa:bb:cc:dd:ee:01" || !(rows[0][2] > rows[1][2])) process.exit(1);
' && { ok=$((ok + 1)); echo "ok  new devices: latest first"; } || { bad=$((bad + 1)); echo "FAIL: new devices: wrong order or timestamps"; }
want "port 22 is dropbear listening on all addresses" '["tcp",22,"all","dropbear"]' "$out"
want "port 8080 listens locally only" '["tcp",8080,"local"' "$out"
want "port 80 over IPv6 — uhttpd" '["tcp",80,"all","uhttpd"]' "$out"
want "UDP 53 is visible" '["udp",53,"all"' "$out"
want "port forward from the internet" '["Web","tcp","8080","192.168.1.5","80"]' "$out"
nowant "disabled forward is not shown" "Off" "$out"
want "check: empty root password" '["bad","Root password is not set' "$out"
want "check: network without password" '["bad","Network '"'"'Guest'"'"' has no password' "$out"
want "check: outdated encryption" '["warn","Network '"'"'Old'"'"' allows outdated' "$out"
want "check: good encryption" '["ok","Network '"'"'Home'"'"': encryption sae-mixed' "$out"
nowant "check: disabled network is not counted" "'Off'" "$out"
want "check: SSH keys only" '["ok","SSH: root password sign-in is off (PasswordAuth)' "$out"
# Dropbear: root password login requires both PasswordAuth and RootPasswordAuth.
AUTH_UCI="$T/uci-auth"
cat > "$AUTH_UCI" <<'U'
#!/bin/sh
case "$*" in
  *"show wireless"*) exec "$NF_UCI_BASE" "$@" ;;
  *"RootPasswordAuth"*) echo "${NF_TEST_RPA:-on}"; exit 0 ;;
  *"PasswordAuth"*) echo "${NF_TEST_PA:-on}"; exit 0 ;;
esac
exec "$NF_UCI_BASE" "$@"
U
chmod +x "$AUTH_UCI"
NF_UCI_BASE="$T/uci" NF_UCI="$AUTH_UCI" NF_TEST_PA=on NF_TEST_RPA=on sh "$S" summary > "$T/auth-on.json"
want "SSH: both options on — root password allowed" '["warn","SSH: root password sign-in is on' "$(cat "$T/auth-on.json")"
NF_UCI_BASE="$T/uci" NF_UCI="$AUTH_UCI" NF_TEST_PA=on NF_TEST_RPA=off sh "$S" summary > "$T/auth-root-off.json"
want "SSH: RootPasswordAuth off — root password denied" '["ok","SSH: root password sign-in is off (RootPasswordAuth)' "$(cat "$T/auth-root-off.json")"
want "SSH: RootPasswordAuth off does not hide password auth for regular users" '["ok","SSH: password authentication is allowed for unprivileged users' "$(cat "$T/auth-root-off.json")"
NF_UCI_BASE="$T/uci" NF_UCI="$AUTH_UCI" NF_TEST_PA=off NF_TEST_RPA=on sh "$S" summary > "$T/auth-all-off.json"
want "SSH: PasswordAuth off turns password authentication off" '["ok","SSH: root password sign-in is off (PasswordAuth)' "$(cat "$T/auth-all-off.json")"
want "check: LuCI over http" '["warn","LuCI is available over http' "$out"
want "WAN inbound policy" '"wan_input":"REJECT"' "$out"
nowant "an ESTABLISHED connection is not counted as a port" '50000' "$(echo "$out" | sed 's/"ssh",1,"root","192.168.1.10"//')"
u=$(sh "$S" updates)
want "updates: theme version" '"installed":"1.0.0"' "$u"
want "updates: a new one is available" '"new":1' "$u"
NF_LOGREAD=true sh "$S" summary >/dev/null && { ok=$((ok + 1)); echo "ok  empty log does not break the summary"; } || { bad=$((bad + 1)); echo "FAIL: empty log"; }
# quick diagnostics: gateway, internet, DNS (command stubs)
D="$PWD/luci-app-nightfall-monitor/root/usr/libexec/nightfall-diag"
mkdir -p "$T/bin"
printf '#!/bin/sh\necho "default via 192.168.1.1 dev eth0"\n' > "$T/bin/ip"
printf '#!/bin/sh\necho "round-trip min/avg/max = 9.0/12.4/15.0 ms"\n' > "$T/bin/ping"
printf '#!/bin/sh\nexit 0\n' > "$T/bin/nslookup"
chmod +x "$T/bin/ip" "$T/bin/ping" "$T/bin/nslookup"
c=$(PATH="$T/bin:$PATH" sh "$D" check)
want "check: gateway responds" "✅ Gateway 192.168.1.1: 12 ms" "$c"
want "check: internet responds" "✅ Internet: 1.1.1.1 — 12 ms" "$c"
want "check: DNS resolves" "✅ DNS: ya.ru resolves" "$c"
printf '#!/bin/sh\nexit 1\n' > "$T/bin/ping"; printf '#!/bin/sh\nexit 1\n' > "$T/bin/nslookup"
c=$(PATH="$T/bin:$PATH" sh "$D" check)
want "check: no internet is visible" "❌ Internet: 1.1.1.1 is not responding" "$c"
want "check: DNS failure is visible" "❌ DNS: google.com does not resolve" "$c"

# address blocking via nft (stub)
cat > "$T/nft" <<'N'
#!/bin/sh
echo "$*" >> "$NFT_LOG"
case "$1 $2" in
"-f -") cat >> "$NFT_LOG"; touch "$NFT_LOG.on" ;;
"list table") [ -f "$NFT_LOG.on" ] && echo "ip saddr @b4 drop" ;;
"list set") case "$5" in b4) printf 'table inet nightfall_ban {\n\tset b4 {\n\t\ttype ipv4_addr\n\t\tflags timeout\n\t\telements = { 203.0.113.5 timeout 1d expires 23h59m10s,\n\t\t\t     198.51.100.7 timeout 1h expires 59m1s }\n\t}\n}\n' ;; esac ;;
esac
exit 0
N
chmod +x "$T/nft"; export NFT_LOG="$T/nft.log"; : > "$NFT_LOG"; rm -f "$NFT_LOG.on"
b=$(NF_NFT="$T/nft" sh "$S" ban 203.0.113.5 2)
want "ban: external address is blocked" '"ok":true,"ip":"203.0.113.5","hours":2' "$b"
want "ban: nft table created" "add rule inet nightfall_ban input ip saddr @b4 drop" "$(cat $NFT_LOG)"
want "ban: address added for 2 hours" "add element inet nightfall_ban b4 { 203.0.113.5 timeout 2h }" "$(cat $NFT_LOG)"
b=$(NF_NFT="$T/nft" sh "$S" ban 192.168.1.10); want "ban: local address not allowed" '"ok":false' "$b"
b=$(NF_NFT="$T/nft" sh "$S" ban 10.0.0.5); want "ban: 10.x not allowed" '"ok":false' "$b"
b=$(NF_NFT="$T/nft" sh "$S" ban 127.0.0.1); want "ban: loopback not allowed" '"ok":false' "$b"
b=$(NF_NFT="$T/nft" sh "$S" ban 'a;rm -rf /'); want "ban: garbage instead of an address is rejected" '"ok":false' "$b"
b=$(NF_NFT="$T/nft" sh "$S" ban 256.1.1.1); want "ban: invalid address is rejected" '"ok":false' "$b"
b=$(NF_NFT="$T/nft" sh "$S" ban fe80::1); want "ban: link-local IPv6 not allowed" '"ok":false' "$b"
b=$(NF_NFT="$T/nft" sh "$S" ban 2001:db8::5 99999); want "ban: IPv6 accepted, duration capped" '"hours":24' "$b"
want "ban: IPv6 went into its own set" "add element inet nightfall_ban b6 { 2001:db8::5 timeout 24h }" "$(cat $NFT_LOG)"
b=$(NF_NFT="$T/nft" sh "$S" bans)
want "bans: list with remaining time" '["203.0.113.5","23h59m10s"]' "$b"
want "bans: second address" '["198.51.100.7","59m1s"]' "$b"
NF_NFT="$T/nft" sh "$S" unban 203.0.113.5 >/dev/null
want "unban: address removed" "delete element inet nightfall_ban b4 { 203.0.113.5 }" "$(cat $NFT_LOG)"
# notification about a burst of failed sign-ins
rm -rf "$T/wd"; mkdir -p "$T/wd"
w=$(NF_DIR="$T/wd" NF_SECFAILS=3 sh "$S" watch); [ -z "$w" ] && { ok=$((ok + 1)); echo "ok  watch: first run is silent (remembers the counter)"; } || { bad=$((bad + 1)); echo "FAIL: watch first run: $w"; }
echo 0 > "$T/wd/sec.fails"
w=$(NF_DIR="$T/wd" NF_SECFAILS=3 sh "$S" watch); want "watch: growth of failed sign-ins produces a message" "Many failed sign-ins" "$w"
w=$(NF_DIR="$T/wd" NF_SECFAILS=3 sh "$S" watch); [ -z "$w" ] && { ok=$((ok + 1)); echo "ok  watch: silent without new growth"; } || { bad=$((bad + 1)); echo "FAIL: watch repeated: $w"; }
# router log
L="$PWD/luci-app-nightfall-monitor/root/usr/libexec/nightfall-log"
r=$(sh "$L" read 100)
echo "$r" | node -e 'JSON.parse(require("fs").readFileSync(0,"utf8"))' 2>/dev/null && { ok=$((ok + 1)); echo "ok  nightfall-log: valid JSON"; } || { bad=$((bad + 1)); echo "FAIL: nightfall-log is not JSON: $r"; }
want "log: service without process id" '"authpriv.warn","dropbear","Bad password attempt for' "$r"
want "log: full message text" "from 203.0.113.5:40022" "$r"
want "log: kernel error level is kept" '"kern.err","rtw88_8821cu","error beacon valid"' "$r"
want "log: steerd message with warn is kept" '"user.notice","steerd","steer[warn] tunnel:' "$r"
want "log: info notice is kept" '"daemon.notice","tachyon","[info] No subscription rules' "$r"
r=$(sh "$L" read 2); nowant "log: N limits the number of lines" "02:10:01" "$r"
r=$(sh "$L" read abc); want "log: garbage instead of N does not break" '"ok":true' "$r"


# DNS statistics
N="$PWD/luci-app-nightfall-monitor/root/usr/libexec/nightfall-dns"
d=$(NF_LOGREAD="$T/dnslogread" NF_UCI="$T/uci_dns" sh "$N" top)
echo "$d" | node -e 'JSON.parse(require("fs").readFileSync(0,"utf8"))' 2>/dev/null && { ok=$((ok + 1)); echo "ok  dns: valid JSON"; } || { bad=$((bad + 1)); echo "FAIL: dns is not JSON: $d"; }
want "dns: total queries" '"total":6' "$d"
want "dns: sites collapse to the main domain" '["youtube.com",2]' "$d"
want "dns: bbc.co.uk is counted as bbc.co.uk" '["bbc.co.uk",1]' "$d"
want "dns: client 192.168.1.11 — 3 queries" '["192.168.1.11",3]' "$d"
want "dns: NXDOMAIN counted" '"nx":2' "$d"
want "dns: NXDOMAIN list" '["nope.example.org",2]' "$d"
want "dns: query types" '["A",5]' "$d"
nowant "dns: other services are not counted" "fake.test" "$d"
d=$(NF_LOGREAD=true NF_UCI="$T/uci_off" sh "$N" top); want "dns: no queries and no log — disabled" '"enabled":false' "$d"

# route with loss and bufferbloat (stubs)
printf '#!/bin/sh\ncat <<X\ntraceroute to 1.1.1.1\n 1  192.168.1.1  0.5 ms  0.4 ms  0.4 ms\n 2  * * *\n 3  10.0.0.1  5.0 ms  * 7.0 ms\nX\n' > "$T/bin/traceroute"; chmod +x "$T/bin/traceroute"
r=$(PATH="$T/bin:$PATH" sh "$D" route 1.1.1.1)
want "route: first hop without loss" "192.168.1.1           0%" "$r"
want "route: silent hop 100%" "100%" "$r"
want "route: partial loss 33%" " 33%" "$r"
printf '#!/bin/sh\nn=$(cat "$NF_CNT" 2>/dev/null || echo 0); n=$((n + 1)); echo $n > "$NF_CNT"\n[ "$n" = 1 ] && echo "round-trip min/avg/max = 10.0/12.0/15.0 ms" || echo "round-trip min/avg/max = 100.0/190.0/300.0 ms"\n' > "$T/bin/pingb"
printf '#!/bin/sh\nsleep 4\n' > "$T/bin/curlb"; chmod +x "$T/bin/pingb" "$T/bin/curlb"
b=$(NF_CNT="$T/cnt" NF_PING="$T/bin/pingb" NF_CURL="$T/bin/curlb" sh "$D" bloat)
want "bloat: idle 12 ms" "idle: 12 ms" "$b"
want "bloat: under load 190 ms" "190 ms (+178 ms)" "$b"
want "bloat: SQM conclusion" "severe bufferbloat" "$b"
b=$(NF_CURL=/nonexistent sh "$D" bloat); want "bloat: hint without curl" "curl is needed" "$b"

# WAN address history and the ISP NAT flag
H="$PWD/luci-app-nightfall-monitor/root/usr/libexec/nightfall-history"
mkdir -p "$T/xd"; printf '1700000000 203.0.113.7\n1700005000 100.64.3.9\n1700009000 192.168.8.2\n' > "$T/xd/extip.log"
x=$(NF_DIR="$T/xd" sh "$H" extip)
want "extip: public address is not NAT" '[1700000000,"203.0.113.7",0]' "$x"
want "extip: 100.64/10 is CGNAT" '[1700005000,"100.64.3.9",1]' "$x"
want "extip: private address on WAN is NAT" '[1700009000,"192.168.8.2",1]' "$x"

# per-program memory history: collection (collector function) and output
mkdir -p "$T/pm/1" "$T/pm/2" "$T/pm/3" "$T/pd"
printf 'Name:\tuhttpd\nVmRSS:\t3000 kB\n' > "$T/pm/1/status"; printf 'Name:\tkthreadd\n' > "$T/pm/2/status"; printf 'Name:\tdnsmasq\nVmRSS:\t9000 kB\n' > "$T/pm/3/status"
sed -n '/^procmem_point() {/,/^}/p' "$PWD/luci-app-nightfall-monitor/root/usr/libexec/nightfall-collector" > "$T/pmfn.sh"
( DIR="$T/pd"; LITE=0; NF_PROCDIR="$T/pm"; . "$T/pmfn.sh"; procmem_point )
pl=$(cat "$T/pd/procmem.log")
want "procmem: the largest program first" "dnsmasq:9000 uhttpd:3000" "$pl"
nowant "procmem: kernel thread without memory is excluded" "kthreadd" "$pl"
( DIR="$T/pd"; LITE=1; NF_PROCDIR="$T/pm"; . "$T/pmfn.sh"; procmem_point ); [ "$(wc -l < "$T/pd/procmem.log")" = 1 ] && { ok=$((ok + 1)); echo "ok  procmem: not written in Lite mode"; } || { bad=$((bad + 1)); echo "FAIL: procmem is written in Lite"; }
n=$(date +%s); printf '%s dnsmasq:5000\n%s dnsmasq:9000 uhttpd:3000\n1000 old:1\n' $((n - 3600)) $((n - 60)) > "$T/pd/procmem.log"
pj=$(NF_DIR="$T/pd" sh "$H" procmem 24)
want "procmem: output contains both fresh points" '[["dnsmasq",5000]]' "$pj"
want "procmem: second point with two programs" '[["dnsmasq",9000],["uhttpd",3000]]' "$pj"
nowant "procmem: old point filtered out" '"old"' "$pj"
# The neighbor table returns the entry state together with the MAC: REACHABLE/STALE must not be mixed.
printf '192.168.1.191 dev br-lan lladdr de:0d:ab:73:aa:8e REACHABLE\n192.168.1.192 dev br-lan lladdr de:0d:ab:73:aa:8e STALE\n192.168.1.193 dev br-lan FAILED\n' > "$T/neigh.txt"
nj=$(NF_DIR="$T/pm" NF_NEIGH="$T/neigh.txt" sh "$H" devices)
want "devices: proxy MAC and REACHABLE state kept" '["192.168.1.191","de:0d:ab:73:aa:8e","REACHABLE"]' "$nj"
want "devices: STALE state is not lost" '["192.168.1.192","de:0d:ab:73:aa:8e","STALE"]' "$nj"
nowant "devices: FAILED neighbor is not reported as reachable" '192.168.1.193' "$nj"

echo; echo "TOTAL: ok=$ok, failed=$bad"; [ "$bad" = 0 ]
