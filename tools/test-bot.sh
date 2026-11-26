#!/bin/sh
# Bot and notification tests without Telegram or a router: curl is replaced with a stub.
# Run from the repository root: sh tools/test-bot.sh
cd "$(dirname "$0")/.." || exit 1
L=$(pwd)/luci-app-nightfall-monitor/root/usr/libexec
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
fail=0
ok()  { echo "ok: $1"; }
bad() { echo "FAIL: $1"; fail=1; }

# curl stub: logs the API method, the message text and whatever came on stdin (arguments separately, in $T/args);
# for getUpdates returns the prepared response from $T/updates (once), {"ok":true} for everything else
cat > "$T/curl" <<'SH'
#!/bin/sh
in=$(cat)
m=$(printf '%s' "$in" | sed -n 's|.*api.telegram.org/bot[^/]*/\([A-Za-z]*\).*|\1|p')
printf '%s\n' "$*" >> "$T/args"
txt=""; for a in "$@"; do case "$a" in text@*|caption@*|chat_data@*) txt="$txt [${a%%@*}] $(cat "${a#*@}" 2>/dev/null | tr '\n' ' ')" ;; allow_queries=*|reply_markup=*) txt="$txt [$a]" ;; esac; done
printf 'METHOD %s TEXT %s STDIN %s\n' "$m" "$txt" "$(printf '%s' "$in" | tr '\n' ' ')" >> "$T/calls"
if [ "$m" = getUpdates ]; then
	if [ -s "$T/updates" ] && ! printf '%s' "$*" | grep -q 'offset=-1'; then cat "$T/updates"; : > "$T/updates"; else echo '{"ok":true,"result":[]}'; fi
elif [ "$m" = editMessageText ] && [ -e "$T/edit.fail" ]; then
	echo '{"ok":false,"error_code":400,"description":"Bad Request: message to edit not found"}'
elif [ "$m" = sendMessage ] || { [ "$m" = sendWidget ] && [ ! -e "$T/widget.fail" ]; }; then
	n=$(( $(cat "$T/mid" 2>/dev/null || echo 100) + 1 )); echo $n > "$T/mid"; printf '{"ok":true,"result":{"message_id":%s,"chat":{"id":1}}}' "$n"
elif [ "$m" = sendWidget ]; then
	echo '{"ok":false,"error_code":400,"description":"Bad Request: widgets are not supported"}'
else
	case "$m" in deleteMessages|editMessageText|answerWidgetQuery) printf '%s %s\n' "$m" "$*" | sed 's/^deleteMessages/DEL/;s/^editMessageText/EDIT/;s/^answerWidgetQuery/ANS/' >> "$T/calls" ;; esac
	echo '{"ok":true,"result":{}}'
fi
SH
chmod +x "$T/curl"
export T

conf() {  # conf CHAT USERS [PROXY] [TG_CLEAN] [TG_WIDGETS]
	printf 'TG=1\nTG_TOKEN=123456:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\nTG_CHAT=%s\nTG_USERS=%s\nTG_PROXY=%s\nTG_CLEAN=%s\nTG_WIDGETS=%s\n' "$1" "$2" "$3" "${4:-1}" "${5:-0}" > "$T/conf"
}
upd() {  # upd CHAT SENDER TEXT | upd cb CHAT SENDER DATA
	if [ "$1" = cb ]; then
		printf '{"ok":true,"result":[{"update_id":10,"callback_query":{"id":"77","from":{"id":%s,"is_bot":false},"message":{"message_id":5,"from":{"id":999,"is_bot":true},"chat":{"id":%s,"type":"supergroup"},"text":"x"},"data":"%s"}}]}' "$3" "$2" "$4" > "$T/updates"
	else
		printf '{"ok":true,"result":[{"update_id":10,"message":{"message_id":5,"from":{"id":%s,"is_bot":false},"chat":{"id":%s,"type":"supergroup"},"text":"%s"}}]}' "$2" "$1" "$3" > "$T/updates"
	fi
}
runbot() {
	: > "$T/calls"; rm -f "$T/rebooted" "$T/wifi.done" "$T/speed.started" "$T/guest.calls"
	NF_CONF="$T/conf" NF_DIR="$T" NF_CURL="$T/curl" NF_NOSLEEP=1 NF_ONCE=1 NF_NOTIFY="$L/nightfall-notify" NF_REBOOT="touch $T/rebooted" NF_PROC="$T/proc" NF_LEASES="$T/leases" \
		NF_WIDGETS="${NF_W:-$T/widgets}" NF_SPEEDBIN="$T/speedbin" NF_GUESTBIN="$T/guestbin" NF_WIFI="$T/wifibin" NF_INITD="$T/initd" NF_BACKUP_TOOL="$T/backupbin" sh "$L/nightfall-bot" >/dev/null 2>&1
}
# stubs: speed test, guest network, wifi and init scripts
printf '#!/bin/sh\ntouch "$T/speed.started"\n' > "$T/speedbin"
printf '#!/bin/sh\nprintf "%%s\\n" "$*" >> "$T/guest.calls"\ncase "$1" in cands) printf "wifinet1|Guest|0|\\nwifinet2|Kids WiFi|1|1900000000\\n" ;; *) echo "{\\"ok\\":true}" ;; esac\n' > "$T/guestbin"
printf '#!/bin/sh\ntouch "$T/wifi.done"\n' > "$T/wifibin"
mkdir -p "$T/initd"; printf '#!/bin/sh\ntouch "$T/dns.done"\n' > "$T/initd/dnsmasq"
chmod +x "$T/speedbin" "$T/guestbin" "$T/wifibin" "$T/initd/dnsmasq"
mkdir -p "$T/proc/sys/kernel"; echo 100 > "$T/proc/uptime"; echo "0.1 0.1 0.1" > "$T/proc/loadavg"; echo testrouter > "$T/proc/sys/kernel/hostname"
printf 'MemTotal: 1000 kB\nMemAvailable: 500 kB\n' > "$T/proc/meminfo"

# 1. private chat: the own user is served, a stranger is not
conf 111 ""; upd 111 111 "/status"; runbot
grep -q 'METHOD sendMessage' "$T/calls" && ok "private chat: owner gets a reply" || bad "private chat: owner got no reply"
conf 111 ""; upd 222 222 "/status"; runbot
grep -q 'METHOD sendMessage' "$T/calls" && bad "foreign chat got a reply" || ok "foreign chat is ignored"

# 2. group: a member outside TG_USERS can view but not control
conf -100500 111; upd -100500 222 "/status"; runbot
grep -q 'METHOD sendMessage' "$T/calls" && ok "group: viewing is available to all members" || bad "group: viewing does not work"
conf -100500 111; upd -100500 222 "/reboot"; runbot
grep -q 'Control is available to administrators only' "$T/calls" && ok "group: a stranger cannot request a reboot" || bad "group: a stranger got through"
[ -e "$T/rebooted" ] && bad "group: a stranger rebooted the router"
conf -100500 111; upd cb -100500 222 "rb:yes"; date +%s > "$T/reboot.ask"; runbot
[ -e "$T/rebooted" ] && bad "group: a stranger confirmed the reboot" || ok "group: a stranger cannot confirm the reboot"
conf -100500 111; upd -100500 111 "/reboot"; runbot
grep -q 'Confirm within a minute' "$T/calls" && ok "group: an administrator requests a reboot" || bad "group: an administrator did not get through"
# without TG_USERS control in a group is closed
conf -100500 ""; upd -100500 111 "/reboot"; runbot
grep -q 'Control is available to administrators only' "$T/calls" && ok "group without TG_USERS: control is closed" || bad "group without TG_USERS: control is open"

# 3. reboot confirmation: a fresh one works once, an old one does not
conf 111 ""; upd cb 111 111 "rb:yes"; date +%s > "$T/reboot.ask"; runbot; sleep 3
[ -e "$T/rebooted" ] && ok "reboot: a fresh confirmation works" || bad "reboot: a fresh confirmation did not work"
[ -e "$T/reboot.ask" ] && bad "reboot: the confirmation is not one-time" || ok "reboot: the confirmation is one-time"
conf 111 ""; upd cb 111 111 "rb:yes"; echo $(( $(date +%s) - 120 )) > "$T/reboot.ask"; runbot; sleep 3
[ -e "$T/rebooted" ] && bad "reboot: an expired confirmation worked" || ok "reboot: an expired confirmation is rejected"
conf 111 ""; upd cb 111 111 "rb:yes"; rm -f "$T/reboot.ask"; runbot; sleep 3
[ -e "$T/rebooted" ] && bad "reboot: worked without a request" || ok "reboot: does not work without a request"

# 4. a proxy with a password must not end up in curl arguments
conf 111 "" "socks5h://user:secret@127.0.0.1:1080"
: > "$T/calls"; : > "$T/args"; NF_CONF="$T/conf" NF_DIR="$T" NF_CURL="$T/curl" NF_NOSLEEP=1 sh "$L/nightfall-notify" test >/dev/null
grep -q secret "$T/args" && bad "proxy is visible in curl arguments" || ok "proxy is not in curl arguments"
grep -q 'STDIN.*proxy = "socks5h://user:secret@127.0.0.1:1080"' "$T/calls" && ok "proxy passed via stdin" || bad "proxy not passed"

# 5. the TG_USERS setting is validated
printf 'TG_USERS=\n' > "$T/c2"; cp "$T/c2" "$T/c3"
r=$(NF_CONF="$T/c3" NF_DEF="$T/c2" NF_NORESTART=1 sh "$L/nightfall-config" set TG_USERS=123456789,987654321)
case "$r" in *'"ok":true'*) ok "TG_USERS: a valid value is accepted" ;; *) bad "TG_USERS: a valid value was rejected: $r" ;; esac
r=$(NF_CONF="$T/c3" NF_DEF="$T/c2" NF_NORESTART=1 sh "$L/nightfall-config" set 'TG_USERS=12;reboot')
case "$r" in *'"ok":false'*) ok "TG_USERS: garbage rejected" ;; *) bad "TG_USERS: garbage accepted: $r" ;; esac

# 6. chat cleanup: the reply is at the bottom, the command and old replies are deleted
conf 111 ""; rm -f "$T/mid"; printf '41\n42\n' > "$T/bot.msgs"; upd 111 111 "/status"; runbot; sleep 1
grep -E '^DEL .*message_ids=\[(5,41,42|41,42,5|5,42,41)\]|^DEL .*message_ids=\[[0-9,]*\]' "$T/calls" | grep -q '41' && grep '^DEL' "$T/calls" | grep -q '5,41,42' && ok "cleanup: the command and old replies were deleted" || bad "cleanup: deletion did not work: $(grep DEL "$T/calls")"
[ "$(cat "$T/bot.msgs")" = "101" ] && ok "cleanup: only the new reply is left in the list" || bad "cleanup: message list: $(tr '\n' ' ' < "$T/bot.msgs")"
conf 111 "" "" 0; rm -f "$T/mid"; printf '41\n' > "$T/bot.msgs"; upd 111 111 "/status"; runbot; sleep 1
grep -q '^DEL' "$T/calls" && bad "TG_CLEAN=0: messages were deleted" || ok "TG_CLEAN=0: nothing is deleted"
conf -100500 111; rm -f "$T/mid"; : > "$T/bot.msgs"; upd -100500 111 "/status"; runbot; sleep 1
grep -q '^DEL' "$T/calls" && bad "group: messages were deleted automatically" || ok "group: automatic cleanup is off"
# a press on the last reply edits it in place, on an old one a new message arrives at the bottom
conf 111 ""; printf '41\n42\n' > "$T/bot.msgs"; upd cb 111 111 "status"; sed -i 's/"message_id":5/"message_id":42/' "$T/updates"; runbot; sleep 1
grep -q '^EDIT' "$T/calls" && ! grep -q '^DEL' "$T/calls" && ok "button on the last reply: edited in place" || bad "button on the last reply: $(cat "$T/calls" | cut -c1-80)"
conf 111 ""; rm -f "$T/mid"; printf '41\n42\n' > "$T/bot.msgs"; upd cb 111 111 "status"; sed -i 's/"message_id":5/"message_id":41/' "$T/updates"; runbot; sleep 1
grep -q 'METHOD sendMessage' "$T/calls" && grep '^DEL' "$T/calls" | grep -q '41' && ok "button on an old reply: new message at the bottom, old ones deleted" || bad "button on an old reply: $(cat "$T/calls" | cut -c1-80)"
# a button on a notification (the bot does not track it) edits it in place and deletes nothing
conf 111 ""; printf '41\n' > "$T/bot.msgs"; upd cb 111 111 "status"; runbot; sleep 1
grep -q '^EDIT' "$T/calls" && ! grep -q '^DEL' "$T/calls" && ok "button on a notification: edited in place, nothing deleted" || bad "button on a notification"
# "Clear chat"
conf 111 ""; rm -f "$T/mid"; printf '41\n42\n' > "$T/bot.msgs"; upd cb 111 111 "cl"; sed -i 's/"message_id":5/"message_id":42/' "$T/updates"; runbot; sleep 1
grep '^DEL' "$T/calls" | grep -q '41' && grep -q 'Chat cleared' "$T/calls" && ok "'Clear chat': all bot messages deleted" || bad "'Clear chat': $(cat "$T/calls" | cut -c1-80)"
conf -100500 111; upd -100500 222 "/clear"; runbot; sleep 1
grep -q '^DEL' "$T/calls" && bad "group: a stranger cleared the chat" || ok "group: a stranger cannot clear the chat"

# 7. speed test via button
conf 111 ""; printf '1700000000 94.20 25000000 12.0 0 ok\n' > "$T/speed.log"; upd cb 111 111 "sp:run"; runbot; sleep 3
[ -e "$T/speed.started" ] && ok "speed: test started" || bad "speed: test not started"
grep -q 'Testing speed' "$T/calls" && grep -q 'Last speed test' "$T/calls" && ok "speed: result shown in the same message" || bad "speed: no result"
grep -q 'sp:run' "$T/calls" || true
conf -100500 111; upd -100500 222 "/speed"; runbot
[ -e "$T/speed.started" ] && bad "speed: viewing started a test" || ok "speed: viewing does not start a test"
conf -100500 111; upd cb -100500 222 "sp:run"; runbot; sleep 1
[ -e "$T/speed.started" ] && bad "speed: a stranger in a group started a test" || ok "speed: a stranger cannot start a test"

# 8. guest Wi-Fi
conf 111 ""; upd 111 111 "/guest"; runbot
grep -q 'Guest' "$T/calls" && grep -q 'Kids WiFi: on until' "$T/calls" && ok "guest Wi-Fi: network list" || bad "guest Wi-Fi: list: $(cat "$T/calls" | cut -c1-120)"
conf 111 ""; upd cb 111 111 "gs:on:wifinet1:60"; runbot
grep -qx 'on wifinet1 60' "$T/guest.calls" && ok "guest Wi-Fi: turn on for an hour" || bad "guest Wi-Fi: turn on: $(cat "$T/guest.calls" 2>/dev/null)"
conf 111 ""; upd cb 111 111 "gs:off:wifinet2"; runbot
grep -qx 'off wifinet2' "$T/guest.calls" && ok "guest Wi-Fi: turn off" || bad "guest Wi-Fi: turn off"
conf 111 ""; upd cb 111 111 "gs:on:wifinet1:abc"; runbot
grep -q '^on' "$T/guest.calls" 2>/dev/null && bad "guest Wi-Fi: invalid time accepted" || ok "guest Wi-Fi: invalid time rejected"
conf -100500 111; upd cb -100500 222 "gs:on:wifinet1:60"; runbot
[ -s "$T/guest.calls" ] && bad "guest Wi-Fi: a stranger in a group turned the network on" || ok "guest Wi-Fi: a stranger cannot control it"

# 9. service restart
conf 111 ""; upd cb 111 111 "rs:wifi"; runbot
grep -q 'Confirm within a minute' "$T/calls" && grep -q 'Restart: Wi-Fi' "$T/calls" && ok "services: confirmation requested" || bad "services: no confirmation"
[ -e "$T/wifi.done" ] && bad "services: restart without confirmation"
conf 111 ""; echo "wifi $(date +%s)" > "$T/restart.ask"; upd cb 111 111 "rs:y:wifi"; runbot; sleep 3
[ -e "$T/wifi.done" ] && ok "services: Wi-Fi restarted after confirmation" || bad "services: Wi-Fi not restarted"
[ -e "$T/restart.ask" ] && bad "services: the confirmation is not one-time" || ok "services: the confirmation is one-time"
conf 111 ""; echo "dns $(date +%s)" > "$T/restart.ask"; upd cb 111 111 "rs:y:wifi"; runbot; sleep 3
[ -e "$T/wifi.done" ] && bad "services: a confirmation for another service worked" || ok "services: the confirmation is bound to the service"
conf 111 ""; echo "dns $(( $(date +%s) - 120 ))" > "$T/restart.ask"; upd cb 111 111 "rs:y:dns"; runbot; sleep 3
[ -e "$T/dns.done" ] && bad "services: an expired confirmation worked" || ok "services: an expired confirmation is rejected"
conf 111 ""; rm -f "$T/restart.ask"; upd cb 111 111 "rs:y:dns"; runbot; sleep 3
[ -e "$T/dns.done" ] && bad "services: worked without a request" || ok "services: does not work without a request"
conf -100500 111; echo "wifi $(date +%s)" > "$T/restart.ask"; upd cb -100500 222 "rs:y:wifi"; runbot; sleep 3
[ -e "$T/wifi.done" ] && bad "services: a stranger in a group restarted Wi-Fi" || ok "services: a stranger cannot restart"

# 11. "Status" widget (Bot API 10.4)
mkdir -p "$T/widgets"; cp "$L/../share/nightfall/widgets/status.html" "$T/widgets/status.html"
printf '1700000000 12 0 61.5 1250000 125000 0 12.3\n' > "$T/hist.fine"
printf 'MemTotal: 1000 kB\nMemAvailable: 400 kB\n' > "$T/proc/meminfo"
wq() {  # wq CHAT DATA
	printf '{"ok":true,"result":[{"update_id":10,"widget_query":{"id":"wq77","from":{"id":111,"is_bot":false},"chat":{"id":%s,"type":"private"},"message_id":88,"data":"%s"}}]}' "$1" "$2" > "$T/updates"
}
conf 111 "" "" 1 0; rm -f "$T/mid"; upd 111 111 "/status"; runbot
grep -q 'METHOD sendWidget' "$T/calls" && bad "widget: sent while the setting is off" || ok "widget: off by default, plain text arrives"
conf 111 "" "" 1 1; rm -f "$T/mid" "$T/bot.widgets"; : > "$T/bot.msgs"; upd 111 111 "/status"; runbot
[ ! -e "$T/bot.widget.err" ] && ok "widget: the error is cleared after a successful send" || bad "widget: the old error remained"
grep -q 'METHOD sendWidget' "$T/calls" && ok "widget: sent" || bad "widget: not sent: $(cut -c1-80 "$T/calls")"
grep 'METHOD sendWidget' "$T/calls" | grep -q 'allow_queries=true' && ok "widget: widget queries allowed" || bad "widget: no allow_queries"
grep 'METHOD sendWidget' "$T/calls" | grep -q '\[caption\] 📊 testrouter' && ok "widget: caption with the status text for older clients" || bad "widget: no caption"
cd=$(grep 'METHOD sendWidget' "$T/calls" | sed 's/.*\[chat_data\] \({[^}]*}\).*/\1/')
printf '%s' "$cd" | python3 -I -c 'import sys,json; d=json.loads(sys.stdin.read()); assert d["h"]=="testrouter" and d["c"]==12 and d["m"]==60 and d["t"]==61.5 and d["p"]==12 and d["d"]==10.0 and d["u"]==1.0 and "r" in d and "w" in d' 2>/dev/null && ok "widget: data is correct and valid JSON" || bad "widget: data: $cd"
[ ${#cd} -lt 1024 ] && ok "widget: data is under 1024 bytes" || bad "widget: data is too large"
[ "$(cat "$T/bot.widgets" 2>/dev/null)" = 101 ] && ok "widget: message remembered" || bad "widget: not remembered: $(cat "$T/bot.widgets" 2>/dev/null)"
conf 111 "" "" 1 1; rm -f "$T/mid"; upd cb 111 111 "status"; runbot; sleep 1
grep -q 'METHOD sendWidget' "$T/calls" && grep '^DEL' "$T/calls" | grep -q 'message_ids=\[5\]' && ok "widget: from the menu a new one is sent, the message with the button removed" || bad "widget: from the menu: $(cut -c1-90 "$T/calls")"
touch "$T/widget.fail"; conf 111 "" "" 1 1; rm -f "$T/mid"; upd 111 111 "/status"; runbot
grep -q 'METHOD sendMessage' "$T/calls" && grep 'METHOD sendMessage' "$T/calls" | grep -q '📊 testrouter' && ok "widget: Telegram error, plain text arrived" || bad "widget: no fallback text"
rm -f "$T/widget.fail"
[ -s "$T/bot.widget.err" ] && ok "widget: failure reason written to bot.widget.err" || bad "widget: failure reason not written"
conf 111 "" "" 1 1; rm -f "$T/mid"; upd 111 111 "/widget"; runbot
grep 'METHOD sendMessage' "$T/calls" | grep -q 'Live widgets' && grep 'METHOD sendMessage' "$T/calls" | grep -q 'last error' && ok "/widget: shows the last error" || bad "/widget: $(cut -c1-120 "$T/calls")"
printf '%s %s\n' "$(date +%s)" '{"ok":false,"error_code":400,"description":"Bad Request: INPUT_MEDIA_WIDGET_NOT_ALLOWED"}' > "$T/bot.widget.err"; rm -f "$T/mid"; upd 111 111 "/widget"; runbot
grep 'METHOD sendMessage' "$T/calls" | grep -q 'rolled out gradually' && ok "/widget: explains the INPUT_MEDIA_WIDGET_NOT_ALLOWED error" || bad "/widget: no explanation for NOT_ALLOWED: $(cut -c1-160 "$T/calls")"
grep 'METHOD sendMessage' "$T/calls" | grep -q 'Setting: on' && ok "/widget: shows that widgets are on" || bad "/widget: no setting state"
NF_W="$T/nowidgets" conf 111 "" "" 1 1; rm -f "$T/mid"; upd 111 111 "/status"; NF_W="$T/nowidgets" runbot
grep -q 'METHOD sendWidget' "$T/calls" && bad "widget: sent without a file" || ok "widget: no template file, plain text arrived"
conf -100500 111 "" 1 1; upd -100500 111 "/status"; runbot
grep -q 'METHOD sendWidget' "$T/calls" && bad "widget: sent to a group" || ok "widget: not sent in a group"
conf 111 "" "" 1 0; rm -f "$T/mid"; upd 111 111 "/widget"; runbot
grep 'METHOD sendMessage' "$T/calls" | grep -q 'Setting: off' && ok "/widget: shows that widgets are off" || bad "/widget (off): $(cut -c1-120 "$T/calls")"
# "Status" text: bars and colored dots
conf 111 "" "" 1 0; rm -f "$T/mid"; upd 111 111 "/status"; runbot
st=$(grep 'METHOD sendMessage' "$T/calls")
case "$st" in *'CPU'*'▰▱▱▱▱▱▱▱▱▱'*'12%'*) ok "status: CPU bar (12% = 1 segment)" ;; *) bad "status: no CPU bar: $st" ;; esac
case "$st" in *'🟢 Memory'*'▰▰▰▰▰▰▱▱▱▱'*'60%'*) ok "status: memory 60% (6 segments)" ;; *) bad "status: memory: $st" ;; esac
case "$st" in *'🟢 Internet: online, 12 ms'*'🟢 Temperature: 61.5'*) ok "status: internet and temperature" ;; *) bad "status: internet/temperature: $st" ;; esac
printf '1700000000 95 0 88.0 1250000 125000 0 -1\n' > "$T/hist.fine"; rm -f "$T/mid"; upd 111 111 "/status"; runbot
st=$(grep 'METHOD sendMessage' "$T/calls")
case "$st" in *'🔴 CPU'*'▰▰▰▰▰▰▰▰▰▰'*) ok "status: high load is red" ;; *) bad "status: load 95%: $st" ;; esac
case "$st" in *'🔴 Temperature: 88.0'*'🔴 Internet: OFFLINE'*|*'🔴 Internet: OFFLINE'*'🔴 Temperature: 88.0'*) ok "status: offline and heat are red" ;; *) bad "status: red: $st" ;; esac
printf '1700000000 12 0 61.5 1250000 125000 0 12.3\n' > "$T/hist.fine"
# widget query
conf 111 "" "" 1 1; wq 111 s; runbot
a=$(grep '^ANS' "$T/calls" | sed 's/.*widget_query_id=wq77.*data=\({.*}\).*/\1/')
printf '%s' "$a" | python3 -I -c 'import sys,json; d=json.loads(sys.stdin.read()); assert d["c"]==12 and d["m"]==60' 2>/dev/null && ok "widget: query 's' got fresh data" || bad "widget: query response: $(grep '^ANS' "$T/calls")"
conf 111 "" "" 1 1; wq 111 zzz; runbot
grep '^ANS' "$T/calls" | grep -q 'widget_query_id=wq77' && ! grep '^ANS' "$T/calls" | grep -q '{' && ok "widget: an unknown query gets an empty but present answer" || bad "widget: unknown query"
conf 111 "" "" 1 1; wq 999 s; runbot
grep -q '^ANS' "$T/calls" && bad "widget: answer to a foreign chat" || ok "widget: a query from a foreign chat is ignored"
conf 111 "" "" 1 1; wq 111 s; runbot
grep -q 'METHOD sendMessage\|METHOD sendWidget' "$T/calls" && bad "widget: a query created a chat message" || ok "widget: a query does not create messages"
# button under a widget: a new message arrives, the widget is deleted
conf 111 "" "" 1 1; rm -f "$T/mid"; echo 88 > "$T/bot.widgets"; printf '88\n' > "$T/bot.msgs"; upd cb 111 111 "menu"; sed -i 's/"message_id":5/"message_id":88/' "$T/updates"; runbot; sleep 1
grep -q 'METHOD sendMessage' "$T/calls" && ! grep -q '^EDIT' "$T/calls" && grep '^DEL' "$T/calls" | grep -q '88' && ok "widget: 'Menu' under a widget sends a new message and deletes the widget" || bad "widget: menu under a widget: $(cut -c1-90 "$T/calls")"
# setting
printf 'TG_WIDGETS=0\n' > "$T/c3"
r=$(NF_CONF="$T/c3" NF_DEF="$T/c3" NF_NORESTART=1 sh "$L/nightfall-config" set TG_WIDGETS=1); case "$r" in *'"ok":true'*) ok "TG_WIDGETS: value accepted" ;; *) bad "TG_WIDGETS: $r" ;; esac
r=$(NF_CONF="$T/c3" NF_DEF="$T/c3" NF_NORESTART=1 sh "$L/nightfall-config" set TG_WIDGETS=5); case "$r" in *'"ok":false'*) ok "TG_WIDGETS: garbage rejected" ;; *) bad "TG_WIDGETS: garbage accepted" ;; esac
# template size: at most 4096 bytes after zlib compression, at most 32768 raw
python3 -I -c 'import sys,zlib; d=open(sys.argv[1],"rb").read(); assert len(d)<=32768 and len(zlib.compress(d,9))<=4096, (len(d), len(zlib.compress(d,9)))' "$L/../share/nightfall/widgets/status.html" && ok "widget: size within Telegram limits" || bad "widget: size exceeded"

# 10. network list for the bot from the Wi-Fi settings (uci)
cat > "$T/uci" <<'SH'
#!/bin/sh
cat <<'EOF'
wireless.wifinet0=wifi-iface
wireless.wifinet0.mode='ap'
wireless.wifinet0.ssid='Home'
wireless.wifinet0.network='lan'
wireless.wifinet1=wifi-iface
wireless.wifinet1.mode='ap'
wireless.wifinet1.ssid='Guest "Net"'
wireless.wifinet1.network='guest'
wireless.wifinet1.disabled='1'
wireless.wifinet2=wifi-iface
wireless.wifinet2.mode='ap'
wireless.wifinet2.ssid='Гости'
wireless.wifinet2.network='lan'
wireless.wifinet3=wifi-iface
wireless.wifinet3.mode='sta'
wireless.wifinet3.ssid='Uplink'
wireless.wifinet3.disabled='1'
wireless.@wifi-iface[4]=wifi-iface
wireless.@wifi-iface[4].mode='ap'
wireless.@wifi-iface[4].ssid='Spare'
wireless.@wifi-iface[4].disabled='1'
EOF
SH
chmod +x "$T/uci"; echo 'wifinet2|1900000000' > "$T/guest.list"
c=$(NF_UCI="$T/uci" NF_GUESTF="$T/guest.list" sh "$L/nightfall-guest" cands)
[ "$(printf '%s\n' "$c" | wc -l)" = 3 ] && ok "cands: three networks found (disabled, with Russian 'guest' in the name, and unbound)" || bad "cands: $(printf '%s' "$c" | tr '\n' ';')"
printf '%s\n' "$c" | grep -qx 'wifinet1|Guest Net|0|' && ok "cands: quotes removed from the network name" || bad "cands: network name"
printf '%s\n' "$c" | grep -qx 'wifinet2|Гости|1|1900000000' && ok "cands: enabled network with turn-off time" || bad "cands: enabled network"
printf '%s\n' "$c" | grep -q 'Home\|Uplink' && bad "cands: a regular network or client got in" || ok "cands: regular network and client excluded"

# 12. saving the whole settings form when the user file lacks some parameters (error "PERSIST_ANY: only 0 or 1 allowed")
cp "$L/../share/nightfall/nightfall-monitor.conf.default" "$T/def"
grep -v '^PERSIST_ANY=' "$T/def" > "$T/def.old"       # default file from versions without this parameter
printf 'TG=1\nTG_CHAT=111\n' > "$T/user.conf"           # the user previously saved only the Telegram fields
form() {   # form DEFAULT_FILE: the form as on the page (value from the user file, or from the default file if missing)
	for k in $(sed -n 's/^KEYS="\(.*\)"/\1/p' "$L/nightfall-config"); do
		if grep -q "^$k=" "$T/user.conf"; then f="$T/user.conf"; else f="$1"; fi
		v=$(sed -n "s/^$k=\"\{0,1\}\([^ #\"]*\).*/\1/p" "$f" | head -n 1)
		[ "$k" = TG_TOKEN ] && v="***"
		printf '%s=%s\n' "$k" "$v"
	done
}
form "$T/def.old" | grep -qx 'PERSIST_ANY=' && ok "settings form (old default file): PERSIST_ANY arrives empty, as for the user" || bad "settings form: empty field not reproduced"
cp "$T/user.conf" "$T/user.keep"
r=$(form "$T/def.old" | NF_CONF="$T/user.conf" NF_DEF="$T/def.old" NF_NORESTART=1 xargs -d '\n' sh "$L/nightfall-config" set)
case "$r" in *'"ok":true'*) ok "settings form: saved even though PERSIST_ANY is empty" ;; *) bad "settings form: $r" ;; esac
grep -q '^PERSIST_ANY=0' "$T/user.conf" && ok "settings form: PERSIST_ANY got 0" || bad "settings form: PERSIST_ANY not written"
cp "$T/user.keep" "$T/user.conf"
r=$(form "$T/def" | NF_CONF="$T/user.conf" NF_DEF="$T/def" NF_NORESTART=1 xargs -d '\n' sh "$L/nightfall-config" set)
case "$r" in *'"ok":true'*) ok "settings form: also saved with the new default file" ;; *) bad "settings form (new file): $r" ;; esac
r=$(NF_CONF="$T/user.conf" NF_DEF="$T/def" NF_NORESTART=1 sh "$L/nightfall-config" set TG_WIDGETS=1 TG_CLEAN=)
case "$r" in *'"ok":true'*) ok "TG_WIDGETS=1 together with an empty flag is saved" ;; *) bad "TG_WIDGETS: $r" ;; esac
grep -q '^TG_WIDGETS=1' "$T/user.conf" && grep -q '^TG_CLEAN=1' "$T/user.conf" && ok "widgets on, empty TG_CLEAN got the default value 1" || bad "values not written: $(tr '\n' ' ' < "$T/user.conf")"
r=$(NF_CONF="$T/user.conf" NF_DEF="$T/def" NF_NORESTART=1 sh "$L/nightfall-config" set PERSIST_ANY=7)
case "$r" in *'"ok":false'*) ok "an invalid flag value (7) is still rejected" ;; *) bad "value 7 accepted: $r" ;; esac
r=$(NF_CONF="$T/user.conf" NF_DEF="$T/def" NF_NORESTART=1 sh "$L/nightfall-config" set TEMP_WARN=)
case "$r" in *'"ok":false'*) ok "an empty number (TEMP_WARN) is still rejected" ;; *) bad "empty number accepted: $r" ;; esac
r=$(NF_CONF="$T/user.conf" NF_DEF="$T/def" sh "$L/nightfall-config" get)
printf '%s' "$r" | grep -q '"PERSIST_ANY":"0"' && ok "the page gets PERSIST_ANY=0, not an empty value" || bad "get: PERSIST_ANY is empty"

# 8. updates: notification, buttons, installation
cat > "$T/updbin" <<'SH'
#!/bin/sh
case "$1" in
check) cat "$T/upd.check" ;;
start) touch "$T/upd.started"; echo '{"state":"starting"}' ;;
status) echo '{"state":"error","pct":100,"msg":"Failed to download the archive."}' ;;
esac
SH
chmod +x "$T/updbin"; export NF_UPDATEBIN="$T/updbin"
echo '{"installed":"1.18.2","latest":"1.19.0","new":1}' > "$T/upd.check"
conf 111 ""; rm -f "$T/mid" "$T/bot.updskip" "$T/bot.updseen" "$T/bot.updchk" "$T/edit.fail"; upd 111 111 "/update"; runbot
grep -q 'A new Nightfall version is available: 1.19.0' "$T/calls" && grep 'A new Nightfall version is available' "$T/calls" | grep -q 'up:go' && ok "updates: the /update command offers to install the new version" || bad "updates: /update"
echo '{"installed":"1.19.0","latest":"1.19.0","new":0}' > "$T/upd.check"
conf 111 ""; upd 111 111 "/update"; runbot
grep -q 'The latest Nightfall version is installed' "$T/calls" && ok "updates: if the version is current, the bot says so" || bad "updates: current version"
echo '{"installed":"1.18.2","latest":"1.19.0","new":1}' > "$T/upd.check"
conf 111 ""; rm -f "$T/bot.updchk" "$T/bot.updseen"; : > "$T/updates"; runbot
grep -q 'A new Nightfall version is out: 1.19.0' "$T/calls" && ok "updates: the bot reports a new version on its own" || bad "updates: auto notification"
: > "$T/calls"; rm -f "$T/bot.updchk"; : > "$T/updates"; runbot
grep -q 'A new Nightfall version is out' "$T/calls" && bad "updates: the same version was reported twice" || ok "updates: the same version is not reported again"
conf 111 ""; echo "TG_UPDATES=0" >> "$T/conf"; rm -f "$T/bot.updchk" "$T/bot.updseen"; : > "$T/updates"; runbot
grep -q 'A new Nightfall version is out' "$T/calls" && bad "updates: TG_UPDATES=0 does not disable notifications" || ok "updates: TG_UPDATES=0 disables notifications"
conf 111 ""; rm -f "$T/upd.started" "$T/bot.updchk"; upd cb 111 111 "up:go"; runbot
[ -e "$T/upd.started" ] && ok "updates: the 'Install' button starts the installation" || bad "updates: installation not started"
conf 222 111; rm -f "$T/upd.started"; upd cb 222 333 "up:go"; runbot
[ -e "$T/upd.started" ] && bad "updates: a stranger in a group may install" || ok "updates: only an administrator can install in a group"
conf 111 ""; rm -f "$T/bot.updskip" "$T/bot.updseen" "$T/bot.updchk"; upd cb 111 111 "up:skip"; runbot
[ "$(cat "$T/bot.updskip" 2>/dev/null)" = "1.19.0" ] && ok "updates: 'Skip this version' is remembered" || bad "updates: skip not recorded"
# the edit failed: the new panel is remembered, the old one deleted (previously two button panels remained)
conf 111 ""; rm -f "$T/mid"; : > "$T/bot.msgs"; : > "$T/bot.panel"; touch "$T/edit.fail"; upd cb 111 111 "status"; runbot; sleep 1; rm -f "$T/edit.fail"
grep '^DEL' "$T/calls" | grep -q '5' && ok "duplicates: if the edit failed, the old panel is deleted" || bad "duplicates: the old panel remained"
grep -qx '101' "$T/bot.msgs" && ok "duplicates: the new panel is remembered" || bad "duplicates: the new panel is not remembered"
# text command: the previous panel is deleted even if it is not in the list
conf 111 ""; rm -f "$T/mid"; : > "$T/bot.msgs"; echo 77 > "$T/bot.panel"; upd 111 111 "/status"; runbot; sleep 1
grep '^DEL' "$T/calls" | grep -q '77' && ok "duplicates: a text command deletes the previous panel" || bad "duplicates: the previous panel was not deleted"

# 9. Lite mode: the setting accepts only 0 and 1
r=$(NF_CONF="$T/user.conf" NF_DEF="$T/def" NF_NORESTART=1 sh "$L/nightfall-config" set LITE=1)
case "$r" in *'"ok":true'*) ok "LITE=1 is accepted" ;; *) bad "LITE=1: $r" ;; esac
grep -q '^LITE=1' "$T/user.conf" && ok "LITE=1 written to the config" || bad "LITE not written"
r=$(NF_CONF="$T/user.conf" NF_DEF="$T/def" NF_NORESTART=1 sh "$L/nightfall-config" set LITE=5)
case "$r" in *'"ok":false'*) ok "LITE=5 is rejected" ;; *) bad "LITE=5 accepted: $r" ;; esac
printf 'LITE=1\nAPPS=1\n' > "$T/apps.conf"
r=$(NF_CONF="$T/apps.conf" NF_DIR="$T" NF_UCI=true sh "$L/nightfall-apps" status)
case "$r" in *'"lite":1'*) ok "per-app accounting: status reports Lite mode" ;; *) bad "apps status: $r" ;; esac

# 13. backup: verification, separate confirmation and restore cancellation
cat > "$T/backupbin" <<'SH'
#!/bin/sh
case "$1" in
 list) echo "Archive verified. Contents: test backup";;
 restore) [ "$3" = apply ] || exit 2; touch "$T/restored"; echo "Nightfall settings restored.";;
 *) exit 2;;
esac
SH
chmod +x "$T/backupbin"
printf '#!/bin/sh\ntouch "$T/collector.restarted"\n' > "$T/initd/nightfall-collector"
chmod +x "$T/initd/nightfall-collector"
touch "$T/nightfall-backup-test.tar.gz"
printf '%s\n' "$T/nightfall-backup-test.tar.gz" > "$T/backup.12345678901234"
conf 111 ""; rm -f "$T/mid" "$T/restore.ask.12345678901234" "$T/restored"
upd cb 111 111 "bk:check:12345678901234"; runbot
[ -s "$T/restore.ask.12345678901234" ] && ok "backup: verification creates a temporary confirmation" || bad "backup: verification did not create a confirmation"
grep 'METHOD sendMessage' "$T/calls" | grep -q 'The archive passed verification' && grep 'METHOD sendMessage' "$T/calls" | grep -q 'bk:apply:12345678901234' && ok "backup: a confirmation button appears after verification" || bad "backup: no confirmation button"
[ ! -e "$T/restored" ] && ok "backup: verification does not apply settings" || bad "backup: verification restored settings right away"
conf 111 ""; date +%s > "$T/restore.ask.12345678901234"; upd cb 111 111 "bk:cancel:12345678901234"; runbot
[ ! -e "$T/restore.ask.12345678901234" ] && [ ! -e "$T/restored" ] && ok "backup: cancel does not change settings" || bad "backup: cancel did not work"
conf 111 ""; date +%s > "$T/restore.ask.12345678901234"; rm -f "$T/restored" "$T/collector.restarted"; upd cb 111 111 "bk:apply:12345678901234"; runbot; sleep 3
[ -e "$T/restored" ] && ok "backup: confirmation starts the restore" || bad "backup: restore not started"
[ ! -e "$T/restore.ask.12345678901234" ] && [ ! -e "$T/backup.12345678901234" ] && ok "backup: the confirmation is one-time" || bad "backup: the confirmation state was not deleted"
[ -e "$T/collector.restarted" ] && ok "backup: the collector and bot restart after restore" || bad "backup: the service was not restarted"
printf '%s\n' "$T/nightfall-backup-test.tar.gz" > "$T/backup.12345678901234"; echo $(( $(date +%s) - 600 )) > "$T/restore.ask.12345678901234"; rm -f "$T/restored"; conf 111 ""; upd cb 111 111 "bk:apply:12345678901234"; runbot
[ ! -e "$T/restored" ] && ok "backup: an expired confirmation is rejected" || bad "backup: an expired confirmation worked"
conf -100500 111; echo "$T/nightfall-backup-test.tar.gz" > "$T/backup.12345678901234"; date +%s > "$T/restore.ask.12345678901234"; rm -f "$T/restored"; upd cb -100500 222 "bk:apply:12345678901234"; runbot
[ ! -e "$T/restored" ] && ok "backup: a non-administrator cannot confirm the restore" || bad "backup: a non-administrator restored settings"

[ $fail = 0 ] && echo "ALL OK" || { echo "THERE ARE FAILURES"; exit 1; }
