'use strict';
'require view';
'require rpc';
'require fs';
'require poll';
'require ui';
'require network';
'require nightfall-devid as DevId';
'require nightfall-monitor-charts as Charts';

/*
 * Nightfall resource monitor: CPU, memory, temperature, flash and network
 * activity in a Windows 11 / Fluent style dashboard.
 * Data comes from /usr/libexec/nightfall-stats (one JSON object per call).
 */

const STATS = '/usr/libexec/nightfall-stats';
const HIST = '/usr/libexec/nightfall-history';
const CFG = '/usr/libexec/nightfall-config';
const WINDOW = 300;          /* seconds shown in charts */
const ring = Charts.ring, chart = Charts.chart, sparkline = Charts.sparkline;
const INTERVAL = 2;          /* poll interval, seconds */
const FULL_EVERY = 5;        /* full (process) sample every N ticks */
const ALERTS_EVERY = 8;      /* collector alerts / last ping every N ticks */
const DEVICES_EVERY = 4;     /* per-device traffic every N ticks (network tab) */
const HIST_EVERY = 8;        /* history charts every N ticks (history tab) */
const RANGES = { h: [ 'fine', 3600, '1 hour' ], d: [ 'coarse', 86400, '24 hours' ], w: [ 'coarse', 604800, '7 days' ], m: [ 'long', 2592000, '30 days' ], q: [ 'long', 7776000, '90 days' ] };
const STORE_KEY = 'nightfall-monitor-v1';

const callBoard = rpc.declare({ object: 'system', method: 'board' });
const callIfaces = rpc.declare({ object: 'network.interface', method: 'dump' });
const callHints = rpc.declare({ object: 'luci-rpc', method: 'getHostHints' });
const callWifi = rpc.declare({ object: 'network.wireless', method: 'status' });
const callAssoc = rpc.declare({ object: 'iwinfo', method: 'assoclist', params: [ 'device', 'mac' ], expect: { results: [] } });
const callReboot = rpc.declare({ object: 'system', method: 'reboot' });
const SPEEDBIN = '/usr/libexec/nightfall-speed';
const NOTIFYBIN = '/usr/libexec/nightfall-notify';
const callInitList = rpc.declare({ object: 'luci', method: 'getInitList', params: [ 'name' ], expect: { '': {} } });
const callInitAction = rpc.declare({ object: 'luci', method: 'setInitAction', params: [ 'name', 'action' ], expect: { result: false } });
const callServiceList = rpc.declare({ object: 'service', method: 'list', params: [ 'name' ], expect: { '': {} } });

const HOT_WARN = 80, HOT_CRIT = 90, HOT_SECONDS = 60;
const BANDS = { '2g': '2.4 GHz', '5g': '5 GHz', '6g': '6 GHz', '60g': '60 GHz' };

const nf1 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });

const PORTS = { 443: 'HTTPS', 80: 'HTTP', 53: 'DNS', 853: 'DNS-over-TLS', 22: 'SSH', 123: 'Time (NTP)', 5228: 'Google Play / push', 5223: 'Apple push',
	3478: 'Calls (STUN)', 3479: 'Calls (STUN)', 1194: 'OpenVPN', 51820: 'WireGuard', 25: 'Mail (SMTP)', 465: 'Mail (SMTP)', 587: 'Mail (SMTP)', 993: 'Mail (IMAP)',
	143: 'Mail (IMAP)', 110: 'Mail (POP3)', 995: 'Mail (POP3)', 8080: 'HTTP (alt.)', 8443: 'HTTPS (alt.)', 1935: 'Streaming (RTMP)', 554: 'Video (RTSP)',
	5353: 'mDNS', 1900: 'UPnP', 6881: 'Torrents', 3389: 'RDP', 445: 'SMB', 21: 'FTP', 5222: 'XMPP', 8000: 'HTTP (alt.)', 8883: 'MQTT', 1883: 'MQTT' };
function portLabel(proto, port) {
	if (port === '-' || port === '') return proto.toUpperCase();
	if (proto === 'udp' && port === '443') return 'QUIC / HTTP3 · UDP 443';
	return (PORTS[port] ? PORTS[port] + ' · ' : '') + proto.toUpperCase() + ' ' + port;
}
const SVC_INFO = { dnsmasq: 'DNS and DHCP', dropbear: 'SSH access', uhttpd: 'LuCI web server', rpcd: 'Panel API', firewall: 'Firewall', network: 'Network interfaces',
	odhcpd: 'DHCPv6 and RA', sysntpd: 'Time sync', ttyd: 'Web terminal', 'https-dns-proxy': 'DNS over HTTPS', 'nightfall-collector': 'Monitor history collector',
	log: 'System log', cron: 'Task scheduler', ubus: 'ubus bus', irqbalance: 'Interrupt balancing', wpad: 'Wi-Fi (hostapd/wpa_supplicant)', hostapd: 'Wi-Fi access point' };
const SVC_PROTECTED = [ 'network', 'uhttpd', 'rpcd', 'dropbear', 'firewall', 'dnsmasq', 'odhcpd', 'log', 'ubus', 'boot', 'system', 'done', 'sysfixtime', 'wpad' ];

const GROUPS = [
	[ /^dnsmasq$/, 'DNS (dnsmasq)', 'g1' ],
	[ /^(uhttpd|rpcd|ucode|luci|nightfall)/, 'Panel and LuCI', 'g2' ],
	[ /^(hostapd|wpa_|wpad|iw|mt76|ath)/, 'Wi-Fi', 'g3' ],
	[ /^(ttyd|dropbear|sshd|login|getty)/, 'Terminal', 'g4' ],
	[ /^(sing-box|xray|v2ray|clash|mihomo|openvpn|wg|tailscale|zerotier|nikki|podkop)/, 'VPN and proxy', 'g5' ],
	[ /^(nginx|lighttpd|adguard|AdGuard|unbound|stubby|https-dns|smartdns|mosdns)/, 'Network services', 'g6' ],
	[ /^(procd|ubusd|netifd|logd|odhcp|crond|ntpd|busybox|sh$|ash$|init|syslog|dnsmasq-|fw4|nft|rngd|urngd|ubox|swconfig|hotplug|sleep|awk|cat)/, 'OpenWrt', 'g7' ]
];

function normalizeMonitorIp(ip) {
	const value = String(ip || '').toLowerCase().split('%')[0];
	if (value.indexOf(':') < 0) return value;
	const halves = value.split('::');
	if (halves.length > 2) return value;
	const a = halves[0] ? halves[0].split(':') : [];
	const b = halves.length > 1 && halves[1] ? halves[1].split(':') : [];
	if (halves.length === 1 && a.length !== 8) return value;
	const mid = halves.length > 1 ? new Array(Math.max(0, 8 - a.length - b.length)).fill('0') : [];
	return a.concat(mid, b).map(g => g.padStart(4, '0')).join(':');
}

function trafficBytes(value) {
	const n = Number(value);
	return Number.isFinite(n) && n > 0 ? n : 0;
}

function fmtMB(kb) {
	kb = Number(kb);
	if (!Number.isFinite(kb) || kb < 0) return '—';
	const mb = kb / 1024;
	if (mb >= 1024) return nf2.format(mb / 1024) + ' GB';
	return (mb >= 100 ? nf0 : nf1).format(mb) + ' MB';
}

function fmtBytes(b) {
	b = Number(b);
	if (!Number.isFinite(b) || b < 0) return '—';
	const u = [ 'B', 'KB', 'MB', 'GB', 'TB' ];
	let i = 0;
	while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
	return (i < 2 ? nf0 : nf2).format(b) + ' ' + u[i];
}

function fmtRate(bps) {
	bps = Number(bps);
	if (!Number.isFinite(bps) || bps < 0) return [ '—', '' ];
	const bits = bps * 8;
	if (bits >= 1e9) return [ nf2.format(bits / 1e9), 'Gbit/s' ];
	if (bits >= 1e6) return [ (bits >= 1e8 ? nf0 : nf1).format(bits / 1e6), 'Mbit/s' ];
	if (bits >= 1e3) return [ nf0.format(bits / 1e3), 'Kbit/s' ];
	return [ nf0.format(bits), 'bit/s' ];
}

function rateText(bps) {
	const r = fmtRate(bps);
	return r[1] ? r[0] + ' ' + r[1] : r[0];
}

function fmtUptime(s) {
	s = Number(s);
	if (!Number.isFinite(s) || s < 0) return '—';
	const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
	return (d ? d + ' d ' : '') + h + ' h ' + m + ' min';
}

function fmtTemp(v) {
	v = Number(v);
	return Number.isFinite(v) ? nf1.format(v) + ' °C' : '—';
}

function niceCeil(v) {
	if (v <= 0) return 1;
	const p = Math.pow(10, Math.floor(Math.log10(v)));
	for (const m of [ 1, 2, 2.5, 5, 10 ])
		if (v <= m * p) return m * p;
	return 10 * p;
}

const XCSS = `
.nfm .nfm-click { cursor: pointer; }
.nfm .nfm-click:hover td { background: var(--nfm-card2); }
.nfm-lst { display: grid; gap: 7px; }
.nfm-li { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 4px 14px; align-items: baseline; font-size: 13px; }
.nfm-li .nm { min-width: 0; overflow-wrap: anywhere; }
.nfm-li .nm small { color: var(--nfm-dim); margin-left: 6px; }
.nfm-li .v { font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; }
.nfm-li .bar { grid-column: 1 / -1; }
.nfm-two { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 18px; }
.nfm-two h4 { margin: 0 0 8px; font-size: 12px; font-weight: 600; color: var(--nfm-dim); text-transform: none; border: 0; padding: 0; }
.nfm-jr { display: grid; grid-template-columns: 22px 130px minmax(0, 1fr) auto; gap: 10px; align-items: baseline; padding: 7px 0; font-size: 13px; border-bottom: 1px solid color-mix(in srgb, var(--nfm-border) 60%, transparent); }
.nfm-jr:last-child { border-bottom: 0; }
.nfm-jr time { color: var(--nfm-dim); font-size: 12px; white-space: nowrap; font-variant-numeric: tabular-nums; }
.nfm-jr b { font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
.nfm-jr.outage .ic { color: #e5484d; } .nfm-jr.boot .ic { color: #3b82f6; }
.nfm-svc { display: grid; grid-template-columns: 12px minmax(0, 1fr) auto; gap: 6px 12px; align-items: center; padding: 10px 0; border-bottom: 1px solid color-mix(in srgb, var(--nfm-border) 60%, transparent); }
.nfm-svc:last-child { border-bottom: 0; }
.nfm-svc .st { width: 10px; height: 10px; border-radius: 50%; background: #9aa0a6; }
.nfm-svc.run .st { background: #13a10e; } .nfm-svc.bad .st { background: #e5484d; box-shadow: 0 0 0 3px color-mix(in srgb, #e5484d 25%, transparent); }
.nfm-svc .nm { font-weight: 600; font-size: 13.5px; } .nfm-svc .ds { color: var(--nfm-dim); font-size: 12px; }
.nfm-svc .ac { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
.nfm-mini { font: inherit; font-size: 12px; padding: 5px 11px; border-radius: 6px; cursor: pointer; color: var(--nfm-text); background: var(--nfm-card); border: 1px solid var(--nfm-border); }
.nfm-mini:hover:not([disabled]) { background: var(--nfm-card2); } .nfm-mini[disabled] { opacity: .4; cursor: not-allowed; }
.nfm-wd { min-width: min(520px, 86vw); }
.nfm-wd svg { width: 100%; height: 150px; display: block; }
.nfm-wd .ax { fill: var(--nfm-dim); font-size: 8px; }
.nfm-flash { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; }
.nfm-warn { color: #e5484d; font-weight: 600; }
.nfm-app-toolbar { display:flex; flex-wrap:wrap; gap:8px; justify-content:flex-end; margin-bottom:12px; }
.nfm-app-summary { margin:0 0 12px; }
.nfm-app-summary .nfm-tile { min-width:0; }
.nfm-app-summary .nfm-tile small { display:block; margin-top:3px; }
.nfm-app-categories { display:grid; gap:7px; }
.nfm-app-distribution { display:grid; grid-template-columns:minmax(190px,260px) minmax(0,1fr); align-items:start; gap:clamp(18px,3vw,42px); min-height:250px; }
.nfm-app-donut-layout { display:contents; }
.nfm-app-donut { width:clamp(180px,19vw,236px); height:clamp(180px,19vw,236px); justify-self:center; display:grid; place-items:center; border-radius:50%; }
.nfm-app-donut-center { width:66%; height:66%; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; border:1px solid var(--nfm-border); border-radius:50%; background:var(--nfm-card); }
.nfm-app-donut-center b { font-size:clamp(17px,1.5vw,22px); font-variant-numeric:tabular-nums; }
.nfm-app-donut-center small { color:var(--nfm-dim); font-size:11px; }
.nfm-app-legend { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px 22px; min-width:0; }
.nfm-app-legend-row { display:grid; grid-template-columns:9px minmax(0,1fr) auto auto; gap:8px; align-items:center; min-width:0; font-size:12.5px; }
.nfm-app-legend-row span { min-width:0; overflow-wrap:anywhere; }
.nfm-app-legend-row b, .nfm-app-legend-size { white-space:nowrap; font-variant-numeric:tabular-nums; }
.nfm-app-legend-row b { font-weight:700; }
.nfm-app-legend-size { color:var(--nfm-dim); text-align:right; }
.nfm-app-legend-dot { width:9px; height:9px; border-radius:3px; background:var(--nfm-app-color); }
.nfm-app-legend-more { grid-column:1 / -1; border-top:1px solid var(--nfm-border); padding-top:7px; }
.nfm-app-legend-more > summary { cursor:pointer; display:flex; align-items:center; justify-content:space-between; gap:12px; color:var(--nfm-text); font-size:12px; font-weight:600; list-style:none; }
.nfm-app-legend-more > summary::-webkit-details-marker { display:none; }
.nfm-app-legend-more > summary::after { content:'⌄'; color:var(--nfm-dim); }
.nfm-app-legend-more[open] > summary::after { content:'⌃'; }
.nfm-app-legend-more .nfm-app-legend { margin-top:10px; }
.nfm-app-category { border:1px solid var(--nfm-border); border-radius:var(--nf-radius-in, 9px); background:var(--nfm-card2); overflow:hidden; }
.nfm-app-category > summary { display:grid; grid-template-columns:12px 9px minmax(145px, .8fr) minmax(100px,1.5fr) auto auto; gap:8px 12px; align-items:center; padding:9px 12px; cursor:pointer; list-style:none; font-size:13px; }
.nfm-app-category > summary::-webkit-details-marker { display:none; }
.nfm-app-category > summary::before { content:'›'; color:var(--nfm-dim); font-size:18px; transform:rotate(0); transition:transform .15s; }
.nfm-app-category[open] > summary::before { transform:rotate(90deg); }
.nfm-app-category-icon { width:9px; height:9px; border-radius:3px; background:var(--nfm-app-color); }
.nfm-app-category-name { min-width:0; overflow-wrap:anywhere; }
.nfm-app-category-bar { height:8px; min-width:0; border-radius:999px; overflow:hidden; background:color-mix(in srgb,var(--nfm-dim) 20%,transparent); }
.nfm-app-category-bar > i { display:block; height:100%; max-width:100%; border-radius:inherit; background:var(--nfm-app-color); }
.nfm-app-category > summary b { font-variant-numeric:tabular-nums; white-space:nowrap; }
.nfm-app-category > summary small { color:var(--nfm-dim); font-variant-numeric:tabular-nums; white-space:nowrap; }
.nfm-app-category-items { padding:0 12px 8px 30px; }
.nfm-app-item { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:4px 10px; align-items:center; padding:7px 0; border-top:1px solid color-mix(in srgb,var(--nfm-border) 65%,transparent); font-size:12.5px; }
.nfm-app-item-name { min-width:0; overflow-wrap:anywhere; }
.nfm-app-item-route { grid-column:1; display:flex; flex-wrap:wrap; gap:3px; }
.nfm-app-item-route .nfm-chip { margin:0; }
.nfm-app-item > b { grid-column:2; grid-row:1 / span 2; white-space:nowrap; font-variant-numeric:tabular-nums; }
.nfm-app-top-list .nfm-host { padding:5px 0; }
.nfm-app-top-list .nfm-host small { display:block; margin:3px 0 0; }
.nfm-app-unknown-list .nfm-host { padding:6px 0; }
.nfm-app-unknown-list .nfm-host small { grid-column:1 / -1; margin:0; }
@media (max-width: 760px) {
.nfm-app-distribution { grid-template-columns:minmax(0,1fr); gap:16px; padding:4px 0; }
.nfm-app-donut { width:176px; height:176px; }
.nfm-app-legend { grid-template-columns:minmax(0,1fr); gap:9px; }
.nfm-app-legend-row { grid-template-columns:9px minmax(0,1fr) auto auto; font-size:12px; }
.nfm-app-legend-more { grid-column:1; }
.nfm-app-category > summary { grid-template-columns:12px 9px minmax(0,1fr) auto auto auto; gap:7px 9px; padding:10px; }
.nfm-app-category-bar { grid-column:3 / 6; grid-row:2; }
.nfm-app-category > summary small { grid-column:6; grid-row:2; }
}
@media (max-width: 640px) { .nfm-mini, .nfm-btn, .nfm-act, .nfm-tab { min-height: 40px; } .nfm-app-toolbar { justify-content:stretch; } .nfm-app-toolbar .nfm-sel { flex:1 1 140px; min-width:0; max-width:100%; } .nfm-mini, .nfm-btn, .nfm-act, .nfm-tab { min-height: 40px; } .nfm-jr { grid-template-columns: 22px minmax(0, 1fr) auto; align-items: start; row-gap: 2px; } .nfm-jr .ic { grid-column: 1; grid-row: 1; } .nfm-jr time { grid-column: 2 / -1; grid-row: 1; } .nfm-jr > span:not(.ic) { grid-column: 2; grid-row: 2; min-width: 0; overflow-wrap: anywhere; } .nfm-jr b { grid-column: 3; grid-row: 2; } .nfm-svc { grid-template-columns: 12px minmax(0, 1fr); } .nfm-svc .ac { grid-column: 1 / -1; justify-content: flex-start; } }
/* History layout: keep the monitor's shared Fluent surfaces and theme tokens. */
.nfm-history { display:grid; gap:12px; min-width:0; }
.nfm-history > .nfm-grid { min-width:0; margin:0; gap:12px; }
.nfm-history .nfm-card { min-width:0; }
.nfm-history .nfm-card-title { min-width:0; }
.nfm-history .nfm-chart { min-width:0; }
.nfm-history .nfm-exp { align-items:stretch; }
.nfm-history .nfm-exp .nfm-btn { flex:0 1 auto; min-width:0; }
.nfm-history .nfm-cmp-t { min-width:0; }
.nfm-history .nfm-note-s { overflow-wrap:anywhere; }
@media (max-width:860px) {
 .nfm-history .nfm-g21 { grid-template-columns:minmax(0,1fr); }
}
@media (max-width:640px) {
 .nfm-history { gap:10px; }
 .nfm-history > .nfm-grid { gap:10px; }
 .nfm-history .nfm-card { padding:13px 12px; }
 .nfm-history .nfm-exp { display:grid; grid-template-columns:minmax(0,1fr); }
 .nfm-history .nfm-exp .nfm-btn { width:100%; justify-content:center; }
 .nfm-history .nfm-cmp-t { grid-template-columns:minmax(0,1.15fr) minmax(0,1fr) minmax(0,1fr) 58px; font-size:11.5px; }
 .nfm-history .nfm-cmp-t > div { padding:7px 4px; }

}
`;

function SVG(tag, attrs, children) {
	const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
	for (const k in attrs || {})
		el.setAttribute(k, attrs[k]);
	for (const c of [].concat(children || []))
		if (c != null) el.appendChild(c);
	return el;
}

function groupOf(name) {
	for (const g of GROUPS)
		if (g[0].test(name)) return { label: g[1], cls: g[2] };
	return { label: name, cls: 'gx' };
}


// Traffic categories: only classify names that are already recognized, no guessing by IP.
const APP_TRAFFIC_CATEGORIES = {
	'YouTube': 'Video & entertainment', 'Netflix': 'Video & entertainment', 'Twitch': 'Video & entertainment',
	'Spotify': 'Video & entertainment', 'RuTube': 'Video & entertainment', 'VK Video': 'Video & entertainment',
	'Zoom': 'Messengers & calls', 'Telegram': 'Messengers & calls', 'WhatsApp': 'Messengers & calls',
	'Discord': 'Messengers & calls', 'MAX': 'Messengers & calls', 'Skype': 'Messengers & calls',
	'VK': 'Social networks', 'VKontakte': 'Social networks', 'Odnoklassniki': 'Social networks', 'OK': 'Social networks', 'Dzen': 'Social networks',
	'Instagram': 'Social networks', 'Facebook': 'Social networks', 'TikTok': 'Social networks', 'X (Twitter)': 'Social networks',
	'Wildberries': 'Shops & marketplaces', 'Wibes': 'Shops & marketplaces', 'Ozon': 'Shops & marketplaces', 'RuStore': 'App stores',
	'Avito': 'Shops & marketplaces', 'AliExpress': 'Shops & marketplaces',
	'T-Bank': 'Banks & payments', 'Sberbank': 'Banks & payments', 'Gosuslugi': 'Government services',
	'Steam': 'Games', 'Xbox': 'Games', 'PlayStation': 'Games', 'Riot Games': 'Games', 'EA': 'Games',
	'Roblox': 'Games', 'Battle.net': 'Games', 'Lesta': 'Games', 'Playrix': 'Games',
	'OneDrive': 'Cloud & storage', 'Google Drive': 'Cloud & storage', 'Google Photos': 'Cloud & storage',
	'Dropbox': 'Cloud & storage', 'Apple iCloud': 'Cloud & storage',
	'Google Meet': 'Messengers & calls', 'Mail.ru': 'Mail & communication',
	'Yandex': 'Search & services', 'Google': 'Search & services', 'Microsoft': 'System services',
	'Apple': 'System services', 'Amazon': 'Cloud & storage', 'GitHub': 'Development',
	'Kaspersky': 'Security', 'Cloudflare': 'Network & infrastructure'
};
const APP_TRAFFIC_INFRA = /^(?:okcdn\.ru|cdn77\.org|akamai\.net|akamaiedge\.net|edgesuite\.net|akadns\.net|fastly\.net|fastly-edge\.com|gcdn\.co|b-cdn\.net|ecdnx\.com|cdn-vk\.ru)$/i;
const APP_TRAFFIC_ADS = /(?:doubleclick\.net|googlesyndication\.com|googletagservices\.com|2mdn\.net|app-measurement\.com|crashlytics\.com|app-analytics-services\.com|mediation\.goog|vk-analytics\.ru|uxfeedback\.ru)/i;
const APP_TRAFFIC_DNS = /^(?:dns\.google|resolver\.arpa|quad9\.net)$/i;
const APP_TRAFFIC_CERT = /^(?:lencr\.org|pki\.goog|digicert\.com)$/i;

/* Traffic history recorded by versions before the English translation stores Russian app names; map them to the current ones. */
const LEGACY_APP_NAMES = { 'Прочее': 'Other', 'Нет DNS-имени': 'No DNS name', 'Общий IP (CDN)': 'Shared IP (CDN)', 'Несколько доменов': 'Multiple domains',
	'ВКонтакте': 'VK', 'Одноклассники': 'Odnoklassniki', 'Яндекс': 'Yandex', 'Дзен': 'Dzen', 'Госуслуги': 'Gosuslugi', 'Т-Банк': 'T-Bank', 'VK Видео': 'VK Video' };
function legacyAppName(name) {
	if (typeof name !== 'string' || !/[\u0400-\u04ff]/.test(name)) return name;
	return name.split(' · ').map(p => LEGACY_APP_NAMES[p] || p).join(' · ');
}

function appTrafficCategory(name) {
	const m = /^Other(?: · (.+))?$/.exec(name || '');
	if (m) {
		const domain = m[1] || '';
		if (!domain || domain === 'No DNS name' || domain === 'Shared IP (CDN)' || domain === 'Multiple domains') return 'Unclassified';
		if (APP_TRAFFIC_ADS.test(domain)) return 'Ads & analytics';
		if (APP_TRAFFIC_DNS.test(domain)) return 'DNS & infrastructure';
		if (APP_TRAFFIC_CERT.test(domain)) return 'Security & certificates';
		if (/^(?:steamcommunity\.com|steamserver\.net|steamconnecttest\.com|gamepass\.com|xboxservices\.com|nvidiagrid\.net|giants-software\.com|farming-simulator\.com|geforce\.com)$/i.test(domain)) return 'Games';
		if (/^(?:hicloud\.com|dbankcloud\.(?:ru|cn)|dbankcdn\.ru|icloud-content\.com)$/i.test(domain)) return 'Cloud & storage';
		if (/^(?:windows\.com|windows\.net|live\.net|msn\.com|android\.com|miui\.com|xiaomi\.(?:com|net)|transsion-os\.com|transsion-message\.com|mediatek\.com|blackberry\.com)$/i.test(domain)) return 'System services';
		if (/^(?:palmplaystore\.com|palm\.tech)$/i.test(domain)) return 'App stores';
		if (/^(?:sberbank\.ru|t-bank-app\.ru|tbank-app\.ru)$/i.test(domain)) return 'Banks & payments';
		if (/^gosuslugi\.ru$/i.test(domain)) return 'Government services';
		if (/^(?:magnit\.ru|5ka\.ru|x5\.ru|x5media\.ru)$/i.test(domain)) return 'Groceries & retail';
		if (/^(?:snapchat\.com|sc-cdn\.net)$/i.test(domain)) return 'Social networks';
		if (/^tamtam\.chat$/i.test(domain)) return 'Messengers & calls';
		if (/^findmykids\.org$/i.test(domain)) return 'Family & location';
		if (/^revenuecat\.com$/i.test(domain)) return 'In-app payments';
		if (/^(?:apptracer\.ru|trace-flow\.ru|uxfeedback\.ru)$/i.test(domain)) return 'Ads & analytics';
		if (/^rtcdn\.ru$/i.test(domain)) return 'Video & entertainment';
		if (APP_TRAFFIC_INFRA.test(domain)) return 'CDN & infrastructure';
		if (domain === 'aaplimg.com' || /(?:^|\.)apple\.com$/i.test(domain)) return 'System services';
		if (/^(?:windows\.com|windows\.net|live\.net|msn\.com)$/i.test(domain)) return 'System services';
		return 'Unclassified';
	}
	return APP_TRAFFIC_CATEGORIES[name] || 'Other apps';
}

function appTrafficDisplayName(name) {
	const m = /^Other(?: · (.+))?$/.exec(name || '');
	if (!m) return name || 'Unknown app';
	const domain = m[1] || '';
	return ({ 'No DNS name': 'IP without a DNS name', 'Shared IP (CDN)': 'Shared IP / CDN', 'Multiple domains': 'Multiple domains' })[domain] || domain || 'IP without a DNS name';
}

function sumMonitorAppTraffic(data, days, ip) {
	const apps = {}, categories = {}, routes = { VPN: 0, Direct: 0, Unknown: 0 }, devices = {};
	const selectedIps = new Set();
	if (ip && typeof ip.forEach === 'function') ip.forEach(x => selectedIps.add(normalizeMonitorIp(x)));
	else if (ip) selectedIps.add(normalizeMonitorIp(ip));
	const bytes = value => {
		const n = Number(value);
		return Number.isFinite(n) && n > 0 ? n : 0;
	};
	const add = (addr, name, route, down, up) => {
		name = legacyAppName(name);
		route = [ 'VPN', 'Direct', 'Unknown' ].includes(route) ? route : 'Unknown';
		const d = bytes(down), u = bytes(up), total = d + u;
		if (selectedIps.size && !selectedIps.has(normalizeMonitorIp(addr))) return;
		const a = apps[name] || (apps[name] = { name, category: appTrafficCategory(name), down: 0, up: 0, total: 0, routes: {} });
		a.down += d; a.up += u; a.total += total; a.routes[route] = (a.routes[route] || 0) + total;
		const c = categories[a.category] || (categories[a.category] = { name: a.category, total: 0, apps: {} });
		c.total += total; c.apps[name] = a;
		routes[route] += total;
		devices[addr] = (devices[addr] || 0) + total;
	};
	for (const r of data.day || []) add(r[0], r[1], r.length >= 5 ? r[2] : 'Unknown', r.length >= 5 ? r[3] : r[2], r.length >= 5 ? r[4] : r[3]);
	if (days > 1) {
		const today = String(data.today || '');
		const base = /^\d{8}$/.test(today) ? new Date(+today.slice(0, 4), +today.slice(4, 6) - 1, +today.slice(6, 8)) : new Date();
		base.setDate(base.getDate() - (days - 1));
		const from = base.getFullYear() * 10000 + (base.getMonth() + 1) * 100 + base.getDate();
		for (const r of data.hist || []) if (+r[0] >= from) add(r[1], r[2], r.length >= 6 ? r[3] : 'Unknown', r.length >= 6 ? r[4] : r[3], r.length >= 6 ? r[5] : r[4]);
	}
	return { apps: Object.values(apps).sort((a, b) => b.total - a.total), categories: Object.values(categories).sort((a, b) => b.total - a.total), routes, devices,
		total: routes.VPN + routes.Direct + routes.Unknown };
}

function sumMonitorDeviceApps(data, deviceIps) {
	const ips = new Set();
	if (deviceIps && typeof deviceIps.forEach === 'function')
		deviceIps.forEach(ip => ips.add(normalizeMonitorIp(ip)));
	else if (Array.isArray(deviceIps))
		deviceIps.forEach(ip => ips.add(normalizeMonitorIp(ip)));
	const apps = {};
	const bytes = value => {
		const n = Number(value);
		return Number.isFinite(n) && n > 0 ? n : 0;
	};
	const add = (name, down, up) => {
		const total = bytes(down) + bytes(up);
		if (name && total > 0) apps[name] = (apps[name] || 0) + total;
	};
	/* apps.day: [ip, app, route, down, up] */
	for (const row of data && data.day || []) {
		if (!ips.has(normalizeMonitorIp(row[0]))) continue;
		if (row.length >= 5) add(row[1], row[3], row[4]);
		else add(row[1], row[2], row[3]);
	}
	/* apps.hist: [date, ip, app, route, down, up] */
	for (const row of data && data.hist || []) {
		if (!ips.has(normalizeMonitorIp(row[1]))) continue;
		if (row.length >= 6) add(row[2], row[4], row[5]);
		else add(row[2], row[3], row[4]);
	}
	return Object.entries(apps).sort((a, b) => b[1] - a[1]);
}

function monitorBuildDhcpIdentity(leases) {
	const candidates = {}, names = {};
	for (const row of leases || []) {
		if (!Array.isArray(row) || row.length < 2) continue;
		const ip = normalizeMonitorIp(row[0]);
		const mac = String(row[1] || '').toUpperCase();
		if (!ip || !/^(?:[0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(mac)) continue;
		(candidates[ip] || (candidates[ip] = new Set())).add(mac);
		const name = String(row[2] || '').trim();
		if (name && name !== '*') (names[ip] || (names[ip] = new Set())).add(name);
	}
	const ipMac = {}, ipName = {}, ambiguous = {};
	for (const ip in candidates) {
		if (candidates[ip].size !== 1) { ambiguous[ip] = true; continue; }
		ipMac[ip] = Array.from(candidates[ip])[0];
		if (names[ip] && names[ip].size === 1) ipName[ip] = Array.from(names[ip])[0];
	}
	return { ipMac, ipName, ambiguous };
}

function monitorSharedNeighbourMacs(neighbours) {
	const ips = {};
	for (const row of neighbours || []) {
		const ip = normalizeMonitorIp(row && row[0]);
		const mac = String(row && row[1] || '').toUpperCase();
		if (!ip || !/^(?:[0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(mac) || ip.indexOf(':') >= 0) continue;
		(ips[mac] || (ips[mac] = new Set())).add(ip);
	}
	return new Set(Object.keys(ips).filter(mac => ips[mac].size > 1));
}

function monitorBuildIpMacMap(hints, neighbours, wifi, leases) {
	const dhcp = monitorBuildDhcpIdentity(leases), proxyMacs = monitorSharedNeighbourMacs(neighbours);
	const hintCandidates = {}, ipMac = {};
	/* Runtime DHCP leases are the authoritative IP -> endpoint MAC source.
	 * LuCI host hints can inherit a bridge/proxy neighbour MAC for many hosts. */
	for (const ip in dhcp.ipMac) ipMac[ip] = dhcp.ipMac[ip];

	for (const mac0 of Object.keys(hints || {})) {
		const mac = String(mac0).toUpperCase(), hint = hints[mac0] || {};
		if (!/^(?:[0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(mac) || proxyMacs.has(mac)) continue;
		for (const addr of (hint.ipaddrs || []).concat(hint.ip6addrs || [])) {
			const ip = normalizeMonitorIp(addr);
			if (!ip || dhcp.ipMac[ip] || dhcp.ambiguous[ip]) continue;
			(hintCandidates[ip] || (hintCandidates[ip] = new Set())).add(mac);
		}
	}
	/* Host hints are a fallback only when DHCP has no entry and the IP is not ambiguous. */
	for (const ip in hintCandidates)
		if (hintCandidates[ip].size === 1 && !dhcp.ambiguous[ip]) ipMac[ip] = Array.from(hintCandidates[ip])[0];

	for (const row of neighbours || []) {
		const ip = normalizeMonitorIp(row && row[0]), mac = String(row && row[1] || '').toUpperCase();
		if (!ip || !/^(?:[0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(mac) || ipMac[ip] || dhcp.ambiguous[ip]) continue;
		if (hintCandidates[ip] && hintCandidates[ip].size > 1) continue;
		/* A MAC repeated by multiple IPv4 neighbours is a shared next hop,
		 * not proof that those IP addresses belong to one endpoint. */
		if (proxyMacs.has(mac)) continue;
		ipMac[ip] = mac;
	}
	return ipMac;
}

function monitorIsInfrastructureName(name) {
	const value = String(name || '').trim().replace(/\.lan$/i, '');
	return /(?:^|[^a-z0-9])(?:router|gateway|repeater|extender|range[- _]?extender|mesh|bridge|access[- _]?point|wireless[- _]?ap|wifi[- _]?ap|ap)(?:$|[^a-z0-9])/i.test(value)
		|| /^re\d{3,5}$/i.test(value);
}

function monitorBuildWifiDisplayRows(wifi, hints, neighbours, leases) {
	const direct = (wifi || []).map(row => Object.assign({}, row));
	const directMacs = new Set(direct.map(row => String(row.mac || '').toUpperCase()).filter(Boolean));
	const identities = monitorBuildIpMacMap(hints, neighbours, direct, leases);
	const dhcp = monitorBuildDhcpIdentity(leases);
	const neighbourByIp = new Map();
	for (const row of neighbours || []) {
		const ip = normalizeMonitorIp(row && row[0]), mac = String(row && row[1] || '').toUpperCase();
		if (ip && mac) neighbourByIp.set(ip, { mac, state: String(row[2] || '').toUpperCase() });
	}
	const byUpstream = {}, infrastructureNames = {}, bridgeMacs = new Set();
	const hintName = mac => {
		const h = hints[mac] || hints[String(mac || '').toLowerCase()] || {};
		return String(h.name || '').trim();
	};
	for (const ip of Object.keys(identities)) {
		const upstream = neighbourByIp.get(ip), endpoint = identities[ip];
		if (!upstream || !directMacs.has(upstream.mac) || upstream.mac === endpoint) continue;
		bridgeMacs.add(upstream.mac);
		const name = dhcp.ipName[ip] || hintName(endpoint);
		if (monitorIsInfrastructureName(name)) {
			infrastructureNames[upstream.mac] = name.replace(/\.lan$/i, '');
			continue;
		}
		const rows = byUpstream[upstream.mac] || (byUpstream[upstream.mac] = {});
		rows[endpoint] = { mac: endpoint, ip, upstream: upstream.mac, state: upstream.state };
	}
	const enriched = direct.map(row => {
		const mac = String(row.mac || '').toUpperCase(), bridge = bridgeMacs.has(mac);
		return Object.assign({}, row, {
			proxyStation: bridge,
			displayName: infrastructureNames[mac] || (bridge ? '' : hintName(mac))
		});
	});
	const inferred = [];
	for (const upstream of Object.keys(byUpstream)) {
		for (const row of Object.values(byUpstream[upstream])) inferred.push({
			mac: row.mac, ip: row.ip, ssid: 'Behind a repeater', band: 'proxy', proxy: true,
			upstream: row.upstream, proxyState: row.state, signal: null, rx: null, tx: null,
			connected_time: null
		});
	}
	return enriched.concat(inferred);
}

function sumMonitorAppDeviceTraffic(data, fromDate, hints, neighbours, wifi, routerIps, leases) {
	/* Backward compatibility: older callers passed routerIps as argument four. */
	if (neighbours && typeof neighbours.has === 'function' && !Array.isArray(neighbours)) {
		routerIps = neighbours; neighbours = []; wifi = []; leases = [];
	}
	const ipMac = monitorBuildIpMacMap(hints, neighbours, wifi, leases), totals = {};
	const add = (ip, down, up) => {
		const norm = normalizeMonitorIp(ip);
		const mac = ipMac[norm] || '';
		const key = routerIps && routerIps.has && routerIps.has(ip) ? 'router' : mac || 'ip:' + norm;
		const row = totals[key] || (totals[key] = { key, mac, ip, total: 0 });
		row.total += trafficBytes(down) + trafficBytes(up);
	};
	for (const row of data && data.day || []) add(row[0], row.length >= 5 ? row[3] : row[2], row.length >= 5 ? row[4] : row[3]);
	for (const row of data && data.hist || []) {
		if (Number(row[0]) < Number(fromDate)) continue;
		add(row[1], row.length >= 6 ? row[4] : row[3], row.length >= 6 ? row[5] : row[4]);
	}
	return Object.values(totals).filter(row => row.total > 0).sort((a, b) => b.total - a.total);
}

function sumMonitorDeviceDailyTraffic(rows, hints, neighbours, wifi, routerIps, leases) {
	const ipMac = monitorBuildIpMacMap(hints, neighbours, wifi, leases), totals = {};
	for (const [ip, down, up] of rows || []) {
		if (routerIps && routerIps.has && routerIps.has(ip)) continue;
		const norm = normalizeMonitorIp(ip), mac = ipMac[norm] || '', key = mac || 'ip:' + norm;
		const row = totals[key] || (totals[key] = { mac, ip, total: 0 });
		row.total += trafficBytes(down) + trafficBytes(up);
		if (row.ip.indexOf(':') >= 0 && String(ip).indexOf(':') < 0) row.ip = ip;
	}
	return Object.values(totals).filter(row => row.total > 0).sort((a, b) => b.total - a.total);
}

function monitorDeviceOwnsHistoricalRow(deviceMac, deviceIps, rowIp, rowMac) {
	const mac = String(deviceMac || '').toUpperCase();
	const historicalMac = String(rowMac || '').toUpperCase();
	/* A MAC in the archive forbids the IP fallback: the address may have moved to another client. */
	if (historicalMac && historicalMac !== '-') return !!mac && historicalMac === mac;
	return !!rowIp && !!deviceIps && deviceIps.has(normalizeMonitorIp(rowIp));
}

/* ---------- widgets ---------- */

const CARD_ICONS = [
	[ /^Wi.Fi:|Wi.Fi signal/i, 'wifi' ], [ /\blog\b/i, 'events' ], [ /history storage|wear/i, 'disk' ], [ /using the link/i, 'net' ], [ /servic/i, 'quick' ],
	[ /summary/i, 'events' ], [ /cpu|program|core/i, 'system' ], [ /memory/i, 'mem' ], [ /temperature/i, 'temp' ], [ /flash/i, 'disk' ],
	[ /wi-?fi/i, 'wifi' ], [ /device|client|who holds/i, 'top' ], [ /interface|speed|traffic|internet|network now|connection quality/i, 'net' ],
	[ /event|alert|warning|history/i, 'events' ], [ /^settings$/i, 'quick' ]
];

const HEAT = {
	cpu: [ 'CPU', r => r[1], v => Math.round(v) + '%' ],
	mem: [ 'Memory', r => r[2], v => Math.round(v) + '%' ],
	ping: [ 'Ping', r => r[7], v => Math.round(v) + ' ms' ],
	net: [ 'Traffic', r => (r[4] >= 0 && r[5] >= 0) ? r[4] + r[5] : null, v => (v * 8 / 1e6).toFixed(1) + ' Mbit/s' ]
};

function card(title, body, extra) {
	const first = Array.isArray(title) ? title.find(x => typeof x === 'string') : title;
	const ic = typeof first === 'string' ? (CARD_ICONS.find(x => x[0].test(first)) || [ 0, 'generic' ])[1] : null;
	return E('section', { class: 'nfm-card' + (extra ? ' ' + extra : '') }, [
		title ? E('h3', { class: 'nfm-card-title' }, ic ? [ E('i', { class: 'nf-ci', 'data-i': ic }) ].concat(title) : title) : null, body ]);
}

/* "usual for this time": column average per 15-minute slot of the day across all days in the summary (up to 7 days) */
function usualCurve(rows, times, i) {
	if (!rows || rows.length < 288) return times.map(() => null);   /* less than a day of data: nothing to compare with */
	const sum = new Array(96).fill(0), cnt = new Array(96).fill(0), bin = t => { const d = new Date(t * 1000); return d.getHours() * 4 + Math.floor(d.getMinutes() / 15); };
	for (const r of rows) { const v = r[i]; if (v == null || v < 0) continue; const b = bin(r[0]); sum[b] += v; cnt[b]++; }
	return times.map(t => { const b = bin(t); return cnt[b] ? sum[b] / cnt[b] : null; });
}

function legendDot(cls, text) {
	return E('span', { class: 'nfm-leg' }, [ E('i', { class: 'nfm-dot ' + cls }), text ]);
}

const CSS = `
.nfm { --nfm-card: var(--nf-card, var(--background-color-medium, #fff)); --nfm-card2: var(--nf-card-alt, var(--background-color-low, #f4f4f4));
  --nfm-border: var(--nf-stroke, rgba(128,128,128,.22)); --nfm-text: var(--text-color-highest, inherit); --nfm-dim: var(--text-color-medium, #666);
  --nfm-accent: var(--nf-accent, var(--primary-color-high, #0067c0)); --nfm-r: var(--nf-radius, 8px);
  --c-cpu: var(--nf-accent, #0078d4); --c-mem: #7a5cc7; --c-temp: #e8710a; --c-flash: #00a0b0; --c-down: var(--nf-accent, #0078d4); --c-up: #13a10e;
  --g1:#00a3b5; --g2:#7a5cc7; --g3:#d6479b; --g4:#e8a30a; --g5:#0f8ee9; --g6:#2fa64a; --g7:#7d8aa0; --gx:#9aa5b4;
  color: var(--nfm-text); }
:root[data-darkmode="true"] .nfm { --c-cpu:var(--nf-accent, #4cc2ff); --c-mem:#b39bff; --c-temp:#ffa94d; --c-flash:#4fd8e6; --c-down:var(--nf-accent, #4cc2ff); --c-up:#6ccb5f;
  --g1:#3dd0e0; --g2:#b39bff; --g3:#ff7fbf; --g4:#ffc552; --g5:#5cb7ff; --g6:#6ccb5f; --g7:#9aa7bf; --gx:#7d8798; }
.nfm *, .nfm *::before, .nfm *::after { box-sizing: border-box; }
.nfm .c-cpu { --c: var(--c-cpu); } .nfm .c-mem { --c: var(--c-mem); } .nfm .c-temp { --c: var(--c-temp); }
.nfm .c-base { --c: var(--nfm-dim); }
.nfm .nfm-line.c-base { stroke-dasharray: 5 4; stroke-width: 1.4; opacity: .75; }
.nfm .c-flash { --c: var(--c-flash); } .nfm .c-down { --c: var(--c-down); } .nfm .c-up { --c: var(--c-up); }
.nfm .g1 { --c: var(--g1); } .nfm .g2 { --c: var(--g2); } .nfm .g3 { --c: var(--g3); } .nfm .g4 { --c: var(--g4); }
.nfm .g5 { --c: var(--g5); } .nfm .g6 { --c: var(--g6); } .nfm .g7 { --c: var(--g7); } .nfm .gx { --c: var(--gx); }
.nfm .nfm-line { stroke: var(--c); } .nfm .nfm-stop { stop-color: var(--c); } .nfm .nfm-spark-a { fill: var(--c); opacity: .18; }
.nfm .nfm-ring-fg { stroke: var(--c); transition: stroke-dasharray .6s ease; } .nfm .nfm-ring-fg.warn { stroke: #f7a21b; } .nfm .nfm-ring-fg.hot { stroke: #e5484d; }
.nfm-bar-fill, .nfm-dot, .nfm-seg { background: var(--c); }

.nfm-top { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin: 2px 0 14px; }
.nfm-top h2 { margin: 0; padding: 0; border: 0; font-size: 20px; font-weight: 600; line-height: 1.2; }
.nfm-top .nfm-sub { color: var(--nfm-dim); font-size: 12px; margin-top: 2px; }
.nfm-top .nfm-spacer { flex: 1 1 auto; }
.nfm-pill { display: inline-flex; align-items: center; gap: 7px; padding: 4px 11px; border-radius: 999px; font-size: 12px;
  background: color-mix(in srgb, #13a10e 14%, transparent); color: var(--nfm-text); border: 1px solid color-mix(in srgb, #13a10e 30%, transparent); }
.nfm-pill::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: #13a10e; animation: nfm-pulse 2s infinite; }
.nfm-rowlink { cursor: pointer; }
.nfm-rowlink:hover td, .nfm-rowlink:focus-visible td { background: color-mix(in srgb, var(--nfm-accent, #4aa3ff) 8%, transparent); }
.nfm-dc { min-width: min(420px, 80vw); }
.nfm-dc-bars { display: flex; align-items: flex-end; gap: 3px; height: 64px; }
.nfm-dc-bars i { flex: 1; min-width: 6px; border-radius: 3px 3px 0 0; background: color-mix(in srgb, var(--nfm-accent, #4aa3ff) 70%, transparent); }
.nfm-mode { display: inline-flex; align-items: center; padding: 4px 11px; border-radius: 999px; font-size: 12px; border: 1px solid color-mix(in srgb, #4aa3ff 40%, transparent); background: color-mix(in srgb, #4aa3ff 14%, transparent); color: var(--nfm-text); cursor: help; }
.nfm-mode.lite { border-color: color-mix(in srgb, #f7a21b 45%, transparent); background: color-mix(in srgb, #f7a21b 16%, transparent); }
.nfm-mode[hidden] { display: none; }
.nfm-pill.paused { background: color-mix(in srgb, #f7a21b 16%, transparent); border-color: color-mix(in srgb, #f7a21b 40%, transparent); }
.nfm-pill.paused::before { background: #f7a21b; animation: none; }
@keyframes nfm-pulse { 50% { opacity: .35; } }
.nfm-btn { font: inherit; font-size: 13px; padding: 6px 14px; border-radius: 6px; cursor: pointer; color: var(--nfm-text);
  background: var(--nfm-card); border: 1px solid var(--nfm-border); border-bottom-color: var(--nf-stroke-strong, var(--nfm-border)); }
.nfm-btn:hover { background: var(--nfm-card2); }
.nfm-ti::before { content:''; display:inline-block; width:14px; height:14px; margin-right:6px; vertical-align:-2px; background:currentColor; -webkit-mask:var(--ic) center/contain no-repeat; mask:var(--ic) center/contain no-repeat; opacity:.85; }
.nfm-ti[data-ic='overview'] { --ic: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='3' width='7' height='9' rx='1'/%3E%3Crect x='14' y='3' width='7' height='5' rx='1'/%3E%3Crect x='14' y='12' width='7' height='9' rx='1'/%3E%3Crect x='3' y='16' width='7' height='5' rx='1'/%3E%3C/svg%3E"); }
.nfm-ti[data-ic='net'] { --ic: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M2 8.8a15 15 0 0 1 20 0M5 12.6a10 10 0 0 1 14 0M8.5 16.3a5 5 0 0 1 7 0'/%3E%3Ccircle cx='12' cy='19' r='1'/%3E%3C/svg%3E"); }
.nfm-ti[data-ic='procs'] { --ic: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='6' y='6' width='12' height='12' rx='2'/%3E%3Cpath d='M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4'/%3E%3C/svg%3E"); }
.nfm-ti[data-ic='svcs'] { --ic: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 2v10'/%3E%3Cpath d='M18.4 6.6a9 9 0 1 1-12.8 0'/%3E%3C/svg%3E"); }
.nfm-ti[data-ic='hist'] { --ic: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 12a9 9 0 1 0 3-6.7L3 8'/%3E%3Cpath d='M3 3v5h5M12 7v5l3 2'/%3E%3C/svg%3E"); }
.nfm-ti[data-ic='wifi'] { --ic: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M2 9a14 14 0 0 1 20 0'/%3E%3Cpath d='M12 19.5h.01'/%3E%3C/svg%3E"); }
.nfm-ti[data-ic='devs'] { --ic: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='5' width='18' height='11' rx='2'/%3E%3Cpath d='M8 20h8M12 16v4'/%3E%3C/svg%3E"); }
.nfm-ti[data-ic='apps'] { --ic: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 3v18h18'/%3E%3Cpath d='M8 16V9M13 16V5M18 16v-4'/%3E%3C/svg%3E"); }
.nfm-ti[data-ic='diag'] { --ic: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 12h4l2-6 4 12 2-6h6'/%3E%3C/svg%3E"); }
.nfm-ti[data-ic='sec'] { --ic: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 3l8 3v6c0 4.5-3.2 7.7-8 9-4.8-1.3-8-4.5-8-9V6z'/%3E%3Cpath d='M9 12l2 2 4-4'/%3E%3C/svg%3E"); }
.nfm-ti[data-ic='log'] { --ic: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01'/%3E%3C/svg%3E"); }
.nfm-hint.sec-ok { border-color: color-mix(in srgb, #2fb36a 45%, transparent); }
.nfm-hint.sec-warn { border-color: color-mix(in srgb, #f7a21b 55%, transparent); }
.nfm-hint.sec-bad { border-color: color-mix(in srgb, #ef4444 60%, transparent); background: color-mix(in srgb, #ef4444 10%, transparent); }
@media (max-width: 420px) { .nfm-ti::before { margin-right:4px; width:13px; height:13px; } }
.nfm-wq-b { display: inline-block; padding: 2px 9px; border-radius: 999px; font-size: 12px; font-weight: 600; background: color-mix(in srgb, var(--c) 18%, transparent); color: var(--c); }
.nfm-wq-b.ok { --c: #3fb950; } .nfm-wq-b.mid { --c: #e0a800; } .nfm-wq-b.bad { --c: #e5534b; }
.nfm-diag-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.nfm-diag-in { flex: 1 1 180px; min-width: 0; height: 34px; padding: 0 10px; border-radius: 10px; border: 1px solid var(--nfm-border); background: transparent; color: inherit; font: inherit; }
.nfm-diag-chips { display: flex; gap: 6px; flex-wrap: wrap; margin: 8px 0; }
.nfm-diag-chips .nfm-tab { font-size: 11.5px; padding: 3px 9px; }
.nfm-diag-out { margin: 0; padding: 10px 12px; border-radius: 10px; background: color-mix(in srgb, var(--nfm-border) 38%, transparent); font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 320px; overflow: auto; }
.nfm-diag.busy .nfm-diag-out { opacity: .6; }
.nfm-mon-h { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
.nfm-mon-t { text-transform: capitalize; min-width: 8em; text-align: center; }
.nfm-mon-lim { width: 72px; height: 28px; padding: 0 6px; border-radius: 8px; border: 1px solid var(--nfm-border); background: transparent; color: inherit; text-align: center; }
.nfm-mon-sum { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px; margin-bottom: 10px; }
.nfm-mon-sum > div { padding: 8px 10px; border-radius: 10px; background: color-mix(in srgb, var(--nfm-border) 40%, transparent); display: flex; flex-direction: column; gap: 2px; }
.nfm-mon-sum span { font-size: 11.5px; opacity: .65; } .nfm-mon-sum b { font-size: 15px; font-variant-numeric: tabular-nums; }
.nfm-mon-bar { height: 8px; border-radius: 8px; background: color-mix(in srgb, var(--nfm-border) 60%, transparent); overflow: hidden; margin: 4px 0; }
.nfm-mon-bar i { display: block; height: 100%; border-radius: 8px; background: var(--nfm-accent); transition: width .6s ease; }
.nfm-mon-bar[data-lvl="mid"] i { background: #e0a800; } .nfm-mon-bar[data-lvl="bad"] i { background: #d13438; }
.nfm-mon-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; margin-top: 8px; }
.nfm-mon-w { font-size: 11px; opacity: .6; text-align: center; }
.nfm-mon-d { min-height: 44px; border-radius: 8px; padding: 4px 5px; display: flex; flex-direction: column; justify-content: space-between; background: color-mix(in srgb, var(--nfm-border) 45%, transparent); font-size: 10.5px; overflow: hidden; }
.nfm-mon-d b { font-size: 11px; font-weight: 600; opacity: .75; } .nfm-mon-d i { font-style: normal; font-variant-numeric: tabular-nums; white-space: nowrap; }
.nfm-mon-d.has { background: color-mix(in srgb, var(--nfm-accent) var(--hv), color-mix(in srgb, var(--nfm-border) 45%, transparent)); }
.nfm-mon-d.today { outline: 2px solid var(--nfm-accent); outline-offset: -2px; }
@media (max-width: 600px) { .nfm-mon-d { min-height: 38px; padding: 3px; font-size: 9.5px; } }
.nfm-wk { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.nfm-wk-t { display: flex; flex-direction: column; gap: 3px; padding: 12px 14px; border-radius: 10px; background: var(--nfm-card2); min-width: 0; }
.nfm-wk-t b { font-size: 20px; line-height: 1.2; overflow-wrap: anywhere; }
.nfm-wk-l { font-size: 11.5px; opacity: .7; text-transform: uppercase; letter-spacing: .04em; }
@media (max-width: 640px) { .nfm-wk { grid-template-columns: 1fr; } }
.nfm-dsk { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 10px 0; border-bottom: 1px solid var(--nfm-border); }
.nfm-dsk:last-child { border-bottom: 0; } .nfm-dsk-i { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.nfm-cmp-t { display: grid; grid-template-columns: minmax(120px, 1.2fr) 1fr 1fr 90px; gap: 0; font-size: 13px; }
.nfm-cmp-t > div { padding: 9px 10px; border-bottom: 1px solid var(--nfm-border); min-width: 0; overflow-wrap: anywhere; }
.nfm-cmp-t .h { color: var(--nfm-dim); font-size: 12px; padding-top: 2px; }
.nfm-cmp-t .h small { display: block; opacity: .8; }
.nfm-cmp-t .n { text-align: right; font-variant-numeric: tabular-nums; }
.nfm-cmp-t .sec { grid-column: 1 / -1; font-weight: 600; font-size: 12px; color: var(--nfm-dim); padding: 14px 10px 4px; border-bottom: 1px solid var(--nfm-border); text-transform: none; }
.nfm-cmp-t .sec:nth-child(4n+2), .nfm-cmp-t .sec:nth-child(4n+3), .nfm-cmp-t .sec:nth-child(4n+4) { display: none; }
.nfm-cmp-t .up { color: #d7a13b; } .nfm-cmp-t .dn { color: #4ec9a0; } .nfm-cmp-t .eq { color: var(--nfm-dim); }
.nfm-exp { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
@media (max-width: 640px) { .nfm-cmp-t { grid-template-columns: 1.2fr 1fr 1fr 64px; font-size: 12px; } .nfm-cmp-t > div { padding: 7px 4px; } }
.nfm-mon-d.has { cursor: pointer; } .nfm-mon-d.has:hover, .nfm-mon-d.has:focus-visible { outline: 2px solid var(--nfm-accent, #0a84ff); outline-offset: -2px; }
.nfm-dr .nfm-table td:first-child { max-width: 320px; }
.nfm-dv-i { display: inline-flex; vertical-align: -3px; margin-right: 6px; color: var(--nfm-dim); }
.nfm-dv-i svg { width: 16px; height: 16px; }
.nfm-dv-i.priv { color: color-mix(in srgb, var(--nfm-dim) 65%, #e0a800); }
.nfm-chip.priv { background: color-mix(in srgb, #e0a800 18%, transparent); color: #b88400; }
.nfm-wh-g { display: grid; grid-template-columns: minmax(150px, 1.8fr) repeat(var(--n, 24), minmax(0, 1fr)); gap: 3px; align-items: center; }
.nfm-wh-n { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; padding-right: 6px; }
.nfm-wh-n:hover { text-decoration: underline; }
.nfm-wh-h { font-size: 10.5px; opacity: .65; text-align: center; white-space: nowrap; overflow: visible; }
.nfm-wh-c { height: 18px; border-radius: 3px; background: color-mix(in srgb, var(--nfm-border) 70%, transparent); }
.nfm-wh-c.q0 { background: #3fb950; } .nfm-wh-c.q1 { background: #8fbf3f; } .nfm-wh-c.q2 { background: #e0a800; } .nfm-wh-c.q3 { background: #e5534b; }
.nfm-wh-leg { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 10px; font-size: 12px; color: var(--nfm-dim); }
.nfm-wh-leg i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 5px; vertical-align: -1px; }
@media (max-width: 600px) { .nfm-wh-g { grid-template-columns: minmax(84px, 1.4fr) repeat(var(--n, 24), minmax(0, 1fr)); gap: 2px; } .nfm-wh-c { height: 16px; border-radius: 2px; } }
.nfm-air-r { margin-bottom: 16px; }
.nfm-air-r h4 { margin: 0 0 8px; font-size: 13px; display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: baseline; }
.nfm-air-r h4 small { color: var(--nfm-dim); font-weight: 400; }
.nfm-air-bars { display: flex; align-items: flex-end; gap: 4px; height: 96px; overflow-x: auto; padding-bottom: 2px; }
.nfm-air-b { flex: 1 0 22px; max-width: 54px; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: stretch; font-size: 11px; text-align: center; position: relative; }
.nfm-air-b i { display: block; border-radius: 4px 4px 0 0; min-height: 3px; height: var(--h, 3%); background: var(--c, #3fb950); }
.nfm-air-b.l0 { --c: #3fb950; } .nfm-air-b.l1 { --c: #8fbf3f; } .nfm-air-b.l2 { --c: #e0a800; } .nfm-air-b.l3 { --c: #e5534b; }
.nfm-air-b.own i { outline: 2px solid var(--nfm-accent, #0a84ff); outline-offset: 1px; }
.nfm-air-x { display: flex; gap: 4px; margin-top: 4px; }
.nfm-air-x span { flex: 1 0 22px; max-width: 54px; text-align: center; font-size: 11px; color: var(--nfm-dim); }
.nfm-air-x span.own { color: var(--nfm-accent, #0a84ff); font-weight: 700; }
.nfm-air-x span.best { color: #3fb950; font-weight: 700; }
.nfm-air-v { margin: 10px 0 6px; font-size: 13px; line-height: 1.45; }
.nfm-air-v b { font-weight: 600; }
.nfm-heat-grid { display: grid; grid-template-columns: 26px repeat(24, 1fr); gap: 3px; align-items: center; }
.nfm-heat-h, .nfm-heat-d { font-size: 10.5px; opacity: .65; text-align: center; }
.nfm-heat-d.today { opacity: 1; font-weight: 700; }
.nfm-heat-c { aspect-ratio: 1; min-height: 10px; border-radius: 3px; background: color-mix(in srgb, var(--nfm-border) 70%, transparent); }
.nfm-heat-c[style] { background: color-mix(in srgb, var(--nfm-accent, #6aa7ff) var(--hv), color-mix(in srgb, var(--nfm-border) 70%, transparent)); }
@media (max-width: 600px) { .nfm-heat-grid { gap: 2px; grid-template-columns: 22px repeat(24, 1fr); } .nfm-heat-c { border-radius: 2px; } }
.nfm-tabs { display: inline-flex; padding: 3px; gap: 2px; border-radius: 8px; background: var(--nfm-card2); border: 1px solid var(--nfm-border); }
.nfm-tab { font: inherit; font-size: 13px; border: 0; background: transparent; color: var(--nfm-text); padding: 5px 16px; border-radius: 6px; cursor: pointer; }
.nfm-tab:hover { background: color-mix(in srgb, var(--nfm-card) 70%, transparent); }
.nfm-tab.on { background: var(--nfm-card); box-shadow: 0 1px 2px rgba(0,0,0,.14); font-weight: 600; position: relative; }
.nfm-tab.on::after { content: ''; position: absolute; left: 50%; bottom: 1px; width: 16px; height: 3px; margin-left: -8px; border-radius: 3px; background: var(--nfm-accent); }

.nfm-grid { display: grid; gap: 12px; margin-bottom: 12px; }
.nfm-g4 { grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); }
.nfm-g21 { grid-template-columns: minmax(0, 2fr) minmax(260px, 1fr); }
.nfm-g3 { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
@media (max-width: 860px) { .nfm-g21 { grid-template-columns: 1fr; } }
.nfm-card { background: var(--nfm-card); border: 1px solid var(--nfm-border); border-radius: var(--nfm-r); padding: 16px 18px; min-width: 0;
  box-shadow: 0 1px 2px rgba(0,0,0,.04); }
.nfm-card { position: relative; overflow: hidden; transition: transform .25s ease, box-shadow .25s ease, border-color .25s ease; }
.nfm-card::after { content: ''; position: absolute; inset: 0 0 auto 0; height: 90px; pointer-events: none; background: linear-gradient(180deg, color-mix(in srgb, var(--nfm-accent) 9%, transparent), transparent); }
.nfm-card > * { position: relative; z-index: 1; }
.nfm-card:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--nfm-accent) 38%, var(--nfm-border)); box-shadow: 0 10px 28px -12px color-mix(in srgb, var(--nfm-accent) 45%, transparent); }
@media (hover: none), (prefers-reduced-motion: reduce) { .nfm-card:hover { transform: none; } }
.nfm-card-title { margin: 0 0 12px; padding: 0 0 0 10px; border: 0; font-size: 14px; font-weight: 600; line-height: 1.3; display: flex; align-items: center; gap: 8px; position: relative; }
.nfm-card-title::before { content: ''; position: absolute; left: 0; top: 2px; bottom: 2px; width: 3px; border-radius: 3px; background: var(--nfm-accent); }
.nfm-card-title .nfm-spacer { flex: 1; }
.nfm-card-title { flex-wrap: wrap; row-gap: 8px; }
.nfm-card-title > button, .nfm-card-title > select, .nfm-card-title > .cbi-button { flex: none; white-space: nowrap; max-width: 100%; }
.nfm-legend { display: inline-flex; flex-wrap: wrap; gap: 4px 14px; font-weight: 400; font-size: 12px; color: var(--nfm-dim); }
.nfm-leg { display: inline-flex; align-items: center; gap: 6px; }
.nfm-dot { width: 10px; height: 10px; border-radius: 3px; display: inline-block; flex: none; }

.nfm-metric { display: flex; align-items: center; gap: 14px; padding: 14px 16px; }
.nfm-metric-info { min-width: 0; line-height: 1.35; }
.nfm-k { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--nfm-dim); }
.nfm-v { font-size: 15px; font-weight: 600; margin: 2px 0; }
.nfm-s { font-size: 12px; color: var(--nfm-dim); }
.nfm-ring { position: relative; width: 74px; height: 74px; flex: none; }
.nfm-ring svg { width: 100%; height: 100%; display: block; }
.nfm-ring-bg { stroke: var(--nfm-card2); }
.nfm-ring-label { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 600; }

.nfm-chart { --h: 220px; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; grid-template-rows: var(--h) auto; column-gap: 8px; }
.nfm-chart:not(.has-right) { grid-template-columns: auto minmax(0, 1fr) 0; }
.nfm-plotw { position: relative; min-width: 0; touch-action: pan-y; cursor: crosshair; }
.nfm-plot { width: 100%; height: 100%; display: block; overflow: visible; border-left: 1px solid var(--nfm-border); border-bottom: 1px solid var(--nfm-border); }
.nfm-xh { stroke: var(--nfm-dim); stroke-width: 1; stroke-dasharray: 3 3; }
.nfm-pt { position: absolute; width: 10px; height: 10px; margin: -5px 0 0 -5px; border-radius: 50%; background: var(--c); border: 2px solid var(--nfm-card); box-sizing: border-box; pointer-events: none; }
.nfm-tip { position: absolute; top: 6px; z-index: 5; pointer-events: none; padding: 7px 10px; border-radius: 8px; font-size: 12px; line-height: 1.5; white-space: nowrap;
  background: var(--nfm-card); color: var(--nfm-text); border: 1px solid var(--nfm-border); box-shadow: 0 6px 20px rgba(0,0,0,.22); transform: translateX(12px); }
.nfm-tip.left { transform: translateX(calc(-100% - 12px)); }
.nfm-tip-t { color: var(--nfm-dim); font-size: 11.5px; margin-bottom: 2px; }
.nfm-tip-r { display: flex; align-items: center; gap: 6px; }
.nfm-tip-r b { font-weight: 600; margin-left: auto; padding-left: 10px; font-variant-numeric: tabular-nums; }
.nfm-grid line { stroke: var(--nfm-border); stroke-dasharray: 3 4; opacity: .7; }
.nfm-yl, .nfm-yr { display: flex; flex-direction: column; justify-content: space-between; font-size: 11px; color: var(--nfm-dim); line-height: 1; padding: 0; margin-top: -5px; margin-bottom: -5px; }
.nfm-yl { text-align: right; } .nfm-yr { text-align: left; }
.nfm-xl { display: flex; justify-content: space-between; font-size: 11px; color: var(--nfm-dim); padding-top: 6px; }
.nfm-spark { width: 100%; height: 34px; display: block; margin-top: 8px; }

.nfm-core { margin-bottom: 14px; }
.nfm-core-h { display: flex; justify-content: space-between; font-size: 12.5px; margin-bottom: 6px; }
.nfm-core-h b { font-weight: 600; }
.nfm-bar { height: 7px; border-radius: 99px; background: var(--nfm-card2); overflow: hidden; }
.nfm-bar-fill { height: 100%; border-radius: 99px; width: 0; transition: width .5s ease; }
.nfm-tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 4px; }
.nfm-tile { background: var(--nfm-card2); border-radius: 6px; padding: 8px 10px; font-size: 11.5px; color: var(--nfm-dim); }
.nfm-tile b { display: block; margin-top: 4px; font-size: 14px; color: var(--nfm-text); font-weight: 600; }

.nfm-stack { display: flex; height: 34px; border-radius: 6px; overflow: hidden; background: var(--nfm-card2); gap: 2px; }
.nfm-seg { height: 100%; min-width: 0; transition: flex-basis .5s ease; }
.nfm-seg.hatch { background: repeating-linear-gradient(135deg, var(--nfm-border) 0 4px, transparent 4px 8px); }
.nfm-seg.free { background: transparent; }
.nfm-legend-lg { margin-top: 12px; gap: 6px 18px; font-size: 12.5px; }
.nfm-note { font-size: 11.5px; color: var(--nfm-dim); margin-left: auto; font-weight: 400; }

.nfm-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.nfm-table th { text-align: left; font-weight: 600; font-size: 12px; color: var(--nfm-dim); padding: 6px 10px; border-bottom: 1px solid var(--nfm-border); white-space: nowrap; }
.nfm-table th.sort { cursor: pointer; user-select: none; } .nfm-table th.sort:hover { color: var(--nfm-text); }
.nfm-table td { padding: 8px 10px; border-bottom: 1px solid color-mix(in srgb, var(--nfm-border) 60%, transparent); vertical-align: middle; }
.nfm-table tr:last-child td { border-bottom: 0; }
.nfm-table tbody tr:hover td { background: transparent; }
.nfm-tabs { max-width: 100%; overflow-x: auto; scrollbar-width: none; }
.nfm-tabs::-webkit-scrollbar { display: none; }
.nfm-tab { white-space: nowrap; flex: none; }
@media (max-width: 640px) {
  .nfm-top .nfm-tabs { display: flex; width: 100%; order: 5; } .nfm-top .nfm-tabs .nfm-tab { flex: 1 0 auto; padding: 6px 8px; font-size: 12.5px; }
  .nfm-card-title { flex-wrap: wrap; row-gap: 8px; }
  .nfm-card-title > .nfm-spacer { flex: 0 0 100%; height: 0; margin: 0; }
  .nfm-card-title > .nfm-note-s, .nfm-card-title > .nfm-legend { flex: 1 0 100%; }
}
.nfm-cfg-layout { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; align-items:start; }
.nfm .nfm-cfg-g { border:1px solid var(--nfm-border); border-radius:var(--nfm-r); background:var(--nfm-card2); padding:0; min-width:0; overflow:hidden; align-self:start; }
.nfm .nfm-cfg-head { display:flex; align-items:center; gap:10px; min-height:52px; margin:0; padding:9px 14px; list-style:none; cursor:pointer; color:var(--nfm-text); font-size:13px; font-weight:700; background:transparent; border-bottom:1px solid transparent; }
.nfm .nfm-cfg-head::-webkit-details-marker { display:none; }
.nfm .nfm-cfg-g[open] > .nfm-cfg-head { border-bottom-color:var(--nfm-border); }
html #view .nfm-card.nfm-cfg-settings-card:focus-within { border-color:var(--nfm-border); }
.nfm-cfg-icon { display:grid; place-items:center; flex:0 0 32px; width:32px; height:32px; border-radius:10px; color:var(--blue,#1688f8); background:color-mix(in srgb,var(--blue,#1688f8) 14%,var(--nfm-card)); }
.nfm-cfg-icon svg { display:block; width:17px; height:17px; fill:none; stroke:currentColor; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }
.nfm-cfg-heading { min-width:0; flex:1; }
.nfm-cfg-chevron { color:var(--nfm-dim); font-size:17px; transition:transform .18s ease; flex:none; }
.nfm-cfg-g:not([open]) .nfm-cfg-chevron { transform:rotate(-90deg); }
.nfm-cfg-body { padding:13px 14px 15px; min-width:0; }
.nfm-cfg-g .nfm-cfg { grid-template-columns:minmax(0,1fr); gap:10px; align-content:start; }
.nfm .nfm-cfg-telegram { margin-top:14px; padding:14px; }
.nfm-tg-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; align-items:start; }
.nfm .nfm-tg-grid .nfm-cfg-g { background:var(--nfm-card); }
.nfm .nfm-tg-grid .nfm-cfg-body { box-sizing:border-box; }
.nfm-cfg-i.nfm-cfg-toggle { display:flex; flex-direction:row; align-items:center; justify-content:space-between; gap:12px; min-height:38px; width:100%; min-width:0; box-sizing:border-box; color:var(--nfm-text); line-height:1.35; }
.nfm-cfg-toggle .nfm-cfg-f { display:flex; flex:0 0 44px; width:44px; min-width:44px; justify-content:flex-end; align-items:center; margin-left:auto; }
.nfm-cfg-i.nfm-cfg-toggle > .nfm-cfg-f > input.nfm-toggle[type="checkbox"] { appearance:none !important; -webkit-appearance:none !important; display:block !important; position:relative; flex:0 0 40px; width:40px !important; min-width:40px !important; max-width:40px; height:23px !important; min-height:23px; padding:0 !important; margin:0 !important; border:1px solid var(--nfm-border) !important; border-radius:99px !important; background:var(--nfm-card2) !important; box-shadow:none !important; cursor:pointer; }
.nfm-cfg-i.nfm-cfg-toggle > .nfm-cfg-f > input.nfm-toggle[type="checkbox"]::before { content:''; position:absolute; top:2px; left:2px; width:17px; height:17px; border:0; border-radius:50%; background:var(--nfm-dim); transform:none; transition:transform .18s ease,background .18s ease; }
.nfm-cfg-i.nfm-cfg-toggle > .nfm-cfg-f > input.nfm-toggle[type="checkbox"]:checked { background:var(--blue,#1688f8) !important; border-color:var(--blue,#1688f8) !important; }
.nfm-cfg-i.nfm-cfg-toggle > .nfm-cfg-f > input.nfm-toggle[type="checkbox"]:checked::before { transform:translateX(17px); background:#fff; }
.nfm-cfg-i.nfm-cfg-toggle > .nfm-cfg-f > input.nfm-toggle[type="checkbox"]:focus-visible { outline:2px solid var(--blue,#1688f8); outline-offset:2px; }
.nfm-cfg-actions { position:sticky; bottom:8px; z-index:4; display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin:14px -2px 0; padding:10px; border:1px solid var(--nfm-border); border-radius:var(--nfm-r); background:var(--nfm-card); box-shadow:0 8px 24px rgba(30,70,120,.12); backdrop-filter:blur(16px); }
.nfm-cfg-actions .nfm-act { min-height:36px; white-space:normal; }
.nfm-cfg-actions .nfm-act:first-child { background:var(--blue,#1688f8); color:#fff; border-color:transparent; }
.nfm-cfg-help { margin-top:10px; color:var(--nfm-dim); font-size:12px; }
.nfm-cfg-help summary { cursor:pointer; color:var(--nfm-text); font-weight:600; padding:6px 0; }
.nfm-cfg-help > div { padding:8px 0 2px; line-height:1.55; }
@media (max-width:900px) { .nfm-cfg-layout { grid-template-columns:repeat(2,minmax(0,1fr)); } .nfm-tg-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media (max-width:680px) { .nfm-cfg-layout,.nfm-tg-grid { grid-template-columns:minmax(0,1fr); } .nfm .nfm-cfg-head { min-height:48px; padding:8px 11px; } .nfm .nfm-cfg-body { padding:11px; } .nfm-cfg-actions { position:static; } .nfm-cfg-actions .nfm-act { flex:1 1 100%; } }
.nfm-table .r { text-align: right; font-variant-numeric: tabular-nums; }
.nfm-chip { display: inline-block; font-size: 11px; padding: 1px 8px; border-radius: 99px; background: var(--nfm-card2); border: 1px solid var(--nfm-border); color: var(--nfm-dim); margin-left: 6px; }
.nfm-rate { display: flex; align-items: baseline; gap: 6px; }
.nfm-rate b { font-size: 26px; font-weight: 600; line-height: 1.1; font-variant-numeric: tabular-nums; }
.nfm-rate span { color: var(--nfm-dim); font-size: 13px; }
.nfm-sel { font: inherit; font-size: 13px; padding: 4px 10px; border-radius: 6px; background: var(--nfm-card); color: var(--nfm-text); border: 1px solid var(--nfm-border); height: auto; }
.nfm-host { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 10px; align-items: center; margin-bottom: 11px; font-size: 13px; }
.nfm-host small { color: var(--nfm-dim); font-size: 11.5px; margin-left: 6px; }
.nfm-host .nfm-bar { grid-column: 1 / -1; height: 5px; }
.nfm-empty { color: var(--nfm-dim); font-size: 13px; padding: 8px 0; }
.nfm-search { font: inherit; font-size: 13px; padding: 5px 10px; border-radius: 6px; background: var(--nfm-card); color: var(--nfm-text); border: 1px solid var(--nfm-border); width: 200px; height: auto; }
.nfm-verdict { display: flex; align-items: center; gap: 12px; margin: 0 0 12px; padding: 12px 16px; border-radius: 12px; border: 1px solid color-mix(in srgb, var(--nfm-vd, #3ddc84) 45%, transparent); background: color-mix(in srgb, var(--nfm-vd, #3ddc84) 12%, transparent); }
.nfm-verdict.ok { --nfm-vd: #3ddc84; } .nfm-verdict.warn { --nfm-vd: #f5a623; } .nfm-verdict.bad { --nfm-vd: #ff5d5d; }
.nfm-vd { width: 12px; height: 12px; border-radius: 50%; background: var(--nfm-vd); box-shadow: 0 0 10px var(--nfm-vd); flex: none; }
.nfm-vd-t { display: flex; flex-direction: column; min-width: 0; } .nfm-vd-t b { font-size: 16px; } .nfm-vd-t small { color: var(--nfm-dim, #8d97a6); font-size: 12px; }
.nfm-linkish { margin-left: auto; background: none; border: 0; color: var(--nfm-dim, #8d97a6); cursor: pointer; font: inherit; font-size: 12px; }
.nfm-more { position: relative; } .nfm-more > summary { list-style: none; } .nfm-more > summary::-webkit-details-marker { display: none; }
.nfm-more-list { position: absolute; z-index: 20; left: 0; top: calc(100% + 6px); min-width: 240px; padding: 6px; display: flex; flex-direction: column; gap: 4px; border-radius: 10px; background: var(--nfm-card, #1b1f27); border: 1px solid var(--nfm-border, #ffffff22); box-shadow: 0 10px 30px #0006; }
.nfm-more-list .nfm-act { width: 100%; justify-content: flex-start; }
.nfm-netline { display: flex; flex-wrap: wrap; gap: 10px 28px; align-items: center; }
.nfm-netline > div { display: flex; flex-direction: column; } .nfm-netline small { color: var(--nfm-dim, #8d97a6); font-size: 12px; } .nfm-netline b { font-size: 20px; font-weight: 600; } .nfm-u { font-size: 13px; font-weight: 400; color: var(--nfm-dim, #8d97a6); }
.nfm-netgo { margin-left: auto; }
.nfm-actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 12px; }
.nfm-act { display: inline-flex; align-items: center; gap: 8px; font: inherit; font-size: 13px; padding: 7px 14px; border-radius: 6px; cursor: pointer; color: var(--nfm-text);
  background: var(--nfm-card); border: 1px solid var(--nfm-border); border-bottom-color: var(--nf-stroke-strong, var(--nfm-border)); }
.nfm-act:hover { background: var(--nfm-card2); }
.nfm-act svg { width: 16px; height: 16px; stroke: currentColor; fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.nfm-act.danger { color: var(--error-color-high, #c42b1c); }
.nfm-sig { display: inline-flex; align-items: flex-end; gap: 2px; height: 14px; vertical-align: middle; margin-right: 8px; }
.nfm-sig i { width: 3px; border-radius: 1px; background: var(--nfm-border); }
.nfm-sig i:nth-child(1) { height: 4px; } .nfm-sig i:nth-child(2) { height: 7px; } .nfm-sig i:nth-child(3) { height: 10px; } .nfm-sig i:nth-child(4) { height: 14px; }
.nfm-sig i.on { background: var(--c-up); }
.nfm-sig.weak i.on { background: #e8a30a; }
.nfm-note-s { color: var(--nfm-dim); font-size: 12px; }
.nfm [hidden] { display: none !important; }
.nfm-alerts { display: grid; gap: 8px; margin: 0 0 12px; }
.nfm-alert { padding: 10px 14px; border-radius: var(--nfm-r); font-size: 13px; line-height: 1.4;
  border: 1px solid color-mix(in srgb, #f7a21b 45%, transparent); background: color-mix(in srgb, #f7a21b 13%, var(--nfm-card)); }
.nfm-alert.crit { border-color: color-mix(in srgb, #e5484d 50%, transparent); background: color-mix(in srgb, #e5484d 13%, var(--nfm-card)); }
.nfm-alert b { font-weight: 600; } .nfm-alert small { display: block; color: var(--nfm-dim); font-size: 12px; }
.nfm-hint { padding: 9px 14px; border-radius: 6px; background: var(--nfm-card2); border: 1px solid var(--nfm-border); color: var(--nfm-dim); font-size: 12.5px; margin: 0 0 12px; line-height: 1.45; }
.nfm-hint code { font-size: 12px; }
.nfm-bar-sm { height: 4px; margin-top: 6px; }
.nfm-evlist { max-height: 360px; overflow: auto; }
.nfm-ev-i { display: grid; grid-template-columns: 8px 118px minmax(0, 1fr); gap: 10px; align-items: baseline; padding: 7px 0; font-size: 13px;
  border-bottom: 1px solid color-mix(in srgb, var(--nfm-border) 60%, transparent); }
.nfm-pin { border: 0; background: none; cursor: pointer; color: var(--nfm-dim); font-size: 14px; padding: 0 6px; }
.nfm-pin.on { color: #f7a21b; }
.nfm-ev-i.nt { grid-template-columns: 8px minmax(0, 1fr); }
.nfm-ev-i:last-child { border-bottom: 0; }
.nfm-ev-i i { width: 8px; height: 8px; border-radius: 50%; background: var(--nfm-dim); }
.nfm-ev-i.warn i { background: #f7a21b; } .nfm-ev-i.crit i { background: #e5484d; } .nfm-ev-i.ok i { background: #13a10e; }
.nfm-ev-i time { color: var(--nfm-dim); font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.nfm-rlog { max-height: min(620px, 68vh); padding: 2px 4px 4px 2px; }
.nfm-rlog-item { border-bottom: 1px solid color-mix(in srgb, var(--nfm-border) 58%, transparent); }
.nfm-rlog-item:last-child { border-bottom: 0; }
.nfm-rlog-item > summary { list-style: none; cursor: pointer; border: 0; border-radius: 6px; padding: 8px 8px; }
.nfm-rlog-item > summary::-webkit-details-marker { display: none; }
.nfm-rlog-item > summary::marker { content: ''; }
.nfm-rlog-item > summary:hover { background: color-mix(in srgb, var(--nfm-card2) 74%, transparent); }
.nfm-rlog .nfm-ev-i { grid-template-columns: 8px 118px minmax(0, 1fr); align-items: center; gap: 10px; }
.nfm-rlog .nfm-ev-i.crit { background: color-mix(in srgb, #e5484d 13%, var(--nfm-card)); box-shadow: inset 2px 0 #e5484d; }
.nfm-rlog .nfm-ev-i.warn { background: color-mix(in srgb, #e8a30a 9%, var(--nfm-card)); box-shadow: inset 2px 0 color-mix(in srgb, #e8a30a 72%, transparent); }
.nfm-rlog .nfm-ev-i.notice { background: color-mix(in srgb, #4b9bea 5%, transparent); }
.nfm-log-line { display: flex; align-items: center; gap: 8px; min-width: 0; flex-wrap: wrap; }
.nfm-log-service { flex: 0 0 auto; font-weight: 650; color: var(--nfm-text); }
.nfm-log-level { flex: 0 0 auto; display: inline-flex; align-items: center; border-radius: 999px; padding: 2px 7px; font-size: 10px; line-height: 1.35; font-weight: 750; letter-spacing: .035em; color: var(--nfm-dim); background: color-mix(in srgb, var(--nfm-dim) 12%, transparent); }
.nfm-log-level.crit { color: #ff777b; background: color-mix(in srgb, #e5484d 18%, transparent); }
.nfm-log-level.warn { color: #ffc44d; background: color-mix(in srgb, #e8a30a 18%, transparent); }
.nfm-log-level.notice, .nfm-log-level.info { color: #72baff; background: color-mix(in srgb, #398be5 16%, transparent); }
.nfm-log-level.debug { color: var(--nfm-dim); background: color-mix(in srgb, var(--nfm-dim) 10%, transparent); }
.nfm-log-text { min-width: 0; overflow-wrap: anywhere; }
.nfm-log-summary, .nfm-log-tools { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; margin: 8px 0; }
.nfm-log-summary { color: var(--nfm-dim); font-size: 11px; }
.nfm-log-diagnostics { margin:10px 0 12px; padding:10px; border:1px solid var(--nfm-border); border-radius:9px; background:color-mix(in srgb,var(--nfm-card2) 55%,transparent); }
.nfm-log-diagnostics-head { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:6px 12px; margin-bottom:8px; font-size:12px; }
.nfm-log-diagnostics-head span, .nfm-log-diagnostic small { color:var(--nfm-dim); font-size:11px; font-weight:400; }
.nfm-log-diagnostic-list { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:7px; }
.nfm-log-diagnostic { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:3px 8px; align-items:center; padding:8px 10px; border:1px solid var(--nfm-border); border-radius:7px; text-align:left; color:var(--nfm-text); background:var(--nfm-card); cursor:pointer; }
.nfm-log-diagnostic:hover, .nfm-log-diagnostic.on { border-color:var(--nfm-accent); background:var(--nfm-card2); }
.nfm-log-diagnostic b { font-size:13px; font-variant-numeric:tabular-nums; }
.nfm-log-diagnostic small { grid-column:1/-1; }
.nfm-log-diagnostic.crit b { color:#ff777b; } .nfm-log-diagnostic.warn b { color:#ffc44d; }
.nfm-log-diagnostics-empty { color:var(--nfm-dim); font-size:11px; }
.nfm-log-repeat { flex:0 0 auto; padding:2px 7px; border:1px solid var(--nfm-border); border-radius:999px; color:var(--nfm-text); background:var(--nfm-card2); font-size:10px; font-weight:700; }
.nfm-log-occurrences { display:grid; gap:5px; margin:0 0 8px; }
.nfm-log-occurrences > div { display:grid; grid-template-columns:150px 110px minmax(0,1fr); gap:8px; padding:5px 7px; border-radius:5px; background:color-mix(in srgb,var(--nfm-card) 75%,transparent); font-size:11px; }
.nfm-log-occurrences time, .nfm-log-occurrences > div > span:nth-child(2) { color:var(--nfm-dim); }
@media (max-width:720px) { .nfm-log-occurrences > div { grid-template-columns:1fr; gap:2px; } .nfm-log-diagnostic-list { grid-template-columns:1fr 1fr; } }
@media (max-width:420px) { .nfm-log-diagnostic-list { grid-template-columns:1fr; } }

.nfm-log-count { display: inline-flex; align-items: center; gap: 5px; padding: 4px 8px; border: 1px solid var(--nfm-border); border-radius: 999px; background: var(--nfm-card2); }
.nfm-log-count b { color: var(--nfm-text); font-variant-numeric: tabular-nums; }
.nfm-log-count.crit b { color: #ff777b; } .nfm-log-count.warn b { color: #ffc44d; } .nfm-log-count.info b { color: #72baff; }
.nfm-log-tab-count { display: inline-block; min-width: 18px; margin-left: 5px; padding: 1px 5px; border-radius: 999px; background: color-mix(in srgb, var(--nfm-dim) 14%, transparent); font-size: 10px; font-variant-numeric: tabular-nums; }
.nfm-log-tools { margin: 8px 0 10px; }
.nfm-log-tools .nfm-btn { min-height: 30px; }
.nfm-log-status { margin-left: auto; color: var(--nfm-dim); font-size: 11px; }
.nfm-log-detail { margin: 0 8px 9px 136px; padding: 10px 12px; border: 1px solid var(--nfm-border); border-radius: 7px; background: var(--nfm-card2); }
.nfm-log-detail-head { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
.nfm-log-detail-meta { display: flex; flex-wrap: wrap; gap: 8px 16px; color: var(--nfm-dim); font-size: 11px; }
.nfm-log-detail-meta b { color: var(--nfm-text); font-weight: 600; }
.nfm-log-full { margin: 0; padding: 8px 10px; border-radius: 5px; background: color-mix(in srgb, var(--nfm-card) 85%, transparent); color: var(--nfm-text); font: 12px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
.nfm-log-more { display: flex; justify-content: center; padding: 8px 0 2px; }
@media (max-width: 720px) {
  .nfm-rlog .nfm-ev-i { grid-template-columns: 7px 88px minmax(0, 1fr); gap: 6px; padding: 8px 5px; }
  .nfm-rlog .nfm-ev-i time { font-size: 10px; }
  .nfm-log-detail { margin-left: 8px; }
  .nfm-log-status { width: 100%; margin-left: 0; }
}
.nfm-tiles.t4 { grid-template-columns: 1fr 1fr; }
.nfm-cfg { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px 18px; }
.nfm-cfg-i { display: flex; flex-direction: column; gap: 4px; min-width:0; font-size: 12.5px; color: var(--nfm-dim); }
.nfm-cfg-f { display: flex; align-items: center; gap: 8px; width:100%; min-width:0; }
.nfm-cfg-f > .nfm-in { flex:1 1 0; min-width:0; box-sizing:border-box; }
.nfm-cfg-f em { font-style: normal; min-width: 22px; }
.nfm-in { font: inherit; font-size: 13px; padding: 5px 10px; border-radius: 6px; background: var(--nfm-card); color: var(--nfm-text); border: 1px solid var(--nfm-border); width: 100%; height: auto; }
.nfm-diag { width: 100%; height: 320px; font: 12px/1.45 ui-monospace, Consolas, monospace; padding: 10px; border-radius: 6px; background: var(--nfm-card2); color: var(--nfm-text); border: 1px solid var(--nfm-border); resize: vertical; }
`;

return view.extend({
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	load() {
		return Promise.all([
			L.resolveDefault(callBoard(), {}),
			L.resolveDefault(callIfaces(), { interface: [] }),
			L.resolveDefault(callHints(), {})
		]);
	},

	render(data) {
		const board = data[0] || {}, ifdump = (data[1] || {}).interface || [], hints = data[2] || {};

		/* Names are filled only after the DHCP-backed identity resolver is available. */
		const names = {}, routerNameIps = new Set();
		/* the router's own addresses (LAN and WAN) are labeled "Router" */
		/* addresses of the router itself: current ones, previous external ones (the ISP changes them) and the whole external subnet. Their traffic repeats device traffic (VPN, proxy)
		   or is service traffic, so it is not counted under "devices" */
		const routerIps = (() => {
			const ips = new Set(), nets = [];
			const n = ip => { const a = String(ip).split('.'); return a.length === 4 && a.every(x => /^\d+$/.test(x)) ? ((+a[0] * 256 + +a[1]) * 256 + +a[2]) * 256 + +a[3] : -1; };
			return {
				add: ip => ips.add(ip),
				has: ip => { if (ips.has(ip)) return true; const x = n(ip); return x >= 0 && nets.some(([ b, sz ]) => x >= b && x < b + sz); },
				learn: info => {
					if (!info) return;
					String(info.router_ips || '').split(/\s+/).filter(Boolean).forEach(ip => ips.add(ip));
					String(info.router_nets || '').split(/\s+/).filter(Boolean).forEach(c => { const [ ip, bits ] = c.split('/'), b = n(ip), sz = Math.pow(2, 32 - (+bits || 32)); if (b >= 0 && !nets.some(x => x[0] === b - b % sz)) nets.push([ b - b % sz, sz ]); });
				}
			};
		})();
		for (const i of ifdump) for (const a of (i['ipv4-address'] || [])) if (a.address) { routerIps.add(a.address); routerNameIps.add(a.address); names[a.address] = 'Router'; }

		/* device -> logical interface, default-route device */
		const devRole = {};
		let wanDev = null, lanDev = 'br-lan';
		for (const i of ifdump) {
			const dev = i.l3_device || i.device;
			if (!dev || i.interface === 'loopback') continue;
			devRole[dev] = i.interface;
			if (i.interface === 'lan') lanDev = dev;
			if (!wanDev && i.up && (i.route || []).some(r => r.target === '0.0.0.0' || r.target === '::'))
				wanDev = dev;
		}

		const S = {
			times: [], cpu: [], mem: [], temp: [], cores: [], net: {},
			prev: null, last: null, full: null, wifi: undefined, prevProcs: null, procRate: {},
			paused: false, rlAuto: true, rlLimit: 300, rlExpanded: {}, tick: 0, iface: null, tab: 'overview', sort: 'mem', filter: '',
				at: {}, alerts: undefined, devs: undefined, devDay: 'day', hist: undefined, range: 'h', appTraffic: undefined, appPeriod: 'day', appDevice: ''
		};

		function refreshIdentityNames() {
			for (const ip of Object.keys(names)) if (!routerNameIps.has(ip)) delete names[ip];
			const dv = S.devs || {};
			/* Older monitor backends do not expose DHCP leases. Do not rebuild
			 * IP labels from host hints alone: they may carry proxy-neighbour aliases. */
			if (!Array.isArray(dv.leases)) return;
			const dhcp = monitorBuildDhcpIdentity(dv.leases);
			const ipMac = monitorBuildIpMacMap(hints, dv.neigh || [], S.wifi, dv.leases);
			for (const ip of Object.keys(ipMac)) {
				const mac = ipMac[ip], h = hints[mac] || hints[String(mac).toLowerCase()] || {};
				const name = dhcp.ipName[ip] || h.name || '';
				if (name) names[ip] = String(name).trim();
			}
		}

		try {
			const saved = JSON.parse(window.sessionStorage.getItem(STORE_KEY) || 'null');
			if (saved && Array.isArray(saved.times)) {
				const cut = Date.now() / 1000 - WINDOW;
				const keep = saved.times.map((t, i) => t >= cut ? i : -1).filter(i => i >= 0);
				S.times = keep.map(i => saved.times[i]);
				for (const k of [ 'cpu', 'mem', 'temp' ]) S[k] = keep.map(i => saved[k][i]);
				for (const n in saved.net)
					S.net[n] = { rx: keep.map(i => saved.net[n].rx[i]), tx: keep.map(i => saved.net[n].tx[i]) };
			}
		} catch (e) {}

		/* ---------- build DOM ---------- */
		const rCpu = ring('c-cpu'), rTemp = ring('c-temp'), rMem = ring('c-mem'), rNet = ring('c-down');
		const flashFill = E('i'), flashPct = E('b', {}, '–');
		const rFlash = {
			el: E('div', { class: 'nfm-flash-meter' }, E('div', { class: 'nfm-flash-track' }, flashFill)),
			set(pct, text) {
				const p = Math.max(0, Math.min(100, Number(pct) || 0));
				flashFill.style.width = p + '%';
				flashFill.className = p >= 90 ? 'hot' : p >= 75 ? 'warn' : '';
				flashPct.textContent = text || '–';
			}
		};
		const T = {};  /* text refs */
		const t = (key, cls) => (T[key] = E('span', { class: cls || '' }, '–'));

		const metric = (r, k, ...lines) => E('section', { class: 'nfm-card nfm-metric' }, [
			r.el, E('div', { class: 'nfm-metric-info' }, [ E('div', { class: 'nfm-k' }, k) ].concat(lines)) ]);

		const hotBox = E('div', { class: 'alert-message warning', hidden: '', style: 'margin-bottom:12px' }, [ E('h4', {}, 'CPU is overheating'), E('p') ]);
		const alertsBox = E('div', { class: 'nfm-alerts', hidden: '' });

		const act = (cls, path, label, fn) => {
			const icon = SVG('svg', { viewBox: '0 0 24 24' });
			icon.innerHTML = path;
			return E('button', { class: 'nfm-act ' + cls, click: fn }, [ icon, label ]);
		};

		const actBtns = [
			act('', '<path d="M5 13a10 10 0 0 1 14 0M8.5 16.5a5 5 0 0 1 7 0"/><circle cx="12" cy="20" r=".8"/>', 'Restart Wi-Fi', () => confirmRun(
				'Restart Wi-Fi?', 'Wireless clients will disconnect briefly.', () => fs.exec('/sbin/wifi', [ 'reload' ]), 'Wi-Fi is restarting…')),
			act('', '<path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3"/><path d="M18 3v4h-4M6 21v-4h4"/>', 'Restart network', () => confirmRun(
				'Restart network?', 'All connections, including this page, will be interrupted for a while.', () => fs.exec('/etc/init.d/network', [ 'restart' ]), 'Network is restarting…')),
			act('', '<path d="M12 3v8"/><path d="M6.5 6.5a8 8 0 1 0 11 0"/>', 'Wake a device', () => wakeDialog()),
			act('', '<path d="M9 4h6v3H9z"/><path d="M7 5.5H5.5v14h13v-14H17"/><path d="M9 12h6M9 15.5h4"/>', 'Copy diagnostics', () => copyDiag()),
			act('danger', '<path d="M12 3v9"/><path d="M7 7a7.5 7.5 0 1 0 10 0"/>', 'Reboot router', () => confirmRun(
				'Reboot router?', 'The router will be unavailable for about a minute.', () => callReboot(), 'Router is rebooting… the page will refresh by itself.', true))
		];
		const actions = E('div', { class: 'nfm-actions', style: 'margin-top:12px' }, [ actBtns[0], actBtns[1],
			E('details', { class: 'nfm-more' }, [ E('summary', { class: 'nfm-act', title: 'More: wake a device, copy diagnostics, reboot router' }, '⋯'),
				E('div', { class: 'nfm-more-list' }, actBtns.slice(2)) ]) ]);
		document.addEventListener('click', ev => { const d = actions.querySelector('details'); if (d && d.open && !d.contains(ev.target)) d.open = false; });

		/* ---- Overview verdict line: one word instead of a scatter of warnings ---- */
		const vdTitle = E('b', {}, 'Loading…'), vdSub = E('small', {}), vdMore = E('button', { type: 'button', class: 'nfm-linkish', hidden: '' }, 'Details ▾');
		const verdictBox = E('div', { class: 'nfm-verdict' }, [ E('i', { class: 'nfm-vd' }), E('div', { class: 'nfm-vd-t' }, [ vdTitle, vdSub ]), vdMore ]);
		const detailsWrap = E('div', { hidden: '' }, [ alertsBox, hotBox ]);
		vdMore.addEventListener('click', () => { const on = detailsWrap.hasAttribute('hidden'); detailsWrap.toggleAttribute('hidden', !on); vdMore.textContent = on ? 'Hide ▴' : 'Details ▾'; });
		function updVerdict() {
			const hot = !hotBox.hasAttribute('hidden'), al = alertsBox.hasAttribute('hidden') ? [] : Array.from(alertsBox.children);
			const crit = hot || al.some(x => x.classList.contains('crit'));
			const n = al.length + (hot ? 1 : 0);
			verdictBox.className = 'nfm-verdict ' + (crit ? 'bad' : n ? 'warn' : 'ok');
			vdTitle.textContent = crit ? 'Needs attention' : n ? 'Some issues' : 'All good';
			const tm = S.temps && S.temps.main != null ? 'temperature ' + nf0.format(S.temps.main) + ' °C' : '', net = (T.wanMini && T.wanMini.textContent) || '';
			vdSub.textContent = n ? (hot ? 'CPU is overheating' : (al[0].querySelector('b') || {}).textContent || '') + (n > 1 ? ' · and ' + (n - 1) + ' more' : '') : [ tm, net && net !== '–' ? 'internet: ' + net : '' ].filter(Boolean).join(' · ');
			vdMore.toggleAttribute('hidden', !n);
			if (!n) { detailsWrap.setAttribute('hidden', ''); vdMore.textContent = 'Details ▾'; }
		}


		const cardsRow = E('div', { class: 'nfm-grid nfm-g4' }, [
			metric(rCpu, 'CPU', E('div', { class: 'nfm-v' }, [ t('cpuCores') ]), E('div', { class: 'nfm-s' }, [ t('cpuLoad') ])),
			metric(rTemp, 'Temperature', E('div', { class: 'nfm-v' }, [ t('tempMain') ]), E('div', { class: 'nfm-s' }, [ t('tempSub') ])),
			metric(rMem, 'Memory', E('div', { class: 'nfm-v' }, [ t('memMain') ]), E('div', { class: 'nfm-s' }, [ t('memSub') ])),
			metric(rNet, 'Internet', E('div', { class: 'nfm-v' }, [ t('netMain') ]), E('div', { class: 'nfm-s' }, [ t('netSub') ]))
		]);
		const flashCard = E('section', { class: 'nfm-card nfm-flash-card' }, [
			E('div', { class: 'nfm-flash-head' }, [
				E('div', { class: 'nfm-flash-heading' }, [
					E('span', { class: 'nfm-flash-icon' }, SVG('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, [
						SVG('ellipse', { cx: 12, cy: 5, rx: 8, ry: 3, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8 }),
						SVG('path', { d: 'M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8 })
					])),
					E('div', {}, [
						E('div', { class: 'nfm-flash-title' }, 'Flash memory'),
						E('span', { class: 'nfm-flash-caption' }, 'Router storage')
					])
				]),
				E('span', { class: 'nfm-flash-percent' }, flashPct)
			]),
			E('div', { class: 'nfm-flash-values' }, [
				E('div', { class: 'nfm-flash-primary' }, [ t('flashMain') ]),
				E('div', { class: 'nfm-flash-secondary' }, [ t('flashSub') ])
			]),
			rFlash.el,
			E('div', { class: 'nfm-flash-stats' }, [
				E('div', { class: 'nfm-flash-stat' }, [
					E('span', {}, 'Total'),
					E('b', {}, [ t('flashTotal') ])
				]),
				E('div', { class: 'nfm-flash-stat' }, [
					E('span', {}, 'Free'),
					E('b', {}, [ t('flashFree') ])
				])
			])
		]);

		const mainChart = chart({
			right: true,
			series: [ { key: 'cpu', cls: 'c-cpu', label: 'CPU', fmt: v => nf0.format(v) + '%' }, { key: 'mem', cls: 'c-mem', label: 'Memory', fmt: v => nf0.format(v) + '%' },
				{ key: 'temp', cls: 'c-temp', axis: 'right', fill: .12, label: 'Temperature', fmt: v => nf1.format(v) + ' °C' } ],
			fmtLeft: v => nf0.format(v) + '%', fmtRight: v => nf0.format(v) + '°'
		});

		const coresBox = E('div');
		const coreRefs = [];
		const tileRefs = {};
		const tiles = E('div', { class: 'nfm-tiles' }, [ [ 'apps', 'programs' ], [ 'sys', 'system' ], [ 'irq', 'interrupts' ], [ 'io', 'disk wait' ] ]
			.map(([ k, l ]) => E('div', { class: 'nfm-tile' }, [ l, tileRefs[k] = E('b', {}, '–') ])));

		const sparkDown = sparkline('c-down'), sparkUp = sparkline('c-up');
		const netMini = chart({
			height: 196,
			series: [ { key: 'rx', cls: 'c-down', label: 'Download', fmt: rateText }, { key: 'tx', cls: 'c-up', fill: .18, label: 'Upload', fmt: rateText } ],
			fmtLeft: v => rateText(v), fmtRight: () => ''
		});

		const memStack = E('div', { class: 'nfm-stack' });
		const memLegend = E('div', { class: 'nfm-legend nfm-legend-lg' });

		const top3Box = E('div');
		const netLine = E('div', { class: 'nfm-netline' }, [
			E('div', {}, [ E('small', {}, 'Download'), E('b', {}, [ T.dlN = E('span', {}, '–'), ' ', T.dlU = E('span', { class: 'nfm-u' }, '') ]) ]),
			E('div', {}, [ E('small', {}, 'Upload'), E('b', {}, [ T.ulN = E('span', {}, '–'), ' ', T.ulU = E('span', { class: 'nfm-u' }, '') ]) ]),
			E('div', {}, [ E('small', {}, 'Connections'), E('b', {}, [ t('ctMini') ]) ]),
			E('div', {}, [ E('small', {}, 'Wi-Fi clients'), E('b', {}, [ t('wifiMini') ]) ]),
			E('div', {}, [ E('small', {}, 'Internet'), E('b', {}, [ t('wanMini') ]) ]),
			E('button', { type: 'button', class: 'nfm-btn nfm-netgo', click: () => { S.tab = 'net'; refresh(); } }, 'More on the "Network" tab →') ]);
		T.netIface = E('span');

		const overview = E('div', {}, [
			verdictBox, detailsWrap, cardsRow,
			E('div', { class: 'nfm-grid nfm-g21' }, [
				card([ 'Last 5 minutes', E('span', { class: 'nfm-spacer' }),
					E('span', { class: 'nfm-legend' }, [ legendDot('c-cpu', 'CPU'), legendDot('c-mem', 'Memory'), legendDot('c-temp', 'Temperature, °C') ]) ], mainChart.el),
				card('Top consumers now', top3Box)
			]),
			card('Network now', netLine),
			actions
		]);

		/* network tab */
		const netSel = E('select', { class: 'nfm-sel', change: ev => { S.iface = ev.target.value; refresh(); } });
		const netBig = chart({ height: 260, series: [ { key: 'rx', cls: 'c-down', label: 'Download', fmt: rateText }, { key: 'tx', cls: 'c-up', fill: .18, label: 'Upload', fmt: rateText } ],
			fmtLeft: v => rateText(v), fmtRight: () => '' });
		const ifBody = E('tbody');
		const wifiBody = E('tbody');
		const hostsBox = E('div');
		const devBody = E('tbody');
		const devNote = E('div', { class: 'nfm-hint', hidden: '' });
		const devSel = E('select', { class: 'nfm-sel', change: ev => { S.devDay = ev.target.value; refresh(); } },
			[ E('option', { value: 'day' }, 'Today'), E('option', { value: 'yday' }, 'Yesterday') ]);
		const dnsBox = E('div', { class: 'nfm-two' }), ipBox = E('div');
		function renderExtIp() {
			const R = S.extip;
			if (!R || !R.rows) { ipBox.replaceChildren(E('div', { class: 'nfm-empty' }, R === null ? 'No data: update the theme on the router.' : 'Loading…')); return; }
			const rows = R.rows.slice().reverse();
			if (!rows.length) { ipBox.replaceChildren(E('div', { class: 'nfm-empty' }, 'The WAN address will appear after the next collector step (every 5 minutes).')); return; }
			const cur = rows[0], nat = !!cur[2];
			ipBox.replaceChildren(
				E('div', { class: 'nfm-hint sec-' + (nat ? 'warn' : 'ok') }, nat ? 'The WAN address ' + cur[1] + ' is in the ISP NAT range (CGNAT or double NAT): incoming connections from the internet and port forwarding will most likely not work. Fix: ask your ISP for a public ("white") IP.' : 'The WAN address ' + cur[1] + ' does not look like ISP NAT: port forwarding and incoming connections are possible.'),
				E('div', { class: 'nfm-k', style: 'margin:10px 0 6px' }, 'Address changes (' + rows.length + ')'),
				E('div', { class: 'nfm-evlist' }, rows.slice(0, 10).map(x => E('div', { class: 'nfm-ev-i' }, [ E('i'), E('time', {}, fmtTs(x[0])), E('span', {}, x[1] + (x[2] ? ' · behind NAT' : '')) ]))));
		}
		const chanSel = E('select', { class: 'nfm-sel', change: ev => { S.chanDev = ev.target.value; renderChannel(); } });
		const chanBox = E('div', { class: 'nfm-two' });
		const chanNote = E('div', { class: 'nfm-note-s', style: 'margin:-4px 0 10px' }, 'Speed over the last few seconds from conntrack data: by service (port) and by internet address.');
		/* ---- diagnostics: ping / route / DNS straight from the browser ---- */
		const DIAG = '/usr/libexec/nightfall-diag';
		const diagOut = E('pre', { class: 'nfm-diag-out' }, 'Choose a host and press a button.');
		const diagHost = E('input', { type: 'text', class: 'nfm-diag-in', value: '1.1.1.1', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', 'aria-label': 'Host address' });
		let diagBusy = false;
		const DNAME = { ping: 'Ping', trace: 'Route', route: 'Route loss', dns: 'DNS', check: 'Full check', bloat: 'Latency under load' };
		const diagHistBox = E('div', { class: 'nfm-evlist' });
		const diagLoad = () => { try { return JSON.parse(window.localStorage.getItem('nfm_diag') || '[]'); } catch (e) { return []; } };
		function diagSave(cmd, host, out) {
			if (/out of LuCI|[Ii]nvalid|[Ii]ncorrect/.test(out)) return;
			try { const l = diagLoad(); l.unshift({ t: Math.floor(Date.now() / 1000), cmd, host, out: String(out).slice(0, 2000) }); window.localStorage.setItem('nfm_diag', JSON.stringify(l.slice(0, 15))); } catch (e) { /* no history */ }
			renderDiagHist();
		}
		function renderDiagHist() {
			const l = diagLoad();
			diagHistBox.replaceChildren(...(l.length ? l.map(x => E('div', { class: 'nfm-ev-i ' + (/❌|severe|heavy/i.test(x.out) ? 'crit' : /noticeable/i.test(x.out) ? 'warn' : 'info'), style: 'cursor:pointer', title: 'Show result', click: () => { diagOut.textContent = x.out; } }, [ E('i'), E('time', {}, fmtTs(x.t)), E('span', {}, DNAME[x.cmd] + (x.host ? ' · ' + x.host : '') + ' — ' + (x.out.split('\n').find(z => /[✅❌]|Verdict|Conclusion|Result/.test(z)) || x.out.split('\n')[0]).slice(0, 90)) ])) : [ E('div', { class: 'nfm-empty' }, 'Results of your checks will appear here (stored in this browser).') ]));
		}
		function runDiag(cmd) {
			const h = (cmd === 'check' || cmd === 'bloat') ? cmd : diagHost.value.trim();
			if (!/^[A-Za-z0-9._:-]{1,253}$/.test(h) || h[0] === '-') { diagOut.textContent = 'Enter a host address or name: letters, digits, dot, hyphen.'; return; }
			if (diagBusy) return;
			diagBusy = true; diagBox.classList.add('busy');
			diagOut.textContent = ({ ping: 'Ping ' + h + '…', trace: 'Route to ' + h + ' (up to 30 seconds)…', route: 'Measuring loss along the route to ' + h + ' (up to 25 seconds)…', bloat: 'Measuring latency without and under load (about 20 seconds)…', dns: 'DNS query ' + h + '…', check: 'Checking gateway, internet and DNS (up to 20 seconds)…' })[cmd];
			fs.exec(DIAG, (cmd === 'check' || cmd === 'bloat') ? [ cmd ] : [ cmd, h ]).then(r => { diagOut.textContent = ((r.stdout || '') + (r.stderr || '')).trim() || 'No response.'; diagSave(cmd, (cmd === 'check' || cmd === 'bloat') ? '' : h, diagOut.textContent); })
				.catch(e => { const m = String((e && e.message) || e || ''); diagOut.textContent = 'Could not run' + (m ? ' (' + m.slice(0, 120) + ')' : '') + '. ' + (/denied|permission|access/i.test(m) ? 'Log out of LuCI and sign in again (new permissions are needed).' : 'Most likely the command did not finish within the router response time limit; try a closer host.'); })
				.then(() => { diagBusy = false; diagBox.classList.remove('busy'); });
		}
		const diagBox = E('div', { class: 'nfm-diag' }, [
			E('div', { class: 'nfm-diag-row' }, [ diagHost,
				E('button', { type: 'button', class: 'nfm-tab on', click: () => runDiag('ping') }, 'Ping'),
				E('button', { type: 'button', class: 'nfm-tab', click: () => runDiag('trace') }, 'Route'),
				E('button', { type: 'button', class: 'nfm-tab', title: 'Loss and latency at each hop of the route', click: () => runDiag('route') }, 'Route loss'),
				E('button', { type: 'button', class: 'nfm-tab', click: () => runDiag('dns') }, 'DNS') ]),
			E('div', { class: 'nfm-diag-row' }, [ E('button', { type: 'button', class: 'nfm-btn', click: () => runDiag('check') }, 'Check everything: gateway, internet, DNS'), E('span', { class: 'nfm-note-s' }, 'ping to the gateway and 1.1.1.1, name resolution via the router DNS') ]),
			E('div', { class: 'nfm-diag-row' }, [ E('button', { type: 'button', class: 'nfm-btn', click: () => runDiag('bloat') }, 'Latency under load test'), E('span', { class: 'nfm-note-s' }, 'bufferbloat: the link is saturated by a download during the test (curl required)') ]),
			E('div', { class: 'nfm-diag-chips' }, [ '1.1.1.1', '8.8.8.8', '77.88.8.8', 'ya.ru', 'google.com' ].map(h =>
				E('button', { type: 'button', class: 'nfm-tab', click: () => { diagHost.value = h; } }, h))),
			diagOut ]);
		const diagBody = diagBox;
		renderDiagHist();
		diagHost.addEventListener('keydown', ev => { if (ev.key === 'Enter') runDiag('ping'); });

		const net = E('div', { hidden: true }, [
			E('div', { class: 'nfm-grid nfm-g3' }, [
				card('Download', E('div', {}, [ E('div', { class: 'nfm-rate' }, [ T.nDlN = E('b', {}, '–'), T.nDlU = E('span') ]),
					E('div', { class: 'nfm-s' }, [ 'total received ', t('nDlTot') ]) ])),
				card('Upload', E('div', {}, [ E('div', { class: 'nfm-rate' }, [ T.nUlN = E('b', {}, '–'), T.nUlU = E('span') ]),
					E('div', { class: 'nfm-s' }, [ 'total sent ', t('nUlTot') ]) ])),
				card('Connections', E('div', {}, [ E('div', { class: 'nfm-rate' }, [ T.ctN = E('b', {}, '–'), T.ctMax = E('span') ]),
					E('div', { class: 'nfm-bar', style: 'margin:8px 0 6px' }, [ T.ctBar = E('div', { class: 'nfm-bar-fill c-cpu' }) ]),
					E('div', { class: 'nfm-s' }, [ t('ctProto') ]) ]))
			]),
			E('div', { class: 'nfm-grid' }, [
				card([ 'What is using the link now', E('span', { class: 'nfm-spacer' }), chanSel ], E('div', {}, [ chanNote, chanBox ]))
			]),
			E('div', { class: 'nfm-grid' }, [ card('DNS queries', dnsBox) ]),
			E('div', { class: 'nfm-grid' }, [ card('WAN address and CGNAT', ipBox) ]),
			E('div', { class: 'nfm-grid' }, [
				card([ 'Speed by interface', E('span', { class: 'nfm-spacer' }), netSel,
					E('span', { class: 'nfm-legend' }, [ legendDot('c-down', 'Download'), legendDot('c-up', 'Upload') ]) ], netBig.el)
			]),
			E('div', { class: 'nfm-grid nfm-g21' }, [
				card('Interfaces', E('table', { class: 'nfm-table' }, [
					E('thead', {}, E('tr', {}, [ E('th', {}, 'Interface'), E('th', { class: 'r' }, '↓ now'), E('th', { class: 'r' }, '↑ now'),
						E('th', { class: 'r' }, '↓ total'), E('th', { class: 'r' }, '↑ total'), E('th', { class: 'r' }, 'Errors') ])), ifBody ])),
				card('Who holds connections', hostsBox)
			]),
		]);

		/* processes tab */
		const procBody = E('tbody');
		const sortTh = (key, label, cls) => E('th', { class: 'sort ' + (cls || ''), click: () => { S.sort = key; refresh(); } }, label);
		const pmBox = E('div'), pmPer = E('select', { class: 'nfm-sel', 'aria-label': 'Memory period', change: ev => { S.pmH = +ev.target.value; S.at.pm = 0; tick(); } },
			[ [ 6, 'Last 6 hours' ], [ 24, 'Last 24 hours' ], [ 168, 'Last 7 days' ] ].map(([ v, l ]) => E('option', { value: String(v), selected: v === 24 }, l)));
		function renderProcMem() {
			const R = S.pm;
			if (!R || !R.rows) { pmBox.replaceChildren(E('div', { class: 'nfm-empty' }, R === null ? 'No data: update the theme on the router.' : 'Loading…')); return; }
			if (R.rows.length < 3) { pmBox.replaceChildren(E('div', { class: 'nfm-empty' }, 'Not enough data yet: per-program memory is recorded every 15 minutes (not kept in Lite mode).')); return; }
			const ser = {};
			R.rows.forEach((row, i) => { for (const [ n, kb ] of row[1]) (ser[n] = ser[n] || new Array(R.rows.length).fill(null))[i] = kb; });
			const list = Object.keys(ser).map(n => {
				const v = ser[n].filter(x => x != null), first = v[0], last = v[v.length - 1], max = Math.max(...v);
				let up = 0; for (let i = 1; i < v.length; i++) if (v[i] >= v[i - 1]) up++;
				const grow = v.length >= 6 && last > first * 1.3 && last - first > 5120 && up >= 0.75 * (v.length - 1);
				return { n, first, last, max, grow, v: ser[n] };
			}).sort((a, b) => (b.grow - a.grow) || b.max - a.max).slice(0, 10);
			const spark = v => { const pts = v.map((x, i) => x == null ? null : [ i, x ]).filter(Boolean); const mx = Math.max(...pts.map(q => q[1])), mn = Math.min(...pts.map(q => q[1])), w = 90, h = 22, N = Math.max(1, v.length - 1);
				return SVG('svg', { width: w, height: h, viewBox: '0 0 ' + w + ' ' + h }, [ SVG('polyline', { fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5, points: pts.map(q => (q[0] / N * w).toFixed(1) + ',' + (h - 2 - (mx === mn ? 0.5 : (q[1] - mn) / (mx - mn)) * (h - 4)).toFixed(1)).join(' ') }) ]); };
			pmBox.replaceChildren(
				E('table', { class: 'nfm-table' }, [ E('thead', {}, E('tr', {}, [ E('th', {}, 'Program'), E('th', {}, 'Trend'), E('th', { class: 'r' }, 'At start'), E('th', { class: 'r' }, 'Now'), E('th', { class: 'r' }, 'Peak') ])),
					E('tbody', {}, list.map(x => E('tr', {}, [ E('td', {}, [ x.n, x.grow ? E('span', { class: 'nfm-chip priv', title: 'Memory grows almost continuously: a leak is possible. Restart the service and keep an eye on it.' }, 'growing · possible leak') : '' ]),
						E('td', {}, spark(x.v)), E('td', { class: 'r' }, fmtMB(x.first)), E('td', { class: 'r' }, fmtMB(x.last)), E('td', { class: 'r' }, fmtMB(x.max)) ]))) ]),
				E('div', { class: 'nfm-note-s', style: 'margin-top:8px' }, 'The ten "heaviest" programs are shown. "Possible leak" is flagged when memory only grew in almost all samples and increased by more than 30% and 5 MB.'));
		}
		const procs = E('div', { hidden: true }, [
			E('div', { class: 'nfm-grid nfm-g21 nfm-proc-overview' }, [ card('CPU cores', E('div', {}, [ coresBox, tiles ])), flashCard ]),
			card([ 'Who uses how much', E('span', { class: 'nfm-note' }, 'program memory is approximate: shared libraries are counted in each one') ], E('div', {}, [ memStack, memLegend ])),
			card([ 'Program memory over the period', E('span', { class: 'nfm-spacer' }), pmPer ], pmBox),
			card([ 'Programs', E('span', { class: 'nfm-spacer' }),
				E('input', { class: 'nfm-search', type: 'search', placeholder: 'Search…', input: ev => { S.filter = ev.target.value.toLowerCase(); refresh(); } }) ],
				E('table', { class: 'nfm-table' }, [
					E('thead', {}, E('tr', {}, [ E('th', {}, 'Name'), E('th', { class: 'r' }, 'Processes'),
						sortTh('cpu', 'CPU ↓', 'r'), sortTh('mem', 'Memory ↓', 'r') ])), procBody ]))
		]);

		/* history tab */
		const rangeBtns = {};
		const rangeTabs = E('div', { class: 'nfm-tabs' }, Object.keys(RANGES).map(k =>
			rangeBtns[k] = E('button', { class: 'nfm-tab', click: () => { S.range = k; S.hist = undefined; S.at.hist = 0; refresh(); tick(); } }, RANGES[k][2])));
		const histNote = E('div', { class: 'nfm-hint', hidden: '' });
		const histMain = chart({ right: true, height: 240,
			series: [ { key: 'cpuB', cls: 'c-base', fill: 0, label: 'CPU usual', fmt: v => nf0.format(v) + '%' }, { key: 'cpu', cls: 'c-cpu', label: 'CPU', fmt: v => nf0.format(v) + '%' }, { key: 'mem', cls: 'c-mem', label: 'Memory', fmt: v => nf0.format(v) + '%' },
				{ key: 'temp', cls: 'c-temp', axis: 'right', fill: .12, label: 'Temperature', fmt: v => nf1.format(v) + ' °C' } ],
			fmtLeft: v => nf0.format(v) + '%', fmtRight: v => nf0.format(v) + '°' });
		const histPing = chart({ height: 200,
			series: [ { key: 'netB', cls: 'c-base', fill: 0, label: 'Internet usual', fmt: v => nf1.format(v) + ' ms' }, { key: 'gw', cls: 'c-up', fill: 0, gaps: true, label: 'Gateway', fmt: v => nf1.format(v) + ' ms' }, { key: 'net', cls: 'c-down', fill: 0, gaps: true, label: 'Internet', fmt: v => nf1.format(v) + ' ms' } ],
			fmtLeft: v => nf0.format(v) + ' ms', fmtRight: () => '' });
		const histNet = chart({ height: 200, series: [ { key: 'rxB', cls: 'c-base', fill: 0, label: 'Download usual', fmt: rateText }, { key: 'rx', cls: 'c-down', label: 'Download', fmt: rateText }, { key: 'tx', cls: 'c-up', fill: .18, label: 'Upload', fmt: rateText } ],
			fmtLeft: v => rateText(v), fmtRight: () => '' });
		const evBox = E('div', { class: 'nfm-evlist' });
		const histInfo = E('div', { class: 'nfm-s', style: 'margin-top:10px' });
		const pingTiles = E('div', { class: 'nfm-tiles t4' }, [ [ 'pAvg', 'average latency' ], [ 'pMax', 'maximum' ], [ 'pLoss', 'lost replies' ], [ 'pCut', 'outages' ] ]
			.map(([ k, l ]) => E('div', { class: 'nfm-tile' }, [ l, T[k] = E('b', {}, '–') ])));
		const CFG_FIELDS = [
			[ 'TEMP_WARN', 'Overheating warning', '°C' ], [ 'TEMP_CRIT', 'Critical overheating', '°C' ],
			[ 'MEM_MIN_PCT', 'Free memory below', '%' ], [ 'FLASH_MAX_PCT', 'Flash used above', '%' ],
			[ 'CT_MAX_PCT', 'Connection table filled', '%' ], [ 'CPU_MAX_PCT', 'CPU load', '%' ],
			[ 'CPU_MINUTES', '…and lasts longer than', 'min' ],
			[ 'PING_TARGET', 'Internet check: address 1', '', 'text' ], [ 'PING_TARGET2', 'Internet check: address 2', '', 'text' ],
			[ 'PERSIST_DIR', 'Folder for saving history', '', 'text', 'e.g. /mnt/sda1/nightfall; /overlay only with permission' ],
			[ 'PERSIST_HOURS', 'Save history to storage every', 'h' ], [ 'HIST_DAYS', 'Long history (30 min step), days 7–90', 'days' ], [ 'BACKUP_KEEP', 'Backups to keep on USB/SD (1–20)', 'pcs' ], [ 'PERSIST_ANY', 'Allow writing to internal flash memory (wear and free space)', '' ], [ 'JOURNAL', 'Outage and reboot log (0/1)', '' ], [ 'WIFI_HIST', 'Wi-Fi signal history (0/1)', '' ],
			[ 'SPEED_URL', 'Speed test file', '', 'text' ], [ 'SPEED_STREAMS', 'Speed test streams (1–8)', '' ],
			[ 'NEWDEV', 'Report new devices (0/1)', '' ],
			[ 'LITE', 'Lite mode for a weak router: polling every 60 s, no per-app accounting and no Wi‑Fi history (0/1)', '' ],
			[ 'APPS', 'Per-app traffic accounting (0/1)', '' ],
			[ 'TG', 'Send notifications to Telegram (0/1)', '' ], [ 'TG_ALERTS', 'Send warnings and reboots (0/1)', '' ], [ 'TG_BOT', 'Bot with buttons: menu, blocking, reboot (0/1)', '' ], [ 'TG_CLEAN', 'Bot cleans up after itself: reply always at the bottom, commands are deleted (0/1)', '' ], [ 'TG_UPDATES', 'Notify in Telegram about new theme versions (0/1)', '' ], [ 'TG_SEC', 'Notify in Telegram about a burst of failed sign-ins (0/1)', '' ], [ 'TG_WIDGETS', 'Live widgets in the bot: "Status" with rings, private chat only (0/1)', '' ], [ 'TG_REPORT', 'Daily report in Telegram, time', '', 'text', 'e.g. 21:00, empty = off' ],
			[ 'TG_TOKEN', 'Bot token (from @BotFather)', '', 'password', 'not set' ], [ 'TG_CHAT', 'Chat id', '', 'text', 'a number, detected by the button' ],
			[ 'TG_USERS', 'Who can control the bot in a group (ids, comma-separated)', '', 'text', 'needed only if the chat id is a group' ],
			[ 'TG_PROXY', 'Proxy for Telegram (if it is blocked)', '', 'text', 'e.g. socks5h://127.0.0.1:1080' ],
			[ 'TG_IFACE', 'Or a VPN interface for Telegram', '', 'text', 'e.g. wg0' ]
		];
		const cfgInputs = {};
		const cfgMsg = E('span', { class: 'nfm-note-s' });
		const backupMsg = E('span', { class: 'nfm-note-s' });
		/* Telegram: first save what was entered, then ask the router to detect the chat id or send a test message */
		const tgMsg = E('div', { class: 'nfm-note-s', style: 'margin-top:6px' });
		const tgRun = cmd => {
			tgMsg.textContent = 'Working…';
			const save = [ 'set' ].concat([ 'TG_TOKEN', 'TG_CHAT', 'TG_PROXY', 'TG_IFACE' ].map(k => k + '=' + cfgInputs[k].value.trim()));
			return callCfg(save).then(r => {
				if (!(r && r.ok)) { tgMsg.textContent = 'Not saved: ' + ((r && r.error) || 'no response'); return null; }
				return fs.exec(NOTIFYBIN, [ cmd ]).then(res => { try { return JSON.parse(res.stdout); } catch (e) { return { ok: false, error: 'no response from the router' }; } }).catch(() => ({ ok: false, error: 'no permission to run (log out of LuCI and sign in again; permissions are refreshed at sign-in) or /usr/libexec/nightfall-notify not found' }));
			});
		};
		const tgTools = E('div', { style: 'margin-top:10px' }, [
			E('div', { class: 'nfm-note-s' }, 'How to set up: 1) in Telegram find @BotFather, create a bot with the /newbot command and paste the token above; 2) open your bot and press Start; 3) press "Detect chat id", then "Send test"; 4) turn on the "Send notifications" switch and save. After that you can send commands to the bot: /status, /clients, /traffic, /apps, /speed, /help (it replies only to you).'),
			E('div', { class: 'nfm-actions', style: 'margin:8px 0 0' }, [
				E('button', { class: 'nfm-act', click: () => tgRun('chatid').then(r => { if (!r) return; if (r.ok) { cfgInputs.TG_CHAT.value = r.chat; callCfg([ 'set', 'TG_CHAT=' + r.chat ]); tgMsg.textContent = 'Chat id found: ' + r.chat; } else tgMsg.textContent = r.error; }) }, 'Detect chat id'),
				E('button', { class: 'nfm-act', click: () => tgRun('test').then(r => { if (r) tgMsg.textContent = r.ok ? 'Message sent, check Telegram.' : 'Not sent: ' + r.error; }) }, 'Send test'),
				E('button', { class: 'nfm-act', click: () => tgRun('backup').then(r => { if (r) tgMsg.textContent = r.ok ? 'Backup sent to Telegram as a file (without the bot token).' : 'Not sent: ' + r.error; }) }, 'Backup to Telegram') ]),
			tgMsg ]);
		/* ---- Storage: find a USB stick / SD card and keep history on it with one click ---- */
		const dskBody = E('div', {}, E('div', { class: 'nfm-empty' }, 'Looking for storage…'));
		const dskMsg = E('div', { class: 'nfm-note-s', style: 'margin-top:8px' });
		function loadDisks() { return callCfg([ 'disks' ]).then(r => { S.dsk = r || null; renderDisks(); }).catch(() => { S.dsk = null; renderDisks(); }); }
		function setPersist(dir, hours, msg) {
			dskMsg.textContent = 'Applying…';
			callCfg(dir ? [ 'set', 'PERSIST_DIR=' + dir, 'PERSIST_HOURS=' + hours ] : [ 'set', 'PERSIST_DIR=' ]).then(r => {
				if (!(r && r.ok)) { dskMsg.textContent = 'Not saved: ' + ((r && r.error) || 'no response'); return; }
				dskMsg.textContent = msg; S.at.alerts = 0; S.at.hist = 0;
				callCfg([ 'get' ]).then(c => { S.cfg = c; if (c) fillCfg(c.values); renderDisks(); });
			});
		}
		function renderDisks() {
			const d = S.dsk, cur = ((S.cfg && S.cfg.values) || {}).PERSIST_DIR || '';
			if (d === undefined) return;
			if (!d || !Array.isArray(d.disks)) { dskBody.replaceChildren(E('div', { class: 'nfm-hint' }, 'Could not get the list of storage devices: update the theme on the router to the latest version.')); return; }
			if (!d.disks.length) {
				const parts = (d.parts || []).filter(x => /^\/dev\/(sd|nvme|vd|mmcblk)/.test(x.dev)), fsl = d.fs || [], msg = [];
				const need = { vfat: 'kmod-fs-vfat', exfat: 'kmod-fs-exfat', ntfs: 'kmod-fs-ntfs3', ext4: 'kmod-fs-ext4', f2fs: 'kmod-fs-f2fs', btrfs: 'kmod-fs-btrfs' };
				if (parts.length) {
					msg.push('The router sees a partition: ' + parts.map(x => x.dev + ' (' + fmtBytes(x.size_kb * 1024) + (x.type ? ', ' + x.type : '') + ')').join(', ') + ', but it is not mounted.');
					const bad = parts.filter(x => x.type && need[x.type] && !fsl.includes(x.type) && !(x.type === 'ntfs' && fsl.includes('ntfs3')));
					if (bad.length) msg.push('A file system driver is missing: install ' + [ ...new Set(bad.map(x => need[x.type])) ].join(', ') + ' and reboot the router.');
					msg.push('Then open "System → Mount Points", press "Add", select this partition, mount point /mnt/sda1, enable it and press "Save & Apply". If there is already an entry marked "does not exist", delete it and add it again.');
				} else if (d.usb_storage === 0) {
					msg.push('The USB storage driver is not loaded. Install kmod-usb-storage (for USB 3.0 also kmod-usb-storage-uas) and reboot the router.');
				} else {
					msg.push('The router does not see the USB stick as a disk. Make sure it is fully inserted, try another port or another stick (some do not get enough power). An entry in "Mount Points" marked "does not exist" means the same thing: a partition with that UUID is not found right now. Details on the router: dmesg | grep -i usb.');
				}
				msg.push('When the storage is mounted, press "Refresh": it will appear here.');
				dskBody.replaceChildren(...msg.map(t => E('div', { class: 'nfm-hint', style: 'margin-bottom:6px' }, t)));
				return;
			}
			dskBody.replaceChildren(...d.disks.map(k => {
				const dir = k.mount.replace(/\/$/, '') + '/nightfall', used = cur === dir || cur.indexOf(k.mount.replace(/\/$/, '') + '/') === 0;
				return E('div', { class: 'nfm-dsk' }, [
					E('div', { class: 'nfm-dsk-i' }, [ E('b', {}, k.mount), E('span', { class: 'nfm-note-s' }, k.dev + ' · ' + k.fs + ' · ' + fmtBytes(k.size_kb * 1024) + ', free ' + fmtBytes(k.free_kb * 1024)) ]),
					used ? E('button', { type: 'button', class: 'nfm-btn', click: () => setPersist('', 0, 'Saving history to storage is off; history is kept in memory only again.') }, '✓ History here · turn off')
						: E('button', { type: 'button', class: 'nfm-btn', click: () => setPersist(dir, 1, 'Done: history is saved to ' + dir + ' every hour and will survive a router reboot.') }, 'Keep history here') ]);
			}));
		}

		const cfgBoolKeys = new Set([ 'PERSIST_ANY', 'JOURNAL', 'WIFI_HIST', 'NEWDEV', 'LITE', 'APPS', 'TG', 'TG_ALERTS', 'TG_BOT', 'TG_CLEAN', 'TG_UPDATES', 'TG_SEC', 'TG_WIDGETS' ]);
		function cfgField(k) {
			const field = CFG_FIELDS.find(f => f[0] === k);
			if (!field) return null;
			const [ key, label, unit, type, placeholder ] = field;
			if (cfgBoolKeys.has(key)) {
				cfgInputs[key] = E('input', { class: 'nfm-toggle', type: 'checkbox', role: 'switch', 'aria-label': label });
				return E('label', { class: 'nfm-cfg-i nfm-cfg-toggle' }, [ label.replace(/\s*\(0\/1\)$/, ''), E('span', { class: 'nfm-cfg-f' }, cfgInputs[key]) ]);
			}
			cfgInputs[key] = E('input', { class: 'nfm-in', type: type || 'number', placeholder: placeholder || '' });
			return E('label', { class: 'nfm-cfg-i' }, [ label,
				E('span', { class: 'nfm-cfg-f' }, [ cfgInputs[key], unit ? E('em', {}, unit) : '' ]) ]);
		}
		function cfgGroup(title, keys, extra, cls) {
			const icons = {
				'Temperature and memory': [ 'path', { d: 'M9 18h6M10 22h4M8 14a6 6 0 1 1 8 0c-.8.7-1 1.3-1 2H9c0-.7-.2-1.3-1-2Z' } ],
				'CPU and connections': [ 'fragment', [
					[ 'rect', { x: 6, y: 6, width: 12, height: 12, rx: 2 } ],
					[ 'path', { d: 'M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4' } ]
				] ],
				'Internet check': [ 'fragment', [
					[ 'circle', { cx: 12, cy: 12, r: 9 } ],
					[ 'path', { d: 'M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18' } ]
				] ],
				'Speed test': [ 'fragment', [
					[ 'path', { d: 'M4 19a9 9 0 1 1 16 0' } ],
					[ 'path', { d: 'm12 13 4-5M7 19h10' } ],
					[ 'circle', { cx: 12, cy: 13, r: 1 } ]
				] ],
				'History storage and backups': [ 'fragment', [
					[ 'ellipse', { cx: 12, cy: 5, rx: 8, ry: 3 } ],
					[ 'path', { d: 'M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3' } ]
				] ],
				'Monitoring mode and features': [ 'fragment', [
					[ 'path', { d: 'M12 2v3m0 14v3M4.9 4.9 7 7m10 10 2.1 2.1M2 12h3m14 0h3M4.9 19.1 7 17m10-10 2.1-2.1' } ],
					[ 'circle', { cx: 12, cy: 12, r: 5 } ]
				] ],
				'Notifications': [ 'fragment', [
					[ 'path', { d: 'M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4' } ]
				] ],
				'Bot control': [ 'fragment', [
					[ 'rect', { x: 3, y: 7, width: 18, height: 13, rx: 3 } ],
					[ 'path', { d: 'M12 3v4M8 13h.01M16 13h.01M9 17h6' } ]
				] ],
				'Connection and tools': [ 'fragment', [
					[ 'path', { d: 'M8 3v5m8-5v5M6 8h12v3a6 6 0 0 1-12 0V8ZM12 17v4' } ]
				] ]
			};
			function cfgIcon() {
				const spec = icons[title] || [ 'circle', { cx: 12, cy: 12, r: 8 } ];
				const svg = SVG('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' });
				if (spec[0] === 'fragment')
					spec[1].forEach(([ tag, attrs ]) => svg.appendChild(SVG(tag, attrs)));
				else
					svg.appendChild(SVG(spec[0], spec[1]));
				return svg;
			}
			return E('details', { class: 'nfm-cfg-g' + (cls ? ' ' + cls : ''), open: true }, [
				E('summary', { class: 'nfm-cfg-head' }, [
					E('span', { class: 'nfm-cfg-icon', 'aria-hidden': 'true' }, cfgIcon()),
					E('span', { class: 'nfm-cfg-heading' }, title),
					E('span', { class: 'nfm-cfg-chevron', 'aria-hidden': 'true' }, '⌄')
				]),
				E('div', { class: 'nfm-cfg-body' }, [
					E('div', { class: 'nfm-cfg' }, keys.map(cfgField).filter(Boolean)),
					extra || ''
				])
			]);
		}
		const cfgCard = card('Alert settings', E('div', {}, [
			E('div', { class: 'nfm-cfg-layout' }, [
				cfgGroup('Temperature and memory', [ 'TEMP_WARN', 'TEMP_CRIT', 'MEM_MIN_PCT', 'FLASH_MAX_PCT' ]),
				cfgGroup('CPU and connections', [ 'CPU_MAX_PCT', 'CPU_MINUTES', 'CT_MAX_PCT' ]),
				cfgGroup('Internet check', [ 'PING_TARGET', 'PING_TARGET2' ]),
				cfgGroup('Speed test', [ 'SPEED_URL', 'SPEED_STREAMS' ]),
				cfgGroup('History storage and backups', [ 'PERSIST_DIR', 'PERSIST_HOURS', 'HIST_DAYS', 'BACKUP_KEEP', 'PERSIST_ANY', 'JOURNAL', 'WIFI_HIST' ]),
				cfgGroup('Monitoring mode and features', [ 'LITE', 'APPS', 'NEWDEV' ])
			]),
			E('section', { class: 'nfm-cfg-g nfm-cfg-telegram' }, [
				E('h4', {}, 'Telegram: notifications and control'),
				E('div', { class: 'nfm-tg-grid' }, [
					cfgGroup('Notifications', [ 'TG', 'TG_ALERTS', 'TG_UPDATES', 'TG_SEC', 'TG_REPORT' ]),
					cfgGroup('Bot control', [ 'TG_BOT', 'TG_CLEAN', 'TG_WIDGETS', 'TG_USERS' ]),
					cfgGroup('Connection and tools', [ 'TG_TOKEN', 'TG_CHAT', 'TG_PROXY', 'TG_IFACE' ], tgTools)
				])
			]),
			E('div', { class: 'nfm-cfg-actions' }, [
				E('button', { class: 'nfm-act', click: () => saveCfg() }, '✓ Save & apply'),
				E('button', { class: 'nfm-act', click: () => (S.cfg ? Promise.resolve(S.cfg) : callCfg([ 'get' ]).then(c => (S.cfg = c))).then(c => fillCfg(c && c.defaults)) }, 'Defaults'),
				E('button', { class: 'nfm-act', click: () => copyDiag() }, 'Copy diagnostics'),
				E('button', { class: 'nfm-act', click: () => {
					backupMsg.textContent = 'Creating and verifying a backup…';
					fs.exec('/usr/libexec/nightfall-backup', [ 'create' ]).then(r => {
						backupMsg.textContent = ((r.stdout || '') + (r.stderr || '')).trim() || 'No response from the archiver.';
					}).catch(e => { backupMsg.textContent = 'Could not create a backup: ' + String((e && e.message) || e); });
				} }, 'Create backup now')
			]),
			cfgMsg,
			backupMsg,
			E('details', { class: 'nfm-cfg-help' }, [
				E('summary', {}, 'Settings help'),
				E('div', {}, 'For an honest traffic split, list known VPN servers as IP:port (comma-separated): their external traffic will be shown as "VPN". What is inside an encrypted tunnel cannot be determined. An empty address 1 disables the internet check. History is safer on USB/SD. A path inside /overlay is allowed only when the internal flash memory switch is on: this speeds up wear and can fill the system partition, so leave some free space. Root / and /rom are always forbidden. Backups are kept separately in nightfall-backups; if USB is disconnected, the backup is temporarily created in /tmp. After saving, the collector restarts; accumulated history is not lost.')
			])
		]), 'nfm-cfg-settings-card');
		const jrnTiles = E('div', { class: 'nfm-tiles t4', style: 'margin-bottom:10px' }, [ [ 'jCnt', 'outages in 7 days' ], [ 'jSum', 'total time offline' ], [ 'jAv', 'availability' ], [ 'jBoot', 'last boot' ] ]
			.map(([ k, l ]) => E('div', { class: 'nfm-tile' }, [ l, T[k] = E('b', {}, '–') ])));
		const jrnBox = E('div');
		const spdTiles = E('div', { class: 'nfm-tiles t4', style: 'margin-bottom:10px' }, [ [ 'sLast', 'last test' ], [ 'sAvg', '7-day average' ], [ 'sMax', 'maximum' ], [ 'sMin', 'minimum' ] ]
			.map(([ k, l ]) => E('div', { class: 'nfm-tile' }, [ l, T[k] = E('b', {}, '–') ])));
		const spdChart = chart({ height: 180, series: [ { key: 'mbps', cls: 'c-down', fill: .16, label: 'Speed', fmt: v => nf1.format(v) + ' Mbit/s' } ],
			fmtLeft: v => nf0.format(v) + ' Mbit/s', fmtRight: () => '' });
		const spdList = E('div', { class: 'nfm-lst', style: 'margin-top:12px' });
		const spdNote = E('div', { class: 'nfm-note-s', style: 'margin-top:8px' });
		const spdSel = E('select', { class: 'nfm-sel', title: 'Automatic speed test', change: ev => {
			callCfg([ 'set', 'SPEED_HOURS=' + ev.target.value ]).then(r => { if (!(r && r.ok)) ui.addNotification(null, E('p', {}, 'Not saved: ' + ((r && r.error) || 'no response')), 'danger'); S.at.spd = 0; }); } },
			[ [ '0', 'Auto test off' ], [ '1', 'Every hour' ], [ '3', 'Every 3 hours' ], [ '6', 'Every 6 hours' ], [ '12', 'Every 12 hours' ], [ '24', 'Once a day' ] ].map(([ v, l ]) => E('option', { value: v }, l)));
		const SPEED_PRESETS = [
			[ 'https://speed.cloudflare.com/__down?bytes=25000000', 'Cloudflare (25 MB per stream)' ],
			[ 'https://mirror.yandex.ru/ubuntu/ls-lR.gz', 'Yandex Mirror (Russia)' ],
			[ 'https://speed.hetzner.de/100MB.bin', 'Hetzner (Germany, 100 MB per stream)' ],
			[ 'https://proof.ovh.net/files/100Mb.dat', 'OVH (France, 100 MB per stream)' ] ];
		const spdSrc = E('select', { class: 'nfm-sel', title: 'Where to download the test file from', change: ev => {
			if (!ev.target.value) { ui.addNotification(null, E('p', {}, 'Enter your own address in the "Speed test file" field in the settings below.'), 'info'); return; }
			callCfg([ 'set', 'SPEED_URL=' + ev.target.value ]).then(r => {
				if (r && r.ok) { if (S.cfg && S.cfg.values) S.cfg.values.SPEED_URL = ev.target.value; if (cfgInputs.SPEED_URL) cfgInputs.SPEED_URL.value = ev.target.value; }
				else ui.addNotification(null, E('p', {}, 'Not saved: ' + ((r && r.error) || 'no response')), 'danger'); }); } },
			SPEED_PRESETS.map(([ v, l ]) => E('option', { value: v }, l)).concat([ E('option', { value: '' }, 'Custom address (in settings)') ]));
		const spdBtn = E('button', { class: 'nfm-btn', click: () => startSpeed() }, 'Test now');
		const flashBox = E('div');
		const dayBody = E('div', { class: 'nfm-day' }, E('div', { class: 'nfm-empty' }, 'Loading…'));
		const wqBody = E('div', { class: 'nfm-wq' });
		const homeBox = E('div', { class: 'nfm-evlist' }), susBox = E('div', { class: 'nfm-evlist' });
		const wbBox = E('div'), wrBox = E('div'), wjBox = E('div', { class: 'nfm-evlist' });
		/* ---- v1.23.0: bands, recommendations and Wi‑Fi connection log ---- */
		/* ---- "Who is home" (via Wi‑Fi) and unusual activity (by traffic over days) ---- */
		function renderDevExtra() {
			const R = S.wq, cl = wifiDisplayRows(), up = m => String(m).toUpperCase();
			const here = {}, via = {};
			for (const c of cl) if (c.mac && !c.proxyStation && (!c.proxy || [ 'REACHABLE', 'DELAY', 'PROBE' ].includes(c.proxyState))) {
				here[up(c.mac)] = true;
				if (c.proxy) via[up(c.mac)] = true;
			}
			const st = {};
			for (const e of (R && R.events) || []) { const m = up(e[1]), o = st[m] = st[m] || { join: 0, leave: 0 }; if (e[2] === 'join') o.join = Math.max(o.join, e[0]); else o.leave = Math.max(o.leave, e[0]); }
			for (const m in here) st[m] = st[m] || { join: 0, leave: 0 };
			const rows = Object.keys(st).map(m => ({ m, home: !!here[m], t: here[m] ? st[m].join : st[m].leave })).sort((a, b) => (b.home - a.home) || (b.t - a.t));
			homeBox.replaceChildren(...(rows.length ? rows.map(x => E('div', { class: 'nfm-ev-i ' + (x.home ? 'ok' : 'info') }, [ E('i'), E('time', {}, x.home ? 'home' : 'offline'),
				E('span', {}, devName(x.m) + (via[x.m] ? ' · via repeater' : '') + (x.t ? (x.home ? ' · connected ' : ' · left ') + fmtTs(x.t) : '')) ])) : [ E('div', { class: 'nfm-empty' }, R || S.wifi ? 'No Wi‑Fi connection data yet.' : 'Loading…') ]));
			/* unusual activity: noticeably more than usual today, or the device sends much more than it receives */
			const base = {};
			for (const x of (S.dd && S.dd.rows) || []) { const k = x[4] && x[4] !== '-' ? up(x[4]) : x[1]; const b = base[k] = base[k] || {}; b[x[0]] = (b[x[0]] || 0) + (+x[2]) + (+x[3]); }
			const out = [];
			for (const r of S.devRows || []) {
				if (r.k === 'router' || r.k === 'v6') continue;
				const today = r.dd + r.du, nm = (r.mac && devName(r.mac)) || names[r.ip] || r.ip;
				const b = base[r.mac] || base[r.ip], days = b ? Object.values(b) : [];
				const avg = days.length >= 3 ? days.reduce((a, c) => a + c, 0) / days.length : 0;
				if (avg > 0 && today > 3 * avg && today > 300e6) out.push([ 'warn', nm + ': today ' + fmtBytes(today) + ', usually about ' + fmtBytes(avg) + ' per day.' ]);
				else if (r.du > 5 * r.dd && r.du > 200e6) out.push([ 'warn', nm + ': sent ' + fmtBytes(r.du) + ', received only ' + fmtBytes(r.dd) + '. This may be a cloud backup from a camera or phone, but it is worth checking.' ]);
			}
			susBox.replaceChildren(...(out.length ? out.map(o => E('div', { class: 'nfm-ev-i nt warn' }, [ E('i'), E('span', {}, o[1]) ])) : [ E('div', { class: 'nfm-empty' }, S.devRows ? 'Nothing unusual: device traffic is within its normal range.' : 'Loading…') ]));
		}
		/* Clients behind a repeater: DHCP keeps their own MACs,
		 * while ip neigh may show the MAC of the intermediate Wi-Fi station.
		 * We do not merge such devices by proxy MAC; we only add separate rows
		 * when several DHCP clients converge on one actually associated station.
		 */
		function wifiDisplayRows() {
			const dv = S.devs || {};
			return monitorBuildWifiDisplayRows(S.wifi || [], hints, dv.neigh || [], dv.leases || []);
		}
		function renderWifiExtra() {
			const cl = wifiDisplayRows(), R = S.wq;
			const bands = {};
			for (const c of cl) { if (c.proxy) continue; const b = c.band || '?'; const e = bands[b] = bands[b] || { n: 0, sum: 0, rate: 0, rn: 0 }; e.n++; if (c.signal) e.sum += c.signal; if (c.rx && c.rx.rate) { e.rate += c.rx.rate; e.rn++; } }
			const bk = Object.keys(bands).sort();
			wbBox.replaceChildren(...(bk.length ? [ E('div', { class: 'nfm-two' }, bk.map(b => { const e = bands[b]; return E('div', { class: 'nfm-tile' }, [ E('div', { class: 'nfm-k' }, BANDS[b] || 'Band unknown'), E('div', { class: 'nfm-v' }, e.n + ' ' + (e.n === 1 ? 'device' : 'devices')),
				E('div', { class: 'nfm-s' }, 'average signal ' + (e.n ? Math.round(e.sum / e.n) : '–') + ' dBm' + (e.rn ? ' · link ' + nf0.format(e.rate / e.rn / 1000) + ' Mbit/s' : '')) ]); })) ] : [ E('div', { class: 'nfm-empty' }, S.wifi ? 'No Wi-Fi clients connected' : 'Wi-Fi data unavailable') ]));
			/* recommendations */
			const tips = [];
			const by = {};
			const bridgeMacs = new Set(cl.filter(c => c.proxyStation).map(c => String(c.mac).toUpperCase()));
			for (const x of (R && R.rows) || []) { const m = String(x[1]).toLowerCase(), v = +x[2]; if (bridgeMacs.has(m.toUpperCase()) || !isFinite(v)) continue; (by[m] = by[m] || []).push(v); }
			const leaves = {};
			for (const e of (R && R.events) || []) if (e[2] === 'leave' && !bridgeMacs.has(String(e[1]).toUpperCase())) { const k = String(e[1]).toLowerCase(); leaves[k] = (leaves[k] || 0) + 1; }
			for (const m of Object.keys(by)) { const v = by[m], avg = v.reduce((a, b) => a + b, 0) / v.length; if (v.length >= 5 && avg <= -75) tips.push([ 'warn', devName(m) + ': average signal ' + Math.round(avg) + ' dBm. Move it closer to the router or add an access point; if the device is on 2.4 GHz, check the channel for interference (card below).' ]); }
			for (const m of Object.keys(leaves)) if (leaves[m] >= 6) tips.push([ 'warn', devName(m) + ': ' + leaves[m] + ' disconnects in the period. Wi‑Fi power saving on the device is often to blame; try turning it off or enable "Fixed MAC" instead of a private one.' ]);
			const n24 = (bands['2g'] || {}).n || 0, n5 = (bands['5g'] || {}).n || 0;
			if (n5 && n24 > 2 * n5 + 1) tips.push([ 'info', '2.4 GHz has ' + n24 + ' devices, 5 GHz has ' + n5 + '. If some devices support 5 GHz, move them there: faster and less interference.' ]);
			if (!tips.length) tips.push([ 'info', R && (R.rows || []).length ? 'No complaints: signal and stability are fine for all clients.' : 'Not enough data yet: signal history accumulates from collector start (not kept in Lite mode).' ]);
			wrBox.replaceChildren(...tips.map(t => E('div', { class: 'nfm-ev-i nt ' + (t[0] === 'warn' ? 'warn' : 'info') }, [ E('i'), E('span', {}, t[1]) ])));
			/* connection log */
			const ev = ((R && R.events) || []).slice(-40).reverse();
			wjBox.replaceChildren(...(ev.length ? ev.map(e => E('div', { class: 'nfm-ev-i ' + (e[2] === 'join' ? 'info' : 'warn') }, [ E('i'), E('time', {}, fmtTs(e[0])), E('span', {}, devName(String(e[1]).toUpperCase()) + (e[2] === 'join' ? ' connected' : ' disconnected')) ])) : [ E('div', { class: 'nfm-empty' }, R ? 'No connects or disconnects yet.' : 'Loading…') ]));
		}
		function wqVerdict(c) {
			if (!c || typeof c !== 'object') return 'No response from the router. Update the theme on the router to the latest version.';
			const devs = c.devs || [], n = devs.reduce((a, d) => a + (+d[1] || 0), 0), ok = devs.reduce((a, d) => a + (+d[2] || 0), 0);
			if (c.hist === '0') return 'Wi-Fi history recording is off: set WIFI_HIST=1 in the collector settings ("History" tab, at the bottom) and save.';
			if (!c.iwinfo) return 'The router does not report radio data (no ubus iwinfo). Make sure Wi-Fi is on and install the rpcd-mod-iwinfo package.';
			if (!devs.length) return 'No radios found: no Wi-Fi interface is enabled right now. Enable Wi-Fi in "Network → Wireless".';
			if (!n) return 'Wi-Fi is working (' + devs.map(d => d[0]).join(', ') + '), but nobody is connected right now. Connect a phone; the first points will appear in about a minute. Wired devices are not counted here.';
			if (!ok) return 'Wi-Fi clients: ' + n + ', but the signal level could not be parsed. Send this message to the developer: ' + (c.sample || 'sample unavailable');
			if (c.collector === 0 && (c.age < 0 || c.age > 180)) return 'There are Wi-Fi clients (' + n + '), but the collector is not running. Restart it: /etc/init.d/nightfall-collector restart, or reboot the router.';
			if (!c.lines) return 'There are Wi-Fi clients (' + n + '), the signal is readable (' + ok + '), the collector is running' + (c.collector ? '' : ' (data is fresh)') + ', but there are no history records. Wait 1–2 minutes and refresh the page. If that does not help: /etc/init.d/nightfall-collector restart.';
			return 'History records: ' + c.lines + '. Refresh the page.';
		}

		function renderWq() {
			const R = S.wq;
			if (R === undefined) { wqBody.replaceChildren(E('div', { class: 'nfm-empty' }, 'Loading…')); return; }
			const bridgeMacs = new Set(wifiDisplayRows().filter(c => c.proxyStation).map(c => String(c.mac).toLowerCase()));
			const rows = (R && R.rows || []).filter(x => !bridgeMacs.has(String(x[1]).toLowerCase()));
			if (!rows.length) {
				const verdict = E('div', { class: 'nfm-note-s' });
				const btn = E('button', { type: 'button', class: 'nfm-btn', click: () => {
					btn.disabled = true; verdict.textContent = 'Checking…';
					callHistory([ 'wifi-check' ]).then(c => { btn.disabled = false; verdict.textContent = wqVerdict(c); }).catch(() => { btn.disabled = false; verdict.textContent = 'Could not run the check: update the theme on the router to the latest version.'; });
				} }, 'Why is it empty? Check');
				wqBody.replaceChildren(E('div', { class: 'nfm-hint' }, 'No data yet: signal history accumulates once a minute from collector start, for Wi-Fi clients only.' + ((R && R.info && R.info.wifi_hist === '0') ? ' Wi-Fi history recording is off in the settings (WIFI_HIST=0).' : '')),
					E('div', { class: 'nfm-row', style: 'display:flex;margin-top:8px;gap:10px;align-items:center;flex-wrap:wrap' }, [ btn, verdict ]));
				return;
			}
			const by = {};
			for (const x of rows) { const m = String(x[1]).toLowerCase(), v = +x[2]; if (!isFinite(v)) continue; const e = by[m] = by[m] || { v: [], last: 0, lastT: 0 }; e.v.push(v); if (x[0] >= e.lastT) { e.lastT = x[0]; e.last = v; } }
			const leaves = {}, from = rows[0][0];
			for (const e of R.events || []) if (e[2] === 'leave' && e[0] >= from) { const k = String(e[1]).toLowerCase(); leaves[k] = (leaves[k] || 0) + 1; }
			const ORD = { bad: 0, mid: 1, ok: 2 };
			const list = Object.keys(by).map(m => {
				const v = by[m].v, avg = v.reduce((a, b) => a + b, 0) / v.length, weak = 100 * v.filter(x => x <= -75).length / v.length, lv = leaves[m] || 0;
				/* rating: strong signal and no drops = good; weak signal or frequent disconnects = bad */
				const q = (avg <= -75 || weak >= 40 || lv >= 6) ? 'bad' : (avg <= -65 || weak >= 15 || lv >= 3) ? 'mid' : 'ok';
				return { m, avg, weak, lv, last: by[m].last, q, live: R.now - by[m].lastT < 180 };
			}).sort((a, b) => ORD[a.q] - ORD[b.q] || a.avg - b.avg);
			const QL = { ok: 'good', mid: 'fair', bad: 'poor' };
			const nm = m => devName(m);
			wqBody.replaceChildren(
				E('table', { class: 'nfm-table' }, [
					E('thead', {}, E('tr', {}, [ E('th', {}, 'Device'), E('th', { class: 'r' }, 'Now'), E('th', { class: 'r' }, 'Average'), E('th', { class: 'r' }, 'Weak'), E('th', { class: 'r' }, 'Disconnects'), E('th', {}, 'Rating') ])),
					E('tbody', {}, list.map(c => E('tr', { class: 'nfm-click', title: 'Show signal over time', click: () => wifiDialog(c.m, nm(c.m), {}) }, [
						E('td', {}, [ nm(c.m), c.live ? '' : E('span', { class: 'nfm-chip' }, 'offline') ]),
						E('td', { class: 'r' }, c.live ? c.last + ' dBm' : '–'), E('td', { class: 'r' }, nf0.format(c.avg) + ' dBm'),
						E('td', { class: 'r' }, nf0.format(c.weak) + '%'), E('td', { class: 'r' }, String(c.lv)),
						E('td', {}, E('span', { class: 'nfm-wq-b ' + c.q }, QL[c.q])) ]))) ]),
				E('div', { class: 'nfm-note-s', style: 'margin-top:8px' }, 'Weak: share of time with signal at −75 dBm or lower. "Poor": weak average signal or frequent disconnects; moving the device closer or changing the channel usually helps. Click a row to see the chart.'));
		}
		/* ---- device by MAC: name from DHCP, otherwise type and vendor by MAC ---- */
		const devId = (mac, host) => { try { return mac ? DevId.identify(mac, host || '') : null; } catch (e) { return null; } };
		const devIcon = id => { const i = E('i', { class: 'nfm-dv-i' + (id && id.priv ? ' priv' : '') }); i.innerHTML = DevId.icon(id.kind); return i; };
		const devName = mac => {
			const m = String(mac).toUpperCase(), h = hints[m] || hints[String(mac).toLowerCase()] || {}, id = devId(m, h.name);
			return h.name || (id && id.known ? [ id.label || 'Device', id.vendor && id.vendor !== id.label ? id.vendor : '' ].filter(Boolean).join(' ') : '') || (h.ipaddrs || [])[0] || m;
		};

		/* ---- Wi‑Fi signal by hour: heat map per client ---- */
		const whBody = E('div', { class: 'nfm-wh' });
		const whTabs = E('div', { class: 'nfm-tabs' }, [ [ 'd', '24 hours' ], [ 'w', '7 days' ] ].map(([ k, t ]) =>
			E('button', { class: 'nfm-tab' + (k === 'd' ? ' on' : ''), type: 'button', click: ev => { S.whR = k; for (const b of whTabs.children) b.classList.toggle('on', b === ev.currentTarget); renderWHeat(); } }, t)));
		const WHQ = [ [ -60, 'q0', 'excellent (−60 and above)' ], [ -67, 'q1', 'good (−60…−67)' ], [ -75, 'q2', 'weakish (−67…−75)' ], [ -200, 'q3', 'poor (below −75)' ] ];
		const whQ = v => WHQ.find(q => v >= q[0]) || WHQ[3];
		function renderWHeat() {
			const R = S.whr;
			if (R === undefined) { whBody.replaceChildren(E('div', { class: 'nfm-empty' }, 'Loading…')); return; }
			const bridgeMacs = new Set(wifiDisplayRows().filter(c => c.proxyStation).map(c => String(c.mac).toLowerCase()));
			const rows = (R && R.rows || []).filter(x => !bridgeMacs.has(String(x[1]).toLowerCase()));
			if (!rows.length) { whBody.replaceChildren(E('div', { class: 'nfm-hint' }, 'No data yet: the collector records the average signal of each client once an hour (the first points appear an hour after start) and keeps them on storage if it is connected.' + (R === null ? ' Update the theme on the router to the latest version.' : ''))); return; }
			const week = S.whR === 'w', step = week ? 21600 : 3600, n = week ? 28 : 24, end = R.now;
			const by = {};
			for (const [ ts, mac, v, c ] of rows) {
				const i = Math.floor((end - (ts - 1800)) / step);
				if (i < 0 || i >= n || !isFinite(+v)) continue;
				const e = by[mac] || (by[mac] = { m: mac, s: new Array(n).fill(0), c: new Array(n).fill(0), all: 0, k: 0 });
				const w = Math.max(1, +c || 1);
				e.s[n - 1 - i] += v * w; e.c[n - 1 - i] += w; e.all += v * w; e.k += w;
			}
			const list = Object.values(by).map(e => (e.avg = e.all / e.k, e)).sort((a, b) => a.avg - b.avg).slice(0, 14);
			if (!list.length) { whBody.replaceChildren(E('div', { class: 'nfm-hint' }, 'No records for this period.')); return; }
			const g = E('div', { class: 'nfm-wh-g', style: '--n:' + n });
			g.appendChild(E('span'));
			for (let c = 0; c < n; c++) {
				const t0 = new Date((end - (n - c) * step) * 1000);
				g.appendChild(E('span', { class: 'nfm-wh-h' }, week ? (t0.getHours() < 6 ? t0.toLocaleDateString('en-US', { weekday: 'short' }) : '') : (t0.getHours() % 3 === 0 ? String(t0.getHours()) : '')));
			}
			for (const e of list) {
				const id = devId(e.m, (hints[e.m.toUpperCase()] || {}).name);
				g.appendChild(E('span', { class: 'nfm-wh-n', title: 'Show signal over time · ' + e.m.toUpperCase() + (id && id.hint ? '\n' + id.hint : ''), click: () => wifiDialog(e.m, devName(e.m), {}) }, [ id ? devIcon(id) : '', devName(e.m) ]));
				for (let c = 0; c < n; c++) {
					const t0 = new Date((end - (n - c) * step) * 1000), when = t0.toLocaleString('en-US', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) + (week ? '–' + new Date((end - (n - c - 1) * step) * 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '');
					if (!e.c[c]) { g.appendChild(E('span', { class: 'nfm-wh-c', title: when + ' — was offline' })); continue; }
					const v = e.s[c] / e.c[c], q = whQ(v);
					g.appendChild(E('span', { class: 'nfm-wh-c ' + q[1], title: devName(e.m) + ', ' + when + ' — ' + nf0.format(v) + ' dBm' }));
				}
			}
			whBody.replaceChildren(g,
				E('div', { class: 'nfm-wh-leg' }, WHQ.map(q => E('span', {}, [ E('i', { class: 'nfm-wh-c ' + q[1] }), q[2] ])).concat([ E('span', {}, [ E('i', { class: 'nfm-wh-c' }), 'offline' ]) ])),
				E('div', { class: 'nfm-note-s', style: 'margin-top:8px' }, 'Rows are Wi‑Fi clients, weakest at the top. A column is ' + (week ? 'six hours' : 'an hour') + ', the color is the average signal. If a device is consistently red, move it closer or add a repeater; red only at certain hours means interference from neighbors or household appliances. Click a name to see the per-minute chart.'));
		}

		/* ---- Wi‑Fi: channel congestion ---- */
		const airBody = E('div', { class: 'nfm-air' });
		const airBtn = E('button', { type: 'button', class: 'nfm-btn', click: () => scanAir() }, 'Scan the air');
		function scanAir() {
			if (S.airBusy) return;
			S.airBusy = true; renderAir();
			callHistory([ 'airscan' ]).then(r => { S.air = r || false; S.airT = Date.now(); }).catch(() => { S.air = false; }).then(() => { S.airBusy = false; renderAir(); });
		}
		const NODFS5 = [ 36, 40, 44, 48, 149, 153, 157, 161, 165 ];
		function airModel(rd, aps) {
			const own = +rd.ch || 0, g = +rd.ghz || 0, band = g ? (g < 3 ? '2g' : g < 5.9 ? '5g' : '6g') : (own && own <= 14 ? '2g' : '5g');
			const nets = aps.filter(a => a[0] === rd.dev && a[2] !== rd.bssid && a[3] > 0).map(a => ({ ssid: a[1], bssid: a[2], ch: +a[3], sig: +a[4] }));
			const w = s => Math.min(1, Math.max(0.08, (s + 92) / 52));
			const chans = band === '2g' ? Array.from({ length: 13 }, (_, i) => i + 1) : Array.from(new Set(NODFS5.concat(own || [], nets.map(x => x.ch)))).sort((a, b) => a - b);
			const col = chans.map(c => {
				let load = 0, k = 0;
				for (const x of nets) {
					const d = Math.abs(x.ch - c), f = band === '2g' ? (d < 5 ? (5 - d) / 5 : 0) : (d === 0 ? 1 : 0);
					if (f > 0) { load += w(x.sig) * f; if (d === 0) k++; }
				}
				return { ch: c, load, k };
			});
			const pool = col.filter(x => band === '2g' ? [ 1, 6, 11 ].includes(x.ch) : NODFS5.includes(x.ch));
			const best = pool.reduce((m, x) => !m || x.load < m.load - 0.05 || (Math.abs(x.load - m.load) <= 0.05 && x.ch === own) ? x : m, null);
			return { band, own, nets, col, best, cur: col.find(x => x.ch === own) || null, ht: rd.ht || '', auto: rd.cfg === 'auto' };
		}
		const airLv = l => l < 0.5 ? 0 : l < 1.5 ? 1 : l < 3 ? 2 : 3;
		function renderAir() {
			airBtn.disabled = !!S.airBusy;
			airBtn.textContent = S.airBusy ? 'Scanning…' : S.air ? 'Scan again' : 'Scan the air';
			if (S.airBusy) { airBody.replaceChildren(E('div', { class: 'nfm-empty' }, 'Scanning the air… this takes 5–15 seconds.')); return; }
			if (S.air === undefined) { airBody.replaceChildren(E('div', { class: 'nfm-hint' }, 'Shows which neighboring networks interfere with your Wi‑Fi and which channel is freer. Scanning distracts the radio for a few seconds, so it runs only on a button press: better not during a video call.'), E('div', { style: 'margin-top:8px' }, airBtn)); return; }
			const R = S.air;
			if (!R || !(R.radios || []).length) { airBody.replaceChildren(E('div', { class: 'nfm-hint' }, R === false ? 'Could not run the scan: update the theme on the router to the latest version.' : 'No radios found: enable Wi‑Fi in "Network → Wireless".'), E('div', { style: 'margin-top:8px' }, airBtn)); return; }
			const secs = R.radios.map(rd => {
				const m = airModel(rd, R.aps || []);
				const mx = Math.max(3, ...m.col.map(x => x.load));
				const bars = E('div', { class: 'nfm-air-bars' }, m.col.map(x => E('div', { class: 'nfm-air-b l' + airLv(x.load) + (x.ch === m.own ? ' own' : ''), title: 'Channel ' + x.ch + ': networks on it ' + x.k + ', load ' + nf1.format(x.load) + (x.ch === m.own ? ' (yours)' : '') }, E('i', { style: '--h:' + Math.max(3, Math.round(100 * Math.min(x.load, mx) / mx)) + '%' }))));
				const xs = E('div', { class: 'nfm-air-x' }, m.col.map(x => E('span', { class: (x.ch === m.own ? 'own' : '') + (m.best && x.ch === m.best.ch && x.ch !== m.own ? ' best' : '') }, String(x.ch))));
				let verdict;
				if (!m.own) verdict = 'Could not determine the router channel.';
				else if (!m.best) verdict = 'Not enough data for a recommendation.';
				else if (m.best.ch === m.own || !m.cur || m.cur.load - m.best.load < 0.4) verdict = [ 'Your channel ', E('b', {}, String(m.own)), m.cur && m.cur.load < 0.5 ? ' is free: nothing needs to change.' : ' is no busier than the others: no point in changing the channel.' ];
				else verdict = [ 'Channel ', E('b', {}, String(m.own)), ' is congested (networks on it: ' + m.cur.k + ', load ' + nf1.format(m.cur.load) + '). Channel ', E('b', {}, String(m.best.ch)), ' is freer (load ' + nf1.format(m.best.load) + '). To change: "Network → Wireless → Edit → Channel".' + (m.auto ? ' It is currently set to "auto": the router picks on its own, but not always well.' : '') ];
				const top = m.nets.slice().sort((a, b) => b.sig - a.sig).slice(0, 8);
				return E('div', { class: 'nfm-air-r' }, [
					E('h4', {}, [ BANDS[m.band] || m.band, E('small', {}, rd.dev + (rd.ssid ? ' · ' + rd.ssid : '') + (m.own ? ' · channel ' + m.own : '') + (m.ht ? ' · ' + m.ht : '')) ]),
					bars, xs, E('div', { class: 'nfm-air-v' }, verdict),
					top.length ? E('table', { class: 'nfm-table' }, [ E('thead', {}, E('tr', {}, [ E('th', {}, 'Neighboring network'), E('th', { class: 'r' }, 'Channel'), E('th', { class: 'r' }, 'Signal') ])),
						E('tbody', {}, top.map(x => E('tr', {}, [ E('td', {}, x.ssid || E('i', {}, 'hidden network')), E('td', { class: 'r' }, String(x.ch)), E('td', { class: 'r' }, x.sig + ' dBm') ]))) ]) : E('div', { class: 'nfm-note-s' }, 'No neighboring networks found.') ]);
			});
			airBody.replaceChildren(...secs, E('div', { class: 'nfm-note-s' }, 'Load is estimated from the number of neighboring networks and their strength; on 2.4 GHz overlapping adjacent channels are taken into account, so only 1, 6 and 11 are recommended. On 5 GHz only channels without radar mode (DFS) are recommended. Measured at ' + new Date(S.airT).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) + '. ' + 'Channels above 6 GHz and 80/160 MHz channel widths are simplified in the calculation.'), E('div', { style: 'margin-top:8px' }, airBtn));
		}
		const heatBody = E('div', { class: 'nfm-heat' });
		const heatTabs = E('div', { class: 'nfm-tabs' }, Object.keys(HEAT).map(k =>
			E('button', { class: 'nfm-tab' + (k === 'cpu' ? ' on' : ''), type: 'button', 'data-k': k, click: ev => { S.heat = k; for (const b of heatTabs.children) b.classList.toggle('on', b === ev.currentTarget); renderHeat(); } }, HEAT[k][0])));
		function renderHeat() {
			const D = S.day, key = S.heat || 'cpu', H = HEAT[key];
			if (!D || !D.h || !D.h.info || !D.h.info.started) { heatBody.replaceChildren(E('div', { class: 'nfm-empty' }, D ? 'No data' : 'Loading…')); return; }
			const sum = [], cnt = [];
			for (let i = 0; i < 168; i++) { sum[i] = 0; cnt[i] = 0; }
			const now = new Date();
			/* detailed data is kept for 7 days; anything older comes from the long history (30-minute step) if it has accumulated */
			const fine = D.h.rows || [], t0 = fine.length ? fine[0][0] : Infinity;
			const old = ((S.lg && S.lg.rows) || []).filter(r => r[0] < t0);
			const all = old.concat(fine), span = all.length ? Math.max(1, Math.round((D.h.now - all[0][0]) / 86400)) : 0;
			for (const r of all) {
				const v = H[1](r); if (v == null || v < 0) continue;
				const d = new Date(r[0] * 1000), i = ((d.getDay() + 6) % 7) * 24 + d.getHours();
				sum[i] += v; cnt[i]++;
			}
			const avg = sum.map((x, i) => cnt[i] ? x / cnt[i] : null);
			const mx = Math.max(0, ...avg.filter(v => v != null)) || 1;
			const days = [ 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun' ];
			const grid = E('div', { class: 'nfm-heat-grid' });
			grid.appendChild(E('span'));
			for (let h = 0; h < 24; h++) grid.appendChild(E('span', { class: 'nfm-heat-h' }, h % 3 === 0 ? String(h) : ''));
			for (let d = 0; d < 7; d++) {
				grid.appendChild(E('span', { class: 'nfm-heat-d' + (d === (now.getDay() + 6) % 7 ? ' today' : '') }, days[d]));
				for (let h = 0; h < 24; h++) {
					const v = avg[d * 24 + h];
					grid.appendChild(E('span', { class: 'nfm-heat-c', style: v == null ? '' : `--hv:${Math.round(100 * v / mx)}%`, title: days[d] + ', ' + h + ':00 — ' + (v == null ? 'no data' : H[2](v)) }));
				}
			}
			heatBody.replaceChildren(grid, E('div', { class: 'nfm-note-s', style: 'margin-top:8px' }, 'Hourly average over ' + (span > 7 ? 'the last ' + span + ' days' : 'the last 7 days') + '. Darker means less, brighter means more (maximum ' + H[2](mx) + ').' + (avg.some(v => v == null) ? ' Empty cells are times with no history yet: detailed data is kept for 7 days, and the long history (up to ' + ((D.h.info && D.h.info.hist_days) || 30) + ' days) accumulates since the update to v1.14.0 and will fill the map over time.' : '')));
		}
		/* ---- Weekly summary: peak hours, the "heaviest" device, average ping ---- */
		const wkBody = E('div', { class: 'nfm-wk' });
		function renderWeek() {
			const D = S.day;
			if (!D || !D.h || !D.h.info || !D.h.info.started) { wkBody.replaceChildren(E('div', { class: 'nfm-empty' }, D ? 'No data' : 'Loading…')); return; }
			const hs = new Array(24).fill(0), hc = new Array(24).fill(0), byDay = {};
			let ps = 0, pc = 0;
			for (const r of D.h.rows || []) {
				const d = new Date(r[0] * 1000), h = d.getHours();
				if (r[4] >= 0 && r[5] >= 0) { hs[h] += trafficBytes(r[4]) + trafficBytes(r[5]); hc[h]++; }
				if (r[7] >= 0) { const ping = trafficBytes(r[7]); ps += ping; pc++; const k = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(), t = byDay[k] || (byDay[k] = [ 0, 0 ]); t[0] += ping; t[1]++; }
			}
			const av = hs.map((x, i) => hc[i] ? x / hc[i] : 0);
			let bi = -1, bv = 0;
			for (let i = 0; i < 24; i++) { const v = av[i] + av[(i + 1) % 24] + av[(i + 2) % 24]; if (v > bv) { bv = v; bi = i; } }
			const hh = h => String(h % 24).padStart(2, '0') + ':00';
			const peak = bi < 0 ? [ '—', 'no traffic data' ] : [ hh(bi) + '–' + hh(bi + 3), 'average ' + (bv / 3 * 8 / 1e6).toFixed(1) + ' Mbit/s' ];
			/* heaviest device */
			let heavy = [ '—', 'per-app accounting is off or there is no data yet' ];
			const A = S.wkA;
			if (A && ((A.hist || []).length || (A.day || []).length)) {
				const t = String(A.today || ''), base = /^\d{8}$/.test(t) ? new Date(+t.slice(0, 4), +t.slice(4, 6) - 1, +t.slice(6, 8)) : new Date();
				base.setDate(base.getDate() - 6);
				const from = base.getFullYear() * 10000 + (base.getMonth() + 1) * 100 + base.getDate();
				const top = sumMonitorAppDeviceTraffic(A, from, hints, S.devs && S.devs.neigh, S.wifi, routerIps, S.devs && S.devs.leases).filter(row => row.key !== 'router');
				if (top.length) {
					const name = row => row.mac ? ((hints[row.mac] || hints[row.mac.toLowerCase()] || {}).name || row.ip) : names[row.ip] || row.ip;
					heavy = [ name(top[0]), fmtBytes(top[0].total) + ' this week' + (top[1] ? ' · next ' + fmtBytes(top[1].total) : '') ];
				}
			}
			/* ping */
			let ping = [ '—', 'no latency data' ];
			if (pc) {
				const dk = Object.keys(byDay).sort(), worst = dk.reduce((w, k) => (!w || byDay[k][0] / byDay[k][1] > byDay[w][0] / byDay[w][1]) ? k : w, null);
				ping = [ Math.round(ps / pc) + ' ms', worst && dk.length > 1 ? 'worst on ' + worst.slice(4, 6) + '/' + worst.slice(6, 8) + ' · ' + Math.round(byDay[worst][0] / byDay[worst][1]) + ' ms' : 'to the internet' ];
			}
			const tile = (ic, t, v, sub) => E('div', { class: 'nfm-wk-t' }, [ E('span', { class: 'nfm-wk-l' }, t), E('b', {}, v), E('span', { class: 'nfm-note-s' }, sub) ]);
			wkBody.replaceChildren(tile('', 'Traffic peak', peak[0], peak[1]), tile('', 'The "heaviest" device', heavy[0], heavy[1]), tile('', 'Average ping', ping[0], ping[1]));
		}
		/* ---- Traffic by month: calendar of daily totals (WAN counters, or the sum over devices if they are understated) ---- */
		const monBody = E('div', { class: 'nfm-mon' });
		const lim = () => { try { return Math.max(0, parseFloat(localStorage.getItem('nfm-limit-gb')) || 0); } catch (e) { return 0; } };
		function renderMon() {
			const T = S.tr; if (!T) { monBody.replaceChildren(E('div', { class: 'nfm-empty' }, 'Loading…')); return; }
			const now = new Date(); if (!S.mon) S.mon = { y: now.getFullYear(), m: now.getMonth() };
			const { y, m } = S.mon, dim = new Date(y, m + 1, 0).getDate(), first = (new Date(y, m, 1).getDay() + 6) % 7;
			const pre = String(y) + String(m + 1).padStart(2, '0'), by = {};
			let rx = 0, tx = 0, mx = 1, days = 0, viaDev = 0;
			for (const r of T.rows || []) if (r[0].indexOf(pre) === 0) { const d = +r[0].slice(6, 8), down = trafficBytes(r[1]), up = trafficBytes(r[2]); by[d] = [ r[0], down, up, r[3] ]; rx += down; tx += up; mx = Math.max(mx, down + up); days++; if (r[3] === 1) viaDev++; }
			const cur = y === now.getFullYear() && m === now.getMonth(), elapsed = cur ? now.getDate() : dim, total = rx + tx;
			const avg = days ? total / Math.max(1, Math.min(days, elapsed)) : 0, fc = cur ? total + avg * (dim - elapsed) : total;
			const step = k => { const d = new Date(y, m + k, 1); S.mon = { y: d.getFullYear(), m: d.getMonth() }; renderMon(); };
			const title = new Date(y, m, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
			const L = lim() * 1073741824;
			const limIn = E('input', { type: 'number', min: '0', step: '10', value: lim() || '', placeholder: 'GB', class: 'nfm-mon-lim', 'aria-label': 'Monthly limit, GB',
				change: ev => { try { localStorage.setItem('nfm-limit-gb', String(Math.max(0, +ev.target.value || 0))); } catch (e) {} renderMon(); } });
			const grid = E('div', { class: 'nfm-mon-grid' });
			[ 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun' ].forEach(d => grid.appendChild(E('span', { class: 'nfm-mon-w' }, d)));
			for (let i = 0; i < first; i++) grid.appendChild(E('span'));
			for (let d = 1; d <= dim; d++) {
				const r = by[d], v = r ? trafficBytes(r[1]) + trafficBytes(r[2]) : 0;
				grid.appendChild(E('span', Object.assign({ class: 'nfm-mon-d' + (cur && d === now.getDate() ? ' today' : '') + (r ? ' has' : ''), style: r ? `--hv:${Math.max(8, Math.round(100 * v / mx))}%` : '',
					title: r ? `${d}: ↓ ${fmtBytes(r[1])}, ↑ ${fmtBytes(r[2])}${r[3] === 1 ? ' (from device data)' : ''}. Click to see who downloaded how much` : `${d}: no data` },
					r ? { role: 'button', tabindex: '0', click: () => dayReport(r[0]), keydown: ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); dayReport(r[0]); } } } : {}), [ E('b', {}, String(d)), E('i', {}, r ? fmtBytes(v) : '') ]));
			}
			const kids = [
				E('div', { class: 'nfm-mon-h' }, [
					E('button', { type: 'button', class: 'nfm-tab', 'aria-label': 'Previous month', click: () => step(-1) }, '‹'),
					E('b', { class: 'nfm-mon-t' }, title),
					E('button', { type: 'button', class: 'nfm-tab', 'aria-label': 'Next month', click: () => step(1) }, '›'),
					E('span', { class: 'nfm-spacer' }), E('label', { class: 'nfm-note-s' }, [ 'Limit, GB ', limIn ]) ]),
				E('div', { class: 'nfm-mon-sum' }, [
					E('div', {}, [ E('span', {}, 'Total'), E('b', {}, fmtBytes(total)) ]),
					E('div', {}, [ E('span', {}, '↓ received'), E('b', {}, fmtBytes(rx)) ]),
					E('div', {}, [ E('span', {}, '↑ sent'), E('b', {}, fmtBytes(tx)) ]),
					E('div', {}, [ E('span', {}, 'Per day'), E('b', {}, days ? fmtBytes(avg) : '—') ]),
					cur ? E('div', {}, [ E('span', {}, 'Month forecast'), E('b', {}, days ? '≈ ' + fmtBytes(fc) : '—') ]) : '' ]) ];
			if (L > 0) {
				const pc = Math.min(100, 100 * total / L), pf = 100 * fc / L;
				kids.push(E('div', { class: 'nfm-mon-bar', 'data-lvl': pc >= 100 ? 'bad' : pc >= 80 ? 'mid' : 'ok' }, [ E('i', { style: `width:${pc}%` }) ]),
					E('div', { class: 'nfm-note-s' }, `${Math.round(pc)}% of the limit used` + (cur && days ? `; forecast for the end of the month ≈ ${Math.round(pf)}%` + (pf > 100 ? ': the limit will be exceeded' : '') : '')));
			}
			kids.push(grid);
			if (viaDev) kids.push(E('div', { class: 'nfm-note-s', style: 'margin-top:8px' }, 'On ' + viaDev + ' ' + (viaDev === 1 ? 'day' : 'days') + ' the WAN port counters showed noticeably less than passed through devices (hardware packet offloading hides traffic from the port), so the total is taken from device data, without the router\'s own traffic. It matches the daily report (click a day).'));
			if (!T.persist) kids.push(E('div', { class: 'nfm-note-s', style: 'margin-top:8px' }, 'Totals are kept in memory and will be reset when the router reboots. To accumulate months, set a folder on a USB stick in the collector settings (PERSIST_DIR).'));
			monBody.replaceChildren(...kids);
		}
		/* ---- daily report: who downloaded and uploaded how much (on clicking a day in the calendar) ---- */
		function dayReport(ymd) {
			const dt = new Date(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8));
			const title = 'Traffic for ' + dt.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
			const body = E('div', { class: 'nfm nfm-dr' }, E('div', { class: 'nfm-empty' }, 'Building the report…'));
			ui.showModal(title, [ body, E('div', { class: 'button-row' }, [ E('button', { class: 'btn', click: ui.hideModal }, 'Close') ]) ]);
			const J = a => callHistory(a).catch(() => null);
			Promise.all([ J([ 'devdaily' ]), J([ 'devices' ]), J([ 'devhr' ]) ]).then(([ dd, dv, hr ]) => {
				const norm = normalizeMonitorIp, ipMac = monitorBuildIpMacMap(hints, dv && dv.neigh, S.wifi, dv && dv.leases);
				routerIps.learn(dv && dv.info);
				const ymdOf = d => d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
				const nowD = new Date(), today = ymdOf(nowD), yest = ymdOf(new Date(nowD.getTime() - 86400000));
				let src = [], how = '';
				const arch = ((dd && dd.rows) || []).filter(r => r[0] === ymd);
				if (arch.length) { src = arch.map(r => [ r[1], r[2], r[3], r[4] !== '-' ? r[4].toUpperCase() : '' ]); how = 'Daily totals saved by the collector.'; }
				else if (ymd === today && dv && dv.day && dv.day.length) { src = dv.day.map(r => [ r[0], r[1], r[2], '' ]); how = 'Today is not over yet: the numbers are still growing.'; }
				else if (ymd === yest && dv && dv.yday && dv.yday.length) { src = dv.yday.map(r => [ r[0], r[1], r[2], '' ]); how = 'Daily totals from collector data.'; }
				else {
					const by = {};
					for (const r of (hr && hr.rows) || []) if (ymdOf(new Date(r[0] * 1000)) === ymd) { const e = by[r[1]] || (by[r[1]] = [ r[1], 0, 0, '' ]); e[1] += trafficBytes(r[2]); e[2] += trafficBytes(r[3]); }
					src = Object.values(by);
					if (src.length) how = 'Built from hourly totals: accurate to the hour.';
				}
				const acc = {};
				for (const [ ip, rx, tx, mac0 ] of src) {
					const rowMac = String(mac0 || '').toUpperCase(), mac = rowMac && rowMac !== '-' ? rowMac : ipMac[norm(ip)] || '', k = routerIps.has(ip) ? 'router' : mac || (String(ip).indexOf(':') >= 0 ? 'v6' : ip);
					const e = acc[k] || (acc[k] = { k, mac, ip, rx: 0, tx: 0 });
					e.rx += trafficBytes(rx); e.tx += trafficBytes(tx);
				}
				const list = Object.values(acc).sort((a, b) => (b.rx + b.tx) - (a.rx + a.tx));
				const wan = ((S.tr && S.tr.rows) || []).find(r => r[0] === ymd);
				const sumRx = list.reduce((a, e) => a + e.rx, 0), sumTx = list.reduce((a, e) => a + e.tx, 0), mx = Math.max(1, ...list.map(e => e.rx + e.tx));
				const kids = [];
				if (wan) kids.push(E('div', { class: 'nfm-mon-sum' }, [
					E('div', {}, [ E('span', {}, wan[3] === 1 ? 'Total (by devices)' : 'Total via WAN'), E('b', {}, fmtBytes(trafficBytes(wan[1]) + trafficBytes(wan[2]))) ]),
					E('div', {}, [ E('span', {}, '↓ received'), E('b', {}, fmtBytes(trafficBytes(wan[1]))) ]),
					E('div', {}, [ E('span', {}, '↑ sent'), E('b', {}, fmtBytes(trafficBytes(wan[2]))) ]) ]));
				if (!list.length) kids.push(E('div', { class: 'nfm-hint' }, 'No per-device data for this day. Detailed per-device totals are kept since version 1.15 (days that ended after the update go to the archive), and hourly data covers about two weeks. To keep them across reboots, connect storage (History → "Storage").'));
				else {
					kids.push(E('table', { class: 'nfm-table' }, [
						E('thead', {}, E('tr', {}, [ E('th', {}, 'Device'), E('th', { class: 'r' }, '↓ downloaded'), E('th', { class: 'r' }, '↑ uploaded'), E('th', { class: 'r' }, 'Total') ])),
						E('tbody', {}, list.slice(0, 40).map(e => {
							const h = e.mac ? (hints[e.mac] || {}) : {}, id = e.mac ? devId(e.mac, h.name) : null;
							const label = e.k === 'router' ? 'The router itself (VPN, DNS, updates)' : e.k === 'v6' ? 'Other IPv6 addresses' : (h.name || (id && id.known ? [ id.label || 'Device', id.vendor && id.vendor !== id.label ? id.vendor : '' ].filter(Boolean).join(' ') : '') || e.ip);
							return E('tr', {}, [
								E('td', {}, [ id ? devIcon(id) : '', label, e.k !== 'router' && e.k !== 'v6' && label !== e.ip ? E('span', { class: 'nfm-chip' }, e.ip) : '',
									E('div', { class: 'nfm-mon-bar', 'data-lvl': 'ok', style: 'margin-top:4px;height:4px' }, E('i', { style: 'width:' + Math.max(2, Math.round(100 * (e.rx + e.tx) / mx)) + '%' })) ]),
								E('td', { class: 'r' }, fmtBytes(e.rx)), E('td', { class: 'r' }, fmtBytes(e.tx)), E('td', { class: 'r' }, E('b', {}, fmtBytes(e.rx + e.tx))) ]);
						})) ]));
					if (list.length > 40) kids.push(E('div', { class: 'nfm-note-s' }, 'Showing the 40 most active of ' + list.length + '.'));
					if (list.some(e => e.k === 'router')) kids.push(E('div', { class: 'nfm-note-s', style: 'margin-top:8px' }, 'The "The router itself" row (your router address at the ISP) is the router\'s own traffic: a proxy or VPN on it, updates, DNS. Device traffic through such a proxy is counted twice: for the device and for the router. That is why this row is not included in "Total" or in the calendar.'));
					if (wan && (trafficBytes(wan[1]) + trafficBytes(wan[2])) > (sumRx + sumTx) * 1.15) kids.push(E('div', { class: 'nfm-note-s', style: 'margin-top:8px' }, 'The device sum (' + fmtBytes(sumRx + sumTx) + ') is less than the WAN counter: part of the traffic is not attributed to devices (hardware packet offloading, service traffic, devices outside the first hundred records).'));
				}
				if (how) kids.push(E('div', { class: 'nfm-note-s', style: 'margin-top:8px' }, how));
				body.replaceChildren(...kids);
			});
		}
		/* ---- Period comparison: weeks and months by daily WAN totals ---- */
		const cmpBody = E('div', { class: 'nfm-cmp' });
		const CMP = { w: 'Week vs previous', m: 'Month vs previous' };
		const cmpTabs = E('div', { class: 'nfm-tabs' }, Object.keys(CMP).map(k =>
			E('button', { class: 'nfm-tab' + (k === 'w' ? ' on' : ''), type: 'button', click: ev => { S.cmp = k; for (const b of cmpTabs.children) b.classList.toggle('on', b === ev.currentTarget); renderCmp(); } }, CMP[k])));
		function renderCmp() {
			const T = S.tr; if (!T) { cmpBody.replaceChildren(E('div', { class: 'nfm-empty' }, 'Loading…')); return; }
			const mode = S.cmp || 'w', by = {};
			for (const r of T.rows || []) by[r[0]] = r;
			const key = d => String(d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate());
			const shift = (d, k) => { const x = new Date(d); x.setDate(x.getDate() + k); return x; };
			const ddmm = d => String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0');
			const now = new Date(); now.setHours(12, 0, 0, 0);
			let cur = [], prev = [], hc, hp;
			if (mode === 'w') {
				for (let i = 6; i >= 0; i--) { cur.push(shift(now, -i)); prev.push(shift(now, -i - 7)); }
				hc = [ 'Last 7 days', ddmm(cur[0]) + '–' + ddmm(cur[6]) ]; hp = [ 'Previous 7 days', ddmm(prev[0]) + '–' + ddmm(prev[6]) ];
			} else {
				const y = now.getFullYear(), m = now.getMonth(), n = now.getDate(), pm = new Date(y, m - 1, 1, 12), pdim = new Date(y, m, 0).getDate();
				for (let d = 1; d <= n; d++) cur.push(new Date(y, m, d, 12));
				for (let d = 1; d <= Math.min(n, pdim); d++) prev.push(new Date(pm.getFullYear(), pm.getMonth(), d, 12));
				const mn = d => d.toLocaleDateString('en-US', { month: 'long' }), cap = x => x.charAt(0).toUpperCase() + x.slice(1);
				hc = [ cap(mn(cur[0])), 'days 1–' + n ]; hp = [ cap(mn(pm)), 'days 1–' + Math.min(n, pdim) ];
			}
			const agg = list => {
				let rx = 0, tx = 0, n = 0, mx = null;
				for (const d of list) { const r = by[key(d)]; if (!r) continue; n++; rx += r[1]; tx += r[2]; if (!mx || r[1] + r[2] > mx[1]) mx = [ d, r[1] + r[2] ]; }
				return { rx, tx, n, tot: rx + tx, avg: n ? (rx + tx) / n : 0, mx };
			};
			const a = agg(cur), b = agg(prev);
			const chg = (x, y) => {
				if (!b.n || !y) return [ '—', 'eq' ];
				const p = (x - y) / y * 100;
				if (Math.abs(p) < 1) return [ '≈ 0%', 'eq' ];
				return [ (p > 0 ? '↑ +' : '↓ −') + Math.round(Math.abs(p)) + '%', p > 0 ? 'up' : 'dn' ];
			};
			const rows = [ [ 'Total', a.tot, b.tot ], [ 'Received', a.rx, b.rx ], [ 'Sent', a.tx, b.tx ], [ 'Daily average', a.avg, b.avg ] ];
			const cells = [ E('div', { class: 'h' }, ''), E('div', { class: 'h n' }, [ hc[0], E('small', {}, hc[1]) ]), E('div', { class: 'h n' }, [ hp[0], E('small', {}, hp[1]) ]), E('div', { class: 'h n' }, 'Difference') ];
			for (const [ t, x, y ] of rows) {
				const c = chg(x, y);
				cells.push(E('div', {}, t), E('div', { class: 'n' }, a.n ? fmtBytes(x) : '—'), E('div', { class: 'n' }, b.n ? fmtBytes(y) : '—'), E('div', { class: 'n ' + c[1] }, c[0]));
			}
			/* connection quality from the long history (30-minute step): ping, loss, speed peaks, load */
			const L = S.lg && S.lg.rows || [];
			if (L.length) {
				const ck = new Set(cur.map(key)), pk = new Set(prev.map(key));
				const q = set => {
					const o = { n: 0, ping: [], loss: [], cpu: [], temp: [], pk: 0 };
					for (const r of L) {
						if (!set.has(key(new Date(r[0] * 1000)))) continue;
						o.n++;
						if (r[7] >= 0) o.ping.push(r[7]); if (r[8] >= 0) o.loss.push(r[8]); if (r[1] >= 0) o.cpu.push(r[1]); if (r[3] >= 0) o.temp.push(r[3]);
						if (r[10] > o.pk) o.pk = r[10];
					}
					return o;
				};
				const avg = l => l.length ? l.reduce((x, y) => x + y, 0) / l.length : null;
				const qa = q(ck), qb = q(pk);
				const line = (t, x, y, f) => {
					const c = x != null && y != null && y > 0 ? chg(x, y) : [ '—', 'eq' ];
					cells.push(E('div', {}, t), E('div', { class: 'n' }, x != null ? f(x) : '—'), E('div', { class: 'n' }, y != null ? f(y) : '—'), E('div', { class: 'n ' + c[1] }, c[0]));
				};
				cells.push(E('div', { class: 'sec' }, 'Connection quality'), E('div', { class: 'sec' }), E('div', { class: 'sec' }), E('div', { class: 'sec' }));
				line('Average ping', avg(qa.ping), avg(qb.ping), v => nf0.format(v) + ' ms');
				line('Packet loss', avg(qa.loss), avg(qb.loss), v => nf1.format(v) + '%');
				line('Download peak', qa.pk || null, qb.pk || null, v => rateText(v));
				line('Average CPU', avg(qa.cpu), avg(qb.cpu), v => nf0.format(v) + '%');
				line('Average temperature', avg(qa.temp), avg(qb.temp), v => nf1.format(v) + ' °C');
			}
			const hv = o => o.mx ? ddmm(o.mx[0]) + ' · ' + fmtBytes(o.mx[1]) : '—';
			cells.splice(cells.findIndex(c => c.classList && c.classList.contains('sec')) < 0 ? cells.length : cells.findIndex(c => c.classList && c.classList.contains('sec')), 0, E('div', {}, 'Heaviest day'), E('div', { class: 'n' }, hv(a)), E('div', { class: 'n' }, hv(b)), E('div', { class: 'n eq' }, ''));
			const note = !a.n ? 'No daily totals for this period yet.' : !b.n ? 'No data for the previous period: the collector keeps daily totals since installation, the comparison will appear later.'
				: (a.n < cur.length || b.n < prev.length) ? 'Days with data: ' + a.n + ' of ' + cur.length + ' and ' + b.n + ' of ' + prev.length + '. Totals are calculated only from them.' : 'Traffic via WAN: received from and sent to the ISP. ↑ more than before, ↓ less.';
			cmpBody.replaceChildren(E('div', { class: 'nfm-cmp-t' }, cells), E('div', { class: 'nfm-note-s', style: 'margin-top:8px' }, note));
		}

		/* ---- Data export to CSV (separator ";", UTF-8 with BOM: opens in Excel) ---- */
		const expNote = E('span', { class: 'nfm-note-s' });
		function csvText(rows) {
			return '﻿' + rows.map(r => r.map(v => { v = v == null ? '' : String(v); return /[;"\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(';')).join('\r\n') + '\r\n';
		}
		function saveCsv(name, rows) {
			const url = URL.createObjectURL(new Blob([ csvText(rows) ], { type: 'text/csv;charset=utf-8' }));
			const a = E('a', { href: url, download: name, style: 'display:none' });
			document.body.appendChild(a); a.click();
			setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
		}
		const isoD = s => /^\d{8}$/.test(String(s)) ? String(s).slice(0, 4) + '-' + String(s).slice(4, 6) + '-' + String(s).slice(6, 8) : String(s);
		const isoT = ts => { const d = new Date(ts * 1000), z = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + ' ' + z(d.getHours()) + ':' + z(d.getMinutes()) + ':' + z(d.getSeconds()); };
		const nonneg = v => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : ''; };
		const stamp = () => isoD(new Date().getFullYear() * 10000 + (new Date().getMonth() + 1) * 100 + new Date().getDate());
		const EXPORTS = [
			[ 'Traffic by day', () => {
				const r = S.tr && S.tr.rows; if (!r || !r.length) return null;
				return [ 'nightfall-traffic-' + stamp() + '.csv', [ [ 'Date', 'Received, bytes', 'Sent, bytes', 'Total, bytes' ] ].concat(r.map(x => { const d = trafficBytes(x[1]), u = trafficBytes(x[2]); return [ isoD(x[0]), d, u, d + u ]; })) ];
			} ],
			[ 'Apps', () => {
				const A = S.wkA; if (!A || !((A.hist || []).length || (A.day || []).length)) return null;
				const nm = {}, map = monitorBuildIpMacMap(hints, S.devs && S.devs.neigh, S.wifi, S.devs && S.devs.leases);
				for (const ip in map) { const h = hints[map[ip]] || hints[map[ip].toLowerCase()] || {}; if (h.name) nm[ip] = h.name; }
				const t = /^\d{8}$/.test(String(A.today || '')) ? isoD(A.today) : stamp();
				const out = [ [ 'Date', 'Device (IP)', 'Name', 'App', 'Received, bytes', 'Sent, bytes', 'Route' ] ];
				for (const [ dt, ip, app, route, d, u ] of A.hist || []) out.push([ isoD(dt), ip, nm[ip] || '', app, trafficBytes(d), trafficBytes(u), route ]);
				for (const [ ip, app, route, d, u ] of A.day || []) out.push([ t, ip, nm[ip] || '', app, trafficBytes(d), trafficBytes(u), route ]);
				return [ 'nightfall-apps-' + stamp() + '.csv', out ];
			} ],
			[ 'Charts (selected period)', () => {
				const r = S.hist && S.hist.rows; if (!r || !r.length) return null;
				return [ 'nightfall-metrics-' + stamp() + '.csv', [ [ 'Time', 'CPU, %', 'Memory, %', 'Temperature, °C', 'Download, bytes/s', 'Upload, bytes/s', 'Gateway ping, ms', 'Internet ping, ms' ] ]
					.concat(r.map(x => [ isoT(x[0]), nonneg(x[1]), nonneg(x[2]), nonneg(x[3]), nonneg(x[4]), nonneg(x[5]), nonneg(x[6]), nonneg(x[7]) ])) ];
			} ],
			[ 'Outage and reboot log', () => {
				const r = S.jrn && S.jrn.rows; if (!r || !r.length) return null;
				return [ 'nightfall-journal-' + stamp() + '.csv', [ [ 'Time', 'Event', 'Duration, s' ] ].concat(r.slice().sort((a, b) => a[0] - b[0]).map(x => [ isoT(x[0]), x[1] === 'outage' ? 'internet outage' : x[1] === 'boot' ? 'reboot' : x[1], x[2] == null ? '' : x[2] ])) ];
			} ]
		];
		const expBtns = EXPORTS.map(([ label, make ]) => E('button', { type: 'button', class: 'nfm-btn', click: () => {
			let r = null; try { r = make(); } catch (e) { r = null; }
			if (!r) { expNote.textContent = '"' + label + '": no data yet.'; return; }
			saveCsv(r[0], r[1]); expNote.textContent = 'Saved file ' + r[0] + ' (records: ' + (r[1].length - 1) + ').';
		} }, '⬇ ' + label));

		const hist = E('div', { class: 'nfm-history', hidden: true }, [
			histNote,
			E('div', { class: 'nfm-grid' }, [ card([ 'Daily summary', E('span', { class: 'nfm-spacer' }), E('span', { class: 'nfm-note-s' }, 'since 00:00 from collector data') ], dayBody) ]),
			E('div', { class: 'nfm-grid' }, [ card([ 'Weekly summary', E('span', { class: 'nfm-spacer' }), E('span', { class: 'nfm-note-s' }, 'last 7 days') ], wkBody) ]),
			E('div', { class: 'nfm-grid' }, [ card('Traffic by month', monBody) ]),
			E('div', { class: 'nfm-grid' }, [ card([ 'Period comparison', E('span', { class: 'nfm-spacer' }), cmpTabs ], cmpBody) ]),
			E('div', { class: 'nfm-grid' }, [ card([ 'Hourly heat map', E('span', { class: 'nfm-spacer' }), heatTabs ], heatBody) ]),
			E('div', { class: 'nfm-grid' }, [
				card([ 'CPU, memory, temperature', E('span', { class: 'nfm-spacer' }),
					E('span', { class: 'nfm-legend' }, [ legendDot('c-cpu', 'CPU'), legendDot('c-mem', 'Memory'), legendDot('c-temp', 'Temperature, °C'), legendDot('c-base', 'usual') ]), rangeTabs ], histMain.el)
			]),
			E('div', { class: 'nfm-grid nfm-g21' }, [
				card([ 'Internet: latency', E('span', { class: 'nfm-spacer' }),
					E('span', { class: 'nfm-legend' }, [ legendDot('c-up', 'to gateway'), legendDot('c-down', 'to internet') ]) ], histPing.el),
				card('Connection quality', E('div', {}, [ pingTiles, E('div', { class: 'nfm-note-s', style: 'margin-top:10px' }, 'Gaps in the chart are moments with no reply.') ]))
			]),
			E('div', { class: 'nfm-grid' }, [
				card([ 'Internet speed (WAN)', E('span', { class: 'nfm-spacer' }),
					E('span', { class: 'nfm-legend' }, [ legendDot('c-down', 'Download'), legendDot('c-up', 'Upload') ]) ], histNet.el)
			]),
			E('div', { class: 'nfm-grid' }, [
				card('History storage and flash wear', flashBox)
			]),
			E('div', { class: 'nfm-grid' }, [ card([ 'Data export to CSV', E('span', { class: 'nfm-spacer' }), E('span', { class: 'nfm-note-s' }, 'opens in Excel and Google Sheets') ], E('div', {}, [ E('div', { class: 'nfm-exp' }, expBtns), E('div', { style: 'margin-top:8px' }, expNote) ])) ]),
			E('div', { class: 'nfm-grid' }, [ card([ 'Storage', E('span', { class: 'nfm-spacer' }), E('button', { type: 'button', class: 'nfm-btn', click: () => { dskBody.replaceChildren(E('div', { class: 'nfm-empty' }, 'Looking for storage…')); loadDisks(); } }, 'Refresh') ], E('div', {}, [ dskBody, dskMsg, E('div', { class: 'nfm-note-s', style: 'margin-top:8px' }, 'History (charts, traffic by day and by app, log) is saved to storage every hour and survives a reboot. A USB stick does not wear out the router memory.') ])) ]),
			E('div', { class: 'nfm-grid' }, [ cfgCard ])
		]);

		/* ---- new tabs (v1.21.0): ready-made cards moved from "Network" and "History", missing pieces added ---- */
		/* ---- unified log: events, outages and reboots, blocks; search and filter ---- */
		const LOGK = [ [ 'all', 'All' ], [ 'ev', 'Events' ], [ 'jr', 'Outages and reboots' ], [ 'bl', 'Blocks' ], [ 'pin', 'Pinned' ] ];
		const logQ = E('input', { class: 'nfm-search', type: 'search', placeholder: 'Search the log…', 'aria-label': 'Search the log', input: () => renderLogTools() });
		const logChips = E('div', { class: 'nfm-tabs', style: 'margin-bottom:10px' }, LOGK.map(([ k, l ]) => E('button', { type: 'button', class: 'nfm-tab' + (k === 'all' ? ' on' : ''), 'data-k': k,
			click: () => { S.logK = k; renderLogTools(); } }, l)));
		const logBox = E('div', { class: 'nfm-evlist' });
		const LOGP = [ [ 0, 'All time' ], [ 86400, 'Last 24 hours' ], [ 604800, 'Last 7 days' ], [ 2592000, 'Last 30 days' ] ];
		const logPer = E('select', { class: 'nfm-sel', 'aria-label': 'Period', change: ev => { S.logP = +ev.target.value; renderLogTools(); } }, LOGP.map(([ v, l ]) => E('option', { value: String(v) }, l)));
		let logShown = [];
		const pinLoad = () => { try { return JSON.parse(window.localStorage.getItem('nfm_pins') || '[]'); } catch (e) { return []; } };
		const pinToggle = id => { try { const l = pinLoad(), i = l.indexOf(id); if (i >= 0) l.splice(i, 1); else l.unshift(id); window.localStorage.setItem('nfm_pins', JSON.stringify(l.slice(0, 100))); } catch (e) { /* no pinning */ } renderLogTools(); };
		const logCsv = E('button', { type: 'button', class: 'nfm-btn', title: 'Download the shown records as a CSV file', click: () => {
			const q = v => '"' + String(v).replace(/"/g, '""') + '"';
			const txt = '﻿time;type;event\n' + logShown.map(x => [ new Date(x.t * 1000).toLocaleString('en-US'), ({ ev: 'event', jr: 'outage/reboot', bl: 'block' })[x.k] || x.k, x.txt ].map(q).join(';')).join('\n');
			const a = E('a', { href: URL.createObjectURL(new Blob([ txt ], { type: 'text/csv;charset=utf-8' })), download: 'nightfall-log.csv' }); document.body.appendChild(a); a.click(); a.remove();
		} }, 'Download CSV');
		/* ---- the router's own log (logread): search, level, service ---- */
		const rlQ = E('input', { class: 'nfm-search', type: 'search', placeholder: 'Search the router log…', 'aria-label': 'Search the router log', input: () => { S.rlLimit = 300; renderRouterLog(); } });
		const rlSvc = E('select', { class: 'nfm-sel', 'aria-label': 'Service', change: () => { S.rlLimit = 300; renderRouterLog(); } }, E('option', { value: '' }, 'All services'));
		const RLV = [ [ 'all', 'All' ], [ 'warn', 'Warnings and errors' ], [ 'err', 'Errors only' ], [ 'info', 'Info' ], [ 'debug', 'Debug' ] ];
		const rlChipRefs = {};
		const rlChips = E('div', { class: 'nfm-tabs nfm-log-tabs', style: 'margin-bottom:8px' }, RLV.map(([ k, l ]) => {
			const count = E('span', { class: 'nfm-log-tab-count' }, '0');
			const button = E('button', { type: 'button', class: 'nfm-tab' + (k === 'all' ? ' on' : ''), 'data-k': k, click: () => { S.rlK = k; S.rlLimit = 300; renderRouterLog(); } }, [ l, count ]);
			rlChipRefs[k] = { button, count };
			return button;
		}));
		let rlVisible = [];
		const rlSummary = E('div', { class: 'nfm-log-summary' });
		const rlDiag = E('div', { class: 'nfm-log-diagnostics' });
		const rlStatus = E('span', { class: 'nfm-log-status' }, 'Loading log…');
		const rlAutoBtn = E('button', { type: 'button', class: 'nfm-btn', title: 'Automatically fetch new records every 20 seconds', click: () => {
				S.rlAuto = S.rlAuto === false;
				setRouterLogAutoLabel();
				if (S.rlAuto) refreshRouterLog();
			} }, 'Auto-refresh: on');
		const rlRefreshBtn = E('button', { type: 'button', class: 'nfm-btn', title: 'Fetch the log now', click: () => refreshRouterLog() }, 'Refresh');
		const rlCopyBtn = E('button', { type: 'button', class: 'nfm-btn', title: 'Copy the filtered records', click: () => copyRouterLog() }, 'Copy');
		const rlExportBtn = E('button', { type: 'button', class: 'nfm-btn', title: 'Download the filtered records as CSV', click: () => exportRouterLog() }, 'Export CSV');
		const rlGroupBtn = E('button', { type: 'button', class: 'nfm-btn', title: 'Merge identical messages', click: () => { S.rlGrouped = S.rlGrouped === false; renderRouterLog(); } }, 'Repeats: grouped');
		const rlTools = E('div', { class: 'nfm-log-tools' }, [ rlAutoBtn, rlRefreshBtn, rlCopyBtn, rlExportBtn, rlGroupBtn, rlStatus ]);
		const rlBox = E('div', { class: 'nfm-evlist nfm-rlog' });
		const rlMore = E('div', { class: 'nfm-log-more', hidden: '' }, E('button', { type: 'button', class: 'nfm-btn', click: () => { S.rlLimit = (S.rlLimit || 300) + 300; renderRouterLog(); } }, 'Show more'));
		const MONRU = { Jan: 'Jan', Feb: 'Feb', Mar: 'Mar', Apr: 'Apr', May: 'May', Jun: 'Jun', Jul: 'Jul', Aug: 'Aug', Sep: 'Sep', Oct: 'Oct', Nov: 'Nov', Dec: 'Dec' };
		const wifiTab = E('div', { hidden: true }, [
			E('div', { class: 'nfm-grid' }, [
				card([ 'Wi-Fi clients', E('span', { class: 'nfm-spacer' }), E('span', { class: 'nfm-note-s' }, 'click a row for the signal chart · speed is the negotiated rate, not current traffic') ],
					E('table', { class: 'nfm-table' }, [
						E('thead', {}, E('tr', {}, [ E('th', {}, 'Device'), E('th', {}, 'Network'), E('th', {}, 'Signal'),
							E('th', { class: 'r' }, '↓ link'), E('th', { class: 'r' }, '↑ link'), E('th', { class: 'r' }, 'Online') ])), wifiBody ]))
			]),
			E('div', { class: 'nfm-grid' }, [ card('Bands: 2.4 and 5 GHz', wbBox) ]),
			E('div', { class: 'nfm-grid' }, [ card('Recommendations', wrBox) ]),
			E('div', { class: 'nfm-grid' }, [ card('Wi‑Fi quality by client', wqBody) ]),
			E('div', { class: 'nfm-grid' }, [ card('Connects and disconnects', wjBox) ]),
			E('div', { class: 'nfm-grid' }, [ card([ 'Wi‑Fi signal by hour', E('span', { class: 'nfm-spacer' }), whTabs ], whBody) ]),
			E('div', { class: 'nfm-grid' }, [ card([ 'Wi‑Fi: channel congestion', E('span', { class: 'nfm-spacer' }) ], airBody) ]),
		]);
		const appTrafficBody = E('div', { class: 'nfm-app-traffic' }, E('div', { class: 'nfm-empty' }, 'Collecting app statistics…'));
		const appPeriod = E('select', { class: 'nfm-sel', 'aria-label': 'App statistics period', change: ev => { S.appPeriod = ev.target.value; renderAppTraffic(); } }, [
			E('option', { value: 'day' }, 'Today'), E('option', { value: '7' }, '7 days'), E('option', { value: '30' }, '30 days')
		]);
		const appDevice = E('select', { class: 'nfm-sel', 'aria-label': 'Device for app statistics', change: ev => { S.appDevice = ev.target.value; renderAppTraffic(); } }, E('option', { value: '' }, 'All devices'));
		let appRenderedData = null, appRenderedPeriod = null, appRenderedDevice = null;
		function renderAppTraffic() {
			const d = S.appTraffic;
			if (d === undefined) { appTrafficBody.replaceChildren(E('div', { class: 'nfm-empty' }, 'Loading app statistics…')); return; }
			if (!d || typeof d.enabled === 'undefined') { appTrafficBody.replaceChildren(E('div', { class: 'nfm-empty' }, 'Could not get statistics. Make sure the Nightfall collector is running.')); return; }
			if (d.lite) { appTrafficBody.replaceChildren(E('div', { class: 'nfm-empty' }, [ E('b', {}, 'App accounting is unavailable in Lite mode'), E('span', {}, 'To save resources, Lite mode turns off the DNS log and per-app traffic analysis. Switch the monitor to "Full" mode if the router can handle the load.') ])); return; }
			if (!d.enabled) { appTrafficBody.replaceChildren(E('div', { class: 'nfm-empty' }, [ E('b', {}, 'Per-app traffic accounting is off'), E('span', {}, 'Turn it on in the monitor settings: History → Settings → "Per-app traffic accounting". After turning it on, it takes time to accumulate DNS mappings.') ])); return; }
			if (d === appRenderedData && S.appPeriod === appRenderedPeriod && S.appDevice === appRenderedDevice) return;
			const periodDays = S.appPeriod === '30' ? 30 : S.appPeriod === '7' ? 7 : 1;
			const ips = Array.from(new Set([ ...(d.day || []).map(r => r[0]), ...(d.hist || []).map(r => r[1]) ])).filter(Boolean).sort();
			/* Address grouping uses the same resolver as device traffic,
			 * the daily report and the cards. Ambiguous DHCP/ARP records are not merged. */
			const ipMac = monitorBuildIpMacMap(hints, S.devs && S.devs.neigh, S.wifi, S.devs && S.devs.leases);
			const deviceGroups = {};
			for (const addr of ips) {
				const macValue = ipMac[normalizeMonitorIp(addr)] || '';
				const hint = macValue ? hints[macValue] || hints[macValue.toLowerCase()] || {} : {};
				const knownIps = new Set((hint.ipaddrs || []).concat(hint.ip6addrs || []).map(normalizeMonitorIp));
				/* For a single IP we keep the old select value: this is compatible
				 * with the saved selection and existing LuCI scenarios. */
				const key = macValue && knownIps.size > 1 ? 'mac:' + macValue : addr;
				const group = deviceGroups[key] || (deviceGroups[key] = { key, mac: macValue, ips: new Set(), label: '' });
				group.ips.add(normalizeMonitorIp(addr));
				group.label = hint.name || names[addr] || group.label || addr;
			}
			const options = Object.values(deviceGroups).sort((a, b) => a.label.localeCompare(b.label, 'en'));
			if (!options.some(group => group.key === S.appDevice)) {
				const legacy = options.find(group => group.ips.has(normalizeMonitorIp(S.appDevice || '')));
				S.appDevice = legacy ? legacy.key : '';
			}
			appDevice.replaceChildren(E('option', { value: '' }, 'All devices'), ...options.map(group =>
				E('option', { value: group.key }, group.label + (group.ips.size > 1 ? ' · ' + group.ips.size + ' addresses' : ' · ' + Array.from(group.ips)[0]))
			));
			appDevice.value = S.appDevice;
			appPeriod.value = S.appPeriod;
			appRenderedData = d; appRenderedPeriod = S.appPeriod; appRenderedDevice = S.appDevice;
			const selectedGroup = options.find(group => group.key === S.appDevice);
			const result = sumMonitorAppTraffic(d, periodDays, selectedGroup ? selectedGroup.ips : '');
			const total = result.total, fmtShare = n => total ? nf1.format(n / total * 100) + '%' : '0%';
			const summary = E('div', { class: 'nfm-tiles t4 nfm-app-summary' }, [
				[ 'Total traffic', total, 'c-cpu' ], [ 'VPN', result.routes.VPN, 'c-mem' ], [ 'Direct', result.routes.Direct, 'c-temp' ], [ 'Unknown route', result.routes.Unknown, 'gx' ]
			].map(x => E('div', { class: 'nfm-tile' }, [ x[0], E('b', {}, fmtBytes(x[1])), E('small', { class: 'nfm-note-s' }, fmtShare(x[1])) ])));
			const appPalette = [ 'var(--c-cpu)', 'var(--c-mem)', 'var(--c-temp)', 'var(--c-down)', 'var(--c-up)', 'var(--c-flash)', 'var(--gx)' ];
			const catRows = result.categories.map((c, i) => {
				const apps = Object.values(c.apps).sort((a, b) => b.total - a.total);
				const color = appPalette[i % appPalette.length];
				const share = total ? c.total / total * 100 : 0;
				const details = E('details', { class: 'nfm-app-category', style: '--nfm-app-color:' + color }, [
					E('summary', {}, [
						E('span', { class: 'nfm-app-category-icon', 'aria-hidden': 'true' }),
						E('span', { class: 'nfm-app-category-name' }, c.name),
						E('span', { class: 'nfm-app-category-bar', 'aria-hidden': 'true' }, E('i', { style: 'width:' + share.toFixed(2) + '%' })),
						E('b', {}, fmtBytes(c.total)), E('small', {}, fmtShare(c.total))
					]),
					E('div', { class: 'nfm-app-category-items' }, apps.map(a => E('div', { class: 'nfm-app-item' }, [
						E('span', { class: 'nfm-app-item-name' }, appTrafficDisplayName(a.name)),
						E('span', { class: 'nfm-app-item-route' }, [ 'VPN', 'Direct', 'Unknown' ].filter(k => a.routes[k] > 0).map(k => E('small', { class: 'nfm-chip', title: (k === 'VPN' ? 'VPN' : k === 'Direct' ? 'Direct' : 'Unknown route') + ': ' + fmtBytes(a.routes[k]) }, (k === 'VPN' ? 'VPN' : k === 'Direct' ? 'Direct' : 'Unkn.') + ' ' + fmtBytes(a.routes[k])))),
						E('b', {}, fmtBytes(a.total))
					])))
				]);
				return details;
			});
			let donutOffset = 0;
			const donutStops = result.categories.map((c, i) => {
				const from = donutOffset;
				donutOffset += total ? c.total / total * 100 : 0;
				return appPalette[i % appPalette.length] + ' ' + from.toFixed(2) + '% ' + donutOffset.toFixed(2) + '%';
			});
			const donut = E('div', { class: 'nfm-app-donut', style: 'background:' + (total ? 'conic-gradient(' + donutStops.join(',') + ')' : 'var(--nfm-card2)') },
				E('div', { class: 'nfm-app-donut-center' }, [ E('b', {}, fmtBytes(total)), E('small', {}, 'Total') ]));
			const legendRows = result.categories.map((c, i) => E('div', { class: 'nfm-app-legend-row' }, [
				E('i', { class: 'nfm-app-legend-dot', style: '--nfm-app-color:' + appPalette[i % appPalette.length] }),
				E('span', {}, c.name), E('b', {}, fmtShare(c.total)), E('small', { class: 'nfm-app-legend-size' }, fmtBytes(c.total))
			]));
			const primaryLegend = E('div', { class: 'nfm-app-legend' }, legendRows.slice(0, 6));
			const remaining = legendRows.slice(6);
			const remainingTotal = result.categories.slice(6).reduce((sum, c) => sum + c.total, 0);
			if (remaining.length) primaryLegend.appendChild(E('details', { class: 'nfm-app-legend-more' }, [
				E('summary', {}, [ E('span', {}, 'Other (' + remaining.length + ' categories)'), E('span', {}, fmtBytes(remainingTotal)) ]),
				E('div', { class: 'nfm-app-legend' }, remaining)
			]));
			const donutBox = E('div', { class: 'nfm-app-distribution' }, [ donut, primaryLegend ]);
			const top = result.apps.slice(0, 30);
			const unknown = result.apps.filter(a => a.category === 'Unclassified').slice(0, 12);
			const unknownBox = E('div', { class: 'nfm-app-unknown-list' }, unknown.length ? unknown.map(a => E('div', { class: 'nfm-host' }, [
				E('span', {}, appTrafficDisplayName(a.name)),
				E('b', {}, fmtBytes(a.total)),
				E('small', {}, [ 'VPN', 'Direct', 'Unknown' ].filter(k => a.routes[k] > 0).map(k => (k === 'VPN' ? 'VPN' : k === 'Direct' ? 'Direct' : 'Unkn.') + ': ' + fmtBytes(a.routes[k])).join(' · '))
			])) : [ E('div', { class: 'nfm-empty' }, 'No unrecognized records yet.') ]);
			const appsBox = E('div', { class: 'nfm-app-top-list' }, top.length ? top.map(a => E('div', { class: 'nfm-host' }, [
				E('span', {}, [ appTrafficDisplayName(a.name), E('small', {}, a.category) ]),
				E('b', {}, fmtBytes(a.total)),
				E('div', { class: 'nfm-bar' }, E('div', { class: 'nfm-bar-fill ' + (a.category === 'Unclassified' ? 'gx' : 'c-cpu'), style: 'width:' + (a.total / Math.max(1, top[0].total) * 100).toFixed(1) + '%' }))
			])) : [ E('div', { class: 'nfm-empty' }, 'No traffic accumulated for the selected period yet.') ]);
			appTrafficBody.replaceChildren(
				E('div', { class: 'nfm-app-toolbar' }, [ appPeriod, appDevice ]),
				summary,
				E('div', { class: 'nfm-grid' }, [
					card('Distribution by category', donutBox)
				]),
				E('div', { class: 'nfm-grid' }, [
					card('Traffic by category', E('div', { class: 'nfm-app-categories' }, catRows.length ? catRows : [ E('div', { class: 'nfm-empty' }, 'No category data.') ]))
				]),
				E('div', { class: 'nfm-grid nfm-g21' }, [
					card('Top apps and domains', appsBox),
					card([ 'Unrecognized', E('span', { class: 'nfm-note-s' }, unknown.length ? 'First 12 records · no false attribution' : 'Unknown traffic check') ], unknownBox)
				]),
				E('div', { class: 'nfm-note-s' }, 'Categories are built from recognized service names. Shared CDNs, IPs without a DNS name and ambiguous domains are not attributed to apps. VPN / Direct / unknown route are counted regardless of category.')
			);
		}
		const appsTab = E('div', { hidden: true }, [
			E('div', { class: 'nfm-grid' }, [ card([ 'App traffic', E('span', { class: 'nfm-spacer' }), E('span', { class: 'nfm-note-s' }, 'Data refreshes every 30 seconds') ], appTrafficBody) ])
		]);
		const devsTab = E('div', { hidden: true }, [
			E('div', { class: 'nfm-grid nfm-g21' }, [ card([ 'Who is home', E('span', { class: 'nfm-note-s' }, 'by Wi‑Fi connections') ], homeBox), card('Unusual activity', susBox) ]),
			E('div', { class: 'nfm-grid' }, [
				card([ 'Traffic by device', E('span', { class: 'nfm-spacer' }), T.devTotal = E('span', { class: 'nfm-note-s' }), devSel ], E('div', {}, [
					devNote,
					E('table', { class: 'nfm-table' }, [
						E('thead', {}, E('tr', {}, [ E('th', {}, 'Device'), E('th', { class: 'r' }, '↓ now'), E('th', { class: 'r' }, '↑ now'),
							E('th', { class: 'r' }, '↓ today'), E('th', { class: 'r' }, '↑ today') ])), devBody ]) ]))
			]),
		]);
		const logTab = E('div', { hidden: true }, [
			E('div', { class: 'nfm-grid' }, [ card([ 'Event log', E('span', { class: 'nfm-spacer' }), logPer, logCsv, logQ ], E('div', {}, [ logChips, logBox ])) ]),
			E('div', { class: 'nfm-grid' }, [ card('Reboot and outage log', E('div', {}, [ jrnTiles, jrnBox ])) ]),
			E('div', { class: 'nfm-grid' }, [ card([ 'Router log', E('span', { class: 'nfm-spacer' }), rlSvc, rlQ ], E('div', {}, [ rlChips, rlSummary, rlDiag, rlTools, rlBox, rlMore ])) ])
		]);
		const diagTab = E('div', { hidden: true }, [
			E('div', { class: 'nfm-grid' }, [ card('Network diagnostics', diagBody) ]),
			E('div', { class: 'nfm-grid' }, [ card('Check history', diagHistBox) ]),
			E('div', { class: 'nfm-grid' }, [ card([ 'Internet speed (router tests)', E('span', { class: 'nfm-spacer' }), spdSrc, spdSel, spdBtn ], E('div', {}, [ spdTiles, spdChart.el, spdList, spdNote ])) ]),
		]);
		const secTiles = E('div', { class: 'nfm-tiles t4' }, [ [ 'sFail', 'failed sign-ins' ], [ 'sNew', 'new this week' ], [ 'sOpen', 'ports open to the network' ], [ 'sFw', 'forwards from the internet' ] ]
			.map(([ k, l ]) => E('div', { class: 'nfm-tile' }, [ l, T[k] = E('b', {}, '–') ])));
		const secVerdict = E('div', { class: 'nfm-hint' }, 'Collecting data…');
		const secLogins = E('div'), secPorts = E('div'), secDev = E('div'), secUpd = E('div'), secBans = E('div'), secChecks = E('div');
		const secTab = E('div', { hidden: true }, [
			E('div', { class: 'nfm-grid' }, [ card('Security summary', E('div', {}, [ secVerdict, secTiles ])) ]),
			E('div', { class: 'nfm-grid nfm-g21' }, [ card('Sign-in attempts (LuCI and SSH)', secLogins), card('Updates', secUpd) ]),
			E('div', { class: 'nfm-grid nfm-g21' }, [ card('Open router ports', secPorts), card('New devices', secDev) ]),
			E('div', { class: 'nfm-grid' }, [ card('Settings checks', secChecks) ]),
			E('div', { class: 'nfm-grid' }, [ card('Blocked addresses', secBans) ])
		]);

		const modeBadge = E('span', { class: 'nfm-mode', hidden: true });
		const setMode = r => {
			if (!r || (r.mode !== 'lite' && r.mode !== 'full')) { modeBadge.hidden = true; return; }
			const lite = r.mode === 'lite';
			modeBadge.hidden = false;
			modeBadge.className = 'nfm-mode' + (lite ? ' lite' : '');
			modeBadge.textContent = 'Mode: ' + (lite ? 'Lite' : 'Full') + (+r.step ? ' · polling every ' + r.step + ' s' : '');
			modeBadge.title = lite ? 'Lite for weak routers: polling once a minute, no per-app accounting and no Wi‑Fi history. Changed in the settings below (LITE).' : 'Full mode: polling every 15 seconds, all features available. For a weak router, enable Lite in the settings below (LITE).';
		};
		const pill = E('span', { class: 'nfm-pill' }, `refreshes every ${INTERVAL} s`);
		const pauseBtn = E('button', { class: 'nfm-btn', click: () => setPaused(!S.paused) }, 'Pause');
		const onTab = (...k) => k.indexOf(S.tab) >= 0;
		const TAB_KEYS = [ 'overview', 'net', 'wifi', 'devs', 'apps', 'procs', 'svcs', 'diag', 'sec', 'log', 'hist' ];
		const tabBtns = {};
		const tabs = E('div', { class: 'nfm-tabs', role: 'tablist' }, [ [ 'overview', 'Overview' ], [ 'net', 'Network' ], [ 'wifi', 'Wi‑Fi' ], [ 'devs', 'Devices' ], [ 'apps', 'Traffic' ], [ 'procs', 'Programs' ], [ 'svcs', 'Services' ], [ 'diag', 'Diagnostics' ], [ 'sec', 'Security' ], [ 'log', 'Log' ], [ 'hist', 'History' ] ]
			.map(([ k, l ]) => tabBtns[k] = E('button', { class: 'nfm-tab nfm-ti', 'data-ic': k, role: 'tab', click: () => { S.tab = k; refresh(); } }, l)));

		const svcFilter = E('input', { class: 'nfm-in', type: 'search', placeholder: 'Find a service…', input: () => renderServices() });
		const svcBox = E('div');
		const svcMore = E('div');
		const svcs = E('div', { hidden: true }, [
			E('div', { class: 'nfm-grid' }, [ card([ 'Service status', E('span', { class: 'nfm-spacer' }), svcFilter ], E('div', {}, [ svcBox,
				E('div', { class: 'nfm-note-s', style: 'margin-top:10px' }, 'Red marks services that are enabled at boot but not running right now. Key services (network, web server, SSH, firewall) cannot be stopped from here, so you do not lose access.') ])) ]),
			E('div', { class: 'nfm-grid' }, [ svcMore ])
		]);
		{ const hv = (window.location.hash || '').replace('#', ''); if (TAB_KEYS.includes(hv)) S.tab = hv; }
		const root = E('div', { class: 'nfm' }, [
			E('style', {}, CSS + XCSS),
			E('div', { class: 'nfm-top' }, [
				E('div', {}, [ E('h2', {}, 'Resource Monitor'),
					E('div', { class: 'nfm-sub' }, [ (board.model || board.hostname || 'OpenWrt') + ' · up ', t('uptime') ]) ]),
				E('span', { class: 'nfm-spacer' }), modeBadge, pill, pauseBtn, tabs ]),
			overview, net, wifiTab, devsTab, appsTab, procs, svcs, diagTab, secTab, logTab, hist
		]);

		/* ---------- quick actions ---------- */
		function runChecked(fn) {
			return Promise.resolve().then(fn).then(res => {
				if (res && typeof res.code === 'number' && res.code !== 0)
					throw new Error((res.stderr || '').trim() || `exit code ${res.code}`);
				return res;
			});
		}

		function confirmRun(title, text, fn, busy, reboot) {
			ui.showModal(title, [
				E('p', {}, text),
				E('div', { class: 'button-row' }, [
					E('button', { class: 'btn', click: ui.hideModal }, 'Cancel'),
					E('button', { class: 'btn cbi-button-negative important', click: () => {
						ui.showModal(null, [ E('p', { class: 'spinning' }, busy) ]);
						runChecked(fn).then(() => {
							if (reboot) window.setTimeout(() => window.location.reload(), 60000);
							else window.setTimeout(ui.hideModal, 2500);
						}).catch(err => {
							ui.hideModal();
							ui.addNotification(null, E('p', {}, 'Could not run: ' + (err.message || err)), 'danger');
						});
					} }, 'Run')
				])
			]);
		}

		function wakeDialog() {
			const hosts = [];
			for (const mac in hints)
				hosts.push({ mac: mac.toUpperCase(), name: hints[mac].name || (hints[mac].ipaddrs || [])[0] || mac });
			hosts.sort((a, b) => a.name.localeCompare(b.name));

			const sel = E('select', { class: 'nfm-sel', style: 'width:100%' }, [ E('option', { value: '' }, '— choose a device —') ]
				.concat(hosts.map(h => E('option', { value: h.mac }, `${h.name} (${h.mac})`))));
			const man = E('input', { type: 'text', placeholder: 'or enter a MAC address: AA:BB:CC:DD:EE:FF', style: 'width:100%;margin-top:8px' });

			ui.showModal('Wake a device', [
				E('p', {}, `The magic packet will be sent to the ${lanDev} network. The device must support Wake-on-LAN.`),
				sel, man,
				E('div', { class: 'button-row' }, [
					E('button', { class: 'btn', click: ui.hideModal }, 'Cancel'),
					E('button', { class: 'btn cbi-button-positive important', click: () => {
						const mac = (man.value.trim() || sel.value).toUpperCase();
						if (!/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(mac)) {
							ui.addNotification(null, E('p', {}, 'Enter a valid MAC address.'), 'warning');
							return;
						}
						ui.hideModal();
						runChecked(() => fs.exec('/usr/bin/etherwake', [ '-b', '-i', lanDev, mac ])).then(() => {
							ui.addNotification(null, E('p', {}, `Wake packet sent: ${mac}`), 'success');
						}).catch(err => {
							ui.addNotification(null, E('p', {}, 'Could not send the packet: ' + (err.message || err) + '. The etherwake package is required (apk add etherwake).'), 'danger');
						});
					} }, 'Wake')
				])
			]);
		}

		/* Primary path: LuCI's own network model (same data the Overview page uses).
		   Fallback: raw ubus calls. Errors are kept in wifiErr for the empty-state hint. */
		let wifiErr = '';
		const bandOf = (band, ch, ghz) => {
			if (band) return String(band).toLowerCase().replace('2.4g', '2g').replace('5ghz', '5g').replace('2ghz', '2g');
			const g = parseFloat(ghz); if (g) return g < 3 ? '2g' : g < 5.9 ? '5g' : '6g';
			const c = parseInt(ch, 10); if (c) return c <= 14 ? '2g' : '5g';
			return null;
		};
		function fetchWifiModel() {
			return network.getWifiNetworks().then(nets => Promise.all((nets || []).map(n => {
				const ifname = n.getIfname && n.getIfname();
				if (!ifname) return [];
				const dev = n.getWifiDevice ? n.getWifiDevice() : null;
				const band = bandOf(dev && dev.get ? dev.get('band') : null, (n.getChannel && n.getChannel()) || (dev && dev.get ? dev.get('channel') : null), n.getFrequency && n.getFrequency());
				const ssid = (n.getActiveSSID && n.getActiveSSID()) || (n.getSSID && n.getSSID()) || ifname;
				return Promise.resolve(n.getAssocList()).then(list =>
					(list || []).map(c => Object.assign({}, c, { ssid: ssid, band: band })));
			}))).then(lists => [].concat(...lists));
		}

		function fetchWifiRaw() {
			return callWifi().then(st => {
				const ifs = [];
				for (const r in st)
					for (const i of (st[r].interfaces || []))
						if (i.ifname && (!i.config || !i.config.mode || i.config.mode === 'ap'))
							ifs.push({ ifname: i.ifname, ssid: (i.config || {}).ssid || i.ifname, band: bandOf((st[r].config || {}).band, (st[r].config || {}).channel, null) });
				return Promise.all(ifs.map(i => callAssoc(i.ifname).then(list =>
					(list || []).map(c => Object.assign({}, c, { ssid: i.ssid, band: i.band })))));
			}).then(lists => [].concat(...lists));
		}

		function fetchWifi() {
			wifiErr = '';
			return fetchWifiModel().catch(e1 => {
				wifiErr = 'network: ' + (e1 && e1.message || e1);
				return fetchWifiRaw();
			}).catch(e2 => {
				wifiErr += (wifiErr ? '; ' : '') + 'ubus: ' + (e2 && e2.message || e2);
				return null;
			});
		}

		function fmtDur(sec) {
			const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60);
			return h ? `${h} h ${m} min` : (m ? `${m} min` : `${Math.floor(sec)} s`);
		}

		function hotInfo() {
			let n = 0, t0 = null, peak = 0;
			for (let i = S.temp.length - 1; i >= 0; i--) {
				const v = S.temp[i];
				if (v == null || v < HOT_WARN) break;
				n++; peak = Math.max(peak, v); t0 = S.times[i];
			}
			if (!n) return null;
			const dur = S.times[S.times.length - 1] - t0;
			return dur >= HOT_SECONDS ? { temp: S.temp[S.temp.length - 1], dur, crit: peak >= HOT_CRIT } : null;
		}

		/* ---------- history collector (nightfall-history) ---------- */
		function callHistory(args) {
			return fs.exec(HIST, args).then(res => {
				try { return JSON.parse(res.stdout); } catch (e) { return false; }
			}).catch(() => false);
		}

		function due(key, sec) {
			const n = Date.now();
			if (n - (S.at[key] || 0) < sec * 1000 - 300) return false;
			S.at[key] = n;
			return true;
		}

		function fetchExtras() {
			const jobs = [];
			if (due('alerts', ALERTS_EVERY * INTERVAL)) jobs.push(callHistory([ 'alerts' ]).then(r => { S.alerts = r; }));
			if (onTab('net', 'devs', 'overview', 'wifi') && due('devs', DEVICES_EVERY * INTERVAL)) jobs.push(callHistory([ 'devices' ]).then(r => { S.devs = r; refreshIdentityNames(); }));
			if (due('mode', 60)) jobs.push(callHistory([ 'mode' ]).then(setMode));
			if (onTab('hist', 'log') && due('hist', HIST_EVERY * INTERVAL)) jobs.push(callHistory([ 'series', RANGES[S.range][0] ]).then(r => { S.hist = r; }));
			if (S.tab === 'hist' && due('tr', 300)) jobs.push(callHistory([ 'traffic' ]).then(r => { S.tr = r; }));
			if (S.tab === 'hist' && due('day', 60)) jobs.push(Promise.all([ callHistory([ 'series', 'coarse' ]), callHistory([ 'devices' ]) ]).then(r => { S.day = { h: r[0], d: r[1] }; }));
			if (S.tab === 'hist' && due('wkA', 300)) jobs.push(callHistory([ 'apps' ]).then(r => { S.wkA = r || null; }));
			if (onTab('hist', 'wifi', 'devs') && due('wq', 60)) jobs.push(callHistory([ 'wifi' ]).then(r => { S.wq = r || null; }));
			if (onTab('hist', 'wifi') && due('whr', 120)) jobs.push(callHistory([ 'wifi-hr' ]).then(r => { S.whr = r || null; }));
			if (S.tab === 'hist' && due('lg', 300)) jobs.push(callHistory([ 'series', 'long' ]).then(r => { S.lg = r || null; }));
			if (S.tab === 'net' && due('chan', DEVICES_EVERY * INTERVAL)) jobs.push(callHistory([ 'channel' ]).then(r => { S.chan = r; }));
			if (S.tab === 'procs' && due('pm', 120)) jobs.push(callHistory([ 'procmem', String(S.pmH || 24) ]).then(r => { S.pm = r || null; }).catch(() => { S.pm = null; }));
			if (S.tab === 'devs' && due('dd', 600)) jobs.push(callHistory([ 'devdaily' ]).then(r => { S.dd = r || null; }).catch(() => { S.dd = null; }));
			if (S.tab === 'apps' && due('appTraffic', 30)) jobs.push(callHistory([ 'apps' ]).then(r => { S.appTraffic = r || null; }).catch(() => { S.appTraffic = null; }));
			if (S.tab === 'net' && due('extip', 120)) jobs.push(callHistory([ 'extip' ]).then(r => { S.extip = r || null; }).catch(() => { S.extip = null; }));
			if (S.tab === 'net' && due('dns', 30)) jobs.push(fs.exec('/usr/libexec/nightfall-dns', [ 'top' ]).then(r => { try { S.dns = JSON.parse(r.stdout); } catch (e) { S.dns = null; } }).catch(() => { S.dns = null; }));
			if (S.tab === 'sec' && due('sec', 60)) jobs.push(fs.exec(SECBIN, [ 'summary' ]).then(r => { try { S.sec = JSON.parse(r.stdout); S.secErr = ''; } catch (e) { S.sec = null; S.secErr = 'could not parse the script response' + (r.stderr ? ': ' + String(r.stderr).slice(0, 120) : ''); } }).catch(e => { S.sec = null; S.secErr = String((e && e.message) || e).slice(0, 120); }));
			if (S.tab === 'sec' && due('bans', 30)) jobs.push(fs.exec(SECBIN, [ 'bans' ]).then(r => { try { S.bans = JSON.parse(r.stdout); } catch (e) { S.bans = null; } }).catch(() => { S.bans = null; }));
			if (S.tab === 'sec' && due('secu', 600)) jobs.push(fs.exec(SECBIN, [ 'updates' ]).then(r => { try { S.secu = JSON.parse(r.stdout); } catch (e) { S.secu = null; } }).catch(() => { S.secu = null; }));
			if (S.tab === 'log' && (S.rlog === undefined || (S.rlAuto !== false && due('rlog', 20)))) jobs.push(fs.exec('/usr/libexec/nightfall-log', [ 'read', '800' ]).then(r => { try { S.rlog = JSON.parse(r.stdout); S.rlogUpdated = Date.now(); } catch (e) { S.rlog = null; } }).catch(() => { S.rlog = null; }));
			if (S.tab === 'log' && due('blog', 30)) jobs.push(fs.exec('/usr/libexec/nightfall-block', [ 'log' ]).then(r => { try { S.blog = JSON.parse(r.stdout); } catch (e) { S.blog = null; } }).catch(() => { S.blog = null; }));
			if (onTab('hist', 'log') && due('jrn', 30)) jobs.push(callHistory([ 'journal' ]).then(r => { S.jrn = r; }));
			if (onTab('hist', 'diag') && due('spd', S.spdRun ? 3 : 30)) jobs.push(callHistory([ 'speed' ]).then(r => { S.spd = r; if (S.spdRun && Date.now() - (S.spdT || 0) > 4000 && (!r || !r.running)) { S.spdRun = false; if (r === false) ui.addNotification(null, E('p', {}, 'The test finished, but the result could not be read: ' + MISSING), 'danger'); } }));
			if (S.tab === 'svcs' && due('svc', 6)) jobs.push(Promise.all([ L.resolveDefault(callInitList(), null), L.resolveDefault(callServiceList(), null) ]).then(r => { S.svc = { init: r[0], run: r[1] }; }));
			if (S.tab === 'hist' && S.cfg === undefined) { S.cfg = null; jobs.push(callCfg([ 'get' ]).then(r => { S.cfg = r; fillCfg(r && r.values); renderDisks(); })); }
			if (S.tab === 'hist' && S.dsk === undefined) { S.dsk = null; jobs.push(loadDisks()); }
			return Promise.all(jobs);
		}

		const MISSING = 'The history collector is not running. On the router run: /etc/init.d/nightfall-collector enable && /etc/init.d/nightfall-collector start';

		function callCfg(args) {
			return fs.exec(CFG, args).then(res => {
				try { return JSON.parse(res.stdout); } catch (e) { return false; }
			}).catch(() => false);
		}

		function fillCfg(v) {
			if (!v) { cfgMsg.textContent = 'Settings unavailable: the collector service and an updated package are required.'; return; }
			cfgMsg.textContent = '';
			for (const k in cfgInputs) {
				if (cfgBoolKeys.has(k)) cfgInputs[k].checked = String(v[k] == null ? '0' : v[k]) === '1';
				else cfgInputs[k].value = v[k] != null ? v[k] : '';
			}
		}

		function saveCfg() {
			const args = [ 'set' ].concat(Object.keys(cfgInputs).map(k => k + '=' + (cfgBoolKeys.has(k) ? (cfgInputs[k].checked ? '1' : '0') : cfgInputs[k].value.trim())));
			callCfg(args).then(r => {
				if (r && r.ok) {
					cfgMsg.textContent = 'Saved, collector restarted.';
					S.at.alerts = 0; S.at.hist = 0;
					callCfg([ 'get' ]).then(c => { S.cfg = c; if (c) fillCfg(c.values); cfgMsg.textContent = 'Saved, collector restarted.'; });
					window.setTimeout(() => { cfgMsg.textContent = ''; }, 5000);
				}
				else ui.addNotification(null, E('p', {}, 'Not saved: ' + ((r && r.error) || 'no response from nightfall-config')), 'danger');
			});
		}

		function buildDiag(hd, cfg) {
			const d = S.last || {}, out = [], h = hd || {}, info = h.info || {};
			const rel = board.release || {};
			const fm = kb => fmtMB(kb);
			out.push('Nightfall monitor diagnostics, ' + new Date().toLocaleString('en-US'));
			out.push(`Model: ${board.model || '?'} · ${rel.description || rel.version || 'OpenWrt'} · kernel ${board.kernel || '?'}`);
			if (d.up != null) out.push(`Uptime: ${fmtUptime(d.up)} · load ${(d.load || []).map(v => nf2.format(v)).join(' / ')}`);
			if (S.cpuNow) out.push(`CPU: ${(d.cpu || []).length - 1} cores, ${nf0.format(S.cpuNow.pct)}% (programs ${nf0.format(S.cpuNow.apps)}%, system ${nf0.format(S.cpuNow.sys)}%, interrupts ${nf1.format(S.cpuNow.irq)}%, disk wait ${nf1.format(S.cpuNow.io)}%)`);
			if (d.temps) out.push('Temperatures (as reported by the system): ' + (d.temps.length ? d.temps.map(t => `${t[0]}=${nf1.format(t[1] / 1000)}°C`).join(', ') : 'no sensors'));
			if (d.mem) out.push(`Memory: used ${fm(d.mem.total - d.mem.avail)} of ${fm(d.mem.total)}, cache ${fm(d.mem.cached + d.mem.buffers)}, swap ${fm(d.mem.swap - d.mem.swapfree)} of ${fm(d.mem.swap)}`);
			if (d.flash) out.push(`Flash: ${fm(d.flash[1])} of ${fm(d.flash[0])} · /tmp ${d.tmp ? fm(d.tmp[1]) : '–'}`);
			if (d.ct) out.push(`Connections: ${d.ct[0]} of ${d.ct[1]}`);
			out.push(`Interfaces (now): ` + (d.net || []).map(n => { const r = (S.rates || {})[n[0]] || { rx: 0, tx: 0 }; return `${n[0]} ↓${rateText(r.rx)} ↑${rateText(r.tx)}`; }).join('; '));
			out.push(`Wi-Fi clients: ${S.wifi ? S.wifi.length : '–'}`);
			out.push(`Collector: ${info.started ? 'running' : 'NOT RUNNING (no data)'} · WAN ${info.wan_dev || '–'} · gateway ${info.gateway || '–'} · check ${info.targets || '–'} · conntrack_acct=${info.acct || '–'} · flow offloading=${info.offload || '–'} · history persisted: ${info.persist === '1' ? 'yes' : 'no'}`);
			const last = (h.rows || []).slice(-1)[0];
			if (last) out.push(`Last sample: CPU ${last[1]}%, memory ${last[2]}%, temperature ${last[3] < 0 ? 'n/a' : last[3] + '°C'}, latency gateway ${last[6] < 0 ? 'none' : last[6] + ' ms'} / internet ${last[7] < 0 ? 'none' : last[7] + ' ms'}`);
			if (cfg && cfg.values) out.push('Settings: ' + Object.keys(cfg.values).map(k => `${k}=${cfg.values[k]}`).join(' '));
			const act = h.active || [];
			out.push('Active warnings: ' + (act.length ? act.map(a => a[3]).join('; ') : 'none'));
			const evs = (h.events || []).slice(-10);
			if (evs.length) out.push('Recent events:\n' + evs.map(e => `  ${fmtTs(e[0])} [${e[1]}] ${e[2]}`).join('\n'));
			if (S.full) out.push('Programs by memory: ' + groupedProcs().sort((a, b) => b.rss - a.rss).slice(0, 6).map(e => `${e.label} ${fmtMB(e.rss)}`).join(', '));
			return out.join('\n');
		}

		function copyDiag() {
			Promise.all([ callHistory([ 'series', 'fine' ]), callCfg([ 'get' ]) ]).then(([ hd, cfg ]) => {
				const text = buildDiag(hd || {}, cfg);
				const ta = E('textarea', { class: 'nfm-diag', readonly: '' }, text);
				const fallback = () => {
					ui.showModal('Diagnostics', [
						E('p', {}, 'Could not copy automatically. Select the text and copy it manually (Ctrl+C).'), ta,
						E('div', { class: 'button-row' }, [ E('button', { class: 'btn', click: ui.hideModal }, 'Close') ]) ]);
					ta.select();
				};
				const ok = () => ui.addNotification(null, E('p', {}, 'Diagnostics copied to the clipboard. Device IP and MAC addresses are not included.'), 'success');
				const legacy = () => {
					const t = E('textarea', { style: 'position:fixed;opacity:0' }, text);
					document.body.appendChild(t); t.select();
					let res = false;
					try { res = document.execCommand('copy'); } catch (e) {}
					t.remove();
					return res ? ok() : fallback();
				};
				if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(ok, legacy);
				else legacy();
			});
		}

		function fmtTs(ts) {
			return new Date(ts * 1000).toLocaleString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
		}

		function xLabels(end, win) {
			const out = [];
			for (let i = 0; i <= 5; i++) {
				const d = new Date((end - win * (5 - i) / 5) * 1000);
				out.push(i === 5 ? 'now' : win > 2 * 86400
					? d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
					: d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
			}
			return out;
		}

		function tempAlertOn() {
			return !!(S.alerts && (S.alerts.active || []).some(a => a[0] === 'temp' || a[0] === 'tempc'));
		}

		function renderAlerts() {
			const a = S.alerts && S.alerts.active || [];
			let dismissed = {};
			try { dismissed = JSON.parse(window.localStorage.getItem('nfm_alerts_dismissed') || '{}') || {}; } catch (e) {}
			const visible = a.filter(x => {
				const key = String(x && x[0] || 'unknown') + ':' + String(x && x[1] || 0);
				return !dismissed[key];
			});
			alertsBox.toggleAttribute('hidden', !visible.length);
			alertsBox.replaceChildren(...visible.map(x => {
				const key = String(x && x[0] || 'unknown') + ':' + String(x && x[1] || 0);
				const title = String(x && x[3] != null && x[3] !== '' ? x[3] : 'Warning without description');
				return E('div', { class: 'nfm-alert' + (x[2] === 'crit' ? ' crit' : '') }, [
					E('div', { class: 'nfm-alert-copy' }, [ E('b', {}, title), E('small', {}, 'since ' + (x && x[1] ? fmtTs(x[1]) : 'unknown time')) ]),
					E('button', { type: 'button', class: 'nfm-alert-dismiss', title: 'Hide after viewing', click: () => {
						dismissed[key] = Date.now();
						try { window.localStorage.setItem('nfm_alerts_dismissed', JSON.stringify(dismissed)); } catch (e) {}
						renderAlerts();
					} }, 'Got it')
				]);
			}));

			const last = S.alerts && S.alerts.last && S.alerts.last[0];
			if (!S.alerts) T.wanMini.textContent = S.alerts === false ? 'history not collected' : '–';
			else if (!last || S.alerts.now - last[0] > 90) T.wanMini.textContent = 'no data';
			else T.wanMini.textContent = (last[7] >= 0 ? nf0.format(last[7]) + ' ms' : 'no response') + (last[6] >= 0 ? ' · gateway ' + nf0.format(last[6]) + ' ms' : '');
			if (last && S.alerts && S.alerts.now - last[0] <= 90) {
				rNet.set(last[7] >= 0 ? Math.min(100, last[7]) : 100, last[7] >= 0 ? nf0.format(last[7]) : '×');
				T.netMain.textContent = last[7] >= 0 ? 'up' : 'no response';
				T.netSub.textContent = last[6] >= 0 ? 'gateway ' + nf0.format(last[6]) + ' ms' : 'ping to 1.1.1.1';
			} else { rNet.set(0, '–'); T.netMain.textContent = S.alerts === false ? 'not collected' : 'no data'; T.netSub.textContent = 'collector required'; }
			updVerdict();
		}

		function renderTop3() {
			const list = (title, rows) => E('div', {}, [ E('div', { class: 'nfm-k', style: 'margin:0 0 4px' }, title) ].concat(rows.length ? rows.map(x => E('div', { class: 'nfm-host' }, [ E('span', {}, x[0]), E('b', {}, x[1]) ])) : [ E('div', { class: 'nfm-empty' }, 'Nothing yet') ]));
			const progs = S.full ? groupedProcs().sort((a, b) => b.rss - a.rss).slice(0, 3).map(e => [ e.label, fmtMB(e.rss) ]) : [];
			const dv = S.devs && S.devs.day ? sumMonitorDeviceDailyTraffic(S.devs.day, hints, S.devs.neigh, S.wifi, routerIps, S.devs.leases).slice(0, 3) : [];
			const identityMap = monitorBuildIpMacMap(hints, S.devs && S.devs.neigh, S.wifi, S.devs && S.devs.leases);
			const nm = ip => {
				const mac = identityMap[normalizeMonitorIp(ip)];
				const h = mac ? hints[mac] || hints[mac.toLowerCase()] || {} : {};
				return h.name || names[ip] || ip;
			};
			top3Box.replaceChildren(list('Programs by memory', progs), E('div', { style: 'height:12px' }), list('Devices by traffic today', dv.map(x => [ x.mac ? ((hints[x.mac] || hints[x.mac.toLowerCase()] || {}).name || x.ip) : nm(x.ip), fmtBytes(x.total) ])));
		}

		function renderDevices() {
			const dv = S.devs;
			devNote.toggleAttribute('hidden', true);
			if (!dv) {
				devBody.replaceChildren(E('tr', {}, E('td', { colspan: 5, class: 'nfm-empty' }, dv === false ? MISSING : 'Collecting data…')));
				T.devTotal.textContent = '';
				return;
			}
			const notes = [];
			if (dv.info && dv.info.acct === '0') notes.push('Byte accounting in conntrack is off, so there will be no numbers. Enable it: sysctl -w net.netfilter.nf_conntrack_acct=1 (and add net.netfilter.nf_conntrack_acct=1 to /etc/sysctl.conf).');
			if (dv.info && dv.info.offload === '1') notes.push('Flow offloading is on: offloaded connections are not counted by conntrack, so per-device numbers may be understated. This is a limitation of the counting method; there is no need to change firewall settings.');
			if (dv.info && dv.info.flow_hw === '1') notes.push('Hardware flow offloading is on: some packets are handled in hardware and may bypass the software counters. So WAN, device and app traffic may differ noticeably; Nightfall does not change this setting automatically.');
			if (notes.length) { devNote.textContent = notes.join(' '); devNote.removeAttribute('hidden'); }

			/* conntrack prints IPv6 in full form, DHCP/NDP hints in short form: compare in one form */
			const norm = normalizeMonitorIp;
			/* Keep exact DHCP identity and avoid merging clients behind proxy-ARP/repeaters. */
			const ipMac = monitorBuildIpMacMap(hints, dv.neigh || [], S.wifi, dv.leases || []);
			routerIps.learn(dv.info);

			const rows = {};
			const row = ip => {
				const mac = ipMac[norm(ip)], k = routerIps.has(ip) ? 'router' : mac || (ip.indexOf(':') >= 0 ? 'v6' : ip);
				return rows[k] || (rows[k] = { k, mac, ip, rd: 0, ru: 0, dd: 0, du: 0 });
			};
			const fresh = dv.now - dv.ts <= 60;
			if (fresh) for (const [ ip, d, u ] of dv.rate) { const r = row(ip); r.rd += trafficBytes(d); r.ru += trafficBytes(u); }
			for (const [ ip, d, u ] of dv[S.devDay] || []) { const r = row(ip); r.dd += trafficBytes(d); r.du += trafficBytes(u); if (!r.ip || r.ip.indexOf(':') >= 0) r.ip = ip; }

			const all = Object.values(rows).filter(r => r.rd + r.ru + r.dd + r.du > 0)
				.sort((a, b) => (b.dd + b.du) - (a.dd + a.du) || (b.rd + b.ru) - (a.rd + a.ru));
			S.devRows = all;
			const list = all.slice(0, 25);
			const mx = list.length ? Math.max(1, list[0].dd + list[0].du) : 1;
			let td = 0, tu = 0;
			for (const r of Object.values(rows)) { td += r.dd; tu += r.du; }
			T.devTotal.textContent = list.length ? `total ↓ ${fmtBytes(td)} · ↑ ${fmtBytes(tu)}` + (all.length > list.length ? ` · showing the ${list.length} most active of ${all.length}` : '') : '';

			const activeWifiMacs = new Set((S.wifi || []).map(c => String(c.mac || '').toUpperCase()).filter(Boolean));
			devBody.replaceChildren(...(list.length ? list.map(r => {
				const h = r.mac ? hints[r.mac] || hints[String(r.mac).toLowerCase()] || {} : {};
				const id = r.mac && r.k !== 'router' && r.k !== 'v6' ? devId(r.mac, h.name) : null;
				/* For an active station we do not use a name found only by IP:
				 * it may belong to an old lease of another MAC. */
				const ipName = r.mac && activeWifiMacs.has(String(r.mac).toUpperCase()) ? '' : names[r.ip];
				const label = r.k === 'v6' ? 'Other IPv6 addresses' : r.k === 'router' ? 'The router itself (VPN, DNS, updates)' : (h.name || ipName || (id && id.known ? (id.label || 'Device') : '') || r.ip);
				const sub = r.k === 'v6' || r.k === 'router' ? '' : ((h.ipaddrs || [])[0] || r.ip);
				return E('tr', { class: 'nfm-rowlink', tabindex: r.k === 'v6' || r.k === 'router' ? null : '0', title: r.k === 'v6' || r.k === 'router' ? null : 'Click: device card',
					click: () => { if (r.k !== 'v6' && r.k !== 'router') openDevCard(r); }, keydown: ev => { if (ev.key === 'Enter' && r.k !== 'v6' && r.k !== 'router') openDevCard(r); } }, [
					E('td', { title: id ? (id.hint ? id.hint + '\n' : '') + r.mac : '' }, [ id ? devIcon(id) : '', label, sub && sub !== label ? E('span', { class: 'nfm-chip' }, sub) : '',
						id && id.vendor ? E('span', { class: 'nfm-chip' }, id.vendor) : '', id && id.priv ? E('span', { class: 'nfm-chip priv' }, 'private MAC') : '',
						E('div', { class: 'nfm-bar nfm-bar-sm' }, E('div', { class: 'nfm-bar-fill c-down', style: `width:${100 * (r.dd + r.du) / mx}%` })) ]),
					E('td', { class: 'r' }, rateText(r.rd)), E('td', { class: 'r' }, rateText(r.ru)),
					E('td', { class: 'r' }, fmtBytes(r.dd)), E('td', { class: 'r' }, fmtBytes(r.du)) ]);
			}) : [ E('tr', {}, E('td', { colspan: 5, class: 'nfm-empty' }, 'No data yet: accounting starts after the collector starts, numbers accumulate during the day.')) ]));
		}

		/* ---- device card (on click in "Devices"): traffic, apps, signal, first seen, actions ---- */
		function openDevCard(r) {
			const mac = String(r.mac || '').toUpperCase(), ip = r.ip || '';
			const h = mac ? hints[mac] || hints[mac.toLowerCase()] || {} : {};
			/* App history is keyed by IP, so we collect all known
			 * IPv4/IPv6 addresses of the device, not just the address of the current conntrack row. */
			const deviceIps = new Set([ ip ].concat(h.ipaddrs || [], h.ip6addrs || []).filter(Boolean).map(normalizeMonitorIp));
			const id = mac ? devId(mac, h.name) : null;
			const label = (mac && devName(mac)) || names[ip] || ip || 'Device';
			const body = E('div', { class: 'nfm nfm-dc' }, E('div', { class: 'nfm-empty' }, 'Collecting data…'));
			const acts = [];
			if (mac) {
				acts.push(E('button', { class: 'btn cbi-button-negative', click: () => { if (window.confirm('Block internet access for "' + label + '"?')) fs.exec('/usr/libexec/nightfall-block', [ 'block', mac ]).then(() => { ui.hideModal(); window.alert('Access blocked. You can unblock it on the same tab under "Internet access".'); }).catch(() => window.alert('Did not work.')); } }, 'Block'));
				acts.push(E('button', { class: 'btn', title: 'Send a "magic packet" if the device supports Wake-on-LAN', click: () => fs.exec('/usr/libexec/nightfall-wol', [ 'send', mac ]).then(() => window.alert('Packet sent.')).catch(() => window.alert('Did not work.')) }, 'Wake'));
			}
			ui.showModal(label, [ body, E('div', { class: 'button-row' }, acts.concat([ E('button', { class: 'btn', click: ui.hideModal }, 'Close') ])) ]);
			const J = a => callHistory(a).catch(() => null);
			Promise.all([ J([ 'devdaily' ]), J([ 'apps' ]), mac ? J([ 'wifi', mac ]) : Promise.resolve(null), J([ 'known' ]) ]).then(([ dd, ap, wf, kn ]) => {
				/* devdaily stores the MAC at the time of recording. We add previous IPs
				 * so that app history without a MAC also lands in the card after an address change. */
				if (mac) for (const row of (dd && dd.rows) || [])
					if (String(row[4] || '').toUpperCase() === mac && row[1]) deviceIps.add(normalizeMonitorIp(row[1]));
				const ymdOf = d => d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
				const mine = (rowIp, rowMac) => monitorDeviceOwnsHistoricalRow(mac, deviceIps, rowIp, rowMac);
				const asBytes = value => { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : 0; };
				const days = {};
				for (const x of (dd && dd.rows) || []) if (mine(x[1], x[4])) days[x[0]] = (days[x[0]] || 0) + asBytes(x[2]) + asBytes(x[3]);
				const nowD = new Date(), today = ymdOf(nowD);
				days[today] = (r.dd || 0) + (r.du || 0);
				const keys = []; for (let i = 13; i >= 0; i--) keys.push(ymdOf(new Date(nowD.getTime() - i * 86400000)));
				const vals = keys.map(k => days[k] || 0), mx = Math.max(1, ...vals);
				const total30 = Object.keys(days).filter(k => k >= ymdOf(new Date(nowD.getTime() - 29 * 86400000))).reduce((a, k) => a + days[k], 0);
				const yest = days[ymdOf(new Date(nowD.getTime() - 86400000))];
				const topApps = sumMonitorDeviceApps(ap, deviceIps).slice(0, 6);
				const sig = ((wf && wf.rows) || []).filter(x => !mac || String(x[1]).toUpperCase() === mac).map(x => +x[2]).filter(v => v < 0);
				const evs = ((wf && wf.events) || []).filter(x => String(x[1]).toUpperCase() === mac).slice(-6).reverse();
				const first = ((kn && kn.rows) || []).find(x => x[0] === mac);
				const kids = [
					E('div', { class: 'nfm-note-s' }, [ ip, mac ? ' · ' + mac : '', id && id.vendor ? ' · ' + id.vendor : '', id && id.priv ? ' · private MAC' : '' ].join('')),
					E('div', { class: 'nfm-mon-sum' }, [
						E('div', {}, [ E('span', {}, 'Today'), E('b', {}, fmtBytes((r.dd || 0) + (r.du || 0))) ]),
						E('div', {}, [ E('span', {}, 'Yesterday'), E('b', {}, yest != null ? fmtBytes(yest) : '–') ]),
						E('div', {}, [ E('span', {}, 'Last 30 days'), E('b', {}, fmtBytes(total30)) ]) ]),
					E('div', { class: 'nfm-k', style: 'margin:12px 0 6px' }, 'Traffic over 14 days'),
					E('div', { class: 'nfm-dc-bars' }, vals.map((v, i) => E('i', { style: 'height:' + Math.max(2, Math.round(60 * v / mx)) + 'px', title: keys[i].slice(6) + '.' + keys[i].slice(4, 6) + ': ' + fmtBytes(v) }))) ];
				if (topApps.length) kids.push(E('div', { class: 'nfm-k', style: 'margin:12px 0 6px' }, 'What it downloads (apps)'), ...topApps.map(a => E('div', { class: 'nfm-host' }, [ E('span', {}, a[0]), E('b', {}, fmtBytes(a[1])) ])));
				if (sig.length) {
					const last = sig[sig.length - 1], avg = Math.round(sig.reduce((s, v) => s + v, 0) / sig.length);
					kids.push(E('div', { class: 'nfm-k', style: 'margin:12px 0 6px' }, 'Wi‑Fi'), E('div', { class: 'nfm-host' }, [ E('span', {}, 'Signal now'), E('b', {}, last + ' dBm') ]), E('div', { class: 'nfm-host' }, [ E('span', {}, 'Average for the period'), E('b', {}, avg + ' dBm') ]));
				}
				if (evs.length) kids.push(E('div', { class: 'nfm-k', style: 'margin:12px 0 6px' }, 'Connects and disconnects'), ...evs.map(x => E('div', { class: 'nfm-host' }, [ E('span', {}, x[2] === 'join' ? 'connected' : 'disconnected'), E('small', {}, fmtTs(x[0])) ])));
				if (first && first[2]) kids.push(E('div', { class: 'nfm-note-s', style: 'margin-top:12px' }, 'First seen: ' + fmtTs(first[2])));
				body.replaceChildren(...kids);
			});
		}

		function renderDay() {
			const D = S.day;
			if (!D || !D.h || !D.h.info || !D.h.info.started) {
				dayBody.replaceChildren(E('div', { class: 'nfm-empty' }, D ? 'The history collector is not running: no summary.' : 'Loading…'));
				return;
			}
			const hwFlow = !!(D.h && D.h.info && D.h.info.flow_hw === '1');
			const mid = new Date().setHours(0, 0, 0, 0) / 1000;
			const rows = (D.h.rows || []).filter(r => r[0] >= mid);
			const col = i => rows.map(r => Number(r[i])).filter(v => Number.isFinite(v) && v >= 0);
			const max = a => a.length ? Math.max(...a) : null, avg = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
			const sum = (list, k) => (list || []).reduce((s, x) => s + trafficBytes(x[k]), 0);
			let dd = sum(D.d && D.d.day, 1), du = sum(D.d && D.d.day, 2), yd = sum(D.d && D.d.yday, 1) + sum(D.d && D.d.yday, 2);
			/* day totals come from "Traffic by month": the best source is already chosen there (WAN port or sum over devices) */
			let ryDev = false;
			{
				const ymd = k => { const x = new Date(); x.setDate(x.getDate() - k); return String(x.getFullYear() * 10000 + (x.getMonth() + 1) * 100 + x.getDate()); };
				const rt = ((S.tr && S.tr.rows) || []).find(r => r[0] === ymd(0)), ry = ((S.tr && S.tr.rows) || []).find(r => r[0] === ymd(1));
				if (rt) { dd = rt[1]; du = rt[2]; }
				if (ry) { yd = ry[1] + ry[2]; ryDev = ry[3] === 1; }
			}
			/* the router's own traffic (proxy, VPN, updates) is counted separately so it does not pose as a device */
			routerIps.learn(D.d && D.d.info);
			let selfB = 0, cliD = 0, cliU = 0;
			for (const [ ip, d, u ] of (D.d && D.d.day) || []) { if (routerIps.has(ip)) selfB += trafficBytes(d) + trafficBytes(u); else { cliD += trafficBytes(d); cliU += trafficBytes(u); } }
			let srcNote = 'Downloaded and uploaded: from the WAN port counters.', swDev = false;
			const rtd = ((S.tr && S.tr.rows) || []).find(r => r[0] === (new Date().getFullYear() * 10000 + (new Date().getMonth() + 1) * 100 + new Date().getDate()) + '');
			if (rtd && rtd[3] === 1) {
				swDev = true;
				srcNote = 'The WAN port counters show noticeably less than passed through devices, so all traffic totals (here, in the calendar and in the period comparison) are taken from device data.' + (hwFlow ? ' Reason: hardware packet offloading is enabled on the router (Network → Firewall); it hides part of the traffic from the port counters.' : ' Likely reason: hardware packet offloading (Network → Firewall) hides traffic from the port counters.');
			}
			if (cliD + cliU > 1.5 * (dd + du) && cliD + cliU > 50e6) {
				dd = cliD; du = cliU; swDev = true;
				srcNote = 'The WAN port counters show noticeably less than passed through devices, so "Downloaded" and "Uploaded" are taken from device data.' + (hwFlow ? ' Reason: hardware packet offloading is enabled on the router (Network → Firewall); it hides part of the traffic from the port counters.' : ' Likely reason: hardware packet offloading (Network → Firewall) hides traffic from the port counters.');
			}

			let drops = 0, down = 0;
			for (const e of D.h.events || []) {
				if (e[0] < mid) continue;
				const tx = String(e[2] || '');
				if (/No internet access|Нет доступа в интернет/.test(tx) && !/Back to normal|Снова/.test(tx)) drops++;
				const m = /Back to normal: No internet access.*lasted (?:(\d+) h )?(?:(\d+) min )?(?:(\d+) s)?/.exec(tx) || /Снова в норме: Нет доступа в интернет.*длилось (?:(\d+) ч )?(?:(\d+) мин )?(?:(\d+) с)?/.exec(tx);
				if (m) down += (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
			}
			const dur = s => s >= 3600 ? Math.floor(s / 3600) + ' h ' + Math.floor(s % 3600 / 60) + ' min' : s >= 60 ? Math.floor(s / 60) + ' min' : s + ' s';
			const pk = (a, f) => a == null ? '–' : f(a);
			const tile = (k, v, s) => E('div', { class: 'nfm-tile' }, [ k, E('b', {}, v), s ? E('span', { class: 'nfm-note-s' }, s) : '' ]);

			const topAll = sumMonitorDeviceDailyTraffic(D.d && D.d.day, hints, D.d && D.d.neigh, S.wifi, routerIps, D.d && D.d.leases);
			const list = topAll.slice(0, 3);
			const mx = list.length ? list[0].total : 1;

			dayBody.replaceChildren(
				E('div', { class: 'nfm-tiles d4' }, [
					tile('Downloaded', fmtBytes(dd), 'uploaded ' + fmtBytes(du)),
					tile('Yesterday total', yd ? fmtBytes(yd) : '–', yd ? (ryDev ? 'from device data' : swDev ? 'from WAN port counters' : 'today ' + nf0.format(100 * (dd + du) / yd) + '% of yesterday') : ''),
					tile('Internet outages', String(drops), drops ? 'offline for ' + dur(down) : 'all stable'),
					tile('Average ping', pk(avg(col(7)), v => nf0.format(v) + ' ms'), pk(max(col(7)), v => 'peak ' + nf0.format(v) + ' ms')),
					tile('CPU peak', pk(max(col(1)), v => nf0.format(v) + '%'), pk(avg(col(1)), v => 'average ' + nf0.format(v) + '%')),
					tile('Temperature peak', pk(max(col(3)), v => nf1.format(v) + ' °C'), pk(avg(col(3)), v => 'average ' + nf1.format(v) + ' °C')),
					tile('Memory peak', pk(max(col(2)), v => nf0.format(v) + '%'), pk(avg(col(2)), v => 'average ' + nf0.format(v) + '%'))
				]),
				list.length ? E('div', { class: 'nfm-day-top' }, [ E('div', { class: 'nfm-k' }, 'Most traffic today' + (topAll.length > list.length ? ' · showing ' + list.length + ' of ' + topAll.length + ' devices' : '')) ].concat(list.map(row => {
					const hint = row.mac ? hints[row.mac] || hints[row.mac.toLowerCase()] || {} : {}, label = hint.name || names[row.ip] || row.ip;
					return E('div', { class: 'nfm-host' }, [ E('span', {}, [ label, label !== row.ip ? E('small', {}, row.ip) : '' ]), E('b', {}, fmtBytes(row.total)),
						E('div', { class: 'nfm-bar' }, E('div', { class: 'nfm-bar-fill c-down', style: `width:${100 * row.total / mx}%` })) ]);
				}))) : '',
				E('div', { class: 'nfm-note-s', style: 'margin-top:8px' }, srcNote + (selfB > 0 ? ' The router\'s own traffic: ' + fmtBytes(selfB) + ' (updates, DNS, speed test, proxy or VPN on the router). It is not included in the device list.' : '')));
		}

		function renderHist() {
			for (const k in rangeBtns) rangeBtns[k].classList.toggle('on', S.range === k);
			const h = S.hist, R = RANGES[S.range], win = R[1];
			const alive = !!(h && h.info && h.info.started);
			histNote.toggleAttribute('hidden', alive);
			if (!alive) histNote.textContent = h === false ? MISSING : 'The history collector is not running or has not recorded anything yet. Check on the router: /etc/init.d/nightfall-collector status; ls /tmp/nightfall';
			if (!h) { evBox.replaceChildren(E('div', { class: 'nfm-empty' }, h === false ? '' : 'Loading…')); return; }

			const end = h.now;
			const rows = (h.rows || []).filter(r => end - r[0] <= win);
			const col = i => rows.map(r => { const v = Number(r[i]); return Number.isFinite(v) && v >= 0 ? v : null; });
			const times = rows.map(r => r[0]);
			const view = { win, end, labels: xLabels(end, win) };
			const vmax = a => a.reduce((m, v) => v != null && v > m ? v : m, 0);

			const temp = col(3), tm = vmax(temp);
			const usual = i => win > 604800 ? times.map(() => null) : usualCurve(S.day && S.day.h && S.day.h.rows, times, i);
			histMain.update(times, { cpuB: usual(1), cpu: col(1), mem: col(2), temp }, { left: 100, right: tm > 90 ? Math.ceil(tm / 20) * 20 : 100 }, view);

			const gw = col(6), net = col(7);
			histPing.update(times, { netB: usual(7), gw, net }, { left: niceCeil(Math.max(vmax(net), vmax(gw), 20)) }, view);
			const rx = col(4), tx = col(5);
			histNet.update(times, { rxB: usual(4), rx, tx }, { left: niceCeil(Math.max(vmax(rx), vmax(tx), 12500)) }, view);

			const ok = net.filter(v => v != null);
			T.pAvg.textContent = ok.length ? nf0.format(ok.reduce((a, b) => a + b, 0) / ok.length) + ' ms' : '–';
			T.pMax.textContent = ok.length ? nf0.format(vmax(ok)) + ' ms' : '–';
			const lossRows = rows.filter(r => r[8] >= 0);
			T.pLoss.textContent = lossRows.length ? nf1.format(lossRows.reduce((a, r) => a + r[8], 0) / lossRows.length) + '%' : '–';
			const evs = (h.events || []).filter(e => end - e[0] <= win);
			T.pCut.textContent = String(evs.filter(e => e[1] === 'crit' && /^(No|Нет) /.test(e[2])).length);

			const list = (h.events || []).slice().reverse().slice(0, 40);
			evBox.replaceChildren(...(list.length ? list.map(e => E('div', { class: 'nfm-ev-i ' + e[1] }, [ E('i'), E('time', {}, fmtTs(e[0])), E('span', {}, e[2]) ]))
				: [ E('div', { class: 'nfm-empty' }, 'No events yet, which is good.') ]));

			const i = h.info || {};
			histInfo.textContent = rows.length < 3 ? 'Not enough data yet: the collector is accumulating points, the chart will fill in a few minutes. ' : '';
			histInfo.textContent += `Recorded every ${i.step || 15} s, the weekly history at 5 minutes, the long one (30 and 90 days) at 30 minutes` + (+i.long_n > 0 ? ` (accumulated ${nf1.format(+i.long_n / 48)} days of ${i.hist_days || 30})` : '') + '. ' +
				(i.persist === '1' ? 'History is kept across reboots. ' : 'History is kept in memory and is reset when the router reboots. ') +
				(i.limits ? 'Thresholds: ' + i.limits + '. ' : '') + 'Settings: /etc/nightfall-monitor.conf.';
		}


		/* ---------- what is using the link ---------- */
		function ipLabel(ip) {
			const map = monitorBuildIpMacMap(hints, S.devs && S.devs.neigh, S.wifi, S.devs && S.devs.leases);
			const mac = map[normalizeMonitorIp(ip)], h = mac ? hints[mac] || hints[mac.toLowerCase()] || {} : {};
			return h.name || names[ip] || ip;
		}

		function renderDns() {
			const d = S.dns;
			if (!d) { dnsBox.replaceChildren(E('div', { class: 'nfm-empty' }, d === false ? MISSING : 'Collecting data…')); return; }
			if (!d.enabled) { dnsBox.replaceChildren(E('div', { class: 'nfm-empty' }, 'The DNS query log is off. To enable: uci set dhcp.@dnsmasq[0].logqueries=1; uci commit dhcp; /etc/init.d/dnsmasq restart')); return; }
			const list = (title, rows, nm) => E('div', {}, [ E('div', { class: 'nfm-k', style: 'margin-bottom:6px' }, title) ].concat(rows.length ? rows.slice(0, 8).map(x => E('div', { class: 'nfm-host' }, [ E('span', {}, nm ? nm(x[0]) : x[0]), E('b', {}, String(x[1])) ])) : [ E('div', { class: 'nfm-empty' }, 'Nothing yet') ]));
			const who = ip => names[ip] || ip;
			dnsBox.replaceChildren(
				E('div', { class: 'nfm-note-s', style: 'grid-column:1/-1' }, 'Queries in the log: ' + d.total + ', names not found: ' + d.nx + (d.types && d.types.length ? ' · ' + d.types.slice(0, 4).map(x => x[0] + ' ' + x[1]).join(', ') : '')),
				list('Most requested', d.sites || []), list('Who is asking', d.clients || [], who), list('Not found (NXDOMAIN)', d.nxd || []));
		}

		function renderChannel() {
			const c = S.chan;
			if (!c) { chanBox.replaceChildren(E('div', { class: 'nfm-empty' }, c === false ? MISSING : 'Collecting data…')); return; }
			const fresh = c.now - c.ts <= 60;
			const srcs = Array.from(new Set((c.svc || []).map(r => r[0])));
			const want = S.chanDev || '';
			chanSel.replaceChildren(E('option', { value: '' }, 'All devices'), ...srcs.map(ip => E('option', { value: ip }, ipLabel(ip))));
			chanSel.value = srcs.includes(want) ? want : '';
			if (!srcs.includes(want)) S.chanDev = '';
			if (!fresh) { chanBox.replaceChildren(E('div', { class: 'nfm-empty' }, 'No fresh data. Byte accounting in conntrack must be enabled (see the hint above) and the collector must be running.')); return; }

			const sel = S.chanDev || '';
			const svc = {}, dst = {};
			for (const [ ip, proto, port, d, u ] of c.svc || []) {
				if (sel && ip !== sel) continue;
				const k = portLabel(proto, port), e = svc[k] || (svc[k] = { k, d: 0, u: 0 });
				e.d += trafficBytes(d); e.u += trafficBytes(u);
			}
			for (const [ ip, host, d, u ] of c.dst || []) {
				if (sel && ip !== sel) continue;
				const e = dst[host] || (dst[host] = { k: host, d: 0, u: 0 });
				e.d += trafficBytes(d); e.u += trafficBytes(u);
			}
			const list = (obj, what) => {
				const rows = Object.values(obj).filter(r => r.d + r.u > 0).sort((a, b) => (b.d + b.u) - (a.d + a.u)).slice(0, 8);
				const mx = rows.length ? rows[0].d + rows[0].u : 1;
				return E('div', {}, [ E('h4', {}, what), E('div', { class: 'nfm-lst' }, rows.length ? rows.map(r => E('div', { class: 'nfm-li' }, [
					E('span', { class: 'nm' }, r.k), E('span', { class: 'v' }, '↓ ' + rateText(r.d)), E('span', { class: 'v' }, '↑ ' + rateText(r.u)),
					E('div', { class: 'nfm-bar nfm-bar-sm bar' }, E('div', { class: 'nfm-bar-fill c-down', style: `width:${100 * (r.d + r.u) / mx}%` })) ]))
					: [ E('div', { class: 'nfm-empty' }, 'No noticeable traffic right now') ]) ]);
			};
			chanBox.replaceChildren(list(svc, 'By service and port'), list(dst, 'By internet address'));
		}

		/* ---------- Wi-Fi client: signal over time ---------- */
		function wifiDialog(mac, label, c) {
			const body = E('div', { class: 'nfm nfm-wd' }, E('div', { class: 'nfm-empty' }, 'Loading signal history…'));
			ui.showModal(label, [ body, E('div', { class: 'button-row' }, [ E('button', { class: 'btn', click: ui.hideModal }, 'Close') ]) ]);
			callHistory([ 'wifi', mac.toLowerCase() ]).then(r => {
				if (!r) { body.replaceChildren(E('div', { class: 'nfm-hint' }, MISSING)); return; }
				const rows = (r.rows || []).filter(x => +x[0] > 0).sort((a, b) => a[0] - b[0]);
				if (rows.length < 2) {
					body.replaceChildren(E('div', { class: 'nfm-hint' }, 'Signal history accumulates once a minute since the collector started (it is kept in memory only). Check back in a few minutes.' +
						((r.info && r.info.wifi_hist === '0') ? ' Wi-Fi history recording is currently off in the settings (WIFI_HIST=0).' : '')));
					return;
				}
				const t0 = rows[0][0], t1 = Math.max(r.now, rows[rows.length - 1][0]), W = 300, H = 120, lo = -95, hi = -30;
				const X = ts => (ts - t0) / Math.max(1, t1 - t0) * W, Y = v => H - (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo) * H;
				const grid = [ -40, -50, -60, -70, -80, -90 ].map(v => SVG('line', { x1: 0, x2: W, y1: Y(v), y2: Y(v), stroke: 'currentColor', 'stroke-opacity': .15, 'stroke-dasharray': '3 4', 'vector-effect': 'non-scaling-stroke' }));
				let d = '', prev = 0;
				for (const x of rows) { d += (prev && x[0] - prev <= 150 ? 'L' : 'M') + X(x[0]).toFixed(1) + ' ' + Y(+x[2]).toFixed(1); prev = x[0]; }
				const vals = rows.map(x => +x[2]), avg = vals.reduce((a, b) => a + b, 0) / vals.length;
				const svg = SVG('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none' }, grid.concat([
					SVG('path', { d, fill: 'none', stroke: 'var(--nfm-accent, #0a84ff)', 'stroke-width': 1.8, 'vector-effect': 'non-scaling-stroke', 'stroke-linejoin': 'round' }) ]));
				const tm = ts => new Date(ts * 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
				const evs = (r.events || []).slice().reverse().slice(0, 12);
				const weak = vals.filter(v => v <= -75).length / vals.length * 100;
				body.replaceChildren(
					E('div', { class: 'nfm-note-s', style: 'margin-bottom:6px' }, `${mac.toUpperCase()}${c && c.ssid ? ' · ' + c.ssid : ''} · period ${tm(t0)} — ${tm(t1)} (${fmtDur(t1 - t0)})`),
					svg,
					E('div', { class: 'nfm-note-s', style: 'display:flex;justify-content:space-between;margin:2px 0 4px' }, [ E('span', {}, tm(t0)), E('span', {}, 'now') ]),
					E('div', { class: 'nfm-note-s', style: 'margin-bottom:10px' }, 'Grid lines: −40, −50 … −90 dBm from top to bottom. Above −65 is a good signal, below −75 is weak.'),
					E('div', { class: 'nfm-tiles t4' }, [ [ 'now', vals[vals.length - 1] + ' dBm' ], [ 'average', nf0.format(avg) + ' dBm' ], [ 'best', Math.max(...vals) + ' dBm' ], [ 'worst', Math.min(...vals) + ' dBm' ] ]
						.map(([ l, v ]) => E('div', { class: 'nfm-tile' }, [ l, E('b', {}, v) ]))),
					E('div', { class: 'nfm-note-s', style: 'margin:10px 0' }, weak >= 20
						? `Weak signal (−75 dBm or lower) about ${nf0.format(weak)}% of the time: move the device closer to the router or consider a repeater.`
						: 'The signal is mostly solid.'),
					E('h4', { style: 'margin:10px 0 4px;font-size:12px;color:var(--nfm-dim)' }, 'Connects and disconnects'),
					E('div', { class: 'nfm-evlist', style: 'max-height:150px' }, evs.length ? evs.map(e => E('div', { class: 'nfm-ev-i ' + (e[2] === 'join' ? 'ok' : 'warn') }, [ E('i'), E('time', {}, fmtTs(e[0])), E('span', {}, e[2] === 'join' ? 'Connected' : 'Disconnected') ]))
						: [ E('div', { class: 'nfm-empty' }, 'No reconnects since the collector started.') ]));
			});
		}

		/* ---------- reboot and outage log ---------- */
		function renderJournal() {
			const j = S.jrn;
			if (!j) { jrnBox.replaceChildren(E('div', { class: 'nfm-empty' }, j === false ? MISSING : 'Loading…')); return; }
			const WEEK = 604800, rows = (j.rows || []).slice().sort((a, b) => b[0] - a[0]);
			const out = rows.filter(r => r[1] === 'outage' && j.now - r[0] <= WEEK);
			const sum = out.reduce((a, r) => a + r[2], 0);
			const boot = rows.find(r => r[1] === 'boot');
			T.jCnt.textContent = String(out.length);
			T.jSum.textContent = sum ? fmtDur(sum) : '0';
			T.jAv.textContent = nf2.format(Math.max(0, 100 - sum * 100 / WEEK)) + '%';
			T.jBoot.textContent = boot ? fmtTs(boot[0]) : (j.up ? fmtTs(j.now - j.up) : '–');
			const disabled = j.info && j.info.journal === '0';
			const list = rows.slice(0, 30);
			jrnBox.replaceChildren(...(list.length ? list.map(r => E('div', { class: 'nfm-jr ' + r[1] }, [
				E('span', { class: 'ic' }, r[1] === 'outage' ? '⚠' : '⟳'), E('time', {}, fmtTs(r[0])),
				E('span', {}, r[1] === 'outage' ? 'Outage: ' + r[3] : r[3]), E('b', {}, r[1] === 'outage' ? fmtDur(r[2]) : '') ]))
				: [ E('div', { class: 'nfm-empty' }, disabled ? 'The log is off (JOURNAL=0 in the settings).' : 'No records yet: the log is filled on connection outages (two failed checks in a row) and router reboots.') ]));
		}

		/* ---------- speed test ---------- */
		function startSpeed() {
			spdBtn.disabled = true; spdBtn.textContent = 'Testing…';
			S.spdRun = true; S.spdT = Date.now(); S.at.spd = 0;
			fs.exec(SPEEDBIN, [ 'start' ]).catch(err => {
				S.spdRun = false;
				ui.addNotification(null, E('p', {}, 'Could not start the test: ' + (err.message || err)), 'danger');
			});
		}

		function renderSpeed() {
			const sp = S.spd;
			if (S.spdRun && Date.now() - (S.spdT || 0) > 60000) S.spdRun = false;   /* a test takes no longer than ~15 s: do not wait beyond that */
			const running = !!(sp && sp.running) || !!S.spdRun;
			spdBtn.disabled = running; spdBtn.textContent = running ? 'Testing…' : 'Test now';
			if (!sp) { spdList.replaceChildren(E('div', { class: 'nfm-empty' }, sp === false ? MISSING : 'Loading…')); return; }
			if (sp.info && sp.info.speed_hours != null && document.activeElement !== spdSel) spdSel.value = sp.info.speed_hours;
			if (S.cfg && S.cfg.values && document.activeElement !== spdSrc) { const u = S.cfg.values.SPEED_URL || SPEED_PRESETS[0][0]; spdSrc.value = SPEED_PRESETS.some(p => p[0] === u) ? u : ''; }
			const WEEK = 604800, all = (sp.rows || []).filter(r => r[5] === 'ok' && sp.now - r[0] <= WEEK);
			const ok = all.map(r => +r[1]);
			T.sLast.textContent = ok.length ? nf1.format(ok[ok.length - 1]) + ' Mbit/s' : '–';
			T.sAvg.textContent = ok.length ? nf1.format(ok.reduce((a, b) => a + b, 0) / ok.length) + ' Mbit/s' : '–';
			T.sMax.textContent = ok.length ? nf1.format(Math.max(...ok)) + ' Mbit/s' : '–';
			T.sMin.textContent = ok.length ? nf1.format(Math.min(...ok)) + ' Mbit/s' : '–';
			const mx = ok.length ? Math.max(...ok) : 10;
			spdChart.update(all.map(r => r[0]), { mbps: ok }, { left: niceCeil(Math.max(mx, 10)) }, { win: WEEK, end: sp.now, labels: xLabels(sp.now, WEEK) });
			const last = (sp.rows || []).slice(-8).reverse();
			spdList.replaceChildren(...(last.length ? last.map(r => E('div', { class: 'nfm-li' }, [
				E('span', { class: 'nm' }, [ fmtTs(r[0]), r[5] !== 'ok' ? E('small', {}, 'could not download the file') : (+r[4] > 300 ? E('small', {}, 'other traffic was flowing at the time') : '') ]),
				E('span', { class: 'v' }, r[5] === 'ok' ? nf1.format(+r[1]) + ' Mbit/s' : '–'), E('span', { class: 'v' }, r[5] === 'ok' ? fmtBytes(+r[2]) : '') ]))
				: [ E('div', { class: 'nfm-empty' }, 'No tests yet. Press "Test now".') ]));
			spdNote.textContent = 'The router downloads a test file in several streams (each stream downloads the whole file; 4 by default, the number is set by the SPEED_STREAMS parameter in /etc/nightfall-monitor.conf) and calculates the speed itself, without the browser. This is the download speed to the selected server; the address is changed in the settings below. If other traffic is flowing at the time, the result is understated.';
		}

		/* ---------- history storage and flash wear ---------- */
		function renderFlash() {
			const i = (S.hist && S.hist.info) || (S.jrn && S.jrn.info) || (S.spd && S.spd.info) || null;
			if (!i) { flashBox.replaceChildren(E('div', { class: 'nfm-empty' }, 'Loading…')); return; }
			const hrs = +i.persist_hours || 6, kb = +i.persist_kb || 0;
			const rows = [
				[ 'Charts and events', 'in router memory (/tmp), not written to flash' ],
				[ 'Outage and reboot log', i.journal === '1' ? 'on flash, one short record per event, no more than 200 lines' : 'off' ],
				[ 'Saving across reboots', i.persist === '1' ? `to ${i.persist_dir} every ${hrs} h` + (kb ? `, up to ${nf0.format(kb)} KB at a time` : '') + ', unchanged files are skipped' : 'off, history is reset on reboot' ]
			];
			const est = i.persist === '1' && kb ? kb * 24 / hrs : 0;
			flashBox.replaceChildren(
				...(i.persist_error === '1' ? [ E('div', { class: 'nfm-hint', style: 'border-color:#e5484d' }, [
					E('b', { class: 'nfm-warn' }, 'Could not save history. '),
					'Check whether the storage is connected, the folder exists and there are write permissions. After the fix, the collector will retry saving automatically.'
				]) ] : []),
				...(i.persist_blocked === '1' ? [ E('div', { class: 'nfm-hint', style: 'border-color:#e5484d' }, [ E('b', { class: 'nfm-warn' }, 'Writing is blocked. '),
					`The folder ${i.persist_dir} is on the router's built-in flash memory, which must not be worn out. Choose a folder on a USB stick or SD card. If this is eMMC, SSD or an SD card that can be written to, set "Allow writing to internal flash memory" to 1.` ]) ] : []),
				E('div', { class: 'nfm-lst' }, rows.map(([ a, b ]) => E('div', {}, [ E('b', {}, a), E('div', { class: 'nfm-note-s' }, b) ]))),
				E('div', { class: 'nfm-note-s', style: 'margin-top:10px' }, est
					? `Estimated storage writes: about ${nf0.format(est / 1024 > 1 ? est / 1024 : est)} ${est / 1024 > 1 ? 'MB' : 'KB'} per day.`
					: 'Nothing is written to storage, flash wear is minimal. To survive reboots, set a folder on USB/SD in the settings below.'));
		}

		/* ---------- service status ---------- */
		function svcLog(name) {
			const body = E('div', { class: 'nfm-evlist', style: 'max-height:55vh;overflow:auto;min-width:min(520px,80vw)' }, E('div', { class: 'nfm-empty' }, 'Reading the log…'));
			ui.showModal('Log: ' + name, [ body, E('div', { class: 'button-row' }, [ E('button', { class: 'btn', click: ui.hideModal }, 'Close') ]) ]);
			fs.exec('/usr/libexec/nightfall-log', [ 'read', '1500' ]).then(r => {
				let j = null; try { j = JSON.parse(r.stdout); } catch (e) { /* ignore */ }
				const rows = j && j.rows ? j.rows.filter(x => x[2] === name || (x[2] || '').indexOf(name) === 0).slice(-80).reverse() : [];
				body.replaceChildren(...(rows.length ? rows.map(x => E('div', { class: 'nfm-ev-i ' + (/err|crit|alert|emerg/.test(x[1]) ? 'crit' : /warn/.test(x[1]) ? 'warn' : 'info') }, [ E('i'), E('time', {}, x[0]), E('span', {}, x[3]) ])) : [ E('div', { class: 'nfm-empty' }, 'The router log has no records for this service.') ]));
			}).catch(() => body.replaceChildren(E('div', { class: 'nfm-empty' }, 'Could not read the log.')));
		}

		function svcAction(name, action, label, danger) {
			const run = () => {
				ui.showModal(null, [ E('p', { class: 'spinning' }, label + '…') ]);
				callInitAction(name, action).then(() => window.setTimeout(() => { ui.hideModal(); S.at.svc = 0; tick(); }, 1500))
					.catch(err => { ui.hideModal(); ui.addNotification(null, E('p', {}, `Failed (${name}: ${action}): ` + (err.message || err)), 'danger'); });
			};
			if (!danger) return run();
			ui.showModal(`${label}?`, [ E('p', {}, `The "${name}" service is important for the router. The connection to the panel may drop for a few seconds.`),
				E('div', { class: 'button-row' }, [ E('button', { class: 'btn', click: ui.hideModal }, 'Cancel'), E('button', { class: 'btn cbi-button-negative important', click: () => { ui.hideModal(); run(); } }, 'Run') ]) ]);
		}

		function renderServices() {
			const sv = S.svc;
			if (!sv || !sv.init) { svcBox.replaceChildren(E('div', { class: 'nfm-empty' }, sv ? 'Service list unavailable: no permission or not supported by this LuCI version.' : 'Loading…')); svcMore.replaceChildren(); return; }
			const q = (svcFilter.value || '').trim().toLowerCase();
			const run = sv.run || {};
			const all = Object.keys(sv.init).map(n => {
				const inst = run[n] && run[n].instances ? Object.values(run[n].instances) : null;
				const known = !!run[n];
				const up = !!(inst && inst.some(i => i.running));
				return { n, en: !!sv.init[n].enabled, known, up, idx: sv.init[n].index };
			}).filter(x => !q || x.n.toLowerCase().includes(q) || (SVC_INFO[x.n] || '').toLowerCase().includes(q));
			const bad = x => x.en && x.known && !x.up;
			const proc = all.filter(x => x.known).sort((a, b) => (bad(b) - bad(a)) || (b.up - a.up) || a.n.localeCompare(b.n));
			const other = all.filter(x => !x.known).sort((a, b) => (b.en - a.en) || a.n.localeCompare(b.n));

			const row = x => {
				const prot = SVC_PROTECTED.includes(x.n);
				const st = x.known ? (x.up ? 'run' : (bad(x) ? 'bad' : 'off')) : 'off';
				const state = x.known ? (x.up ? 'running' : (x.en ? 'not running, although enabled' : 'stopped')) : (x.en ? 'enabled at boot' : 'disabled');
				return E('div', { class: 'nfm-svc ' + st }, [ E('i', { class: 'st' }),
					E('div', {}, [ E('div', { class: 'nm' }, x.n), E('div', { class: 'ds' }, [ SVC_INFO[x.n] ? SVC_INFO[x.n] + ' · ' : '', state, x.known && x.en ? ' · autostart on' : (x.known ? ' · autostart off' : '') ]) ]),
					E('div', { class: 'ac' }, [
						E('button', { class: 'nfm-mini', title: 'Recent router log records for this service', click: () => svcLog(x.n) }, 'Log'),
						E('button', { class: 'nfm-mini', click: () => svcAction(x.n, 'restart', 'Restart ' + x.n, prot) }, 'Restart'),
						x.up ? E('button', { class: 'nfm-mini', disabled: prot, title: prot ? 'Key service: stopping from here is disabled' : '', click: () => svcAction(x.n, 'stop', 'Stop ' + x.n) }, 'Stop')
							: E('button', { class: 'nfm-mini', click: () => svcAction(x.n, 'start', 'Start ' + x.n) }, 'Start'),
						E('button', { class: 'nfm-mini', disabled: prot && x.en, title: prot && x.en ? 'Key service: autostart cannot be changed' : '', click: () => svcAction(x.n, x.en ? 'disable' : 'enable', (x.en ? 'Disable autostart for ' : 'Enable autostart for ') + x.n) }, x.en ? 'Autostart: on' : 'Autostart: off') ]) ]);
			};
			svcBox.replaceChildren(...(proc.length ? proc.map(row) : [ E('div', { class: 'nfm-empty' }, q ? 'Nothing found' : 'No running services found') ]));
			svcMore.replaceChildren(other.length ? E('details', { class: 'nfm-card' }, [ E('summary', { style: 'cursor:pointer;font-weight:600;font-size:14px' }, `Scripts without a separate process (${other.length})`),
				E('div', { style: 'margin-top:8px' }, other.map(row)) ]) : '');
		}

		/* ---------- logic ---------- */
		function setPaused(p) {
			S.paused = p;
			pauseBtn.textContent = p ? 'Resume' : 'Pause';
			pill.classList.toggle('paused', p);
			pill.textContent = p ? 'paused' : `refreshes every ${INTERVAL} s`;
		}

		const show = (el, v) => el.toggleAttribute('hidden', !v);

		function cpuDelta(a, b) {
			const sum = x => x[0] + x[1] + x[2] + x[3] + x[4] + x[5] + x[6] + x[7];
			const dt = sum(b) - sum(a);
			if (dt <= 0) return null;
			const idle = (b[3] + b[4]) - (a[3] + a[4]);
			return {
				pct: 100 * (1 - idle / dt),
				apps: 100 * ((b[0] + b[1]) - (a[0] + a[1])) / dt,
				sys: 100 * (b[2] - a[2]) / dt,
				irq: 100 * ((b[5] + b[6]) - (a[5] + a[6])) / dt,
				io: 100 * (b[4] - a[4]) / dt
			};
		}

		function pickTemps(list) {
			const wifi = [], cpu = [];
			for (const [ n, v ] of list || []) {
				const c = v / 1000;
				if (!isFinite(c) || c <= 0) continue;
				(/phy|mt76|mt79|wifi|wlan|ath|iwlwifi/i.test(n) ? wifi : cpu).push([ n, c ]);
			}
			const main = cpu.find(x => /cpu|soc|core|a53|a73|thermal/i.test(x[0])) || cpu[0] || wifi[0];
			return { main: main ? main[1] : null, wifi: wifi.map(x => x[1]) };
		}

		function ingest(d) {
			const now = Date.now() / 1000;
			const prev = S.last;
			S.last = d;

			/* temperature, memory */
			const tp = pickTemps(d.temps);
			S.temps = tp;
			const memUsed = d.mem.total - d.mem.avail;

			let cpuNow = null;
			if (prev) cpuNow = cpuDelta(prev.cpu[0], d.cpu[0]);
			const cores = [];
			if (prev) for (let i = 1; i < d.cpu.length; i++) cores.push(cpuDelta(prev.cpu[i], d.cpu[i]));
			S.cores = cores;
			if (cpuNow) S.cpuNow = cpuNow;

			/* network rates */
			const dtUp = prev ? d.up - prev.up : 0;
			const rates = {};
			if (prev && dtUp > 0) {
				const pm = {};
				for (const n of prev.net) pm[n[0]] = n;
				for (const n of d.net) {
					const p = pm[n[0]];
					if (!p) continue;
					rates[n[0]] = { rx: Math.max(0, (n[1] - p[1]) / dtUp), tx: Math.max(0, (n[5] - p[5]) / dtUp) };
				}
			}
			S.rates = rates;

			if (prev && cpuNow) {
				S.times.push(now);
				S.cpu.push(cpuNow.pct);
				S.mem.push(100 * memUsed / d.mem.total);
				S.temp.push(tp.main);
				for (const n of d.net) {
					const h = S.net[n[0]] || (S.net[n[0]] = { rx: [], tx: [] });
					while (h.rx.length < S.times.length - 1) { h.rx.unshift(null); h.tx.unshift(null); }
					h.rx.push(rates[n[0]] ? rates[n[0]].rx : null);
					h.tx.push(rates[n[0]] ? rates[n[0]].tx : null);
				}
				while (S.times.length && S.times[0] < now - WINDOW) {
					S.times.shift(); S.cpu.shift(); S.mem.shift(); S.temp.shift();
					for (const n in S.net) { S.net[n].rx.shift(); S.net[n].tx.shift(); }
				}
				try {
					window.sessionStorage.setItem(STORE_KEY, JSON.stringify({ times: S.times, cpu: S.cpu, mem: S.mem, temp: S.temp, net: S.net }));
				} catch (e) {}
			}

			if (d.procs) {
				const rate = {};
				if (S.prevProcs && S.prevProcs.up < d.up) {
					const dtp = d.up - S.prevProcs.up;
					for (const p of d.procs) {
						const o = S.prevProcs.t[p[0]];
						if (o != null) rate[p[0]] = Math.max(0, (p[3] - o) / 100 / dtp * 100);
					}
				}
				S.procRate = rate;
				S.prevProcs = { up: d.up, t: Object.fromEntries(d.procs.map(p => [ p[0], p[3] ])) };
				S.full = d;
			}
		}

		function seriesMax() {
			let m = 0;
			for (const v of S.temp) if (v != null && v > m) m = v;
			return { left: 100, right: m > 90 ? Math.ceil(m / 20) * 20 : 100 };
		}

		function netMaxOf(h) {
			let m = 0;
			for (const v of h.rx.concat(h.tx)) if (v != null && v > m) m = v;
			return niceCeil(Math.max(m, 12500));  /* at least 100 kbit/s */
		}

		function groupedProcs() {
			const full = S.full;
			if (!full) return [];
			const map = {};
			for (const p of full.procs) {
				const g = groupOf(p[1]);
				const e = map[g.label] || (map[g.label] = { label: g.label, cls: g.cls, n: 0, rss: 0, cpu: 0, names: {} });
				e.n++; e.rss += p[2]; e.cpu += S.procRate[p[0]] || 0; e.names[p[1]] = 1;
			}
			return Object.values(map).filter(e => e.rss > 0 || e.cpu > 0);
		}

		function pickIface(d) {
			const names = d.net.map(n => n[0]);
			if (S.iface && names.includes(S.iface)) return S.iface;
			if (wanDev && names.includes(wanDev)) return (S.iface = wanDev);
			const prefer = names.find(n => /^(wan|eth1|pppoe|usb|lte|wwan)/.test(n)) || names.find(n => /^eth/.test(n)) || names[0];
			return (S.iface = prefer);
		}

		function ifaceTitle(n) {
			const r = devRole[n];
			const kind = /^br-|^lan/.test(n) ? 'LAN bridge' : /^(wlan|phy)/.test(n) ? 'Wi-Fi' : null;
			return [ n, r ? r.toUpperCase() : kind ];
		}

		function renderLogTools() {
			const k = S.logK || 'all', q = logQ.value.trim().toLowerCase();
			for (const b of logChips.children) b.classList.toggle('on', b.getAttribute('data-k') === k);
			const items = [];
			const h = S.hist;
			if (h && h.events) for (const e of h.events) items.push({ t: e[0], k: 'ev', cls: e[1], txt: e[2] });
			const j = S.jrn;
			if (j && j.rows) for (const r of j.rows) items.push(r[1] === 'outage' ? { t: r[0], k: 'jr', cls: 'crit', txt: 'Outage: ' + r[3] + (r[2] ? ' (' + fmtDur(r[2]) + ')' : '') } : { t: r[0], k: 'jr', cls: 'info', txt: 'Reboot: ' + r[3] });
			const bl = S.blog;
			if (bl && bl.log) for (const r of bl.log) items.push({ t: r[0], k: 'bl', cls: r[3] === 'on' ? 'warn' : 'info', txt: (r[2] || r[1]) + (r[3] === 'on' ? ': access blocked' : ': access allowed') + (r[4] ? ' · ' + r[4] : '') });
			if (!h && !j && !bl) { logBox.replaceChildren(E('div', { class: 'nfm-empty' }, 'Loading…')); return; }
			const seen = new Set();
			const since = S.logP ? Date.now() / 1000 - S.logP : 0;
			const pins = pinLoad(), pid = x => x.t + '|' + x.txt;
			const list = items.filter(x => (k === 'all' || x.k === k || (k === 'pin' && pins.includes(pid(x)))) && (k === 'pin' || x.t >= since || pins.includes(pid(x))) && (!q || x.txt.toLowerCase().includes(q)))
				.sort((a, b) => (pins.includes(pid(b)) - pins.includes(pid(a))) || b.t - a.t).filter(x => { const id = x.t + '|' + x.txt; if (seen.has(id)) return false; seen.add(id); return true; })				.slice(0, 2000);
			logShown = list;
			logBox.replaceChildren(...(list.length ? list.slice(0, 200).map(x => E('div', { class: 'nfm-ev-i ' + x.cls }, [ E('i'), E('time', {}, fmtTs(x.t)), E('span', {}, [ x.txt, E('button', { type: 'button', class: 'nfm-pin' + (pins.includes(pid(x)) ? ' on' : ''), title: pins.includes(pid(x)) ? 'Unpin' : 'Pin: the record will stay at the top', click: () => pinToggle(pid(x)) }, pins.includes(pid(x)) ? '★' : '☆') ]) ]))
				: [ E('div', { class: 'nfm-empty' }, q || k !== 'all' ? 'Nothing found. Change the filter or query.' : 'No records yet.') ]));
		}
		const SECBIN = '/usr/libexec/nightfall-sec';
		const isExternalIp = ip => !/^(10\.|127\.|0\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|(fe[89ab]|f[cd])[0-9a-f]*:|::1?$)/i.test(ip) && /^[0-9a-f:.]+$/i.test(ip);
		const secAct = (args, msg) => fs.exec(SECBIN, args).then(r => { let j = null; try { j = JSON.parse(r.stdout); } catch (e) { /* ignore */ } if (!j || !j.ok) window.alert((j && j.error) || 'Did not work.');
			S.at.sec = 0; S.at.bans = 0; })
			.catch(() => window.alert('Could not run the command on the router.'));
		const banBtn = ip => isExternalIp(ip) ? E('button', { type: 'button', class: 'nfm-btn', title: 'The router will stop accepting packets from this address for 24 hours (until the router reboots)',
			click: () => { if (window.confirm('Block address ' + ip + ' on the router for 24 hours?')) secAct([ 'ban', ip, '24' ]); } }, 'Block for 24 h') : '';
		const RISKY = { 21: 'FTP without encryption', 23: 'Telnet without encryption', 445: 'SMB', 139: 'SMB', 3389: 'remote desktop', 5900: 'VNC' };
		const routerLogLevel = x => {
			/* BusyBox crond logs a normal job dispatch at cron.err; it does not mean the job failed. */
			if (String(x[2] || '').toLowerCase() === 'crond' && /^USER\s+\S+\s+pid\s+\d+\s+cmd\s+/.test(String(x[3] || ''))) return 'notice';
			const priority = String(x[1] || '').trim().toLowerCase().split('.').pop();
			const source = String(x[2] || '') + ' ' + String(x[3] || '');
			const tagged = (source.match(/(?:^|[^a-z0-9_-])(?:[a-z0-9_.-]+)?\[(emerg|panic|alert|crit(?:ical)?|err(?:or)?|warn(?:ing)?|notice|info|debug)\]/i) || [])[1];
			const value = String(tagged || priority || '').toLowerCase();
			if (/^(emerg|panic|alert|crit|critical|err|error)$/.test(value)) return 'err';
			if (/^(warn|warning)$/.test(value)) return 'warn';
			if (value === 'notice') return 'notice';
			if (value === 'debug') return 'debug';
			if (value === 'info') return 'info';
			return 'info';
		};
		const routerLogMeta = {
			err: { cls: 'crit', tag: 'ERR', title: 'Error' },
			warn: { cls: 'warn', tag: 'WARN', title: 'Warning' },
			notice: { cls: 'notice', tag: 'NOTICE', title: 'Notice' },
			info: { cls: 'info', tag: 'INFO', title: 'Info' },
			debug: { cls: 'debug', tag: 'DEBUG', title: 'Debug' }
		};
		const routerLogDiagMeta = {
			wan: { title: 'WAN / internet', hint: 'WAN connection loss or recovery events', cls: 'crit' },
			dns: { title: 'DNS', hint: 'DNS service or configuration errors', cls: 'warn' },
			wifi: { title: 'Wi-Fi', hint: 'Frequent disconnects or client authentication errors', cls: 'warn' },
			vpn: { title: 'VPN and proxy', hint: 'Connection, route or handshake errors', cls: 'warn' },
			service: { title: 'Router services', hint: 'Restarts, crashes or out-of-memory', cls: 'crit' },
			security: { title: 'Security', hint: 'Repeated failed sign-in attempts', cls: 'warn' }
		};
		function routerLogDiagnosis(x) {
			const svc = String(x[2] || '').toLowerCase(), msg = String(x[3] || '').toLowerCase();
			const level = routerLogLevel(x);
			if (/^(netifd|udhcpc|pppd|odhcp6c)$/.test(svc) &&
				/(wan|interface|carrier|link|lease|lcp)/.test(msg) &&
				/(now down|link is down|lost carrier|no lease|lease lost|lcp terminated|failed to bring up|network unreachable|no route to host|ifdown)/.test(msg))
				return 'wan';
			if (/dnsmasq|smartdns|unbound|https-dns|stubby/.test(svc) &&
				/(no servers found|failed to create listening socket|failed to bind|cannot assign requested address|no address range available|cannot read .*resolv)/.test(msg))
				return 'dns';
			if (/^(sing-box|xray|v2ray|openvpn|wg|wireguard|tailscale|zerotier|nikki|podkop|mihomo|clash)$/.test(svc) &&
				(level === 'err' || level === 'warn') &&
				/(handshake.*timed out|timeout|connection refused|failed|error|unreachable|no route)/.test(msg))
				return 'vpn';
			if (/^(procd|kernel)$/.test(svc) &&
				/(respawn|crash|segfault|out of memory|oom-kill|killed process|process .* exited)/.test(msg))
				return 'service';
			if (/^(hostapd|wpad|wpa_supplicant)$/.test(svc) &&
				(level === 'err' || level === 'warn') &&
				/(deauth|disassoc|disconnected|authentication failed|handshake failed)/.test(msg))
				return 'wifi';
			if (/^(dropbear|luci|uhttpd)$/.test(svc) &&
				/(bad password|failed login|login attempt for nonexistent|authentication failed)/.test(msg))
				return 'security';
			return '';
		}
		function routerLogFingerprint(x) {
			const svc = String(x[2] || 'unknown').toLowerCase();
			const level = routerLogLevel(x);
			const msg = String(x[3] || '').toLowerCase().replace(/\b(pid|port|id)[=: ]+\d+\b/g, '$1=#')
				.replace(/\s+/g, ' ').trim();
			return svc + '|' + level + '|' + msg;
		}
		function groupRouterLogRows(rows) {
			if (S.rlGrouped === false) return rows.slice().reverse().map((x, i) => ({ rows: [ x ], lastIndex: rows.length - i, key: routerLogFingerprint(x) + '|' + String(x[0] || '') + '|' + String(x[3] || '') }));
			const map = new Map();
			rows.forEach((x, i) => {
				const key = routerLogFingerprint(x);
				if (!map.has(key)) map.set(key, { key, rows: [], lastIndex: i });
				const group = map.get(key);
				group.rows.push(x); group.lastIndex = i;
			});
			return Array.from(map.values()).sort((a, b) => b.lastIndex - a.lastIndex);
		}
		function setRouterLogAutoLabel() {
			rlAutoBtn.textContent = S.rlAuto === false ? 'Auto-refresh: off' : 'Auto-refresh: on';
			rlAutoBtn.classList.toggle('on', S.rlAuto !== false);
		}
		function routerLogRowText(x) {
			return [ x[0], x[1], x[2], x[3] ].map(v => String(v == null ? '' : v)).join(' ');
		}
		function copyRouterLogRows(rows) {
			const value = rows.map(routerLogRowText).join('\n');
			if (!value) { rlStatus.textContent = 'No records to copy'; return; }
			const done = () => { rlStatus.textContent = 'Copied: ' + rows.length + ' records'; };
			const fallback = () => {
				const area = document.createElement('textarea');
				area.value = value; area.setAttribute('readonly', ''); area.style.position = 'fixed'; area.style.opacity = '0';
				document.body.appendChild(area); area.select();
				let ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
				area.remove(); if (ok) done(); else rlStatus.textContent = 'Could not copy, use CSV export';
			};
			if (window.navigator && window.navigator.clipboard && window.navigator.clipboard.writeText)
				window.navigator.clipboard.writeText(value).then(done).catch(fallback);
			else fallback();
		}
		function copyRouterLog() { copyRouterLogRows(rlVisible); }
		function exportRouterLog() {
			const quote = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
			const csv = '﻿time;priority;service;message\n' + rlVisible.map(x => [ x[0], x[1], x[2], x[3] ].map(quote).join(';')).join('\n');
			const url = URL.createObjectURL(new Blob([ csv ], { type: 'text/csv;charset=utf-8' }));
			const a = E('a', { href: url, download: 'nightfall-router-log.csv' });
			document.body.appendChild(a); a.click(); a.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 30000);
			rlStatus.textContent = 'Exported: ' + rlVisible.length + ' records';
		}
		function refreshRouterLog() {
			rlStatus.textContent = 'Refreshing the log…';
			S.at.rlog = Date.now();
			fs.exec('/usr/libexec/nightfall-log', [ 'read', '800' ]).then(r => {
				const data = JSON.parse(r.stdout);
				if (!data || !data.ok || !Array.isArray(data.rows)) throw new Error('Invalid response');
				S.rlog = data; S.rlogUpdated = Date.now();
			}).catch(() => { S.rlog = null; })
				.then(() => renderRouterLog());
		}
		function renderRouterLog() {
			const R = S.rlog;
			for (const key of Object.keys(rlChipRefs))
				rlChipRefs[key].button.classList.toggle('on', key === (S.rlK || 'all'));
			setRouterLogAutoLabel();
			rlGroupBtn.textContent = S.rlGrouped === false ? 'Repeats: separate' : 'Repeats: grouped';
			rlGroupBtn.classList.toggle('on', S.rlGrouped !== false);
			if (R === undefined) { rlBox.replaceChildren(E('div', { class: 'nfm-empty' }, 'Loading the router log…')); return; }
			if (!R || !R.ok || !Array.isArray(R.rows)) {
				rlVisible = []; rlSummary.replaceChildren(); rlDiag.replaceChildren();
				rlBox.replaceChildren(E('div', { class: 'nfm-empty' }, 'Could not get the log. Log out of LuCI and sign in again after the update.'));
				rlStatus.textContent = 'No data'; rlMore.hidden = true; return;
			}
			const rows = R.rows.filter(x => Array.isArray(x) && x.length >= 4);
			const levels = rows.map(x => routerLogLevel(x));
			const counts = { all: rows.length, err: 0, warn: 0, info: 0, debug: 0 };
			rows.forEach((x, i) => { const l = levels[i]; if (l === 'err') counts.err++; else if (l === 'warn') counts.warn++; else if (l === 'debug') counts.debug++; else counts.info++; });
			const tabCounts = { all: counts.all, warn: counts.err + counts.warn, err: counts.err, info: counts.info, debug: counts.debug };
			for (const key of Object.keys(rlChipRefs)) rlChipRefs[key].count.textContent = String(tabCounts[key] || 0);
			const svcs = Array.from(new Set(rows.map(x => String(x[2] || 'unknown')))).sort((a, b) => a.localeCompare(b, 'en'));
			const currentServices = Array.from(rlSvc.options).slice(1).map(o => o.value);
			if (currentServices.join('\u0000') !== svcs.join('\u0000')) {
				const cur = rlSvc.value;
				rlSvc.replaceChildren(E('option', { value: '' }, 'All services'), ...svcs.map(v => E('option', { value: v }, v)));
				rlSvc.value = svcs.includes(cur) ? cur : '';
			}
			const diagnostics = {};
			rows.forEach(x => {
				const cat = routerLogDiagnosis(x);
				if (cat) {
					if (!diagnostics[cat]) diagnostics[cat] = [];
					diagnostics[cat].push(x);
				}
			});
			/* Wi-Fi disconnects and failed logins are noisy individually; only surface repeated bursts. */
			if (diagnostics.wifi && diagnostics.wifi.length < 5) delete diagnostics.wifi;
			if (diagnostics.security && diagnostics.security.length < 3) delete diagnostics.security;
			const diagKeys = Object.keys(diagnostics);
			rlDiag.replaceChildren(...(diagKeys.length ? [
				E('div', { class: 'nfm-log-diagnostics-head' }, [
					E('b', {}, 'Possible problems'),
					E('span', {}, 'Hints based on log patterns, not a final diagnosis')
				]),
				E('div', { class: 'nfm-log-diagnostic-list' }, diagKeys.map(cat => {
					const meta = routerLogDiagMeta[cat], items = diagnostics[cat];
					const button = E('button', { type: 'button', class: 'nfm-log-diagnostic ' + meta.cls + (S.rlDiag === cat ? ' on' : ''), click: () => { S.rlDiag = S.rlDiag === cat ? '' : cat; S.rlLimit = 300; renderRouterLog(); } }, [
						E('span', { class: 'nfm-log-diagnostic-title' }, meta.title),
						E('b', {}, String(items.length)),
						E('small', {}, meta.hint)
					]);
					return button;
				}))
			] : [ E('div', { class: 'nfm-log-diagnostics-empty' }, 'No obvious recurring problems found in the current records.') ]));
			const q = rlQ.value.trim().toLowerCase(), key = S.rlK || 'all', service = rlSvc.value;
			const filtered = rows.filter((x, i) => {
				const l = levels[i], searchable = (String(x[1]) + ' ' + String(x[2]) + ' ' + String(x[3])).toLowerCase();
				const typeMatch = key === 'all' || (key === 'err' && l === 'err') ||
					(key === 'warn' && (l === 'err' || l === 'warn')) ||
					(key === 'info' && (l === 'notice' || l === 'info')) || (key === 'debug' && l === 'debug');
				const diagMatch = !S.rlDiag || routerLogDiagnosis(x) === S.rlDiag;
				return typeMatch && diagMatch && (!service || String(x[2] || 'unknown') === service) && (!q || searchable.includes(q));
			});
			rlVisible = filtered.slice().reverse();
			const groups = groupRouterLogRows(filtered);
			const limit = Math.max(1, S.rlLimit || 300), visible = groups.slice(0, limit);
			rlSummary.replaceChildren(
				E('span', { class: 'nfm-log-count' }, [ 'In memory: ', E('b', {}, String(rows.length)) ]),
				E('span', { class: 'nfm-log-count crit' }, [ 'Errors: ', E('b', {}, String(counts.err)) ]),
				E('span', { class: 'nfm-log-count warn' }, [ 'Warnings: ', E('b', {}, String(counts.warn)) ]),
				E('span', { class: 'nfm-log-count info' }, [ 'Info: ', E('b', {}, String(counts.info)) ]),
				S.rlDiag ? E('button', { type: 'button', class: 'nfm-btn', click: () => { S.rlDiag = ''; renderRouterLog(); } }, 'Reset diagnostics') : ''
			);
			const logScrollTop = rlBox.scrollTop;
			rlBox.replaceChildren(...(visible.length ? visible.map(group => {
				const x = group.rows[group.rows.length - 1], l = routerLogLevel(x);
				const meta = routerLogMeta[l] || routerLogMeta.info, serviceName = String(x[2] || 'unknown');
				const time = String(x[0] || '').replace(/^([A-Z][a-z]{2}) (\d+) /, (m, a, d) => d + ' ' + (MONRU[a] || a) + ', ');
				const repeats = group.rows.length;
				const occurrences = repeats > 1 ? E('div', { class: 'nfm-log-occurrences' }, group.rows.slice().reverse().map(row =>
					E('div', {}, [ E('time', {}, String(row[0] || '')), E('span', {}, String(row[1] || '')), E('span', {}, String(row[3] || '')) ])
				)) : '';
				const groupKey = group.key || routerLogFingerprint(x);
				const item = E('details', { class: 'nfm-rlog-item', 'data-log-key': groupKey }, [
					E('summary', { class: 'nfm-ev-i ' + meta.cls, title: 'Expand record details' }, [
						E('i', { 'aria-hidden': 'true' }), E('time', {}, time),
						E('span', { class: 'nfm-log-line' }, [
							E('b', { class: 'nfm-log-service' }, serviceName),
							E('span', { class: 'nfm-log-level ' + meta.cls, title: meta.title }, meta.tag),
							E('span', { class: 'nfm-log-text' }, String(x[3] || '')),
							repeats > 1 ? E('span', { class: 'nfm-log-repeat' }, '× ' + repeats) : ''
						])
					]),
					E('div', { class: 'nfm-log-detail' }, [
						E('div', { class: 'nfm-log-detail-head' }, [
							E('div', { class: 'nfm-log-detail-meta' }, [
								E('span', {}, [ 'Service: ', E('b', {}, serviceName) ]),
								E('span', {}, [ 'Syslog priority: ', E('b', {}, String(x[1] || 'not specified')) ]),
								E('span', {}, [ 'Class: ', E('b', {}, meta.title) ]),
								E('span', {}, [ 'Repeats in buffer: ', E('b', {}, String(repeats)) ]),
								E('span', {}, [ 'First event: ', E('b', {}, String(group.rows[0][0] || 'not specified')) ]),
								E('span', {}, [ 'Last event: ', E('b', {}, String(x[0] || 'not specified')) ])
							]),
							E('button', { type: 'button', class: 'nfm-btn', click: ev => { ev.preventDefault(); copyRouterLogRows(group.rows); } }, repeats > 1 ? 'Copy group' : 'Copy record')
						]),
						occurrences,
						E('pre', { class: 'nfm-log-full' }, String(x[3] || ''))
					])
				]);
				item.open = !!(S.rlExpanded && S.rlExpanded[groupKey]);
				item.addEventListener('toggle', () => {
					if (!item.isConnected) return;
					if (!S.rlExpanded) S.rlExpanded = {};
					if (item.open) S.rlExpanded[groupKey] = true;
					else delete S.rlExpanded[groupKey];
				});
				return item;
			}) : [ E('div', { class: 'nfm-empty' }, 'Nothing found for the selected conditions.') ]));
			rlBox.scrollTop = logScrollTop;
			rlMore.hidden = groups.length <= visible.length;
			rlMore.firstChild.textContent = 'Show more (' + Math.min(300, groups.length - visible.length) + ' of ' + groups.length + ')';
			const updated = S.rlogUpdated ? new Date(S.rlogUpdated).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'not refreshed yet';
			rlStatus.textContent = 'Showing ' + visible.length + ' groups of ' + groups.length + ' · records ' + filtered.length + ' · updated ' + updated;
		}
		function renderSec() {
			const R = S.sec;
			if (R === undefined) return;
			if (!R || !R.ok) {
				secVerdict.className = 'nfm-hint'; secVerdict.textContent = R === false ? MISSING : 'Could not get data' + (S.secErr ? ' (' + S.secErr + ')' : '') + '. If it says "Permission denied" or "Access denied", log out of LuCI and sign in again (new permissions are needed).';
				return;
			}
			const lg = R.logins || {}, fw = R.fw || {}, ports = R.ports || [], nd = R.newdev || [];
			const fails = (lg.failed_ssh || 0) + (lg.failed_luci || 0);
			const open = ports.filter(p => p[2] === 'all');
			const week = nd.filter(d => R.now - d[2] <= 604800);
			const reds = fw.redirects || [];
			T.sFail.textContent = String(fails); T.sNew.textContent = String(week.length);
			T.sOpen.textContent = String(open.length); T.sFw.textContent = String(reds.length);
			const wanClosed = fw.wan_input === 'REJECT' || fw.wan_input === 'DROP';
			const risky = open.filter(p => RISKY[p[1]]);
			let msg, cls = 'ok';
			if (risky.length) { msg = 'Attention: port ' + risky.map(p => p[1] + ' (' + RISKY[p[1]] + ')').join(', ') + ' is open. If you do not need it, turn off the service.'; cls = 'bad'; }
			else if (fails >= 20) { msg = 'There are many failed sign-ins in the log (' + fails + '). If SSH or LuCI is reachable from the internet, close it or change the password.'; cls = 'warn'; }
			else if (!wanClosed && fw.wan_input) { msg = 'Incoming connections from the internet to the router are allowed (policy "' + fw.wan_input + '"). Normally this should be "REJECT".'; cls = 'warn'; }
			else if (reds.length) { msg = 'Ports forwarded from the internet: ' + reds.length + '. Make sure they are needed.'; cls = 'warn'; }
			else msg = 'No obvious problems: incoming from the internet is closed' + (fw.wan_input ? ' (' + fw.wan_input + ')' : '') + ', no forwarded ports.';
			const chk = R.checks || [], badChk = chk.filter(c => c[0] === 'bad');
			if (badChk.length && cls === 'ok') { msg = 'Something to fix: ' + badChk[0][1]; cls = 'bad'; }
			secVerdict.className = 'nfm-hint sec-' + cls; secVerdict.textContent = msg;
			secChecks.replaceChildren(...(chk.length ? chk.map(c => E('div', { class: 'nfm-ev-i nt ' + ({ bad: 'crit', warn: 'warn', ok: 'info' })[c[0]] }, [ E('i'), E('span', {}, c[1]) ])) : [ E('div', { class: 'nfm-empty' }, 'No data: update the theme on the router.') ]));

			const MON = { Jan: 'Jan', Feb: 'Feb', Mar: 'Mar', Apr: 'Apr', May: 'May', Jun: 'Jun', Jul: 'Jul', Aug: 'Aug', Sep: 'Sep', Oct: 'Oct', Nov: 'Nov', Dec: 'Dec' };
			const ago = t => String(t).replace(/^([A-Z][a-z]{2}) (\d+) /, (m, a, d) => d + ' ' + (MON[a] || a) + ', ');
			secLogins.replaceChildren(
				E('div', { class: 'nfm-s' }, 'Failed attempts in the log: SSH ' + (lg.failed_ssh || 0) + ', LuCI ' + (lg.failed_luci || 0) + '. The router log keeps only recent events since boot.'),
				(lg.top || []).length ? E('div', { style: 'margin:10px 0' }, [ E('div', { class: 'nfm-k' }, 'Most attempts come from'), ...(lg.top || []).map(x => E('div', { class: 'nfm-host' }, [ E('span', {}, x[0]), E('span', { style: 'display:flex;gap:10px;align-items:center' }, [ E('b', {}, String(x[1])), banBtn(x[0]) ]) ])) ]) : '',
				E('div', { class: 'nfm-evlist', style: 'margin-top:8px' }, (lg.recent || []).length ? (lg.recent || []).map(x => E('div', { class: 'nfm-ev-i ' + (x[2] ? 'info' : 'warn') }, [ E('i'), E('time', {}, ago(x[0])),
					E('span', {}, (x[1] === 'ssh' ? 'SSH' : 'LuCI') + (x[2] ? ': sign-in ' : ': failed attempt ') + x[3] + ' from ' + x[4]) ])) : [ E('div', { class: 'nfm-empty' }, 'No sign-in attempts in the log.') ]));
			secPorts.replaceChildren(
				E('div', { class: 'nfm-note-s', style: 'margin-bottom:8px' }, 'Ports the router itself listens on. "Network" means reachable from other devices; the firewall closes it from the internet' + (fw.wan_input ? ' (WAN input: ' + fw.wan_input + ')' : '') + '.'),
				E('table', { class: 'nfm-table' }, [ E('thead', {}, E('tr', {}, [ E('th', {}, 'Port'), E('th', {}, 'Program'), E('th', {}, 'Who can connect') ])),
					E('tbody', {}, ports.map(p => E('tr', {}, [ E('td', {}, p[0].toUpperCase() + ' ' + p[1]), E('td', {}, p[3] === '-' ? E('i', {}, 'unknown') : p[3]),
						E('td', {}, [ p[2] === 'all' ? 'network' : 'router only', RISKY[p[1]] ? E('span', { class: 'nfm-chip', style: 'margin-left:6px' }, RISKY[p[1]]) : '' ]) ]))) ]),
				reds.length ? E('div', { style: 'margin-top:12px' }, [ E('div', { class: 'nfm-k' }, 'Port forwarding from the internet'), ...reds.map(x => E('div', { class: 'nfm-host' }, [ E('span', {}, (x[0] || 'unnamed') + ': ' + (x[1] || 'tcp').toUpperCase() + ' ' + x[2] + ' → ' + x[3] + ':' + (x[4] || x[2])) ])) ]) : '');
			secDev.replaceChildren(...(nd.length ? nd.map(d => E('div', { class: 'nfm-host' }, [ E('span', {}, [ d[1] || 'unnamed', E('small', {}, d[0]) ]), E('b', {}, d[2] ? fmtTs(d[2]) : '') ])) : [ E('div', { class: 'nfm-empty' }, 'The collector has not seen any new devices yet.') ]));
			const BN = S.bans;
			secBans.replaceChildren(...(BN && BN.ok && (BN.bans || []).length ? [ E('div', { class: 'nfm-note-s', style: 'margin-bottom:8px' }, 'These addresses cannot reach the router itself. The block is lifted automatically when it expires or after a router reboot.'),
				...BN.bans.map(b => E('div', { class: 'nfm-host' }, [ E('span', {}, b[0]), E('span', { style: 'display:flex;gap:10px;align-items:center' }, [ E('small', {}, b[1] ? 'remaining ' + b[1] : ''), E('button', { type: 'button', class: 'nfm-btn', click: () => secAct([ 'unban', b[0] ]) }, 'Unblock') ]) ])) ]
				: [ E('div', { class: 'nfm-empty' }, BN === undefined ? 'Checking…' : 'No blocked addresses. You can block an address with the button next to the offender in "Sign-in attempts".') ]));
			const U = S.secu;
			if (U && U.ok) {
				const th = U.theme || {};
				secUpd.replaceChildren(
					E('div', { class: 'nfm-host' }, [ E('span', {}, 'Nightfall'), E('b', {}, th.installed ? 'v' + th.installed : '–') ]),
					th.latest ? E('div', { class: 'nfm-s' }, th.new ? [ 'A new version v' + th.latest + ' is out. To update: the /update command in the Telegram bot or the installer in the router terminal (install-update.sh --list shows versions).' ] : 'The latest version is installed.') : E('div', { class: 'nfm-s' }, 'Could not check for a new version (no connection to GitHub).'),
					E('div', { class: 'nfm-host' }, [ E('span', {}, 'OpenWrt'), E('b', {}, U.openwrt || '–') ]),
					E('div', { class: 'nfm-host' }, [ E('span', {}, 'Kernel'), E('b', {}, U.kernel || '–') ]),
					E('div', { class: 'nfm-note-s', style: 'margin-top:8px' }, 'Check package and firmware updates in "System → Software" and "System → Backup / Flash Firmware".'));
			} else secUpd.replaceChildren(E('div', { class: 'nfm-empty' }, U === undefined ? 'Checking…' : 'Could not get data.'));
		}
		/* "Devices": the "Internet access" card (blocking, limits, schedule, groups), the same as on "Overview" */
		let blk = null, blkTried = false;
		function renderDevBlock() {
			if (blk || blkTried) return;
			blkTried = true;
			const holder = E('div', { class: 'nfm-grid' });
			devsTab.insertBefore(holder, devsTab.firstChild);
			L.require('nightfall-overview').then(m => {
				if (!m || typeof m.blockCard !== 'function') throw new Error('no');
				blk = m.blockCard(); holder.appendChild(blk.el); blk.start();
			}).catch(() => { holder.appendChild(card('Internet access', E('div', { class: 'nfm-empty' }, 'Blocking and schedules are available on the "Overview" page (Status → Overview), "Internet access" card.'))); });
		}

		function refresh() {
			const d = S.last;
			for (const k in tabBtns) {
				tabBtns[k].classList.toggle('on', S.tab === k);
				tabBtns[k].setAttribute('aria-selected', S.tab === k);
			}
			show(overview, S.tab === 'overview'); show(net, S.tab === 'net'); show(procs, S.tab === 'procs'); show(svcs, S.tab === 'svcs'); show(hist, S.tab === 'hist');
			show(wifiTab, S.tab === 'wifi'); show(devsTab, S.tab === 'devs'); show(appsTab, S.tab === 'apps'); show(diagTab, S.tab === 'diag'); show(secTab, S.tab === 'sec'); show(logTab, S.tab === 'log');
			if (!d) return;

			T.uptime.textContent = fmtUptime(d.up);

			/* cards */
			const cn = d.cpu.length - 1;
			const c = S.cpuNow;
			rCpu.set(c ? c.pct : 0, c ? nf0.format(c.pct) + '%' : '–');
			T.cpuCores.textContent = `${cn} ${cn === 1 ? 'core' : 'cores'}`;
			T.cpuLoad.textContent = 'load ' + d.load.map(v => nf2.format(v)).join(' · ');

			const tp = S.temps;
			if (tp.main != null) {
				const cls = tp.main >= 85 ? 'hot' : tp.main >= 70 ? 'warn' : '';
				rTemp.set(tp.main, nf0.format(tp.main) + '°');
				rTemp.el.querySelector('.nfm-ring-fg').setAttribute('class', 'nfm-ring-fg c-temp ' + cls);
				T.tempMain.textContent = 'CPU ' + fmtTemp(tp.main);
				T.tempSub.textContent = tp.wifi.length ? 'Wi-Fi ' + tp.wifi.map(v => nf0.format(v) + '°').join(' / ') : 'no Wi-Fi sensors found';
			} else {
				rTemp.set(0, '–');
				T.tempMain.textContent = 'no sensor';
				T.tempSub.textContent = 'the system does not report temperature';
			}

			const m = d.mem, used = m.total - m.avail;
			rMem.set(100 * used / m.total, nf0.format(100 * used / m.total) + '%');
			T.memMain.textContent = `${fmtMB(used)} of ${fmtMB(m.total)}`;
			T.memSub.textContent = `cache ${fmtMB(m.cached + m.buffers)} · /tmp ${d.tmp ? fmtMB(d.tmp[1]) : '–'}`;

			if (d.flash) {
				rFlash.set(100 * d.flash[1] / d.flash[0], nf0.format(100 * d.flash[1] / d.flash[0]) + '%');
				T.flashMain.textContent = `${fmtMB(d.flash[1])} of ${fmtMB(d.flash[0])}`;
				T.flashSub.textContent = `Free: ${fmtMB(d.flash[0] - d.flash[1])}`;
				T.flashTotal.textContent = fmtMB(d.flash[0]);
				T.flashFree.textContent = fmtMB(d.flash[0] - d.flash[1]);
			}

			/* charts */
			const dataMain = { cpu: S.cpu, mem: S.mem, temp: S.temp };
			mainChart.update(S.times, dataMain, seriesMax());

			/* cores */
			while (coreRefs.length < S.cores.length) {
				const i = coreRefs.length;
				const fill = E('div', { class: 'nfm-bar-fill c-cpu' }), val = E('b', {}, '–');
				coresBox.appendChild(E('div', { class: 'nfm-core' }, [
					E('div', { class: 'nfm-core-h' }, [ E('span', {}, `Core ${i + 1}`), val ]), E('div', { class: 'nfm-bar' }, fill) ]));
				coreRefs.push({ fill, val });
			}
			S.cores.forEach((v, i) => {
				if (!v) return;
				coreRefs[i].fill.style.width = Math.max(0, Math.min(100, v.pct)) + '%';
				coreRefs[i].val.textContent = nf0.format(v.pct) + '%';
			});
			if (c) {
				tileRefs.apps.textContent = nf0.format(c.apps) + '%';
				tileRefs.sys.textContent = nf0.format(c.sys) + '%';
				tileRefs.irq.textContent = nf1.format(c.irq) + '%';
				tileRefs.io.textContent = nf1.format(c.io) + '%';
			}

			/* network */
			const ifn = pickIface(d);
			T.netIface.textContent = ifn || '–';
			const rt = (S.rates || {})[ifn] || { rx: 0, tx: 0 };
			const cur = d.net.find(n => n[0] === ifn);
			const h = S.net[ifn] || { rx: [], tx: [] };
			const hm = netMaxOf(h);
			netMini.update(S.times, h, { left: hm });
			sparkDown.update(S.times, h.rx, hm); sparkUp.update(S.times, h.tx, hm);
			const dr = fmtRate(rt.rx), ur = fmtRate(rt.tx);
			T.dlN.textContent = dr[0]; T.dlU.textContent = dr[1]; T.ulN.textContent = ur[0]; T.ulU.textContent = ur[1];
			T.ctMini.textContent = `${nf0.format(d.ct[0])}${d.ct[1] ? ' of ' + nf0.format(d.ct[1]) : ''}`;
			if (S.tab === 'overview') renderTop3();
			updVerdict();

			if (S.tab === 'net') {
				T.nDlN.textContent = dr[0]; T.nDlU.textContent = dr[1]; T.nUlN.textContent = ur[0]; T.nUlU.textContent = ur[1];
				T.nDlTot.textContent = cur ? fmtBytes(cur[1]) : '–'; T.nUlTot.textContent = cur ? fmtBytes(cur[5]) : '–';
				T.ctN.textContent = nf0.format(d.ct[0]); T.ctMax.textContent = d.ct[1] ? 'of ' + nf0.format(d.ct[1]) : '';
				T.ctBar.style.width = d.ct[1] ? Math.min(100, 100 * d.ct[0] / d.ct[1]) + '%' : '0';
				const pr = S.full ? S.full.ctp : null;
				T.ctProto.textContent = pr ? `TCP ${nf0.format(pr[0])} · UDP ${nf0.format(pr[1])} · other ${nf0.format(pr[2])}` : 'details unavailable';

				if (netSel.options.length !== d.net.length)
					netSel.replaceChildren(...d.net.map(n => { const o = ifaceTitle(n[0]); return E('option', { value: n[0] }, o[1] ? `${o[0]} (${o[1]})` : o[0]); }));
				netSel.value = ifn;
				netBig.update(S.times, h, { left: hm });

				ifBody.replaceChildren(...d.net.map(n => {
					const r = (S.rates || {})[n[0]] || { rx: 0, tx: 0 }, o = ifaceTitle(n[0]);
					return E('tr', {}, [ E('td', {}, [ n[0], o[1] ? E('span', { class: 'nfm-chip' }, o[1]) : '' ]),
						E('td', { class: 'r' }, rateText(r.rx)), E('td', { class: 'r' }, rateText(r.tx)),
						E('td', { class: 'r' }, fmtBytes(n[1])), E('td', { class: 'r' }, fmtBytes(n[5])),
						E('td', { class: 'r' }, nf0.format(n[3] + n[4] + n[7] + n[8])) ]);
				}));

				if (S.full && S.full.cth) {
					const top = S.full.cth, mx = top.length ? top[0][1] : 1;
					hostsBox.replaceChildren(...(top.length ? top.map(([ ip, n ]) => E('div', { class: 'nfm-host' }, [
						E('span', {}, [ names[ip] || ip, names[ip] ? E('small', {}, ip) : '' ]), E('b', {}, nf0.format(n)),
						E('div', { class: 'nfm-bar' }, E('div', { class: 'nfm-bar-fill c-cpu', style: `width:${100 * n / mx}%` })) ]))
						: [ E('div', { class: 'nfm-empty' }, 'No active connections') ]));
				} else {
					hostsBox.replaceChildren(E('div', { class: 'nfm-empty' }, S.full ? 'Connection table unavailable (nf_conntrack required).' : 'Collecting data…'));
				}
			}

			renderAlerts();
			if (onTab('net', 'devs')) renderDevices();
			if (S.tab === 'devs') renderDevExtra();
			if (S.tab === 'procs') renderProcMem();
			if (S.tab === 'apps') renderAppTraffic();
			if (S.tab === 'net') { renderChannel(); renderDns(); renderExtIp(); }
			if (S.tab === 'svcs') renderServices();
			if (S.tab === 'hist') { renderHist(); renderDay(); renderHeat(); renderWeek(); renderCmp(); renderMon(); renderWq(); renderWHeat(); renderAir(); renderJournal(); renderSpeed(); renderFlash(); }
			if (S.tab === 'wifi') { renderWq(); renderWHeat(); renderAir(); renderWifiExtra(); }
			if (S.tab === 'log') { renderHist(); renderJournal(); renderLogTools(); renderRouterLog(); }
			if (S.tab === 'diag') renderSpeed();
			if (S.tab === 'sec') renderSec();
			if (S.tab === 'devs') renderDevBlock();

			/* overheating banner */
			const hot = hotInfo();
			hotBox.toggleAttribute('hidden', !hot || tempAlertOn());
			if (hot) {
				hotBox.classList.toggle('danger', hot.crit);
				hotBox.classList.toggle('warning', !hot.crit);
				hotBox.firstChild.textContent = hot.crit ? 'Critical CPU overheating' : 'CPU is overheating';
				hotBox.lastChild.textContent = `Temperature ${fmtTemp(hot.temp)} has stayed above ${HOT_WARN} °C for more than ${Math.max(1, Math.round(hot.dur / 60))} min. Check ventilation and do not cover the router.`;
			}

			/* wifi clients */
			T.wifiMini.textContent = S.wifi ? nf0.format(wifiDisplayRows().length) : '–';
			if (onTab('net', 'wifi')) {
				const rows = wifiDisplayRows().slice().sort((a, b) => (b.signal || -999) - (a.signal || -999)).map(c => {
					const mac = (c.mac || '').toUpperCase(), h = hints[mac] || hints[mac.toLowerCase()] || {};
					const deviceName = c.displayName || (!c.proxyStation ? h.name : '') || (!c.proxyStation ? (h.ipaddrs || [])[0] : '') || (!c.proxyStation ? c.ip : '') || mac;
					const lvl = c.proxy ? 0 : c.signal >= -55 ? 4 : c.signal >= -65 ? 3 : c.signal >= -75 ? 2 : 1;
					const link = x => x && x.rate ? nf0.format(x.rate / 1000) + ' Mbit/s' : '–';
					return E('tr', { class: 'nfm-click', title: 'Show signal over time', click: () => { if (!c.proxy) wifiDialog(mac, deviceName, c); } }, [
						E('td', {}, [ deviceName, (c.displayName || (!c.proxyStation && h.name)) ? E('span', { class: 'nfm-chip' }, mac) : '' ]),
						E('td', {}, [ c.ssid, c.proxy ? E('span', { class: 'nfm-chip' }, 'behind an access point') : c.proxyStation ? E('span', { class: 'nfm-chip' }, 'access point / bridge') : c.band ? E('span', { class: 'nfm-chip' }, BANDS[c.band] || c.band) : '' ]),
						E('td', {}, c.proxy ? '—' : [ E('span', { class: 'nfm-sig' + (lvl <= 2 ? ' weak' : '') }, [ 1, 2, 3, 4 ].map(n => E('i', { class: n <= lvl ? 'on' : '' }))), `${c.signal} dBm` ]),
						E('td', { class: 'r' }, c.proxy ? '—' : link(c.tx)), E('td', { class: 'r' }, c.proxy ? '—' : link(c.rx)),
						E('td', { class: 'r' }, c.proxy ? ((c.proxyState === 'REACHABLE' || c.proxyState === 'DELAY' || c.proxyState === 'PROBE') ? 'via repeater · reachable' : 'via repeater · unconfirmed') : c.connected_time != null ? fmtDur(c.connected_time) : '–') ]);
				});
				wifiBody.replaceChildren(...(rows.length ? rows : [ E('tr', {}, E('td', { colspan: 6, class: 'nfm-empty' },
					S.wifi ? 'No Wi-Fi clients connected' : 'Wi-Fi data unavailable' + (wifiErr ? ' (' + wifiErr + ')' : ''))) ]));
			}

			/* memory by program */
			if (S.full) {
				const f = S.full, g = groupedProcs().sort((a, b) => b.rss - a.rss);
				const top = g.slice(0, 6), rest = g.slice(6);
				const restRss = rest.reduce((s, e) => s + e.rss, 0);
				const sumRss = g.reduce((s, e) => s + e.rss, 0);
				const kernel = Math.max(0, f.mem.total - f.mem.free - sumRss);
				const items = top.map(e => ({ label: e.label, cls: e.cls, kb: e.rss }));
				if (restRss > 0) items.push({ label: 'Other programs', cls: 'gx', kb: restRss });
				items.push({ label: 'Kernel, buffers and /tmp', cls: 'hatch', kb: kernel });
				items.push({ label: 'Free', cls: 'free', kb: f.mem.free });
				memStack.replaceChildren(...items.map(i => E('div', { class: 'nfm-seg ' + i.cls, title: `${i.label}: ${fmtMB(i.kb)}`, style: `flex:${i.kb} 1 0` })));
				memLegend.replaceChildren(...items.map(i => E('span', { class: 'nfm-leg' }, [
					E('i', { class: 'nfm-dot ' + (i.cls === 'hatch' || i.cls === 'free' ? '' : i.cls), style: i.cls === 'hatch' ? 'background:repeating-linear-gradient(135deg,var(--nfm-border) 0 2px,transparent 2px 4px);border:1px solid var(--nfm-border)'
						: i.cls === 'free' ? 'background:var(--nfm-card2);border:1px solid var(--nfm-border)' : '' }),
					`${i.label} · ${fmtMB(i.kb)}` ])));
			}

			if (S.tab === 'procs' && S.full) {
				let g = groupedProcs();
				if (S.filter) g = g.filter(e => e.label.toLowerCase().includes(S.filter) || Object.keys(e.names).some(n => n.toLowerCase().includes(S.filter)));
				g.sort((a, b) => S.sort === 'cpu' ? (b.cpu - a.cpu || b.rss - a.rss) : (b.rss - a.rss));
				procBody.replaceChildren(...g.map(e => E('tr', {}, [
					E('td', {}, [ E('i', { class: 'nfm-dot ' + e.cls, style: 'margin-right:8px;vertical-align:middle' }), e.label,
						Object.keys(e.names).length > 1 || Object.keys(e.names)[0] !== e.label ? E('span', { class: 'nfm-chip' }, Object.keys(e.names).slice(0, 3).join(', ') + (Object.keys(e.names).length > 3 ? '…' : '')) : '' ]),
					E('td', { class: 'r' }, String(e.n)), E('td', { class: 'r' }, nf1.format(e.cpu) + '%'), E('td', { class: 'r' }, fmtMB(e.rss)) ])));
			}
		}

		const self = this;
		function tick() {
			if (S.paused) return Promise.resolve();
			const wantFull = S.tick++ % FULL_EVERY === 0 || (S.tab !== 'overview' && !S.full);
			const extras = fetchExtras();
			return Promise.all([ fs.exec(STATS, wantFull ? [ 'full' ] : []), wantFull ? fetchWifi() : Promise.resolve(undefined), extras ]).then(([ res, wifi ]) => {
				if (wifi !== undefined) S.wifi = wifi;
				let d = null;
				try { d = JSON.parse(res.stdout); } catch (e) {}
				if (!d) throw new Error(res.stderr || 'no data');
				ingest(d);
				if (!S.paused && pill.classList.contains('paused')) pill.classList.remove('paused');
				if (!S.paused) pill.textContent = `refreshes every ${INTERVAL} s`;
				refresh();
			}).catch(err => {
				pill.textContent = 'no data: ' + (err.message || err);
				pill.classList.add('paused');
			});
		}

		refresh();
		tick();
		poll.add(tick, INTERVAL);
		self._state = S;
		return root;
	}
});
