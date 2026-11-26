'use strict';
'require baseclass';
'require fs';
'require rpc';
'require nightfall-qr as NfQr';

/*
 * Nightfall: Status → Overview extras.
 *  - a strip of live tiles with mini graphs (internet, WAN speed, CPU, temperature, memory);
 *  - cards sorted by priority, can be dragged (or moved with ↑ ↓ on the grip) and remembered per browser;
 *  - coloured status badges for Wi-Fi signal and port link state.
 * Data comes from /usr/libexec/nightfall-stats and /usr/libexec/nightfall-history (Nightfall monitor package).
 */

const STATS = '/usr/libexec/nightfall-stats';
const HIST = '/usr/libexec/nightfall-history';
const APPSBIN = '/usr/libexec/nightfall-apps';
const ORDER_KEY = 'nightfall-overview-order-v1';
const SIZE_KEY = 'nightfall-overview-size-v1';
const HEIGHT_KEY = 'nightfall-overview-h-v1';
const PORT_LABEL_KEY = 'nightfall-port-labels-v1';
function portLabelsLoad() {
	try { return JSON.parse(localStorage.getItem(PORT_LABEL_KEY) || '{}') || {}; }
	catch (e) { return {}; }
}
function portLabelsSave(v) {
	try { localStorage.setItem(PORT_LABEL_KEY, JSON.stringify(v)); return true; }
	catch (e) { return false; }
}
const WIN = 600;            /* seconds shown in mini graphs */
const EVERY = 3000;         /* ms between samples */
const ALERTS_EVERY = 5;     /* ping / alerts every N samples */

const callIfaces = rpc.declare({ object: 'network.interface', method: 'dump' });
const callHints = rpc.declare({ object: 'luci-rpc', method: 'getHostHints', expect: { '': {} } });
const callWireless = rpc.declare({ object: 'network.wireless', method: 'status', expect: { '': {} } });
const callIwDevs = rpc.declare({ object: 'iwinfo', method: 'devices', expect: { devices: [] } });
const callIwInfo = rpc.declare({ object: 'iwinfo', method: 'info', params: [ 'device' ] });
const callAssoc = rpc.declare({ object: 'iwinfo', method: 'assoclist', params: [ 'device' ], expect: { results: [] } });
const callUci = rpc.declare({ object: 'uci', method: 'get', params: [ 'config' ], expect: { values: {} } });
const callReboot = rpc.declare({ object: 'system', method: 'reboot' });
const callBoard = rpc.declare({ object: 'system', method: 'board' });

/* shared live numbers (filled by the live strip, read by the health card) */
const SHARED = { mode: null, t: null, cpu: null, mem: null, temp: null, online: null, ping: null, loss: null };
let DRAG = false;           /* true while a card is being dragged: the DOM observer must not re-sort */

const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });

/* card priority: lower goes first; unknown cards keep their order after the known ones */
const PRIORITY = [
	/Интернет|Internet/i, /^(Сеть|Network)$/i, /порт|Port/i, /Беспровод|Wireless|Wi-?Fi/i, /Top clients/i, /App traffic/i, /Internet access/,
	/Router health/, /\bnow$/, /Event feed/, /Quick actions/,
	/^(Система|System)$/i, /Температур|Temperature/i, /Память|Memory/i, /Хранилищ|Storage/i, /DHCP|Аренд/i, /DSL/i
];

function fmtRate(bps) {
	const bits = bps * 8;
	if (bits >= 1e9) return [ nf2.format(bits / 1e9), 'Gbit/s' ];
	if (bits >= 1e6) return [ (bits >= 1e8 ? nf0 : nf1).format(bits / 1e6), 'Mbit/s' ];
	if (bits >= 1e3) return [ nf0.format(bits / 1e3), 'Kbit/s' ];
	return [ nf0.format(bits), 'bit/s' ];
}

function niceCeil(v) {
	if (v <= 0) return 1;
	const p = Math.pow(10, Math.floor(Math.log10(v)));
	for (const m of [ 1, 2, 2.5, 5, 10 ])
		if (v <= m * p) return m * p;
	return 10 * p;
}

function SVG(tag, attrs, children) {
	const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
	for (const k in attrs || {})
		el.setAttribute(k, attrs[k]);
	for (const c of [].concat(children || []))
		if (c != null) el.appendChild(c);
	return el;
}


/* chart style from the theme settings (Personalization → Charts): area, line, bars, steps; smoothing */
function nfPlot(segs, H) {
	const root = document.documentElement, kind = root.getAttribute('data-nf-chart') || 'area', smooth = root.getAttribute('data-nf-chart-smooth') !== 'off';
	const f = n => n.toFixed(1);
	let line = '', area = '';
	segs.forEach(p => {
		if (!p.length) return;
		let d = 'M' + f(p[0][0]) + ' ' + f(p[0][1]);
		if (kind === 'bars') {   /* bars: vertical strokes in the series color (no fill) */
			p.forEach(q => { line += 'M' + f(q[0]) + ' ' + f(q[1]) + 'V' + H; });
			return;
		}
		if (kind === 'step') {
			for (let i = 1; i < p.length; i++) d += 'L' + f(p[i][0]) + ' ' + f(p[i - 1][1]) + 'L' + f(p[i][0]) + ' ' + f(p[i][1]);
		}
		else if (smooth && p.length > 2) {
			/* monotone cubic curve: never overshoots the data and does not loop where points are unevenly spaced (gaps in history) */
			const n = p.length, dx = [], m = [], t = [];
			for (let i = 0; i < n - 1; i++) { dx[i] = p[i + 1][0] - p[i][0]; m[i] = dx[i] > 0 ? (p[i + 1][1] - p[i][1]) / dx[i] : 0; }
			t[0] = m[0]; t[n - 1] = m[n - 2];
			for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
			for (let i = 0; i < n - 1; i++) {
				if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
				const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
				if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
			}
			for (let i = 0; i < n - 1; i++) {
				const h = dx[i] / 3, b = p[i], c = p[i + 1];
				d += 'C' + f(b[0] + h) + ' ' + f(Math.max(0, Math.min(H, b[1] + t[i] * h))) + ' ' + f(c[0] - h) + ' ' + f(Math.max(0, Math.min(H, c[1] - t[i + 1] * h))) + ' ' + f(c[0]) + ' ' + f(c[1]);
			}
		}
		else for (let i = 1; i < p.length; i++) d += 'L' + f(p[i][0]) + ' ' + f(p[i][1]);
		line += d;
		if (kind !== 'line') area += d + 'L' + f(p[p.length - 1][0]) + ' ' + H + 'L' + f(p[0][0]) + ' ' + H + 'Z';
	});
	return { line, area };
}

/* time based mini graph; classes[i] is the colour class of series i */
let sparkSeq = 0;
function spark(classes, winSec) {
	const W = 100, H = 34, win = winSec || WIN;
	const uid = 'nfg' + (++sparkSeq) + '_';
	/* fill under the line: a smooth gradient from the line down, no solid rectangle */
	const grads = classes.map((c, i) => SVG('linearGradient', { id: uid + i, x1: 0, y1: 0, x2: 0, y2: 1, class: c }, [
		SVG('stop', { offset: 0, 'stop-color': 'currentColor', 'stop-opacity': .26 }),
		SVG('stop', { offset: .55, 'stop-color': 'currentColor', 'stop-opacity': 0 }),
		SVG('stop', { offset: 1, 'stop-color': 'currentColor', 'stop-opacity': 0 })
	]));
	const parts = classes.map((c, i) => ({
		area: SVG('path', { class: 'a ' + c, style: `fill:url(#${uid + i});opacity:1` }),
		line: SVG('path', { class: 'l ' + c, pathLength: 1 }),
		glint: SVG('path', { class: 's ' + c })
	}));
	const el = SVG('svg', { class: 'nf-spark', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none' },
		[ SVG('defs', {}, grads) ].concat(parts.reduce((a, p) => a.concat([ p.area, p.line, p.glint ]), [])));

	return {
		el,
		update(times, arrays, max, min) {
			const now = times.length ? times[times.length - 1] : 0, lo = min || 0, span = (max - lo) || 1;
			parts.forEach((p, i) => {
				const vals = arrays[i] || [];
				const pts = [];
				for (let k = 0; k < times.length; k++) {
					if (vals[k] == null || now - times[k] > win) continue;
					pts.push([ W - (now - times[k]) / win * W, H - 2 - Math.max(0, Math.min(1, (vals[k] - lo) / span)) * (H - 4) ]);
				}
				const pl = nfPlot([ pts ], H);
				p.line.setAttribute('d', pl.line);
				p.glint.setAttribute('d', pl.line);
				p.area.setAttribute('d', classes.length === 1 ? pl.area : '');
			});
		}
	};
}

function badge(kind, text) {
	return E('span', { class: 'nf-badge ' + kind }, text);
}

/* ---------- tile details: a dialog with a longer history chart ---------- */

const DETAIL = {
	net: { title: 'Internet', cols: [ [ 7, 'Internet', 'nf-c-down' ], [ 6, 'To gateway', 'nf-c-up' ] ], fmt: v => nf0.format(v) + ' ms', ceil: v => niceCeil(Math.max(20, v)) },
	wan: { title: 'WAN traffic', cols: [ [ 4, 'Download', 'nf-c-down' ], [ 5, 'Upload', 'nf-c-up' ] ], fmt: v => fmtRate(v).join(' '), ceil: v => niceCeil(Math.max(12500, v)) },
	cpu: { title: 'CPU', cols: [ [ 1, 'Load', 'nf-c-cpu' ] ], fmt: v => nf0.format(v) + '%', ceil: () => 100 },
	temp: { title: 'Temperature', cols: [ [ 3, 'CPU', 'nf-c-temp' ] ], fmt: v => nf1.format(v) + ' °C', ceil: v => Math.max(100, niceCeil(v)), floor: 30 },
	mem: { title: 'Memory', cols: [ [ 2, 'Used', 'nf-c-mem' ] ], fmt: v => nf0.format(v) + '%', ceil: () => 100 },
	ct: { title: 'Connections', cols: [ [ 9, 'Connections', 'nf-c-mem' ] ], fmt: v => nf0.format(v), ceil: v => niceCeil(Math.max(50, v)) },
	loss: { title: 'Packet loss', icon: 'net', cols: [ [ 8, 'Loss', 'nf-c-temp' ] ], fmt: v => nf1.format(v) + '%', ceil: v => niceCeil(Math.max(5, v)) },
	/* Wi‑Fi signal: average and worst across all clients; hour, day and week from "wifi", month and longer from hourly "wifi-hr" */
	sig: { title: 'Wi‑Fi signal', icon: 'wifi', neg: true, cols: [ [ 1, 'Average', 'nf-c-down' ], [ 2, 'Worst', 'nf-c-up' ] ], fmt: v => nf0.format(v) + ' dBm', ceil: () => -30, floor: -95,
		load: range => fs.exec(HIST, [ range === 'm' || range === 'q' ? 'wifi-hr' : 'wifi' ]).then(res => {
			const h = JSON.parse(res.stdout), step = range === 'm' || range === 'q' ? 3600 : 60, g = new Map();
			for (const r of h.rows || []) {
				const v = +r[2]; if (!isFinite(v) || v >= 0 || v < -120) continue;
				const t = Math.round(r[0] / step) * step, e = g.get(t) || [ 0, 0, 0 ];
				e[0] += v; e[1]++; e[2] = e[1] === 1 ? v : Math.min(e[2], v); g.set(t, e);
			}
			return { now: h.now, info: h.info, rows: Array.from(g.entries()).sort((a, b) => a[0] - b[0]).map(([ t, e ]) => [ t, e[0] / e[1], e[2] ]) };
		})
	}
};
const INFO = { up: 1, cli: 1, day: 1, stor: 1 };
const DRANGE = { h: [ 'fine', 3600, 'Hour' ], d: [ 'coarse', 86400, 'Day' ], w: [ 'coarse', 604800, 'Week' ], m: [ 'long', 2592000, 'Month' ], q: [ 'long', 7776000, '3 months' ] };

function openDetail(key, from) {
	if (INFO[key] && !document.querySelector('.nf-dlg-bg')) return openInfo(key, from);
	const cfg = DETAIL[key];
	if (!cfg || document.querySelector('.nf-dlg-bg')) return;
	const two = v => String(v).padStart(2, '0');
	const clock = (ts, long) => { const d = new Date(ts * 1000); return (long ? two(d.getDate()) + '.' + two(d.getMonth() + 1) + ' ' : '') + two(d.getHours()) + ':' + two(d.getMinutes()); };
	let range = 'h', data = null;

	const W = 600, H = 220;
	const svg = SVG('svg', { class: 'nf-dchart', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none' });
	const xl = E('div', { class: 'nf-dx' });
	const tip = E('div', { class: 'nf-dtip', hidden: '' });
	const wrap = E('div', { class: 'nf-dplot' }, [ svg, tip ]);
	const stats = E('div', { class: 'nf-dstats' });
	const note = E('div', { class: 'nf-dnote' });
	const tabs = {};
	const seg = E('div', { class: 'nf-dseg', role: 'tablist' }, Object.keys(DRANGE).map(k =>
		tabs[k] = E('button', { type: 'button', click: () => { range = k; load(); } }, DRANGE[k][2])));
	const legend = E('div', { class: 'nf-dleg' }, cfg.cols.map(x => E('span', {}, [ E('i', { class: x[2] }), x[1] ])));

	const bg = E('div', { class: 'nf-dlg-bg' });
	const close = () => { document.removeEventListener('keydown', onKey); bg.classList.remove('on'); window.setTimeout(() => { bg.remove(); if (from && from.focus) from.focus(); }, 200); };
	const onKey = ev => { if (ev.key === 'Escape') close(); };
	const dlg = E('div', { class: 'nf-dlg', role: 'dialog', 'aria-modal': 'true', 'aria-label': cfg.title }, [
		E('div', { class: 'nf-dlg-h' }, [ E('h4', {}, [ E('i', { class: 'nf-ci', 'data-i': cfg.icon || (key === 'wan' || key === 'net' ? 'net' : key === 'cpu' ? 'system' : key) }), cfg.title ]), seg,
			E('button', { type: 'button', class: 'nf-dlg-x', 'aria-label': 'Close', click: close }, '×') ]),
		stats, legend, wrap, xl, note ]);
	bg.appendChild(dlg);
	bg.addEventListener('mousedown', ev => { if (ev.target === bg) close(); });
	document.addEventListener('keydown', onKey);
	document.body.appendChild(bg);
	window.requestAnimationFrame(() => bg.classList.add('on'));
	const closeBtn = dlg.querySelector('.nf-dlg-x'); closeBtn.focus();

	function draw() {
		const R = DRANGE[range];
		Object.keys(tabs).forEach(k => tabs[k].setAttribute('aria-pressed', String(k === range)));
		svg.replaceChildren(); xl.replaceChildren(); tip.hidden = true;
		if (!data || !data.rows) { note.textContent = data === false ? 'The history collector is not running: no chart.' : 'Loading…'; stats.replaceChildren(); return; }
		const end = data.now, win = R[1];
		const rows = data.rows.filter(r => end - r[0] <= win);
		if (rows.length < 2) { note.textContent = 'Not enough data for this period yet.'; stats.replaceChildren(); return; }
		note.textContent = '';
		const series = cfg.cols.map(x => rows.map(r => r[x[0]] != null && (cfg.neg ? isFinite(r[x[0]]) : r[x[0]] >= 0) ? r[x[0]] : null));
		const all = [].concat(...series).filter(v => v != null);
		const hi = cfg.ceil(all.length ? Math.max(...all) : 1), lo = cfg.floor || 0, span = (hi - lo) || 1;
		const t0 = end - win;
		const X = t => (t - t0) / win * W, Y = v => H - 4 - Math.max(0, Math.min(1, (v - lo) / span)) * (H - 10);
		for (let i = 0; i <= 4; i++) svg.appendChild(SVG('line', { class: 'g', x1: 0, x2: W, y1: Y(lo + span * i / 4), y2: Y(lo + span * i / 4) }));
		series.forEach((vals, si) => {
			let d = '', ad = '', fx = 0, lx = 0, open = false;
			rows.forEach((r, k) => {
				const v = vals[k];
				if (v == null) { open = false; return; }
				const x = X(r[0]).toFixed(1), y = Y(v).toFixed(1);
				d += (open ? 'L' : 'M') + x + ' ' + y;
				if (!open) fx = x;
				lx = x; open = true;
			});
			if (cfg.cols.length === 1 && d) ad = d + 'L' + lx + ' ' + H + 'L' + fx + ' ' + H + 'Z';
			if (ad) svg.appendChild(SVG('path', { class: 'a ' + cfg.cols[si][2], d: ad }));
			svg.appendChild(SVG('path', { class: 'l ' + cfg.cols[si][2], d, pathLength: 1 }));
		});
		const cur = SVG('line', { class: 'cur', y1: 0, y2: H, x1: 0, x2: 0, visibility: 'hidden' });
		svg.appendChild(cur);
		for (const f of [ 0, .25, .5, .75, 1 ]) xl.appendChild(E('span', {}, clock(t0 + win * f, range !== 'h' && win > 86400 * 1.5)));

		const st = cfg.cols.map((x, si) => {
			const v = series[si].filter(q => q != null);
			return v.length ? [ x[1], v[v.length - 1], Math.min(...v), v.reduce((s, q) => s + q, 0) / v.length, Math.max(...v) ] : null;
		}).filter(Boolean);
		const loss = key === 'net' ? rows.map(r => r[8]).filter(v => v != null && v >= 0) : [];
		const cells = [].concat(...st.map(s => [ [ s[0] + (st.length > 1 ? ' · now' : ': now'), s[1] ], [ st.length > 1 ? s[0] + ' · min' : 'min', s[2] ], [ st.length > 1 ? s[0] + ' · avg' : 'avg', s[3] ], [ st.length > 1 ? s[0] + ' · max' : 'max', s[4] ] ]
			.map(x => E('div', { class: 'nf-ds' }, [ E('span', {}, x[0]), E('b', {}, cfg.fmt(x[1])) ]))));
		if (loss.length) cells.push(E('div', { class: 'nf-ds' }, [ E('span', {}, 'average loss'), E('b', {}, nf1.format(loss.reduce((s, q) => s + q, 0) / loss.length) + '%') ]));
		stats.replaceChildren(...cells);

		const move = ev => {
			const r = wrap.getBoundingClientRect(), f = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)), t = t0 + f * win;
			let bi = 0, bd = 1e12;
			rows.forEach((q, k) => { const dd = Math.abs(q[0] - t); if (dd < bd) { bd = dd; bi = k; } });
			const x = X(rows[bi][0]);
			cur.setAttribute('x1', x); cur.setAttribute('x2', x); cur.setAttribute('visibility', 'visible');
			tip.replaceChildren(E('span', {}, clock(rows[bi][0], win > 86400)), ...cfg.cols.map((cc, si) => E('div', {}, [ E('i', { class: cc[2] }), cc[1] + ' ', E('b', {}, series[si][bi] != null ? cfg.fmt(series[si][bi]) : '–') ])));
			tip.hidden = false;
			const px = x / W * r.width;
			tip.style.left = Math.min(r.width - tip.offsetWidth - 4, Math.max(4, px + 12)) + 'px';
		};
		wrap.onpointermove = move;
		wrap.onpointerleave = () => { cur.setAttribute('visibility', 'hidden'); tip.hidden = true; };
	}

	function load() {
		draw();
		const src = cfg.load ? cfg.load(range) : fs.exec(HIST, [ 'series', DRANGE[range][0] ]).then(res => JSON.parse(res.stdout));
		src.then(d => { data = d; if (data && data.info && !data.info.started) data = false; draw(); }).catch(() => { data = false; draw(); });
	}
	load();
}

/* ---------- dialogs without a chart: uptime, Wi‑Fi clients, daily traffic, storage ---------- */
function openInfo(key, from) {
	const T = { up: [ 'Uptime and reboots', 'system' ], cli: [ 'Wi‑Fi clients', 'wifi' ], day: [ 'Traffic today', 'net' ], stor: [ 'Storage', 'system' ] }[key];
	const body = E('div', { class: 'nf-info' }, E('div', { class: 'nf-empty' }, 'Loading…'));
	const bg = E('div', { class: 'nf-dlg-bg' });
	const onKey = ev => { if (ev.key === 'Escape') close(); };
	const close = () => { document.removeEventListener('keydown', onKey); bg.classList.remove('on'); window.setTimeout(() => { bg.remove(); if (from && from.focus) from.focus(); }, 200); };
	bg.appendChild(E('div', { class: 'nf-dlg nf-dlg-info', role: 'dialog', 'aria-modal': 'true', 'aria-label': T[0] }, [
		E('div', { class: 'nf-dlg-h' }, [ E('h4', {}, [ E('i', { class: 'nf-ci', 'data-i': T[1] }), T[0] ]), E('button', { type: 'button', class: 'nf-dlg-x', 'aria-label': 'Close', click: close }, '×') ]),
		body ]));
	bg.addEventListener('mousedown', ev => { if (ev.target === bg) close(); });
	document.addEventListener('keydown', onKey);
	document.body.appendChild(bg);
	window.requestAnimationFrame(() => bg.classList.add('on'));
	bg.querySelector('.nf-dlg-x').focus();
	const two = v => String(v).padStart(2, '0');
	const when = ts => { const d = new Date(ts * 1000); return two(d.getDate()) + '.' + two(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + two(d.getHours()) + ':' + two(d.getMinutes()); };
	const row = (a, b, bar) => E('div', { class: 'nf-info-row' }, [ E('span', {}, a), bar != null ? E('span', { class: 'nf-info-bar' }, E('i', { class: bar > 90 ? 'low' : bar > 75 ? 'mid' : '', style: 'width:' + Math.max(2, Math.min(100, bar)) + '%' })) : '', E('b', {}, b) ]);
	const head = t => E('div', { class: 'nf-info-h' }, t);
	const fill = (...n) => body.replaceChildren(...n.flat().filter(Boolean));
	const dur = sec => { const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60); return (d ? d + ' d ' : '') + (d || h ? h + ' h ' : '') + m + ' min'; };
	const J = f => fs.exec(HIST, f).then(r => JSON.parse(r.stdout)).catch(() => null);

	if (key === 'up') {
		Promise.all([ fs.exec(STATS, []).then(r => JSON.parse(r.stdout)).catch(() => null), J([ 'journal' ]) ]).then(([ d, j ]) => {
			if (!d) { fill(E('div', { class: 'nf-empty' }, 'No data.')); return; }
			const boots = ((j && j.rows) || []).filter(r => r[1] === 'boot').sort((a, b) => b[0] - a[0]).slice(0, 8);
			fill(row('Running since last reboot', dur(d.up)), row('Turned on', when(Date.now() / 1000 - d.up)),
				row('Load over 1 / 5 / 15 minutes', d.load.map(v => nf2.format(v)).join(' · ')),
				head('Recent reboots'),
				boots.length ? boots.map(r => row(when(r[0]), 'reboot')) : E('div', { class: 'nf-info-row' }, 'The log is empty for now: the collector records reboots since it was installed.'),
				E('div', { class: 'nf-dnote' }, 'Full log of outages and reboots: Resource Monitor → History.'));
		});
	}
	else if (key === 'cli') {
		Promise.all([ L.resolveDefault(callIwDevs(), []), L.resolveDefault(callHints(), {}), L.require('nightfall-devid').catch(() => null) ]).then(([ devs, hints, DEVID ]) =>
			Promise.all((devs || []).map(dv => L.resolveDefault(callAssoc(dv), []).then(l => (Array.isArray(l) ? l : []).map(c => Object.assign({ dev: dv }, c))))).then(lists => {
				const cl = [].concat(...lists).sort((a, b) => (a.signal || -200) - (b.signal || -200));
				if (!cl.length) { fill(E('div', { class: 'nf-empty' }, 'Nobody is connected over Wi‑Fi right now.')); return; }
				const q = v => v >= -60 ? 'excellent' : v >= -67 ? 'good' : v >= -75 ? 'weak' : 'poor';
				fill(cl.map(c => {
					const mac = String(c.mac || '').toUpperCase(), h = hints[mac] || {}, id = DEVID && mac ? DEVID.identify(mac, h.name || '') : null;
					const name = h.name || (id && id.known ? [ id.label || 'Device', id.vendor && id.vendor !== id.label ? id.vendor : '' ].filter(Boolean).join(' ') : '') || (h.ipaddrs || [])[0] || mac;
					const rate = c.rx && c.rx.rate ? ' · ↓ ' + nf0.format(c.rx.rate / 1000) + ' Mbit/s' : '';
					return row(name + ' · ' + c.dev + (id && id.priv ? ' · private MAC' : ''), (c.signal != null ? c.signal + ' dBm · ' + q(c.signal) : '–') + rate, c.signal != null ? Math.max(0, Math.min(100, (c.signal + 95) * 100 / 50)) : null);
				}), E('div', { class: 'nf-dnote' }, 'Weakest at the top. The longer the bar, the better the signal. Hourly chart: Monitor → History → "Wi‑Fi signal by hour".'));
			}));
	}
	else if (key === 'day') {
		J([ 'traffic' ]).then(t => {
			const rows = ((t && t.rows) || []).slice().sort((a, b) => a[0].localeCompare(b[0]));
			if (!rows.length) { fill(E('div', { class: 'nf-empty' }, 'The counters have not collected enough data yet.')); return; }
			const d0 = new Date(), key0 = d => d.getFullYear() + two(d.getMonth() + 1) + two(d.getDate());
			const by = {}; rows.forEach(r => { by[r[0]] = r; });
			const days = []; for (let i = 0; i < 14; i++) { const d = new Date(d0.getTime() - i * 86400000), r = by[key0(d)]; days.push([ d, r ? r[1] : 0, r ? r[2] : 0 ]); }
			const sum = (n, k) => days.slice(0, n).reduce((a, x) => a + x[k], 0), mx = Math.max(1, ...days.map(x => x[1] + x[2]));
			fill(row('Today', '↓ ' + fmtBytes(days[0][1]) + ' · ↑ ' + fmtBytes(days[0][2])), row('Yesterday', '↓ ' + fmtBytes(days[1][1]) + ' · ↑ ' + fmtBytes(days[1][2])),
				row('Last 7 days', '↓ ' + fmtBytes(sum(7, 1)) + ' · ↑ ' + fmtBytes(sum(7, 2))), row('Last 14 days', '↓ ' + fmtBytes(sum(14, 1)) + ' · ↑ ' + fmtBytes(sum(14, 2))),
				head('By day (downloaded + uploaded)'),
				days.map(x => row(x[0].toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' }), fmtBytes(x[1] + x[2]), 100 * (x[1] + x[2]) / mx)),
				E('div', { class: 'nf-dnote' }, 'Totals from the WAN port counters, or from per-device data if those are too low (hardware offloading). Breakdown by device and month: Monitor → History → "Traffic by month".'));
		});
	}
	else {
		fs.exec(STATS, []).then(r => JSON.parse(r.stdout)).then(d => {
			const m = d.mem, used = m.total - m.avail, fm = kb => fmtBytes(kb * 1024);
			fill(d.flash ? row('Flash (settings and packages)', fm(d.flash[1]) + ' of ' + fm(d.flash[0]), 100 * d.flash[1] / d.flash[0]) : '',
				d.flash ? row('Free flash space', fm(d.flash[0] - d.flash[1])) : '',
				d.tmp ? row('/tmp (RAM: history, logs)', fm(d.tmp[1]) + ' of ' + fm(d.tmp[0]), 100 * d.tmp[1] / d.tmp[0]) : '',
				row('RAM', fm(used) + ' of ' + fm(m.total), 100 * used / m.total),
				E('div', { class: 'nf-dnote' }, 'Attached USB drives and SD cards that can store history: Monitor → History → "Drives".'));
		}).catch(() => fill(E('div', { class: 'nf-empty' }, 'No data.')));
	}
}

/* ---------- live tiles ---------- */

function liveStrip() {
	const S = {
		t: [], cpu: [], mem: [], temp: [], rx: [], tx: [], ping: [], ct: [], lo: [], cli: null, sig: null, day: null,
		last: null, wan: null, online: null, gw: null, net: null, loss: null
	};
	const R = {};   /* DOM refs */

	const sp = {
		net: spark([ 'nf-c-down' ]), wan: spark([ 'nf-c-down', 'nf-c-up' ]), cpu: spark([ 'nf-c-cpu' ]),
		temp: spark([ 'nf-c-temp' ]), mem: spark([ 'nf-c-mem' ]), ct: spark([ 'nf-c-mem' ]), lo: spark([ 'nf-c-temp' ])
	};

	const tile = (key, title, extra, ...rows) => E('div', { class: 'nf-tile', 'data-tile': key }, [
		E('div', { class: 'nf-tile-k' }, [ E('span', {}, title), extra || '' ]) ].concat(rows));

	R.netBadge = E('span', {}, badge('off', '—'));
	R.tempBadge = E('span');
	R.vdT = E('b', {}, 'Loading…'); R.vdS = E('small');
	R.verdict = E('div', { class: 'nf-verdict', 'data-k': 'ok' }, [
		E('i', { class: 'nf-vd' }),
		E('div', { class: 'nf-vd-t' }, [ R.vdT, R.vdS ]),
		R.vdDismiss = E('button', { type: 'button', class: 'nf-vd-dismiss', title: 'Hide this notice until the status changes', 'aria-label': 'Hide notice' }, '×')
	]);
	const verdictDismissKey = 'nightfall-overview-verdict-dismissed';
	let dismissedVerdictSignature = '';
	R.vdDismiss.textContent = 'Got it';
	R.vdDismiss.setAttribute('aria-label', 'Got it');
	R.vdDismiss.addEventListener('click', ev => {
		ev.preventDefault();
		ev.stopPropagation();
		dismissedVerdictSignature = R.verdict.dataset.signature || '';
		try { localStorage.setItem(verdictDismissKey, dismissedVerdictSignature); } catch (e) {}
		R.verdict.hidden = true;
	});
	const strip = E('div', { class: 'nf-live' }, [
		R.verdict,
		E('div', { class: 'nf-editnote' }, 'Layout mode: drag ⋮⋮ by the card header to move it; the icons next to it pin the card and change its size; the corner resizes it. When finished, click "View → Done".'),
		E('div', { class: 'nf-live-h' }, [
			E('span', {}, 'Now'),
			E('span', { class: 'nf-live-acts' }, [
				E('details', { class: 'nf-viewmenu' }, [ E('summary', { class: 'nf-linkbtn', title: 'Columns, layout, card order, Wi-Fi QR' }, '⚙ View ▾'),
					E('div', { class: 'nf-viewlist' }, [
				R.cols = E('span', { class: 'nf-colsel', title: 'How many card columns on the Overview; cards are packed with no gaps' }, [ E('span', {}, 'Columns:') ].concat([ [ '0', 'Auto' ], [ '1', '1' ], [ '2', '2' ], [ '3', '3' ] ].map(c => E('button', { type: 'button', class: 'nf-linkbtn', 'data-c': c[0] }, c[1])))),
				R.lay = E('span', { class: 'nf-colsel nf-laysel', title: 'Which tiles to show and how to arrange the cards, in one click' }, [ E('span', {}, 'Layout:') ].concat([ [ 'std', 'Standard' ], [ 'home', 'Home' ], [ 'min', 'Minimal' ], [ 'admin', 'Admin' ] ].map(c => E('button', { type: 'button', class: 'nf-linkbtn', 'data-l': c[0] }, c[1])))),
				R.edit = E('button', { type: 'button', class: 'nf-linkbtn nf-editbtn', title: 'Show move, pin and size icons on the cards', 'aria-pressed': 'false' }, 'Edit layout'),
				R.reset = E('button', { type: 'button', class: 'nf-linkbtn', title: 'Restore the default card order' }, 'Reset card order'),
				R.qrBtn = E('button', { type: 'button', class: 'nf-linkbtn', title: 'QR code for joining Wi-Fi' }, 'Wi-Fi QR')
					]) ]),
				R.boardBtn = E('button', { type: 'button', class: 'nf-linkbtn', title: 'Full-screen dashboard: time, speed, ping, load' }, 'Dashboard')
			])
		]),
		E('div', { class: 'nf-live-grid' }, [
			tile('net', 'Internet', R.netBadge,
				R.netV = E('div', { class: 'nf-tile-v' }, '–'), R.netS = E('div', { class: 'nf-tile-s' }, ' '), sp.net.el),
			tile('wan', 'WAN traffic', null,
				R.wanV = E('div', { class: 'nf-tile-v' }, '–'), R.wanS = E('div', { class: 'nf-tile-s' }, ' '), sp.wan.el),
			tile('cpu', 'CPU', null,
				R.cpuV = E('div', { class: 'nf-tile-v' }, '–'), R.cpuS = E('div', { class: 'nf-tile-s' }, ' '), sp.cpu.el),
			tile('temp', 'Temperature', R.tempBadge,
				R.tempV = E('div', { class: 'nf-tile-v' }, '–'), R.tempS = E('div', { class: 'nf-tile-s' }, ' '), sp.temp.el),
			tile('mem', 'Memory', null,
				R.memV = E('div', { class: 'nf-tile-v' }, '–'), R.memS = E('div', { class: 'nf-tile-s' }, ' '), sp.mem.el),
			tile('ct', 'Connections', null,
				R.ctV = E('div', { class: 'nf-tile-v' }, '–'), R.ctS = E('div', { class: 'nf-tile-s' }, ' '), sp.ct.el),
			tile('up', 'Uptime', null,
				R.upV = E('div', { class: 'nf-tile-v' }, '–'), R.upS = E('div', { class: 'nf-tile-s' }, ' ')),
			tile('cli', 'Wi‑Fi clients', null,
				R.cliV = E('div', { class: 'nf-tile-v' }, '–'), R.cliS = E('div', { class: 'nf-tile-s' }, ' ')),
			tile('loss', 'Packet loss', null,
				R.lossV = E('div', { class: 'nf-tile-v' }, '–'), R.lossS = E('div', { class: 'nf-tile-s' }, ' '), sp.lo.el),
			tile('sig', 'Wi‑Fi signal', null,
				R.sigV = E('div', { class: 'nf-tile-v' }, '–'), R.sigS = E('div', { class: 'nf-tile-s' }, ' ')),
			tile('day', 'Traffic today', null,
				R.dayV = E('div', { class: 'nf-tile-v' }, '–'), R.dayS = E('div', { class: 'nf-tile-s' }, ' ')),
			tile('stor', 'Storage', null,
				R.storV = E('div', { class: 'nf-tile-v' }, '–'), R.storS = E('div', { class: 'nf-tile-s' }, ' '))
		])
	]);

	/* "Dashboard" mode: large clock and metrics full screen (a tablet on a shelf, a second monitor) */
	let boardEl = null, boardTimer = 0;
	const txt = el => (el && el.textContent || '').trim() || '–';
	function closeBoard() {
		if (!boardEl) return;
		clearInterval(boardTimer); boardEl.remove(); boardEl = null;
		if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
	}
	function openBoard() {
		if (boardEl) return;
		const val = E('div', { class: 'nf-bd-v' }), clock = E('div', { class: 'nf-bd-clock' }), date = E('div', { class: 'nf-bd-date' });
		const cell = (k, title) => { const v = E('div', { class: 'nf-bd-n' }), s = E('div', { class: 'nf-bd-s' }); return { k, v, s, el: E('div', { class: 'nf-bd-c', 'data-k': k }, [ E('div', { class: 'nf-bd-t' }, title), v, s ]) }; };
		const cells = [ cell('net', 'Internet'), cell('wan', 'Traffic'), cell('cpu', 'CPU'), cell('temp', 'Temperature'), cell('mem', 'Memory') ];
		boardEl = E('div', { class: 'nf-board', role: 'dialog', 'aria-label': 'Dashboard' }, [
			E('button', { type: 'button', class: 'nf-bd-x', 'aria-label': 'Close' }, '✕'), clock, date,
			E('div', { class: 'nf-bd-grid' }, cells.map(c => c.el)) ]);
		const tick = () => {
			const d = new Date();
			clock.textContent = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
			date.textContent = d.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' });
			const src = { net: [ R.netV, R.netS ], wan: [ R.wanV, R.wanS ], cpu: [ R.cpuV, R.cpuS ], temp: [ R.tempV, R.tempS ], mem: [ R.memV, R.memS ] };
			cells.forEach(c => {
				c.v.textContent = txt(src[c.k][0]); c.s.textContent = txt(src[c.k][1]) === '–' ? '' : txt(src[c.k][1]);
				const t = document.querySelector('.nf-tile[data-tile="' + c.k + '"]');
				c.el.setAttribute('data-lvl', t && t.getAttribute('data-lvl') || '');
			});
		};
		tick(); boardTimer = setInterval(tick, 1000);
		boardEl.addEventListener('click', closeBoard);
		document.body.appendChild(boardEl);
		const rq = boardEl.requestFullscreen || boardEl.webkitRequestFullscreen;
		if (rq) { try { const p = rq.call(boardEl); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
	}
	document.addEventListener('keydown', ev => { if (ev.key === 'Escape') closeBoard(); });
	document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) closeBoard(); });
	R.boardBtn.addEventListener('click', openBoard);
	function openQr() {
		if (document.querySelector('.nf-qr-ov')) return;
		const esc = v => String(v).replace(/([\\;,:"])/g, '\\$1');
		const body = E('div', { class: 'nf-qr-body' }, 'Loading…');
		const ov = E('div', { class: 'nf-qr-ov' }, E('div', { class: 'nf-qr-box' }, [
			E('div', { class: 'nf-qr-h' }, [ E('b', {}, 'Wi-Fi QR code'), E('button', { type: 'button', class: 'nf-linkbtn', 'data-close': '1' }, 'Close') ]),
			body,
			E('div', { class: 'nf-qr-note' }, 'Point your phone camera at it and it will offer to connect. The password is visible only to you and never leaves the router.')
		]));
		ov.addEventListener('click', ev => { if (ev.target === ov || (ev.target.getAttribute && ev.target.getAttribute('data-close'))) ov.remove(); });
		document.body.appendChild(ov);
		callUci('wireless').then(v => {
			const list = Object.keys(v).map(k => v[k]).filter(x => x['.type'] === 'wifi-iface' && x.mode !== 'sta' && x.ssid);
			body.textContent = '';
			if (!list.length) { body.textContent = 'No Wi-Fi networks found.'; return; }
			const seen = {};
			list.forEach(x => {
				const open = !x.encryption || x.encryption === 'none';
				const sae = /^sae/.test(x.encryption || '') && !/psk/.test(x.encryption || '');
				const key = x.key || '';
				const k = x.ssid + '|' + key; if (seen[k]) return; seen[k] = 1;
				const txt = 'WIFI:T:' + (open ? 'nopass' : (sae ? 'SAE' : 'WPA')) + ';S:' + esc(x.ssid) + ';' + (open ? '' : 'P:' + esc(key) + ';') + (x.hidden === '1' ? 'H:true;' : '') + ';';
				const m = NfQr.encode(txt);
				const card = E('div', { class: 'nf-qr-card' });
				if (!m) card.appendChild(E('div', {}, 'Data too long'));
				else if (!open && !key) card.appendChild(E('div', {}, 'No password in the settings (possibly a RADIUS server).'));
				else {
					const n = m.length, q = 3, NS = 'http://www.w3.org/2000/svg';
					const svg = document.createElementNS(NS, 'svg');
					svg.setAttribute('viewBox', '0 0 ' + (n + 2 * q) + ' ' + (n + 2 * q)); svg.setAttribute('class', 'nf-qr-svg'); svg.setAttribute('shape-rendering', 'crispEdges');
					const bg = document.createElementNS(NS, 'rect'); bg.setAttribute('width', n + 2 * q); bg.setAttribute('height', n + 2 * q); bg.setAttribute('fill', '#fff'); svg.appendChild(bg);
					let d = ''; m.forEach((r, i) => r.forEach((c, j) => { if (c) d += 'M' + (j + q) + ' ' + (i + q) + 'h1v1h-1z'; }));
					const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); p.setAttribute('fill', '#000'); svg.appendChild(p);
					card.appendChild(svg);
				}
				card.appendChild(E('div', { class: 'nf-qr-ssid' }, x.ssid));
				card.appendChild(E('div', { class: 'nf-qr-sub' }, open ? 'no password' : (x.encryption || '') + (x.disabled === '1' ? ' · off' : '')));
				body.appendChild(card);
			});
			/* timed guest network: networks with "guest" in the name and disabled networks */
			const cands = Object.keys(v).filter(k => v[k]['.type'] === 'wifi-iface' && v[k].mode !== 'sta' && v[k].ssid && (v[k].disabled === '1' || /guest/i.test((v[k].network || '') + ' ' + v[k].ssid)));
			const gbox = E('div', { class: 'nf-qr-guest' });
			if (!cands.length) {
				gbox.appendChild(E('div', { class: 'nf-qr-sub' }, 'Timed guest network: create a separate Wi-Fi network (for example, guest) in Network → Wireless, and on/off buttons will appear here.'));
			} else {
				fs.exec(GUESTBIN, [ 'status' ]).then(r => { let st = null; try { st = JSON.parse(r.stdout); } catch (e) { /* ignore */ } return st; }).catch(() => null).then(st => {
					const until = {}; ((st && st.list) || []).forEach(x => { until[x[0]] = x[1]; });
					const hm = t => { const d = new Date(t * 1000); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
					const reopen = () => { ov.remove(); window.setTimeout(openQr, 400); };
					const act = (b, args) => { b.disabled = true; fs.exec(GUESTBIN, args).then(reopen).catch(() => { b.disabled = false; }); };
					gbox.appendChild(E('div', { class: 'nf-qr-gh' }, 'Timed guest network'));
					cands.forEach(id => {
						const x = v[id], on = x.disabled !== '1';
						const btns = on ? [ E('button', { type: 'button', class: 'nf-linkbtn nf-bad', click: ev => act(ev.currentTarget, [ 'off', id ]) }, 'Turn off') ]
							: [ [ 30, '30 min' ], [ 60, '1 hour' ], [ 240, '4 hours' ], [ 1440, '24 hours' ] ].map(([ m, t ]) => E('button', { type: 'button', class: 'nf-linkbtn', click: ev => act(ev.currentTarget, [ 'on', id, String(m) ]) }, t));
						gbox.appendChild(E('div', { class: 'nf-qr-gr' }, [
							E('div', { class: 'nf-qr-gn' }, [ E('b', {}, x.ssid), E('span', { class: 'nf-qr-sub' }, on ? (until[id] ? 'on until ' + hm(until[id]) : 'on, no timer') : 'off') ]),
							E('div', { class: 'nf-qr-ga' }, btns) ]));
					});
					if (cands.some(id => v[id].disabled === '1')) gbox.appendChild(E('div', { class: 'nf-qr-note' }, 'The network appears a few seconds after it is turned on. It turns itself off when the timer ends.'));
				});
			}
			body.appendChild(gbox);
		}).catch(() => { body.textContent = 'No access to the Wi-Fi settings. Update the package and sign in to LuCI again.'; });
	}
	document.addEventListener('keydown', ev => { if (ev.key === 'Escape') { const o = document.querySelector('.nf-qr-ov'); if (o) o.remove(); } });
	R.qrBtn.addEventListener('click', openQr);
	R.edit.addEventListener('click', () => {
		const root = document.documentElement, on = !root.hasAttribute('data-nf-edit');
		root.toggleAttribute('data-nf-edit', on);
		R.edit.textContent = on ? 'Done' : 'Edit layout'; R.edit.setAttribute('aria-pressed', String(on));
		const m = R.edit.closest('details'); if (m) m.open = false;
		window.setTimeout(() => window.dispatchEvent(new Event('resize')), 60);
	});
	document.addEventListener('click', ev => { const m = document.querySelector('.nf-viewmenu[open]'); if (m && !m.contains(ev.target)) m.open = false; });
	document.addEventListener('keydown', ev => { if (ev.key === 'Escape') { const m = document.querySelector('.nf-viewmenu[open]'); if (m) m.open = false; } });

	const paintCols = () => { const cur = document.documentElement.getAttribute('data-nf-ov-cols') || '0'; R.cols.querySelectorAll('button').forEach(x => x.classList.toggle('on', x.getAttribute('data-c') === cur)); };
	R.cols.addEventListener('click', ev => { const b = ev.target.closest && ev.target.closest('button[data-c]'); if (!b) return; if (window.Nightfall && window.Nightfall.set) window.Nightfall.set('ovCols', b.getAttribute('data-c')); paintCols(); window.setTimeout(() => window.dispatchEvent(new Event('resize')), 60); });
	new MutationObserver(paintCols).observe(document.documentElement, { attributes: true, attributeFilter: [ 'data-nf-ov-cols' ] }); paintCols();
	const paintLay = () => { const cur = (window.Nightfall && window.Nightfall.prefs && window.Nightfall.prefs().ovLay) || ''; R.lay.querySelectorAll('button').forEach(x => x.classList.toggle('on', x.getAttribute('data-l') === cur)); };
	R.lay.addEventListener('click', ev => { const b = ev.target.closest && ev.target.closest('button[data-l]'); if (!b) return; if (window.Nightfall && window.Nightfall.layout) window.Nightfall.layout(b.getAttribute('data-l')); paintLay(); });
	new MutationObserver(paintLay).observe(document.documentElement, { attributes: true, attributeFilter: [ 'data-nf-hide', 'data-nf-ov-cols', 'data-nf-ov-size' ] }); paintLay();
	strip.addEventListener('click', ev => {
		const t = ev.target.closest && ev.target.closest('.nf-tile[data-tile]');
		if (t) openDetail(t.getAttribute('data-tile'), t);
	});
	strip.addEventListener('keydown', ev => {
		const t = ev.target.closest && ev.target.closest('.nf-tile[data-tile]');
		if (t && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); openDetail(t.getAttribute('data-tile'), t); }
	});
	strip.querySelectorAll('.nf-tile').forEach(t => { const k = t.getAttribute('data-tile'); if (!DETAIL[k] && !INFO[k]) return; t.setAttribute('tabindex', '0'); t.setAttribute('role', 'button'); t.setAttribute('title', 'Click to open the chart'); });

	function trim(now) {
		while (S.t.length && S.t[0] < now - WIN) {
			S.t.shift(); S.cpu.shift(); S.mem.shift(); S.temp.shift(); S.rx.shift(); S.tx.shift(); S.ping.shift(); S.ct.shift(); S.lo.shift();
		}
	}

	function pickTemp(list) {
		let main = null, first = null, wifi = null;
		for (const [ n, v ] of list || []) {
			const c = v / 1000;
			if (!isFinite(c) || c <= 0) continue;
			if (/phy|mt76|mt79|wifi|wlan|ath|iwlwifi/i.test(n)) { if (wifi == null) wifi = c; continue; }
			if (first == null) first = c;
			if (main == null && /cpu|soc|core|a53|a73|thermal/i.test(n)) main = c;
		}
		/* on routers without a CPU sensor (MikroTik hAP ac2) use the Wi‑Fi chip sensor */
		return main != null ? main : first != null ? first : wifi;
	}

	function ingest(d) {
		const now = Date.now() / 1000, prev = S.last;
		S.last = d;
		if (!prev || d.up <= prev.up) return;

		const sum = x => x[0] + x[1] + x[2] + x[3] + x[4] + x[5] + x[6] + x[7];
		const dt = sum(d.cpu[0]) - sum(prev.cpu[0]);
		const cpu = dt > 0 ? 100 * (1 - ((d.cpu[0][3] + d.cpu[0][4]) - (prev.cpu[0][3] + prev.cpu[0][4])) / dt) : null;

		const up = d.up - prev.up;
		let rx = null, tx = null;
		const dev = S.wan;
		if (dev) {
			const a = prev.net.find(n => n[0] === dev), b = d.net.find(n => n[0] === dev);
			if (a && b && up > 0) {
				rx = Math.max(0, (b[1] - a[1]) / up);
				tx = Math.max(0, (b[5] - a[5]) / up);
			}
		}

		S.t.push(now); S.cpu.push(cpu);
		S.mem.push(100 * (d.mem.total - d.mem.avail) / d.mem.total);
		S.temp.push(pickTemp(d.temps));
		S.rx.push(rx); S.tx.push(tx);
		S.ping.push(S.net != null && S.net >= 0 ? S.net : null);
		S.ct.push(d.ct && d.ct[0] >= 0 ? d.ct[0] : null);
		S.lo.push(S.loss);
		trim(now);
	}

	function render() {
		const d = S.last;
		if (!d) return;
		const lastOf = a => { for (let i = a.length - 1; i >= 0; i--) if (a[i] != null) return a[i]; return null; };

		/* internet */
		R.netBadge.replaceChildren(S.online === true ? badge('ok', 'Online') : S.online === false ? badge('bad', 'Offline') : badge('off', 'No data'));
		setNum(R.netV, S.net != null && S.net >= 0 ? nf0.format(S.net) + ' ms' : (S.online === false ? '—' : '–'));
		R.netS.textContent = S.gw != null && S.gw >= 0 ? 'to gateway ' + nf1.format(S.gw) + ' ms' : (S.online == null ? 'history is not being collected' : ' ');
		sp.net.update(S.t, [ S.ping ], niceCeil(Math.max(20, ...S.ping.filter(v => v != null))));

		/* WAN speed */
		const rx = lastOf(S.rx), tx = lastOf(S.tx);
		if (rx != null) {
			const r = fmtRate(rx), u = fmtRate(tx || 0);
			setNum(R.wanV, '↓ ' + r[0] + ' ' + r[1]);
			setNum(R.wanS, '↑ ' + u[0] + ' ' + u[1]);
		}
		else R.wanV.textContent = S.wan ? '–' : 'WAN not found';
		sp.wan.update(S.t, [ S.rx, S.tx ], niceCeil(Math.max(12500, ...S.rx.filter(v => v != null), ...S.tx.filter(v => v != null))));

		/* CPU */
		const cpu = lastOf(S.cpu);
		setNum(R.cpuV, cpu != null ? nf0.format(cpu) + '%' : '–');
		R.cpuS.textContent = 'load ' + d.load.map(v => nf2.format(v)).join(' · ');
		setLvl(R.cpuV, cpu, ...thr('cpu', 60, 85));
		sp.cpu.update(S.t, [ S.cpu ], 100);

		/* temperature */
		const t = lastOf(S.temp);
		if (t != null) {
			setNum(R.tempV, nf1.format(t) + ' °C');
			const [ tempMid, tempBad ] = thr('temp', 70, 85);
			R.tempBadge.replaceChildren(t >= tempBad ? badge('bad', 'Hot') : t >= tempMid ? badge('warn', 'Warm') : badge('ok', 'Normal'));
			R.tempS.textContent = 'CPU';
		}
		else { R.tempV.textContent = '–'; R.tempS.textContent = 'no sensor'; R.tempBadge.replaceChildren(); }
		setLvl(R.tempV, t, ...thr('temp', 70, 85));
		sp.temp.update(S.t, [ S.temp ], 100, 30);

		/* memory */
		const m = d.mem, used = m.total - m.avail;
		setNum(R.memV, nf0.format(100 * used / m.total) + '%');
		R.memS.textContent = nf0.format(used / 1024) + ' MB of ' + nf0.format(m.total / 1024) + ' MB';
		setLvl(R.memV, 100 * used / m.total, ...thr('mem', 70, 88));
		sp.mem.update(S.t, [ S.mem ], 100);

		/* verdict line: one phrase instead of a scatter of badges */
		{
			const bad = [], warn = [], memP = 100 * used / m.total, loss = S.loss != null ? S.loss : null;
			if (S.online === false) bad.push('no internet connection');
			const [ tempMid, tempBad ] = thr('temp', 70, 85), [ memMid, memBad ] = thr('mem', 70, 88), [ cpuMid, cpuBad ] = thr('cpu', 60, 85);
			if (t != null && t >= tempBad) bad.push('overheating ' + nf0.format(t) + ' °C'); else if (t != null && t >= tempMid) warn.push('temperature ' + nf0.format(t) + ' °C');
			if (memP >= memBad) bad.push('memory ' + nf0.format(memP) + '% full'); else if (memP >= memMid) warn.push('memory ' + nf0.format(memP) + '%');
			if (cpu != null && cpu >= cpuBad) bad.push('high CPU load ' + nf0.format(cpu) + '%'); else if (cpu != null && cpu >= cpuMid) warn.push('CPU ' + nf0.format(cpu) + '%');
			if (loss != null && loss >= 5) warn.push('packet loss ' + nf1.format(loss) + '%');
			const k = bad.length ? 'bad' : warn.length ? 'warn' : 'ok', all = bad.concat(warn);
			const signature = k + '|' + all.join('|');
			R.verdict.setAttribute('data-k', k);
			R.verdict.dataset.signature = signature;
			let dismissed = '';
			try { dismissed = localStorage.getItem(verdictDismissKey) || ''; } catch (e) {}
			if (dismissedVerdictSignature === signature) dismissed = signature;
			if (dismissed && dismissed !== signature) {
				try { localStorage.removeItem(verdictDismissKey); } catch (e) {}
				dismissed = '';
			}
			if (dismissed !== signature) dismissedVerdictSignature = '';
			R.verdict.hidden = k !== 'ok' && dismissed === signature;
			R.vdDismiss.hidden = k === 'ok';
			if (k === 'ok') {
				try { localStorage.removeItem(verdictDismissKey); } catch (e) {}
			}
			R.vdT.textContent = k === 'ok' ? 'All good' : k === 'bad' ? 'Needs attention' : 'Some issues';
			R.vdS.textContent = k === 'ok' ? [ S.online === true ? 'internet is up' : '', t != null ? 'temperature ' + nf0.format(t) + ' °C' : '', 'memory ' + nf0.format(memP) + '%' ].filter(Boolean).join(' · ') : all.join(' · ');
		}

		/* connections, uptime, Wi‑Fi clients: optional tiles (enabled in the "Now" settings) */
		const ct = d.ct && d.ct[1] > 0 ? d.ct : null;
		setNum(R.ctV, ct ? nf0.format(ct[0]) : '–');
		R.ctS.textContent = ct ? 'of ' + nf0.format(ct[1]) + ' (' + nf0.format(100 * ct[0] / ct[1]) + '%)' : 'no data';
		setLvl(R.ctV, ct ? 100 * ct[0] / ct[1] : null, 70, 90);
		sp.ct.update(S.t, [ S.ct ], niceCeil(Math.max(50, ...S.ct.filter(v => v != null))));
		const us = d.up || 0, ud = Math.floor(us / 86400), uh = Math.floor(us % 86400 / 3600), um = Math.floor(us % 3600 / 60);
		R.upV.textContent = ud > 0 ? ud + ' d ' + uh + ' h' : uh > 0 ? uh + ' h ' + um + ' min' : um + ' min';
		R.upS.textContent = 'load ' + d.load.map(v => nf2.format(v)).join(' · ');
		setNum(R.cliV, S.cli != null ? String(S.cli) : '–');
		R.cliS.textContent = S.cli == null ? 'counting…' : 'connected over Wi‑Fi';

		/* loss, Wi‑Fi signal, daily traffic, storage */
		setNum(R.lossV, S.loss != null ? nf1.format(S.loss) + '%' : '–');
		R.lossS.textContent = S.net != null && S.net >= 0 ? 'ping ' + nf0.format(S.net) + ' ms' : 'no data';
		setLvl(R.lossV, S.loss, 2, 5);
		sp.lo.update(S.t, [ S.lo ], niceCeil(Math.max(5, ...S.lo.filter(v => v != null))));
		if (S.sig) {
			setNum(R.sigV, nf0.format(S.sig.avg) + ' dBm');
			R.sigS.textContent = 'worst ' + nf0.format(S.sig.worst) + ' dBm · clients: ' + S.sig.n;
			setLvl(R.sigV, S.sig.avg >= -67 ? 0 : 100 - Math.max(0, S.sig.avg + 100) * 1.2, 40, 70);
		}
		else { R.sigV.textContent = '–'; R.sigS.textContent = S.cli === 0 ? 'no Wi‑Fi clients' : 'counting…'; setLvl(R.sigV, null, 40, 70); }
		if (S.day) { setNum(R.dayV, '↓ ' + fmtBytes(S.day[0])); R.dayS.textContent = '↑ ' + fmtBytes(S.day[1]); }
		else { R.dayV.textContent = '–'; R.dayS.textContent = 'counters not collected yet'; }
		if (d.flash && d.flash[0] > 0) {
			const fp = 100 * d.flash[1] / d.flash[0], fr = (d.flash[0] - d.flash[1]) / 1048576;
			setNum(R.storV, nf0.format(fp) + '%'); R.storS.textContent = 'free ' + (fr >= 1 ? nf1.format(fr) + ' GB' : nf0.format(fr * 1024) + ' MB');
			setLvl(R.storV, fp, 75, 90);
		}
		else { R.storV.textContent = '–'; R.storS.textContent = 'no data'; }

		SHARED.t = Date.now(); SHARED.cpu = cpu; SHARED.mem = 100 * used / m.total; SHARED.temp = t;
		SHARED.online = S.online; SHARED.ping = S.net; SHARED.loss = S.loss;
	}

	function sample() {
		return fs.exec(STATS, []).then(res => {
			let d = null;
			try { d = JSON.parse(res.stdout); } catch (e) { /* ignore */ }
			if (!d) throw new Error('no data');
			ingest(d);
			render();
		});
	}

	function history() {
		return fs.exec(HIST, [ 'alerts' ]).then(res => {
			let h = null;
			try { h = JSON.parse(res.stdout); } catch (e) { /* ignore */ }
			if (!h || !h.info || !h.info.started) { S.online = null; return; }
			const last = (h.last || [])[0];
			const fresh = last && h.now - last[0] <= 90;
			S.net = fresh ? last[7] : null;
			S.gw = fresh ? last[6] : null;
			S.loss = fresh && last[8] != null && last[8] >= 0 ? last[8] : null;
			S.online = fresh ? last[7] >= 0 : null;
			if ((h.active || []).some(a => a[0] === 'wan')) S.online = false;
		}).catch(() => { S.online = null; });
	}

	function seed() {
		return fs.exec(HIST, [ 'series', 'fine' ]).then(res => {
			let h = null;
			try { h = JSON.parse(res.stdout); } catch (e) { /* ignore */ }
			if (!h || !h.rows) return;
			if (h.info && h.info.mode) SHARED.mode = h.info.mode;
			for (const r of h.rows) {
				if (h.now - r[0] > WIN) continue;
				S.t.push(r[0]); S.cpu.push(r[1] >= 0 ? r[1] : null); S.mem.push(r[2] >= 0 ? r[2] : null);
				S.temp.push(r[3] >= 0 ? r[3] : null); S.rx.push(r[4] >= 0 ? r[4] : null); S.tx.push(r[5] >= 0 ? r[5] : null);
				S.ping.push(r[7] >= 0 ? r[7] : null);
				S.ct.push(r[9] != null && r[9] >= 0 ? r[9] : null);
				S.lo.push(r[8] != null && r[8] >= 0 ? r[8] : null);
			}
		}).catch(() => {});
	}

	function clients() {
		const hid = document.documentElement.getAttribute('data-nf-hide') || '';
		if (hid.indexOf(' cli ') >= 0 && hid.indexOf(' sig ') >= 0) return Promise.resolve();
		return L.resolveDefault(callIwDevs(), []).then(devs => Promise.all((devs || []).map(dv => L.resolveDefault(callAssoc(dv), [])))).then(lists => {
			const all = [].concat(...lists.map(l => Array.isArray(l) ? l : []));
			S.cli = all.length;
			const sg = all.map(c => +c.signal).filter(v => isFinite(v) && v < 0 && v > -120);
			S.sig = sg.length ? { avg: sg.reduce((a, b) => a + b, 0) / sg.length, worst: Math.min(...sg), n: sg.length } : null;
		}).catch(() => {});
	}

	/* today's traffic from the WAN counters (needed by the "Traffic today" tile) */
	function today() {
		if ((document.documentElement.getAttribute('data-nf-hide') || '').indexOf(' day ') >= 0) return Promise.resolve();
		return fs.exec(HIST, [ 'traffic' ]).then(res => {
			const h = JSON.parse(res.stdout), d = new Date(), k = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
			const r = (h.rows || []).find(x => x[0] === k);
			S.day = r ? [ r[1], r[2] ] : null;
		}).catch(() => {});
	}

	function findWan() {
		return callIfaces().then(res => {
			for (const i of (res && res.interface) || []) {
				const dev = i.l3_device || i.device;
				if (dev && i.up && (i.route || []).some(r => r.target === '0.0.0.0' || r.target === '::')) { S.wan = dev; return; }
			}
		}).catch(() => {});
	}

	/* a tile was enabled in the settings or the layout changed: load its data right away instead of waiting for the poll loop */
	new MutationObserver(() => { Promise.all([ clients(), today() ]).then(render); }).observe(document.documentElement, { attributes: true, attributeFilter: [ 'data-nf-hide' ] });

	let n = 0, timer = null;
	function tick() {
		if (document.hidden || window.getComputedStyle(strip).display === 'none') return;
		sample().then(() => {
			if (n++ % ALERTS_EVERY === 0) return Promise.all([ history(), clients(), today() ]).then(render);
		}).catch(() => {
			/* stats script not available (no ACL or package missing): drop the strip */
			if (!S.last) { strip.remove(); window.clearInterval(timer); }
		});
	}

	return {
		el: strip,
		resetBtn: R.reset,
		start() {
			Promise.all([ findWan(), seed() ]).then(() => history()).then(() => {
				tick();
				timer = window.setInterval(tick, EVERY);
			});
		}
	};
}

/* ---------- cards: priority order, drag & drop ---------- */

const PIN_KEY = 'nightfall-overview-pins-v1';
const NAMES_KEY = 'nightfall-names-v1';
let PIN_MEM = null, NAMES_MEM = null, EDITING = false;

function loadPins() {
	try { const v = JSON.parse(window.localStorage.getItem(PIN_KEY) || 'null'); return Array.isArray(v) ? v : (PIN_MEM || []); }
	catch (e) { return PIN_MEM || []; }
}

function savePins(list) {
	PIN_MEM = list;
	try { window.localStorage.setItem(PIN_KEY, JSON.stringify(list)); } catch (e) { /* private mode */ }
}

function loadNames() {
	try { const v = JSON.parse(window.localStorage.getItem(NAMES_KEY) || 'null'); return v && typeof v === 'object' ? v : (NAMES_MEM || {}); }
	catch (e) { return NAMES_MEM || {}; }
}

function setName(key, value) {
	const n = Object.assign({}, loadNames());
	if (value) n[key] = value; else delete n[key];
	NAMES_MEM = n;
	try { window.localStorage.setItem(NAMES_KEY, JSON.stringify(n)); } catch (e) { /* private mode */ }
}

const nameKey = k => String(k || '').toUpperCase();

/* inline rename: swaps the title box for an input; Enter or leaving the field saves, Esc cancels, empty text restores the automatic name */
function editName(box, key, auto, done) {
	const inp = E('input', { class: 'nf-rename', type: 'text', maxlength: '40', placeholder: auto, 'aria-label': 'Custom device name' });
	inp.value = loadNames()[nameKey(key)] || '';
	box.replaceChildren(inp);
	EDITING = true;
	inp.focus(); inp.select();
	let fin = false;
	const end = save => {
		if (fin) return;
		fin = true; EDITING = false;
		if (save) setName(nameKey(key), inp.value.trim());
		done();
	};
	inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') end(true); else if (ev.key === 'Escape') end(false); });
	inp.addEventListener('blur', () => end(true));
}

let MEM = null;   /* fallback when localStorage is blocked: order survives until the page is reloaded */

function loadOrder() {
	try { const v = JSON.parse(window.localStorage.getItem(ORDER_KEY) || 'null'); return Array.isArray(v) ? v : MEM; }
	catch (e) { return MEM; }
}

function saveOrder(list) {
	MEM = list || null;
	try {
		if (list) window.localStorage.setItem(ORDER_KEY, JSON.stringify(list));
		else window.localStorage.removeItem(ORDER_KEY);
	} catch (e) { /* private mode */ }
}

function cardsOf(view) {
	return Array.from(view.children).filter(c => c.classList.contains('cbi-section') && c.querySelector(':scope > .cbi-title h3'));
}

function titleOf(sec) {
	const h = sec.querySelector(':scope > .cbi-title h3');
	return h ? (h.getAttribute('data-nf-title') || h.textContent.trim()) : '';
}

function rank(title, index, saved, pins) {
	const pin = pins && pins.includes(title) ? 0 : 1;
	const si = saved ? saved.indexOf(title) : -1;
	if (si >= 0) return [ pin, 0, si, 0 ];
	let p = PRIORITY.findIndex(re => re.test(title));
	if (p < 0) p = 100;
	return [ pin, 1, p, index ];
}

function sortCards(view, saved) {
	const cards = cardsOf(view);
	if (cards.length < 2) return;
	const pins = loadPins();
	const sorted = cards.map((c, i) => ({ c, r: rank(titleOf(c), i, saved, pins) }))
		.sort((a, b) => a.r[0] - b.r[0] || a.r[1] - b.r[1] || a.r[2] - b.r[2] || a.r[3] - b.r[3]).map(x => x.c);
	if (sorted.every((c, i) => c === cards[i])) return;   /* already in order: do not touch the DOM (restarts animations) */
	const marker = document.createComment('nf');
	view.insertBefore(marker, cards[0]);
	sorted.forEach(c => view.insertBefore(c, marker));
	marker.remove();
}

/* FLIP: remember where the elements were, run the change, then glide them from the old place to the new one */
function flip(items, mutate) {
	if (document.documentElement.getAttribute('data-nf-motion') === 'off') { mutate(); return; }
	const before = new Map(items.map(e => [ e, e.getBoundingClientRect() ]));
	mutate();
	const moved = [];
	items.forEach(e => {
		const a = before.get(e), b = e.getBoundingClientRect();
		const dx = a.left - b.left, dy = a.top - b.top;
		if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
		e.style.transition = 'none';
		e.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';
		moved.push(e);
	});
	if (!moved.length) return;
	void document.body.offsetWidth;
	window.requestAnimationFrame(() => moved.forEach(e => {
		e.classList.add('nf-moving');
		e.style.transition = 'transform .3s cubic-bezier(.2, .8, .2, 1)';
		e.style.transform = '';
		let done = false;
		const fin = () => { if (done) return; done = true; e.style.transition = ''; e.classList.remove('nf-moving'); e.removeEventListener('transitionend', fin); };
		e.addEventListener('transitionend', fin);
		window.setTimeout(fin, 420);
	}));
}

/* pointer-driven drag: the card follows the cursor, a dashed slot marks where it will land, the others glide aside */
function startDrag(view, sec, ev, persist) {
	const rect = sec.getBoundingClientRect(), cs = window.getComputedStyle(sec);
	const offX = ev.clientX - rect.left, offY = ev.clientY - rect.top;
	let px = ev.clientX, py = ev.clientY, last = 0, raf = 0, ended = false;

	const slot = E('div', { class: 'nf-slot' });
	slot.style.gridColumn = cs.gridColumnStart + ' / ' + cs.gridColumnEnd;
	slot.style.gridRowEnd = sec.style.gridRowEnd;
	slot.style.height = rect.height + 'px';
	slot.style.marginBottom = cs.marginBottom;
	DRAG = true;
	view.insertBefore(slot, sec);
	document.body.classList.add('nf-drag-on');
	sec.classList.add('nf-lifted');
	sec.style.left = rect.left + 'px'; sec.style.top = rect.top + 'px';
	sec.style.width = rect.width + 'px'; sec.style.height = rect.height + 'px';

	const check = () => {
		const now = performance.now();
		if (now - last < 150) return;
		const others = cardsOf(view).filter(c => c !== sec);
		const target = others.find(c => { const r = c.getBoundingClientRect(); return px >= r.left && px <= r.right && py >= r.top && py <= r.bottom; });
		if (!target) return;
		const r = target.getBoundingClientRect(), wide = r.width > view.clientWidth * 0.7;
		const rx = (px - r.left) / r.width - 0.5, ry = (py - r.top) / r.height - 0.5;
		const before = (!wide && Math.abs(rx) > Math.abs(ry)) ? rx < 0 : ry < 0;
		const ref = before ? target : target.nextSibling;
		if (ref === slot || slot.nextSibling === ref) return;
		flip(others, () => view.insertBefore(slot, ref));
		last = now;
	};

	const loop = () => {
		if (ended) return;
		if (py < 70) window.scrollBy(0, -Math.min(22, (70 - py) / 3 + 4));
		else if (py > window.innerHeight - 70) window.scrollBy(0, Math.min(22, (py - (window.innerHeight - 70)) / 3 + 4));
		check();
		raf = window.requestAnimationFrame(loop);
	};

	const move = e => {
		px = e.clientX; py = e.clientY;
		sec.style.left = (px - offX) + 'px'; sec.style.top = (py - offY) + 'px';
		check();
	};

	const finish = () => {
		if (ended) return;
		ended = true;
		window.cancelAnimationFrame(raf);
		window.removeEventListener('pointermove', move);
		window.removeEventListener('pointerup', finish);
		window.removeEventListener('pointercancel', finish);
		const t = slot.getBoundingClientRect();
		const land = () => {
			view.insertBefore(sec, slot);
			slot.remove();
			sec.classList.remove('nf-lifted', 'nf-landing');
			sec.style.left = sec.style.top = sec.style.width = sec.style.height = sec.style.transition = '';
			document.body.classList.remove('nf-drag-on');
			persist();
			DRAG = false;
		};
		if (document.documentElement.getAttribute('data-nf-motion') === 'off') { land(); return; }
		sec.classList.add('nf-landing');
		sec.style.left = t.left + 'px'; sec.style.top = t.top + 'px';
		let done = false;
		const fin = () => { if (done) return; done = true; land(); };
		sec.addEventListener('transitionend', fin);
		window.setTimeout(fin, 320);
	};

	window.addEventListener('pointermove', move);
	window.addEventListener('pointerup', finish);
	window.addEventListener('pointercancel', finish);
	raf = window.requestAnimationFrame(loop);
}

const ICONS = [
	[ /Интернет|Internet/i, 'net' ], [ /^(Сеть|Network)$/i, 'network' ], [ /порт|Port/i, 'ports' ], [ /Беспровод|Wireless|Wi.?Fi/i, 'wifi' ],
	[ /Top clients/i, 'top' ], [ /Router health/i, 'health' ], [ /Event feed/i, 'events' ], [ /Quick actions/i, 'quick' ],
	[ /^(Система|System)$/i, 'system' ], [ /Температур|Temperature/i, 'temp' ], [ /Память|Memory/i, 'mem' ], [ /Хранилищ|Storage/i, 'disk' ], [ /DHCP|Аренд/i, 'dhcp' ]
];
const iconFor = title => (ICONS.find(x => x[0].test(title)) || [ 0, 'generic' ])[1];

/* card size: '' (normal) → wide → min; remembered by card title */
let SIZE_MEM = null;
function loadSizes() {
	try { const v = JSON.parse(window.localStorage.getItem(SIZE_KEY) || 'null'); return v && typeof v === 'object' ? v : (SIZE_MEM || {}); }
	catch (e) { return SIZE_MEM || {}; }
}
function saveSizes(m) {
	SIZE_MEM = m;
	try { window.localStorage.setItem(SIZE_KEY, JSON.stringify(m)); } catch (e) { /* private mode */ }
}
/* card height set by the user by dragging the corner (px, by card title) */
let H_MEM = null;
function loadHeights() {
	try { const v = JSON.parse(window.localStorage.getItem(HEIGHT_KEY) || 'null'); return v && typeof v === 'object' ? v : (H_MEM || {}); }
	catch (e) { return H_MEM || {}; }
}
function saveHeights(m) {
	H_MEM = m;
	try { window.localStorage.setItem(HEIGHT_KEY, JSON.stringify(m)); } catch (e) { /* private mode */ }
}
/* do not break IP and MAC addresses in tables (DHCP leases, Wi‑Fi) mid-string */
const NW_RE = /^((\d{1,3}\.){3}\d{1,3}|([0-9a-f]{2}[:-]){5}[0-9a-f]{2})$/i;
function markNoWrap(view) {
	view.querySelectorAll('.td, td').forEach(td => {
		if (!td.classList.contains('nf-nw') && NW_RE.test(td.textContent.trim())) td.classList.add('nf-nw');
	});
}

/* Tables with live data (Wi‑Fi clients, DHCP leases): LuCI rebuilds the rows every 5 seconds, and column widths and row heights
   "breathe" because of changing text (signal, rate, labels). Remember the largest sizes and do not let the table shrink back.
   Called synchronously from a MutationObserver before the frame is painted, so no jump is visible. Reset when the window is resized. */
let STAB_GEN = 0, STAB_W = window.innerWidth;
const STAB_MEM = {};   /* largest sizes per table id: LuCI recreates the table on every poll, so the memory must survive the element being replaced */
window.addEventListener('resize', () => { if (Math.abs(window.innerWidth - STAB_W) > 2) { STAB_W = window.innerWidth; STAB_GEN++; } });
/* card size, density, font or style changed in Personalization: forget the collected minimums, otherwise tables would keep their old size */
new MutationObserver(() => {
	STAB_GEN++;
	const v = document.getElementById('view');
	if (v) { v.querySelectorAll('.cbi-section').forEach(c => { if (!c.classList.contains('nf-fixh')) c.style.minHeight = ''; }); window.setTimeout(() => { stabilizeTables(v); window.dispatchEvent(new Event('resize')); }, 120); }
}).observe(document.documentElement, { attributes: true, attributeFilter: [ 'data-nf-ov-size', 'data-nf-density', 'data-nf-font', 'data-nf-style', 'data-nf-radius', 'data-nf-fsz', 'data-nf-ovwide', 'data-nf-ov-cols', 'style' ] });
/* "Associated Stations": host name on the first line, IP and MAC below (the separate MAC column is hidden) */
function decorateHosts(view) {
	view.querySelectorAll('#wifi_assoclist_table').forEach(tb => {
		let any = false;
		tb.querySelectorAll('tr.tr, .tr').forEach(r => {
			if (r.classList.contains('table-titles') || r.querySelector(':scope > .th, :scope > th')) return;
			const c = r.querySelectorAll(':scope > .td, :scope > td');
			if (c.length < 3 || c[2].querySelector('.nf-host')) { if (c.length >= 3) any = true; return; }
			const mac = (c[1].textContent || '').trim(), raw = (c[2].textContent || '').trim();
			const m = /^(.+?)\s*\(([^)]*)\)\s*$/.exec(raw);
			const name = m ? m[1] : '', addrs = (m ? m[2] : raw).split(/\s*,\s*/).filter(Boolean);
			const v4 = addrs.find(a => /^\d+\.\d+\.\d+\.\d+$/.test(a)) || addrs[0] || '';
			const wrap = E('div', { class: 'nf-host', title: raw }), isMac = x => x && /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/i.test(x);
			if (name) {
				wrap.appendChild(E('div', { class: 'nf-h1' }, name));
				wrap.appendChild(E('div', { class: 'nf-h2' }, [ v4, isMac(mac) ? E('span', { class: 'nf-h2m' }, ' · ' + mac) : '' ]));
			} else wrap.appendChild(E('div', { class: 'nf-h1 nf-h1ip' }, [ v4 || '?', isMac(mac) ? E('span', { class: 'nf-h2m' }, ' · ' + mac) : '' ]));
			c[2].textContent = ''; c[2].appendChild(wrap);
			any = true;
		});
		tb.classList.toggle('nf-hostmerged', any);
	});
}
/* "Free" memory: the more free, the better. Green: plenty left, yellow: medium, red: low (the reverse of normal bars) */
/* line color by load: green, yellow, red */
/* tile color thresholds from the theme settings (attribute on <html>, "mid,bad") */
function thr(k, mid, bad) {
	const p = (document.documentElement.getAttribute('data-nf-thr-' + k) || '').split(',').map(parseFloat);
	return p.length === 2 && isFinite(p[0]) && isFinite(p[1]) && p[0] < p[1] ? p : [ mid, bad ];
}

function setLvl(el, v, mid, bad) {
	const tile = el && el.closest ? el.closest('.nf-tile') : null;
	if (tile) {
		tile.setAttribute('data-lvl', v == null ? '' : v >= bad ? 'bad' : v >= mid ? 'mid' : 'ok');
		tile.style.setProperty('--ring', v == null || !(v > 0) ? 0 : Math.max(4, Math.min(100, v)));
	}
}
/* the number on a card smoothly "rolls" to the new value */
function setNum(el, text) {
	const m = /^(\D*)(-?\d+(?:[.,]\d+)?)(.*)$/.exec(text), off = document.documentElement.getAttribute('data-nf-motion') === 'off';
	if (el._nfR) { cancelAnimationFrame(el._nfR); el._nfR = 0; }
	const to = m ? parseFloat(m[2].replace(',', '.')) : null, from = el._nfN, sfx = m ? m[1] + '|' + m[3] : '';
	const same = el._nfS === sfx;      /* the unit or prefix changed (Kbit → Mbit): do not roll the number */
	el._nfN = to; el._nfS = sfx;
	if (!m || off || from == null || from === to || !same || Math.abs(to - from) > 1e6) { el.textContent = text; return; }
	const dec = (m[2].split(/[.,]/)[1] || '').length, sep = m[2].indexOf(',') >= 0 ? ',' : '.', t0 = performance.now(), D = 500;
	const step = now => {
		const k = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - k, 3);
		el.textContent = k >= 1 ? text : m[1] + (from + (to - from) * e).toFixed(dec).replace('.', sep) + m[3];
		el._nfR = k < 1 ? requestAnimationFrame(step) : 0;
	};
	el._nfR = requestAnimationFrame(step);
}
function levelFree(view) {
	const fmt = (n, u) => (Math.round(n * 100) / 100).toFixed(2) + ' ' + u;
	view.querySelectorAll('.cbi-progressbar').forEach(pb => {
		const row = pb.closest('.tr, tr'), lab = row && row.querySelector('.td, td');
		if (!lab) return;
		const t = (lab.textContent || '').trim(), title = pb.getAttribute('title') || '';
		const m = /\((\d+(?:[.,]\d+)?)%\)\s*$/.exec(title); if (!m) return;
		const f = parseFloat(m[1].replace(',', '.'));
		if (/^(свободно|free|available|доступно)$/i.test(t)) pb.setAttribute('data-nf-free', f >= 30 ? 'ok' : f >= 12 ? 'mid' : 'low');
		else if (/^(занято|used|в\s+использовании)$/i.test(t)) {
			/* "Used" = everything that is not free (including cache): 67% free → 33% used */
			const fr = Array.from((row.closest('.table, table') || view).querySelectorAll('.cbi-progressbar')).find(x => { const r = x.closest('.tr, tr'), l = r && r.querySelector('.td, td'); return l && /^(свободно|free|available|доступно)$/i.test((l.textContent || '').trim()) && x !== pb; });
			const fm = fr && /([\d.,]+)\s*([KMGT]?i?B)\s*\/\s*([\d.,]+)\s*([KMGT]?i?B)\s*\((\d+(?:[.,]\d+)?)%\)/.exec(fr.getAttribute('title') || '');
			let u = f;
			if (fm && fm[2] === fm[4]) {
				const tot = parseFloat(fm[3].replace(',', '.')), fre = parseFloat(fm[1].replace(',', '.'));
				u = Math.max(0, Math.min(100, Math.round(100 - parseFloat(fm[5].replace(',', '.')))));
				const nt = fmt(tot - fre, fm[2]) + ' / ' + fmt(tot, fm[4]) + ' (' + u + '%)';
				if (title !== nt) { pb.setAttribute('title', nt); pb.setAttribute('data-nf-fixed', '1'); }
				const bar = pb.firstElementChild; if (bar && bar.style.width !== u + '%') bar.style.width = u + '%';
			}
			pb.setAttribute('data-nf-free', u < 60 ? 'ok' : u < 85 ? 'mid' : 'low');
		}
		else if (/^(буферизовано|кэшировано|кешировано|buffered|cached|shared)/i.test(t)) pb.setAttribute('data-nf-free', 'dim');
		else if (/(дисков|временн|storage|disk|temporary|tmp|overlay|root)/i.test(t)) pb.setAttribute('data-nf-free', f < 70 ? 'ok' : f < 90 ? 'mid' : 'low');   /* storage: fill level */
	});
}
function stabilizeTables(view) {
	view.querySelectorAll('.table').forEach(tb => {
		if (!tb.querySelector('.td[data-title], td')) return;
		const st = tb.id ? (STAB_MEM[tb.id] = STAB_MEM[tb.id] || {}) : (tb.__nfSt = tb.__nfSt || {});
		if (st.gen !== STAB_GEN) { st.gen = STAB_GEN; st.col = []; st.row = []; st.h = 0; }
		if (tb.__nfGen !== STAB_GEN) { tb.__nfGen = STAB_GEN; tb.querySelectorAll('.tr, tr').forEach(r => { r.style.minHeight = ''; r.querySelectorAll('.td, .th, td, th').forEach(c => { c.style.minWidth = ''; }); }); tb.style.minHeight = ''; }
		const rows = Array.from(tb.querySelectorAll(':scope > .tr, :scope > tbody > tr, :scope > thead > tr'));
		if (!rows.length || tb.getBoundingClientRect().width < 40) return;
		/* the row count changed (a client left or joined): remember the height again, otherwise empty space remains under the table */
		if (st.n !== rows.length) {
			if (st.n != null) { st.row = []; st.h = 0; tb.style.minHeight = ''; rows.forEach(r => { r.style.minHeight = ''; }); }
			st.n = rows.length;
		}
		/* remembered widths must not overflow the card: on overflow reset and measure again */
		const box = tb.parentElement;
		if (box && st.col.length && tb.getBoundingClientRect().width > box.clientWidth + 2) {
			st.col = []; tb.querySelectorAll('.td, .th, td, th').forEach(c => { c.style.minWidth = ''; });
			st.noW = Date.now();
		}
		const keepW = !st.noW || Date.now() - st.noW > 60000;   /* after an overflow, do not lock widths for a minute */
		rows.forEach((r, ri) => {
			const cells = Array.from(r.querySelectorAll(':scope > .td, :scope > .th, :scope > td, :scope > th'));
			cells.forEach((c, ci) => {
				const w = Math.ceil(c.getBoundingClientRect().width);
				if (!keepW) return;
				if (w > (st.col[ci] || 0)) st.col[ci] = w;
				if (st.col[ci] && c.style.minWidth !== st.col[ci] + 'px') c.style.minWidth = st.col[ci] + 'px';
			});
			const h = Math.ceil(r.getBoundingClientRect().height);
			if (h > (st.row[ri] || 0)) st.row[ri] = h;
			if (st.row[ri] && r.style.minHeight !== st.row[ri] + 'px') r.style.minHeight = st.row[ri] + 'px';
		});
		const th = Math.ceil(tb.getBoundingClientRect().height);
		if (th > st.h) st.h = th;
		if (st.h && tb.style.minHeight !== st.h + 'px') tb.style.minHeight = st.h + 'px';
	});
}

function syncSizes(view, relayoutNow) {
	const m = loadSizes();
	cardsOf(view).forEach(sec => {
		const t = titleOf(sec), v = m[t] || '';
		sec.classList.toggle('nf-wide', v === 'wide');
		sec.classList.toggle('nf-min', v === 'min');
		const hh = +loadHeights()[t] || 0;
		sec.style.minHeight = hh && v !== 'min' ? hh + 'px' : '';
		sec.classList.toggle('nf-fixh', !!hh && v !== 'min');
		const b = sec.querySelector(':scope > .cbi-title .nf-size');
		if (b) { b.setAttribute('data-s', v); b.title = v === 'wide' ? 'Wide. Click to collapse' : v === 'min' ? 'Collapsed. Click to restore normal size' : 'Normal size. Click to stretch to full width'; }
	});
	if (relayoutNow) window.dispatchEvent(new Event('resize'));
}

function syncPins(view) {
	const pins = loadPins();
	cardsOf(view).forEach(sec => {
		const on = pins.includes(titleOf(sec));
		sec.classList.toggle('nf-pinned', on);
		const b = sec.querySelector(':scope > .cbi-title .nf-pin');
		if (b) { b.setAttribute('aria-pressed', String(on)); b.title = on ? 'Unpin' : 'Pin to top'; }
	});
}

function decorateCards(view) {
	const persist = () => saveOrder(cardsOf(view).map(titleOf));

	cardsOf(view).forEach(sec => {
		if (sec.hasAttribute('data-nf-card')) { if (sec.__nfRs && sec.__nfRs.parentNode !== sec) sec.appendChild(sec.__nfRs); return; }   /* LuCI may rebuild the content: put the corner back */
		sec.setAttribute('data-nf-card', '1');

		const h3 = sec.querySelector(':scope > .cbi-title h3');
		const tn = h3.firstChild;
		if (!tn || tn.nodeType !== 3) return;

		const title = tn.data.trim();
		h3.setAttribute('data-nf-title', title);
		const grip = E('span', {
			class: 'nf-grip', role: 'button', tabindex: '0', title: 'Drag to move the card (or press ↑ ↓ on this icon)',
			'aria-label': 'Move card "' + title + '"'
		}, '⋮⋮');
		const pin = E('button', { type: 'button', class: 'nf-pin', title: 'Pin to top', 'aria-label': 'Pin card "' + title + '"', 'aria-pressed': 'false' });
		pin.addEventListener('click', ev => {
			ev.preventDefault(); ev.stopPropagation();
			const pins = loadPins().filter(t => t !== title);
			if (!loadPins().includes(title)) pins.push(title);
			savePins(pins);
			syncPins(view);
			flip(cardsOf(view), () => sortCards(view, loadOrder()));
		});
		const size = E('button', { type: 'button', class: 'nf-size', 'data-s': '', 'aria-label': 'Size of card "' + title + '"' });
		size.addEventListener('click', ev => {
			ev.preventDefault(); ev.stopPropagation();
			const m = Object.assign({}, loadSizes()), cur = m[title] || '';
			const nx = cur === '' ? 'wide' : cur === 'wide' ? 'min' : '';
			if (nx) m[title] = nx; else delete m[title];
			saveSizes(m);
			syncSizes(view, true);
		});
		h3.replaceChild(E('span', { class: 'nf-ttl' }, [ grip, E('i', { class: 'nf-ci', 'data-i': iconFor(title), 'aria-hidden': 'true' }), title, pin, size ]), tn);

		const hb = h3.querySelector(':scope > .label[data-indicator], :scope > .cbi-button, :scope > button');
		if (hb) {
			const sync = () => {
				const tx = (hb.textContent || '').trim();
				if (tx) { hb.setAttribute('title', tx); hb.setAttribute('aria-label', tx); }
				hb.classList.toggle('nf-show', /показ|разв|show|unhide/i.test(tx));
			};
			sync(); hb.addEventListener('mouseenter', sync); hb.addEventListener('focus', sync);
			hb.addEventListener('click', () => { window.setTimeout(sync, 60); window.setTimeout(sync, 400); });
		}

		grip.addEventListener('pointerdown', ev => {
			if (DRAG || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
			ev.preventDefault();
			const x0 = ev.clientX, y0 = ev.clientY;
			const probe = e => {
				if (Math.abs(e.clientX - x0) + Math.abs(e.clientY - y0) < 4) return;
				drop();
				startDrag(view, sec, e, persist);
			};
			const drop = () => { window.removeEventListener('pointermove', probe); window.removeEventListener('pointerup', drop); window.removeEventListener('pointercancel', drop); };
			window.addEventListener('pointermove', probe);
			window.addEventListener('pointerup', drop);
			window.addEventListener('pointercancel', drop);
		});

		/* resize corner: right/left changes the width (one column or full width), down/up the height */
		const rs = E('span', { class: 'nf-rs', role: 'slider', tabindex: '0', 'aria-label': 'Size of card "' + title + '": arrow keys change width and height, Delete resets',
			title: 'Drag to resize. Double-click to reset.' });
		sec.appendChild(rs); sec.__nfRs = rs;
		const setH = (px, save) => {
			const m = Object.assign({}, loadHeights());
			if (px) m[title] = Math.round(px); else delete m[title];
			if (save) saveHeights(m);
			sec.style.minHeight = px ? Math.round(px) + 'px' : '';
			sec.classList.toggle('nf-fixh', !!px);
		};
		const setW = wide => {
			const m = Object.assign({}, loadSizes());
			if (wide) m[title] = 'wide'; else delete m[title];
			saveSizes(m);
			syncSizes(view, true);
		};
		rs.addEventListener('pointerdown', ev => {
			if (ev.pointerType === 'mouse' && ev.button !== 0) return;
			ev.preventDefault(); ev.stopPropagation();
			const x0 = ev.clientX, y0 = ev.clientY, h0 = sec.getBoundingClientRect().height, wide0 = sec.classList.contains('nf-wide');
			const multi = window.matchMedia('(min-width: 900px)').matches;
			rs.setPointerCapture(ev.pointerId);
			sec.classList.add('nf-resizing');
			let moved = false;
			const mv = e => {
				const dy = e.clientY - y0, dx = e.clientX - x0;
				if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
				if (!moved) return;
				setH(Math.max(90, h0 + dy), false);
				if (multi) {
					if (!wide0 && dx > 70) sec.classList.add('nf-wide');
					else if (wide0 && dx < -70) sec.classList.remove('nf-wide');
					else sec.classList.toggle('nf-wide', wide0);
				}
				window.dispatchEvent(new Event('resize'));
			};
			const up = () => {
				rs.removeEventListener('pointermove', mv); rs.removeEventListener('pointerup', up); rs.removeEventListener('pointercancel', up);
				sec.classList.remove('nf-resizing');
				if (!moved) return;   /* a simple click does not remember anything */
				const hh = Math.round(sec.getBoundingClientRect().height);
				saveHeights(Object.assign({}, loadHeights(), { [title]: Math.max(90, hh) }));
				const m = Object.assign({}, loadSizes());
				if (sec.classList.contains('nf-wide')) m[title] = 'wide'; else if (m[title] === 'wide') delete m[title];
				saveSizes(m);
				syncSizes(view, true);
			};
			rs.addEventListener('pointermove', mv); rs.addEventListener('pointerup', up); rs.addEventListener('pointercancel', up);
		});
		rs.addEventListener('dblclick', () => { setH(0, true); setW(false); });
		rs.addEventListener('keydown', ev => {
			const cur = sec.getBoundingClientRect().height;
			if (ev.key === 'ArrowRight') setW(true);
			else if (ev.key === 'ArrowLeft') setW(false);
			else if (ev.key === 'ArrowDown') setH(cur + 40, true);
			else if (ev.key === 'ArrowUp') setH(Math.max(90, cur - 40), true);
			else if (ev.key === 'Delete' || ev.key === 'Backspace' || ev.key === 'Home') { setH(0, true); setW(false); }
			else return;
			ev.preventDefault(); window.dispatchEvent(new Event('resize'));
		});

		grip.addEventListener('keydown', ev => {
			if (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown') return;
			ev.preventDefault();
			const list = cardsOf(view), i = list.indexOf(sec);
			let ok = false;
			if (ev.key === 'ArrowUp' && i > 0) { flip(list, () => view.insertBefore(sec, list[i - 1])); ok = true; }
			else if (ev.key === 'ArrowDown' && i < list.length - 1) { flip(list, () => view.insertBefore(list[i + 1], sec)); ok = true; }
			if (!ok) return;
			grip.focus();
			persist();
		});
	});
}

/* ---------- status badges ---------- */

function signalLevel(dbm) {
	if (dbm >= -60) return [ 'ok', 'Excellent' ];
	if (dbm >= -70) return [ 'ok', 'Good' ];
	if (dbm >= -80) return [ 'warn', 'Weak' ];
	return [ 'bad', 'Poor' ];
}

/* Idempotent: called synchronously from a MutationObserver (before the frame is painted),
   so the raw LuCI text ("no link", "1 GbE") never reaches the screen. */
function enhanceBadges(view) {
	/* Wi-Fi clients: signal strength */
	view.querySelectorAll('.ifacebadge[data-signal]').forEach(b => {
		const raw = b.getAttribute('data-signal');
		const have = b.querySelector(':scope > .nf-badge');
		if (have && b.getAttribute('data-nf-q') === raw) return;
		const dbm = parseInt(raw, 10);
		b.setAttribute('data-nf-q', raw);
		if (!isFinite(dbm)) return;
		const [ kind, text ] = signalLevel(dbm);
		if (have) { have.className = 'nf-badge ' + kind; if (have.textContent !== text) have.textContent = text; }
		else b.appendChild(badge(kind, text));
	});

	/* port boxes: link state next to the speed */
	view.querySelectorAll('.ifacebox').forEach(box => {
		const img = box.querySelector('.ifacebox-body > img[src*="port_"], .ifacebox-body > img[src*="/pse_"]');
		if (!img) return;
		const head = box.querySelector('.ifacebox-head');
		if (head) {
			let titleEl = head.querySelector('strong, h3, h4, .nf-port-title');
			if (!titleEl) {
				/* LuCI 25.12 renders the port name as a bare text node, not as strong/h3.
				   Wrap that node so the edit control has a stable target and survives observer passes. */
				const textNode = Array.from(head.childNodes).find(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
				if (textNode) {
					titleEl = document.createElement('span');
					titleEl.className = 'nf-port-title';
					titleEl.textContent = textNode.textContent.trim();
					head.replaceChild(titleEl, textNode);
				}
				else titleEl = head.firstElementChild;
			}
			if (titleEl) {
				if (!box.hasAttribute('data-nf-port-key')) box.setAttribute('data-nf-port-key', titleEl.textContent.trim());
				const key = box.getAttribute('data-nf-port-key');
				if (key) {
					const custom = portLabelsLoad()[key] || '';
					if (titleEl.textContent !== (custom || key)) titleEl.textContent = custom || key;
					let edit = head.querySelector(':scope > .nf-port-edit');
					if (!edit) {
						edit = document.createElement('button');
						edit.type = 'button'; edit.className = 'nf-port-edit'; edit.textContent = '✎'; edit.style.cssText = 'margin-left:6px;border:0;background:transparent;color:inherit;cursor:pointer;opacity:.7;padding:2px 5px;border-radius:6px;font:inherit';
						edit.title = 'Edit the card label (this browser only)';
						edit.setAttribute('aria-label', 'Edit label of port ' + key);
						edit.addEventListener('click', ev => {
							ev.preventDefault(); ev.stopPropagation();
							const current = portLabelsLoad()[key] || '';
							const value = window.prompt('Label for card ' + key + '. Leave empty to restore the original name:', current);
							if (value === null) return;
							const next = portLabelsLoad(), label = value.trim().slice(0, 40);
							if (label) next[key] = label; else delete next[key];
							if (!portLabelsSave(next)) { window.alert('Could not save the label in the browser.'); return; }
							titleEl.textContent = label || key;
						});
						head.appendChild(edit);
					}
				}
			}
		}
		const up = /_up\.svg/.test(img.getAttribute('src'));
		const state = up ? 'up' : 'down';
		if (box.getAttribute('data-nf-port') !== state) box.setAttribute('data-nf-port', state);
		const body = img.parentNode, node = body.lastChild;
		if (!node || node === img || node.nodeName === 'BR') return;
		if (node.nodeType === 3) {
			const raw = node.data.trim();
			if (!raw) return;
			let txt = raw;
			if (!up && /соедин|no link|not connected|disconnected|нет/i.test(txt)) txt = 'no link';
			const bd = badge(up ? 'ok' : 'off', txt);
			bd.title = raw;
			body.replaceChild(bd, node);
		}
		else if (!node.classList.contains('nf-badge') || !node.classList.contains(up ? 'ok' : 'off')) {
			node.classList.remove('ok', 'off');
			node.classList.add('nf-badge', up ? 'ok' : 'off');
		}
	});
}

/* ---------- dense grid layout: each card spans N rows of 8px ---------- */

/* Card layout by columns. Computed here rather than in the stylesheet, so it works regardless of which classes LuCI has applied.
   "Auto" follows the old rules: 2 columns, 3 with "Compact" on screens from 1700 px, 1 with "Large" or "Single column". */
function applyColumns(view, relayout) {
	const root = document.documentElement, pref = root.getAttribute('data-nf-ov-cols') || '0';
	const size = root.getAttribute('data-nf-ov-size') || 'md', wideOn = root.getAttribute('data-nf-ov-wide') === 'on';
	const w = window.innerWidth;
	let n = pref === '1' || pref === '2' || pref === '3' ? +pref : (size === 'lg' || wideOn ? 1 : size === 'sm' && w >= 1700 ? 3 : 2);
	if (w < 900) n = 0;
	const imp = (el, k, v) => el.style.setProperty(k, v, 'important');
	const clear = (el, ks) => ks.forEach(k => el.style.removeProperty(k));
	const kids = Array.from(view.children).filter(c => c.nodeType === 1);
	if (!n) {
		clear(view, [ 'display', 'grid-template-columns', 'grid-auto-rows', 'grid-auto-flow', 'column-gap', 'row-gap', 'align-items', 'column-count' ]);
		kids.forEach(c => { clear(c, [ 'grid-column', 'margin', 'align-self', 'min-width', 'width', 'break-inside', 'column-span' ]); c.style.gridRowEnd = ''; });
		if (relayout) relayout();
		return;
	}
	/* dense grid: 8 px rows, a card spans as many rows as it needs; dense pulls following cards into free spots */
	imp(view, 'display', 'grid'); imp(view, 'column-count', 'auto'); imp(view, 'grid-template-columns', 'repeat(' + n + ', minmax(0, 1fr))');
	imp(view, 'grid-auto-rows', '8px'); imp(view, 'grid-auto-flow', 'row dense'); imp(view, 'column-gap', '16px'); imp(view, 'row-gap', '0'); imp(view, 'align-items', 'start');
	kids.forEach(c => {
		const card = c.classList.contains('cbi-section') && !c.classList.contains('nf-live');
		const span = !card || (n > 1 && (c.classList.contains('nf-wide') || !!c.querySelector('.table .th:nth-child(5)')));
		clear(c, [ 'break-inside', 'column-span', 'width' ]);
		imp(c, 'grid-column', span ? '1 / -1' : 'auto'); imp(c, 'min-width', '0'); imp(c, 'align-self', 'start');
		if (card || c.classList.contains('nf-live')) imp(c, 'margin', '0');
	});
	if (relayout) relayout();
}

function gridLayout(view) {
	const ROW = 8, GAP = 16;
	let raf = 0;
	const ro = new ResizeObserver(() => schedule());
	const seen = new WeakSet();

	function apply() {
		raf = 0;
		const grid = window.getComputedStyle(view).display === 'grid';
		Array.from(view.children).forEach(el => {
			if (el.nodeType !== 1 || window.getComputedStyle(el).display === 'none') return;
			if (!seen.has(el)) { seen.add(el); ro.observe(el); }
			if (!grid) { el.style.gridRowEnd = ''; return; }
			const h = el.getBoundingClientRect().height;
			el.style.gridRowEnd = 'span ' + Math.max(1, Math.ceil((h + GAP) / ROW));
		});
	}
	function schedule() { if (!raf) raf = window.requestAnimationFrame(apply); }

	window.addEventListener('resize', schedule);
	return schedule;
}



/* ---------- "New device on the network" banner: from collector events over the last 24 hours ---------- */
const NEWDEV_RE = /^New device(?: on(?: the)? network)?:\s*/i;
function newDevBanner() {
	const el = E('div', { class: 'nf-newdev', hidden: 'hidden' });
	let timer = null;
	const seenKey = 'nightfall-newdev-seen';
	const seen = () => { try { return parseInt(localStorage.getItem(seenKey), 10) || 0; } catch (e) { return 0; } };
	const mark = ts => { try { localStorage.setItem(seenKey, String(ts)); } catch (e) { /* ignore */ } };
	function load() {
		if (document.hidden) return;
		fs.exec(HIST, [ 'series', 'fine' ]).then(res => {
			let h = null;
			try { h = JSON.parse(res.stdout); } catch (e) { /* no collector */ }
			const now = Date.now() / 1000, last = seen();
			const ev = ((h && h.events) || []).filter(e => typeof e[2] === 'string' && NEWDEV_RE.test(e[2]) && e[0] > last && now - e[0] < 86400);
			if (!ev.length) { el.hidden = true; return; }
			const lastEv = ev[ev.length - 1], txt = lastEv[2].replace(NEWDEV_RE, '').trim();
			const mac = (txt.match(/([0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5})/) || [])[1];
			const priv = /private (?:Wi-?Fi )?address/i.test(txt);
			const name = txt.split(',')[0].trim();
			const acts = [ E('button', { type: 'button', class: 'nf-linkbtn', click: () => { mark(Math.ceil(lastEv[0])); el.hidden = true; } }, 'It\'s mine') ];
			if (mac) acts.push(E('button', { type: 'button', class: 'nf-linkbtn nf-bad', click: ev2 => {
				const b = ev2.currentTarget; b.disabled = true;
				fs.exec(BLOCKBIN, [ 'block', mac, /^(unnamed|no name)$/i.test(name) ? '' : name ]).then(() => { mark(Math.ceil(lastEv[0])); el.hidden = true; }).catch(() => { b.disabled = false; });
			} }, 'Block internet'));
			el.replaceChildren(E('span', { class: 'nf-newdev-i', 'aria-hidden': 'true' }, '🆕'),
				E('div', { class: 'nf-newdev-t' }, [ E('b', {}, ev.length > 1 ? 'New devices: ' + ev.length + '. Latest:' : 'New device on the network'), E('span', {}, txt.replace(/\s*\(private.*$/i, '')) , priv ? E('span', { class: 'nf-newdev-n' }, 'Private Wi-Fi address: it may change on a phone.') : '' ]),
				E('div', { class: 'nf-newdev-a' }, acts));
			el.hidden = false;
		}).catch(() => {});
	}
	return { el, start() { load(); timer = window.setInterval(load, 30000); } };
}

/* ---------- top clients card ---------- */

function fmtBytes(b) {
	const u = [ 'B', 'KB', 'MB', 'GB', 'TB' ];
	let i = 0;
	while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
	return (i < 2 ? nf0 : nf2).format(b) + ' ' + u[i];
}

function normIp(ip) {
	if (ip.indexOf(':') < 0) return ip;
	const h = ip.toLowerCase().split('::');
	const a = h[0] ? h[0].split(':') : [], b = h.length > 1 && h[1] ? h[1].split(':') : [];
	const mid = h.length > 1 ? new Array(Math.max(0, 8 - a.length - b.length)).fill('0') : [];
	return a.concat(mid, b).map(g => g.padStart(4, '0')).join(':');
}

/* row sparkline: values is an array of numbers (oldest on the left); drawn as a filled polyline */
function miniSpark(vals, cls) {
	const W = 100, H = 22, n = vals.length;
	if (n < 2) return '';
	const mx = Math.max(1, ...vals);
	const pts = vals.map((v, i) => [ (i / (n - 1) * W).toFixed(1), (H - 2 - (v / mx) * (H - 4)).toFixed(1) ]);
	const line = 'M' + pts.map(p => p.join(' ')).join('L');
	return '<svg class="nf-msp ' + cls + '" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true"><path class="a" d="' + line + 'L' + W + ' ' + H + 'L0 ' + H + 'Z"/><path class="l" d="' + line + '"/></svg>';
}

/* reorder child nodes without needless "yanking": rows already in place are not recreated, their numbers and charts update smoothly */
function syncChildren(parent, nodes) {
	nodes.forEach((nd, i) => { if (parent.children[i] !== nd) parent.insertBefore(nd, parent.children[i] || null); });
	while (parent.children.length > nodes.length) parent.lastElementChild.remove();
}

function topCard() {
	const body = E('div', { class: 'nf-top-b' }, E('div', { class: 'nf-empty' }, 'Collecting data…'));
	let mode = 'now';
	try { mode = localStorage.getItem('nightfall-top-mode') === 'day' ? 'day' : 'now'; } catch (e) { /* ignore */ }
	const modeBtns = [ [ 'now', 'Now' ], [ 'day', 'Today' ] ].map(([ k, t ]) => E('button', { type: 'button', class: 'nf-linkbtn' + (k === mode ? ' on' : ''), 'data-m': k,
		click: ev => { ev.stopPropagation(); mode = k; try { localStorage.setItem('nightfall-top-mode', k); } catch (e) { /* ignore */ } modeBtns.forEach(b => b.classList.toggle('on', b.getAttribute('data-m') === k)); render(last); } }, t));
	const el = E('div', { class: 'cbi-section nf-top fade-in' }, [
		E('div', { class: 'cbi-title nf-top-t' }, [ E('h3', {}, 'Top clients'), E('span', { class: 'nf-top-m', role: 'group', 'aria-label': 'Period' }, modeBtns) ]), body ]);
	let names = null, timer = null, DEVID = null, hrRows = null, hrAt = 0;
	const live = {};            /* device key → latest rate samples (bytes/s), for the "Now" sparkline */
	const rowsEl = new Map();   /* key → { el, parts }: rows persist between updates */
	L.require('nightfall-devid').then(m => { DEVID = m; if (last) render(last); }).catch(() => { /* monitor package without the module: no icons */ });

	let last = null;

	function render(dv) {
		if (EDITING) return;
		last = dv;
		if (!dv || !Array.isArray(dv.rate)) {
			rowsEl.clear();
			body.replaceChildren(E('div', { class: 'nf-empty' }, [ E('b', {}, 'No data'), E('span', {}, 'Per-device statistics collection is not running.') ]));
			return;
		}
		const ipName = {};
		for (const mac in names || {})
			for (const ip of (names[mac].ipaddrs || []).concat(names[mac].ip6addrs || []))
				ipName[normIp(ip)] = { n: names[mac].name || mac, k: mac.toUpperCase(), h: names[mac].name || '' };
		/* address → MAC from the router neighbor table (ip neigh): identifies devices with no DHCP name and with temporary IPv6 addresses */
		const neigh = {};
		for (const [ ip, mac ] of dv.neigh || []) neigh[normIp(ip)] = mac.toUpperCase();
		/* the router's own addresses: current, previous external ones and the whole ISP external subnet (the address changes) */
		const routerIps = String((dv.info && dv.info.router_ips) || '').split(/\s+/).filter(Boolean), routerNets = [];
		const ip4 = ip => { const a = String(ip).split('.'); return a.length === 4 && a.every(x => /^\d+$/.test(x)) ? ((+a[0] * 256 + +a[1]) * 256 + +a[2]) * 256 + +a[3] : -1; };
		String((dv.info && dv.info.router_nets) || '').split(/\s+/).filter(Boolean).forEach(c => { const [ ip, bits ] = c.split('/'), b = ip4(ip), sz = Math.pow(2, 32 - (+bits || 32)); if (b >= 0) routerNets.push([ b - b % sz, sz ]); });
		const isRouter = ip => { if (routerIps.includes(ip)) return true; const x = ip4(ip); return x >= 0 && routerNets.some(([ b, sz ]) => x >= b && x < b + sz); };
		const rows = {};
		const keyOf = ip => {
			if (isRouter(ip)) return 'router';
			const nm = ipName[normIp(ip)];
			return nm ? nm.k : neigh[normIp(ip)] || ip;
		};
		const row = ip => {
			const k = keyOf(ip), nm = ipName[normIp(ip)];
			return rows[k] || (rows[k] = { k, name: k === 'router' ? 'Router' : nm ? nm.n : ip, host: nm ? nm.h : '', ip, rd: 0, ru: 0, dd: 0, du: 0 });
		};
		const fresh = dv.now - dv.ts <= 60;
		if (fresh) for (const [ ip, d, u ] of dv.rate) { const r = row(ip); r.rd += d; r.ru += u; }
		for (const [ ip, d, u ] of dv.day || []) { const r = row(ip); r.dd += d; r.du += u; }
		/* samples for the "Now" sparkline: each update is one point, zero for those with no traffic */
		for (const k in live) if (!rows[k]) live[k].push(0);
		for (const k in rows) (live[k] || (live[k] = [])).push(rows[k].rd + rows[k].ru);
		for (const k in live) { if (live[k].length > 40) live[k].shift(); if (!rows[k] && live[k].every(v => v === 0)) delete live[k]; }
		/* hourly over the day: from the collector's hourly totals (devhr), the hour index counts back from now */
		const hourly = {};
		for (const [ ts, ip, d, u ] of hrRows || []) {
			const i = Math.floor((dv.now - ts) / 3600);
			if (i < 0 || i > 23) continue;
			const a = hourly[keyOf(ip)] || (hourly[keyOf(ip)] = new Array(24).fill(0));
			a[23 - i] += d + u;
		}
		/* the router's own traffic (VPN, proxy) duplicates device traffic, so it is excluded from the "Today" ranking and shares; in "Now" it is shown, so you can see the router downloading something */
		const all = Object.values(rows).filter(r => r.rd + r.ru + r.dd + r.du > 0 && !(mode === 'day' && r.k === 'router')), dayTot = all.reduce((t, r) => t + r.dd + r.du, 0) || 1;
		const list = mode === 'day'
			? all.sort((a, b) => (b.dd + b.du) - (a.dd + a.du) || (b.rd + b.ru) - (a.rd + a.ru)).slice(0, 8)
			: all.sort((a, b) => (b.rd + b.ru) - (a.rd + a.ru) || (b.dd + b.du) - (a.dd + a.du)).slice(0, 5);
		if (!list.length) {
			rowsEl.clear();
			body.replaceChildren(E('div', { class: 'nf-empty' }, [ E('b', {}, 'Quiet for now'), E('span', {}, 'No noticeable traffic from devices right now.') ]));
			return;
		}
		if (body.firstElementChild && body.firstElementChild.classList.contains('nf-empty')) body.replaceChildren();
		const val = r => mode === 'day' ? r.dd + r.du : r.rd + r.ru, mx = Math.max(1, ...list.map(val));
		const seen = new Set();
		const nodes = list.map(r => {
			seen.add(r.k);
			let rw = rowsEl.get(r.k);
			if (!rw) {
				rw = { nbox: E('div', { class: 'nf-top-n' }), sp: E('div', { class: 'nf-top-sp' }), bar: E('i'), dn: E('span'), up: E('span'), tot: E('b'), lbl: E('span') };
				rw.el = E('div', { class: 'nf-top-r' }, [
					rw.nbox,
					E('div', { class: 'nf-top-g' }, [ rw.sp, E('div', { class: 'nf-top-bar' }, rw.bar) ]),
					E('div', { class: 'nf-top-v' }, [ rw.dn, rw.up ]),
					E('div', { class: 'nf-top-d' }, [ rw.tot, rw.lbl ]) ]);
				rowsEl.set(r.k, rw);
			}
			const canName = r.k !== 'router' && /^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/.test(r.k);
			const custom = canName ? loadNames()[nameKey(r.k)] : '';
			const id = DEVID && canName ? DEVID.identify(r.k, r.host) : null;
			/* name: custom → from DHCP → device type by MAC → address */
			const shown = custom || (r.name !== r.ip ? r.name : (id && id.label && id.known ? id.label : r.name));
			const sub = [ custom ? r.name : '', shown === r.ip ? '' : r.ip, id && id.vendor ? id.vendor : '', id && id.priv ? 'private MAC' : '' ].filter(Boolean);
			const sig = [ shown, sub.join('|'), canName ? 1 : 0, id ? id.kind : '' ].join('\n');
			if (rw.sig !== sig || !rw.nbox.firstChild || rw.nbox.querySelector('.nf-rename')) {
				rw.sig = sig;
				const nameEl = E('b', { title: (id && id.hint ? id.hint + '\n' : '') + r.k }, E('span', { class: 'nf-dv-t' }, shown));
				if (id) {
					const ic = E('i', { class: 'nf-dv-i' + (id.priv ? ' priv' : '') }); ic.innerHTML = DEVID.icon(id.kind);
					nameEl.insertBefore(ic, nameEl.firstChild);
				}
				rw.nbox.replaceChildren(nameEl, E('span', {}, sub.join(' · ')));
				if (canName) nameEl.appendChild(E('button', { type: 'button', class: 'nf-edit', title: 'Custom name', 'aria-label': 'Rename "' + shown + '"',
					click: ev => { ev.stopPropagation(); editName(rw.nbox, r.k, r.name, () => { rw.sig = ''; render(last); }); } }));
			}
			rw.bar.style.width = Math.max(2, Math.round(val(r) / mx * 100)) + '%';
			const dn = fmtRate(r.rd), up = fmtRate(r.ru);
			setNum(rw.dn, '↓ ' + dn[0] + ' ' + dn[1]); setNum(rw.up, '↑ ' + up[0] + ' ' + up[1]);
			setNum(rw.tot, fmtBytes(r.dd + r.du));
			rw.lbl.textContent = 'today' + (mode === 'day' ? ' · ' + Math.max(1, Math.round((r.dd + r.du) / dayTot * 100)) + '%' : '');
			const series = mode === 'day' ? hourly[r.k] : live[r.k];
			rw.sp.innerHTML = series && series.some(v => v > 0) ? miniSpark(series, mode === 'day' ? 'h' : 'n') : '';
			rw.sp.title = mode === 'day' ? 'Hourly traffic today' : 'Rate over the last few minutes';
			return rw.el;
		});
		for (const k of Array.from(rowsEl.keys())) if (!seen.has(k)) rowsEl.delete(k);
		syncChildren(body, nodes);
	}

	function load() {
		if (document.hidden || window.getComputedStyle(el).display === 'none') return;
		const needHr = Date.now() - hrAt > 300000;
		Promise.all([ fs.exec(HIST, [ 'devices' ]), names ? null : L.resolveDefault(callHints(), {}), needHr ? L.resolveDefault(fs.exec(HIST, [ 'devhr' ]), null) : null ]).then(r => {
			if (r[1]) names = r[1];
			if (needHr) { hrAt = Date.now(); try { hrRows = JSON.parse(r[2].stdout).rows; } catch (e) { /* old collector without devhr */ } }
			let dv = null;
			try { dv = JSON.parse(r[0].stdout); } catch (e) { /* no collector */ }
			render(dv);
		}).catch(() => render(null));
	}

	return { el, contains: n => el.contains(n), start() { load(); timer = window.setInterval(load, 8000); } };
}

/* ---------- traffic by application (YouTube, Telegram…) ---------- */

/* app icons: simple line symbols by service type (not company logos) */
const APP_SHAPES = {
	play: [ [ 'rect', { x: 3, y: 5, width: 18, height: 14, rx: 4 } ], [ 'path', { d: 'M10 9.5v5l4.5-2.5z' } ] ],
	chat: [ [ 'path', { d: 'M4 5h16v11H9l-5 4z' } ] ],
	camera: [ [ 'rect', { x: 3, y: 3, width: 18, height: 18, rx: 5 } ], [ 'circle', { cx: 12, cy: 12, r: 4 } ], [ 'circle', { cx: 17.2, cy: 6.8, r: .6 } ] ],
	people: [ [ 'circle', { cx: 9, cy: 8, r: 3 } ], [ 'path', { d: 'M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6' } ], [ 'circle', { cx: 17, cy: 9, r: 2.4 } ], [ 'path', { d: 'M16 14.2c2.8.2 5 2.4 5 5.3' } ] ],
	music: [ [ 'path', { d: 'M9 18V6l10-2v12' } ], [ 'circle', { cx: 6.5, cy: 18, r: 2.5 } ], [ 'circle', { cx: 16.5, cy: 16, r: 2.5 } ] ],
	video: [ [ 'rect', { x: 3, y: 6, width: 12, height: 12, rx: 2 } ], [ 'path', { d: 'M15 10l6-3v10l-6-3' } ] ],
	game: [ [ 'rect', { x: 2, y: 8, width: 20, height: 9, rx: 4.5 } ], [ 'path', { d: 'M7 12.5h3M8.5 11v3' } ], [ 'circle', { cx: 15.5, cy: 12, r: .6 } ], [ 'circle', { cx: 17.5, cy: 13.5, r: .6 } ] ],
	search: [ [ 'circle', { cx: 11, cy: 11, r: 6.5 } ], [ 'path', { d: 'M16 16l5 5' } ] ],
	cloud: [ [ 'path', { d: 'M7 18a4 4 0 0 1-.6-7.95A6 6 0 0 1 18 9.5 4.3 4.3 0 0 1 17.5 18z' } ] ],
	apps: [ [ 'rect', { x: 3, y: 3, width: 8, height: 8, rx: 2 } ], [ 'rect', { x: 13, y: 3, width: 8, height: 8, rx: 2 } ], [ 'rect', { x: 3, y: 13, width: 8, height: 8, rx: 2 } ], [ 'rect', { x: 13, y: 13, width: 8, height: 8, rx: 2 } ] ],
	globe: [ [ 'circle', { cx: 12, cy: 12, r: 9 } ], [ 'path', { d: 'M3 12h18M12 3c2.6 2.4 4 5.4 4 9s-1.4 6.6-4 9c-2.6-2.4-4-5.4-4-9s1.4-6.6 4-9z' } ] ]
};
const APP_GLYPH = { 'YouTube': 'play', 'Netflix': 'play', 'Twitch': 'play', 'Telegram': 'chat', 'WhatsApp': 'chat', 'Discord': 'chat', 'VK': 'people', 'Facebook': 'people', 'X (Twitter)': 'chat',
	'Instagram': 'camera', 'TikTok': 'music', 'Spotify': 'music', 'Zoom': 'video', 'Steam': 'game', 'Yandex': 'search', 'Google': 'search', 'Cloudflare': 'cloud', 'Amazon': 'cloud', 'Apple': 'apps', 'Microsoft': 'apps', 'RuTube': 'play', 'VK Video': 'play', 'Odnoklassniki': 'people', 'MAX': 'chat', 'Dzen': 'play', 'RuStore': 'apps', 'Wildberries': 'apps', 'Wibes': 'play', 'Ozon': 'apps', 'Avito': 'search', 'Gosuslugi': 'apps', 'T-Bank': 'apps', 'Kaspersky': 'apps', 'Lesta': 'game', 'GitHub': 'apps', 'Dropbox': 'cloud', 'OneDrive': 'cloud', 'PlayStation': 'game', 'Xbox': 'game', 'Epic Games': 'game' };
function appGlyph(name) {
	const el = SVG('svg', { viewBox: '0 0 24 24', width: 18, height: 18, class: 'nf-ic', 'aria-hidden': 'true' }, (APP_SHAPES[APP_GLYPH[name] || 'globe']).map(sh => SVG(sh[0], sh[1])));
	return el;
}
const APP_COLORS = { 'YouTube': '#ff3b30', 'Telegram': '#2aabee', 'WhatsApp': '#25d366', 'Instagram': '#e1306c', 'Facebook': '#1877f2', 'TikTok': '#25c8c8',
	'Netflix': '#e50914', 'Twitch': '#9146ff', 'Spotify': '#1db954', 'Discord': '#5865f2', 'Zoom': '#2d8cff', 'Steam': '#66c0f4', 'VK': '#0077ff',
	'Yandex': '#fc3f1d', 'Google': '#4285f4', 'Apple': '#a2aaad', 'Microsoft': '#00a4ef', 'Amazon': '#ff9900', 'X (Twitter)': '#8899a6', 'Cloudflare': '#f38020', 'VPN': '#8b5cf6', 'RuTube': '#e53935', 'VK Video': '#0077ff', 'Odnoklassniki': '#ee8208', 'MAX': '#1685f8', 'Dzen': '#6b5ce7', 'RuStore': '#00a5e8', 'Wildberries': '#cb11ab', 'Wibes': '#8b5cf6', 'Ozon': '#005bff', 'Avito': '#00aaff', 'Gosuslugi': '#0b65c2', 'T-Bank': '#ffdd2d', 'Kaspersky': '#009c5a', 'Lesta': '#e65a28', 'GitHub': '#6e5494', 'Dropbox': '#0061ff', 'OneDrive': '#0078d4', 'PlayStation': '#003791', 'Xbox': '#107c10', 'Epic Games': '#2f2d2e' };
const PERIODS = [ [ 'day', 'Today', 1 ], [ 'week', '7 days', 7 ], [ 'month', '30 days', 30 ] ];

function ymd(d) { return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }

/* per-app totals for a period: today is rows "ip, app, down, up", hist is the same with the date as the first column.
   "Other · domain" is folded into "Other", and the domains go to the details (other). */
function sumApps(data, days, ip) {
	/* Traffic history recorded by versions before the English translation stores Russian app names; map them to the current ones. */
	const LEGACY_APP_NAMES = { 'Прочее': 'Other', 'Нет DNS-имени': 'No DNS name', 'Общий IP (CDN)': 'Shared IP (CDN)', 'Несколько доменов': 'Multiple domains',
		'ВКонтакте': 'VK', 'Одноклассники': 'Odnoklassniki', 'Яндекс': 'Yandex', 'Дзен': 'Dzen', 'Госуслуги': 'Gosuslugi', 'Т-Банк': 'T-Bank', 'VK Видео': 'VK Video' };
	function legacyAppName(name) {
		if (typeof name !== 'string' || !/[\u0400-\u04ff]/.test(name)) return name;
		return name.split(' · ').map(p => LEGACY_APP_NAMES[p] || p).join(' · ');
	}
	const tot = {}, other = {}, routes = { VPN: 0, Direct: 0, Unknown: 0 };
	const add = (a, route, d, u) => {
		a = legacyAppName(a);
		route = [ 'VPN', 'Direct', 'Unknown' ].includes(route) ? route : 'Unknown';
		const m = /^Other(?: · (.+))?$/.exec(a);
		if (m) {
			const k = (m[1] || '') + '\u001f' + route;
			const t = other[k] || (other[k] = [ 0, 0 ]);
			t[0] += d; t[1] += u;
			a = 'Other';
		}
		const k = a + '\u001f' + route;
		const t = tot[k] || (tot[k] = [ 0, 0, a, route ]);
		t[0] += d; t[1] += u;
		routes[route] += d + u;
	};
	for (const r of data.day || []) if (!ip || r[0] === ip) add(r[1], r.length >= 5 ? r[2] : 'Unknown', r.length >= 5 ? r[3] : r[2], r.length >= 5 ? r[4] : r[3]);
	if (days > 1) {
		const t = String(data.today || '');
		const base = /^\d{8}$/.test(t) ? new Date(+t.slice(0, 4), +t.slice(4, 6) - 1, +t.slice(6, 8)) : new Date();
		base.setDate(base.getDate() - (days - 1));
		const from = ymd(base);
		for (const r of data.hist || []) if (+r[0] >= from && (!ip || r[1] === ip)) add(r[2], r.length >= 6 ? r[3] : 'Unknown', r.length >= 6 ? r[4] : r[3], r.length >= 6 ? r[5] : r[4]);
	}
	return { tot, other, routes };
}

function appsCard() {
	const body = E('div', { class: 'nf-apps-b' }, E('div', { class: 'nf-empty' }, 'Collecting data…'));
	const el = xcard('nf-apps', 'App traffic', body);
	let names = null, timer = null, data = null, period = 'day', dev = '', busy = false, showOther = false;

	const run = cmd => fs.exec(APPSBIN, [ cmd ]).then(r => { try { return JSON.parse(r.stdout); } catch (e) { return null; } });

	function label(ip) {
		for (const mac in names || {}) {
			const n = names[mac];
			if ((n.ipaddrs || []).concat(n.ip6addrs || []).some(x => normIp(x) === normIp(ip)))
				return loadNames()[nameKey(mac)] || n.name || ip;
		}
		return ip;
	}

	function toggle(cmd, ask) {
		if (busy || (ask && !window.confirm(ask))) return;
		busy = true;
		body.replaceChildren(E('div', { class: 'nf-empty' }, cmd === 'enable' ? 'Turning on…' : 'Turning off…'));
		run(cmd).then(r => {
			busy = false;
			if (!r || !r.ok) { body.replaceChildren(E('div', { class: 'nf-empty' }, [ E('b', {}, 'Failed'), E('span', {}, (r && r.error) || 'No response from the router. Sign out and sign in again (permissions are refreshed at sign-in).') ])); return; }
			window.setTimeout(load, cmd === 'enable' ? 2500 : 500);
		}).catch(() => { busy = false; load(); });
	}

	function render() {
		if (EDITING || busy) return;
		if (!data || typeof data.enabled === 'undefined') {
			body.replaceChildren(E('div', { class: 'nf-empty' }, [ E('b', {}, 'No data'), E('span', {}, 'The statistics collector is not running or has not been updated to a version with per-app accounting.') ]));
			return;
		}
		if (data.lite) {
			body.replaceChildren(E('div', { class: 'nf-empty' }, [ E('b', {}, 'Per-app accounting is disabled by Lite mode'), E('span', {}, 'Lite mode spares a low-end router: no DNS log and no per-app breakdown. To turn accounting back on, disable Lite in the monitor settings (LITE=0).') ]));
			return;
		}
		if (!data.enabled) {
			body.replaceChildren(E('div', { class: 'nf-apps-off' }, [
				E('b', {}, 'How much traffic YouTube, Telegram and others use'),
				E('span', {}, 'The router matches connection addresses with site names from DNS queries and shows who downloaded how much. This turns on the DNS log in dnsmasq: it is written to the router RAM (not to disk) and trimmed to 1 MB. You can turn it off right here.'),
				E('button', { type: 'button', class: 'cbi-button cbi-button-action', click: () => toggle('enable', 'Turn on per-app traffic accounting?\n\nThe DNS log in dnsmasq will be enabled (in router RAM) and dnsmasq will restart for a couple of seconds.') }, 'Turn on accounting')
			]));
			return;
		}
		const p = PERIODS.find(x => x[0] === period) || PERIODS[0];
		const ips = {};
		for (const r of (data.day || [])) ips[r[0]] = 1;
		for (const r of (data.hist || [])) ips[r[1]] = 1;
		const sel = E('select', { class: 'nf-apps-dev', 'aria-label': 'Device', change: ev => { dev = ev.target.value; render(); } },
			[ E('option', { value: '' }, 'All devices') ].concat(Object.keys(ips).sort().map(ip => E('option', { value: ip }, label(ip) + (label(ip) === ip ? '' : ' · ' + ip)))));
		sel.value = dev && ips[dev] ? dev : '';
		if (sel.value !== dev) dev = sel.value;
		const seg = E('div', { class: 'nf-apps-seg', role: 'group', 'aria-label': 'Period' }, PERIODS.map(x =>
			E('button', { type: 'button', 'aria-pressed': String(x[0] === period), click: () => { period = x[0]; render(); } }, x[1])));

		const { tot, other, routes } = sumApps(data, p[2], dev);
		const byApp = {};
		for (const k of Object.keys(tot)) {
			const v = tot[k], a = v[2], route = v[3], d = v[0], u = v[1], t = d + u;
			const r = byApp[a] || (byApp[a] = { a, d: 0, u: 0, t: 0, routes: {} });
			r.d += d; r.u += u; r.t += t;
			r.routes[route] = (r.routes[route] || 0) + t;
		}
		const rows = Object.values(byApp).filter(r => r.t > 0).sort((x, y) => (x.a === 'Other') - (y.a === 'Other') || y.t - x.t);
		const sum = rows.reduce((n, r) => n + r.t, 0);
		const list = rows.filter(r => r.a !== 'Other').slice(0, 8).concat(rows.filter(r => r.a === 'Other').slice(0, 1));
		const content = [];
		if (sum > 0) {
			const routeCards = [ [ 'VPN', routes.VPN, 'vpn' ], [ 'Direct', routes.Direct, 'direct' ], [ 'Unknown', routes.Unknown, 'unknown' ] ];
			content.push(E('div', { class: 'nf-apps-summary' }, routeCards.map(x => E('div', { class: 'nf-apps-summary-item ' + x[2] }, [ E('span', {}, x[0]), E('b', {}, fmtBytes(x[1])), E('small', {}, nf1.format(x[1] / sum * 100) + '%') ]))));
		}
		if (!list.length) {
			content.push(E('div', { class: 'nf-empty' }, [ E('b', {}, 'Empty for now'), E('span', {}, data.dnsmap > 0 ? 'No data for this period yet.' : 'The DNS log is empty for now. Wait a few minutes for devices to make queries. If nothing appears, check that devices use the router DNS (not DoH/DoT in a browser or phone).') ]));
		}
		else {
			const mx = Math.max(1, ...list.map(r => r.t));
			list.forEach(r => {
				const routeBadges = [ 'VPN', 'Direct', 'Unknown' ].filter(route => r.routes[route] > 0).map(route => E('small', {
						class: 'nf-apps-route nf-apps-route-' + route.toLowerCase(),
						title: (route === 'VPN' ? 'VPN' : route === 'Direct' ? 'Direct' : 'Unknown') + ': ' + fmtBytes(r.routes[route])
					}, (route === 'VPN' ? 'VPN' : route === 'Direct' ? 'Direct' : 'Unkn.') + ' · ' + fmtBytes(r.routes[route])));
				content.push(E('div', { class: 'nf-apps-r', style: '--c:' + (APP_COLORS[r.a] || 'var(--nf-text-dim)') }, [
					E('div', { class: 'nf-apps-n' }, [
						E('div', { class: 'nf-apps-title' }, [ r.a === 'Other' ? E('i') : appGlyph(r.a), E('b', {}, r.a) ]),
						E('div', { class: 'nf-apps-routes' }, routeBadges)
					]),
					E('div', { class: 'nf-top-bar nf-apps-track' }, [ 'VPN', 'Direct', 'Unknown' ].filter(route => r.routes[route] > 0).map(route =>
						E('i', { class: 'nf-apps-segment nf-apps-segment-' + route.toLowerCase(), title: route + ': ' + fmtBytes(r.routes[route]), style: 'width:' + (r.routes[route] / r.t * 100).toFixed(2) + '%' }))),
					E('div', { class: 'nf-apps-v' }, [ E('b', {}, fmtBytes(r.t)), E('span', {}, '↓ ' + fmtBytes(r.d) + ' · ↑ ' + fmtBytes(r.u)) ]),
					E('div', { class: 'nf-apps-p' }, sum ? nf0.format(r.t / sum * 100) + '%' : '')
				]));
				/* what "Other" consists of: the heaviest domains (you can add a rule for them to /etc/nightfall-apps.list) */
				if (r.a === 'Other') {
					const top = Object.keys(other).map(k => {
						const a = k.split(String.fromCharCode(31));
						const route = a[1] === 'VPN' ? 'VPN' : a[1] === 'Direct' ? 'Direct' : 'Unknown';
						const raw = a[0] || 'No DNS name';
						const reasons = {
							'No DNS name': 'No current DNS name was found for the IP. Possible causes: a direct IP connection, DoH/DoT, external DNS, an expired record or a missing DNS log.',
							'Shared IP (CDN)': 'The same IP was seen for several known apps. The traffic is left unrecognized so it is not attributed to the wrong service.',
							'Multiple domains': 'Several different unknown domains were found for the IP. None of them can be picked safely.'
						};
						const names = { 'No DNS name': 'IP without a DNS name', 'Shared IP (CDN)': 'Shared IP / CDN', 'Multiple domains': 'Multiple domains' };
						return { domain: names[raw] || raw, reason: reasons[raw] || '', route, t: other[k][0] + other[k][1] };
					}).filter(x => x.t > 0).sort((x, y) => y.t - x.t);
					if (top.length) {
						const otherTotal = top.reduce((n, x) => n + x.t, 0);
						const shown = showOther ? top : top.slice(0, 6);
						content.push(E('section', { class: 'nf-apps-other-panel', 'aria-label': 'Breakdown of unrecognized traffic' }, [
							E('div', { class: 'nf-apps-other-head' }, [
								E('div', { class: 'nf-apps-other-heading' }, [
									E('b', {}, 'Unrecognized'),
									E('span', {}, top.length + (top.length === 1 ? ' domain/route pair' : ' domain/route pairs'))
								]),
								E('strong', {}, fmtBytes(otherTotal))
							]),
							E('p', { class: 'nf-apps-other-note' }, 'An IP without a DNS name may mean a direct connection, DoH/DoT, external DNS or an expired record. Shared CDNs and conflicting domains stay here until the app can be identified reliably.'),
							E('div', { class: 'nf-apps-other-list' }, shown.map(x => E('div', { class: 'nf-apps-other-row' }, [
								E('span', { class: 'nf-apps-other-domain', title: x.reason || x.domain }, x.domain),
								E('small', { class: 'nf-apps-other-route nf-apps-route-' + x.route.toLowerCase() }, x.route === 'VPN' ? 'VPN' : x.route === 'Direct' ? 'Direct' : 'Unkn.'),
								E('b', { class: 'nf-apps-other-size' }, fmtBytes(x.t)),
								E('span', { class: 'nf-apps-other-share' }, nf1.format(x.t / otherTotal * 100) + '%')
							]))),
							top.length > 6 ? E('button', { type: 'button', class: 'nf-apps-more', 'aria-expanded': String(showOther), click: () => { showOther = !showOther; render(); } }, showOther ? 'Collapse list' : 'Show all (' + top.length + ')') : null
						]));
					}
				}
			});
		}
		body.replaceChildren(E('div', { class: 'nf-apps-bar' }, [ seg, sel ]), ...content,
			E('div', { class: 'nf-apps-f' }, [
				E('span', {}, 'The route is determined from the available routing rules. "Unknown" means there is not enough data; DoH/DoT and third-party DNS can limit app recognition.'),
				E('button', { type: 'button', class: 'nf-apps-stop', click: () => toggle('disable', 'Turn off per-app traffic accounting?\n\nThe DNS log in dnsmasq will be restored to its previous settings.') }, 'Turn off accounting')
			]));
	}

	function load() {
		if (idle(el) || busy || EDITING) return;
		Promise.all([ fs.exec(HIST, [ 'apps' ]), names ? null : L.resolveDefault(callHints(), {}) ]).then(r => {
			if (r[1]) names = r[1];
			try { data = JSON.parse(r[0].stdout); } catch (e) { data = null; }
			render();
		}).catch(() => { data = null; render(); });
	}

	return { el, contains: n => el.contains(n), start() { load(); timer = window.setInterval(load, 15000); } };
}

/* ---------- "Internet access": blocking devices manually and on a schedule ---------- */

const BLOCKBIN = '/usr/libexec/nightfall-block';
const GUESTBIN = '/usr/libexec/nightfall-guest';
const WOLBIN = '/usr/libexec/nightfall-wol';

function blockCard() {
	const body = E('div', { class: 'nf-blk-b' }, E('div', { class: 'nf-empty' }, 'Collecting data…'));
	const head = E('div', { class: 'nf-blk-h', hidden: true });
	const el = xcard('nf-block', 'Internet access', E('div', {}, [ head, body ]));
	let timer = null, devs = null, busy = false, open = null, note = '', logOn = false, logRows = null;
	let tab = 'all', qs = '', more = false, checking = false, checkedAt = 0, DEVID = null;
	try { tab = localStorage.getItem('nightfall-blk-tab') || 'all'; } catch (e) { /* ignore */ }
	L.require('nightfall-devid').then(m => { DEVID = m; if (devs) render(); }).catch(() => { /* monitor package without the module: no icons */ });
	const search = E('input', { type: 'search', class: 'nf-blk-q', placeholder: 'Find a device', 'aria-label': 'Find a device', input: () => { qs = search.value.trim().toLowerCase(); more = false; render(); } });
	const tabsEl = E('div', { class: 'nf-blk-tabs', role: 'group', 'aria-label': 'Show devices' });
	const chkBtn = E('button', { type: 'button', class: 'nf-linkbtn', title: 'The router re-checks who is connected right now: Wi-Fi by association with the access point, wired by ARP reply', click: () => { if (checking) return; checking = true; renderHead(); load(true); } }, 'Check now');
	const chkNote = E('span', { class: 'nf-blk-chk' });
	head.append(tabsEl, E('div', { class: 'nf-blk-tools' }, [ search, chkBtn, chkNote ]));
	const nmOf = d => {
		const id = DEVID && d.mac ? DEVID.identify(d.mac, d.name) : null;
		return { id, nm: d.name || (id && id.known ? [ id.label || 'Device', id.vendor && id.vendor !== id.label ? id.vendor : '' ].filter(Boolean).join(' ') : '') || d.ip || d.mac };
	};
	const hasRule = d => !!(d.active || d.from || d.quota || d.manual);
	function renderHead() {
		const all = devs || [];
		const groups = Array.from(new Set(all.map(d => d.group).filter(Boolean))).sort();
		const defs = [ [ 'all', 'All', all.length ], [ 'on', 'Online', all.filter(d => d.online).length ], [ 'off', 'Offline', all.filter(d => !d.online).length ], [ 'rule', 'With rules', all.filter(hasRule).length ] ]
			.concat(groups.map(g => [ 'g:' + g, g, all.filter(d => d.group === g).length ]));
		const shown = defs.filter(x => x[0] === 'all' || x[0] === tab || x[2] > 0);
		tabsEl.replaceChildren(...shown.map(x => E('button', { type: 'button', class: 'nf-linkbtn' + (tab === x[0] ? ' on' : ''), 'aria-pressed': String(tab === x[0]),
			click: () => { tab = x[0]; more = false; try { localStorage.setItem('nightfall-blk-tab', tab); } catch (e) { /* ignore */ } render(); } }, [
			E('span', { class: 'nf-blk-tab-label' }, x[1]), E('i', { class: 'nf-blk-tab-count' }, String(x[2]))
		])));
		search.hidden = all.length < 8 && !qs;
		chkBtn.disabled = checking; chkBtn.classList.toggle('spin', checking); chkBtn.textContent = checking ? 'Checking…' : 'Check now';
		chkNote.textContent = checkedAt ? 'checked at ' + new Date(checkedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
		head.hidden = !all.length;
	}

	const run = args => fs.exec(BLOCKBIN, args).then(r => { try { return JSON.parse(r.stdout); } catch (e) { return null; } });

	function act(args, okNote) {
		if (busy) return;
		busy = true;
		run(args).then(r => {
			busy = false;
			note = r && r.ok ? okNote : ((r && r.error) || 'No response from the router. Sign out and sign in to LuCI again (permissions are refreshed at sign-in).');
			open = r && r.ok ? null : open;
			load(true);
		}).catch(() => { busy = false; note = 'The command failed.'; load(true); });
	}

	/* schedule: several windows, each with its own weekdays (#92) */
	const DAYN = [ 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun' ];
	const daysText = dy => !dy ? 'every day' : dy === '12345' ? 'weekdays' : dy === '67' ? 'weekends' : dy.split('').map(x => DAYN[+x - 1]).join(', ');
	const winsOf = o => {
		const w = [];
		if (o.from && o.to) w.push({ from: o.from, to: o.to, days: o.days || '' });
		String(o.rules || '').split(';').forEach(r => { const m = /^(\d\d:\d\d)-(\d\d:\d\d)(?:@([1-7]*))?$/.exec(r); if (m) w.push({ from: m[1], to: m[2], days: m[3] || '' }); });
		return w;
	};
	const winsLine = o => winsOf(o).map(w => w.from + '–' + w.to + (w.days ? ' ' + daysText(w.days) : '')).join(', ');

	function sched(d) {
		const from = E('input', { type: 'time', value: '23:00', 'aria-label': 'Block from' });
		const to = E('input', { type: 'time', value: '07:00', 'aria-label': 'Unblock at' });
		const chk = DAYN.map((n, i) => E('input', { type: 'checkbox', value: String(i + 1), checked: true, 'aria-label': n }));
		const preset = (txt, set) => E('button', { type: 'button', class: 'cbi-button', click: () => chk.forEach(c => { c.checked = set.indexOf(c.value) >= 0; }) }, txt);
		const picked = () => { const v = chk.filter(c => c.checked).map(c => c.value).join(''); return v === '1234567' ? '' : v; };
		const wins = winsOf(d);
		const list = wins.map((w, i) => E('div', { class: 'nf-blk-sched nf-blk-win' }, [
			E('span', {}, '⏰ ' + w.from + '–' + w.to + ' · ' + daysText(w.days)),
			E('button', { type: 'button', class: 'cbi-button', click: () => act([ 'sdel', d.mac, String(i + 1) ], 'Window removed.') }, 'Remove') ]));
		if (wins.length > 1) list.push(E('div', { class: 'nf-blk-sched' }, [ E('button', { type: 'button', class: 'cbi-button', click: () => act([ 'sched', d.mac, 'off' ], 'Schedule removed.') }, 'Remove whole schedule') ]));
		return E('div', { class: 'nf-blk-sch' }, list.concat([
			E('div', { class: 'nf-blk-sched' }, [ E('span', {}, wins.length ? 'Another window: block from' : 'Block from'), from, E('span', {}, 'to'), to ]),
			E('div', { class: 'nf-blk-sched nf-blk-days' }, chk.map((c, i) => E('label', {}, [ c, DAYN[i] ]))),
			E('div', { class: 'nf-blk-sched' }, [ preset('Every day', '1234567'), preset('Weekdays', '12345'), preset('Weekends', '67'),
				E('button', { type: 'button', class: 'cbi-button cbi-button-action', click: () => {
					if (!chk.some(c => c.checked)) { note = 'Select at least one weekday.'; render(); return; }
					act([ 'sadd', d.mac, from.value, to.value, picked() ], 'Schedule saved.');
				} }, 'Add') ]) ]));
	}

	function quotaRow(d) {
		const gb = E('input', { type: 'number', min: '0.1', step: '0.1', value: d.quota ? String(Math.round(d.quota / 102.4) / 10) : '', placeholder: 'GB', 'aria-label': 'Daily limit, GB' });
		return E('div', { class: 'nf-blk-sched' }, [
			E('span', {}, 'Daily traffic limit'), gb, E('span', {}, 'GB'),
			E('button', { type: 'button', class: 'cbi-button cbi-button-action', click: () => {
				const v = parseFloat(String(gb.value).replace(',', '.'));
				if (!(v > 0)) { note = 'Enter the limit in gigabytes, for example 5.'; render(); return; }
				act([ 'quota', d.mac, String(Math.round(v * 1024)), d.name || '' ], 'Limit set: internet will be blocked until the end of the day once the device downloads ' + v + ' GB.');
			} }, 'Set'),
			d.quota ? E('button', { type: 'button', class: 'cbi-button', click: () => act([ 'quota', d.mac, 'off' ], 'Limit removed.') }, 'Remove') : ''
		]);
	}

	function render() {
		if (EDITING || busy) return;
		if (!devs) {
			body.replaceChildren(E('div', { class: 'nf-empty' }, [ E('b', {}, 'No data'), E('span', {}, 'Could not get the device list. If you just updated the theme, sign out and sign in to LuCI again.') ]));
			return;
		}
		renderHead();
		const pass = d => (tab === 'all' || (tab === 'on' && d.online) || (tab === 'off' && !d.online) || (tab === 'rule' && hasRule(d)) || tab === 'g:' + d.group)
			&& (!qs || [ d.name, d.ip, d.mac, d.group, nmOf(d).nm ].some(v => v && String(v).toLowerCase().indexOf(qs) >= 0));
		const found = devs.filter(pass).sort((a, b) => ((b.active ? 1 : 0) - (a.active ? 1 : 0)) || ((b.from || b.quota ? 1 : 0) - (a.from || a.quota ? 1 : 0)) || (b.online - a.online) || nmOf(a).nm.localeCompare(nmOf(b).nm));
		const rows = more ? found : found.slice(0, 30);
		const list = rows.map(d => {
			const { id, nm } = nmOf(d);
			const q = d.quota ? ' · 📉 ' + fmtBytes(d.used) + ' of ' + fmtBytes(d.quota * 1048576) : '';
			const st = d.active ? E('span', { class: 'nf-blk-st bad' }, (d.reason === 'quota' ? 'limit reached' : d.reason === 'sched' ? 'scheduled' : 'blocked') + q)
				: E('span', { class: 'nf-blk-st ' + (d.online && !d.from && !d.quota ? 'ok' : '') }, (d.from ? '⏰ ' + winsLine(d) + (d.snoozed ? ' (skipped until tomorrow)' : '') + ' · ' : '') + (d.online ? (d.wifi ? 'online · Wi-Fi' : (d.connection ? 'online · ' + d.connection : 'online')) : 'offline') + q);
			const line = E('div', { class: 'nf-blk-r' + (d.active ? ' off' : '') }, [
				E('div', { class: 'nf-blk-n' }, [ E('b', { title: id && id.hint ? id.hint : '' }, [ id ? (() => { const ic = E('i', { class: 'nf-dv-i' + (id.priv ? ' priv' : '') }); ic.innerHTML = DEVID.icon(id.kind); return ic; })() : '', E('span', { class: 'nf-dv-t' }, nm) ]),
					E('span', {}, [ d.ip !== nm ? d.ip : '', d.mac, !d.name && id && id.vendor ? id.vendor : '', id && id.priv ? 'private MAC' : '' ].filter(Boolean).join(' · ')) ]),
				st,
				E('div', { class: 'nf-blk-a' }, [
					E('button', { type: 'button', class: 'cbi-button ' + (d.active ? 'cbi-button-action' : 'cbi-button-remove'),
						click: () => act([ d.active ? 'unblock' : 'block', d.mac, nm ], d.active ? nm + ': internet restored.' : nm + ': internet blocked.') }, d.active ? 'Restore' : 'Block'),
					!d.online ? E('button', { type: 'button', class: 'cbi-button nf-wol', title: 'Wake over the network (Wake-on-LAN): this feature must be enabled on the computer or NAS', 'aria-label': 'Wake ' + nm,
						click: ev => { const b = ev.currentTarget; b.disabled = true; fs.exec(WOLBIN, [ 'send', d.mac ]).then(r => { let j = null; try { j = JSON.parse(r.stdout); } catch (e) { /* empty */ } note = j && j.ok ? nm + ': wake signal sent. The computer needs 10–30 seconds.' : ((j && j.error) || 'No response from the router. Update the theme and sign in to LuCI again.'); render(); }).catch(() => { note = 'Could not send the signal.'; render(); }); } }, '⚡') : '',
					E('button', { type: 'button', class: 'cbi-button', 'aria-expanded': String(open === d.mac), click: () => { open = open === d.mac ? null : d.mac; render(); } }, '⏰')
				])
			]);
			return open === d.mac ? E('div', { class: 'nf-blk-g' }, [ line, sched(d), quotaRow(d) ]) : line;
		});
		body.replaceChildren(
			note ? E('div', { class: 'nf-blk-note' }, note) : '',
			...(list.length ? list : [ E('div', { class: 'nf-empty' }, devs.length ? 'Nobody in this tab.' : 'No devices visible.') ]),
			found.length > rows.length ? E('button', { type: 'button', class: 'nf-link nf-blk-more', click: () => { more = true; render(); } }, 'Show ' + (found.length - rows.length) + ' more') : '',
			logOn ? E('div', { class: 'nf-blk-log' }, (logRows && logRows.length ? logRows.map(r => E('div', {}, [ E('span', {}, new Date(r[0] * 1000).toLocaleString('en-US', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })), E('b', {}, r[2] || r[1]), E('span', { class: r[3] === 'on' ? 'bad' : 'ok' }, r[3] === 'on' ? 'blocked' : 'restored'), E('i', {}, r[4]) ])) : [ E('div', { class: 'nf-empty' }, 'No entries yet.') ])) : '',
			E('div', { class: 'nf-apps-f' }, [ E('span', {}, 'The device loses internet access (by MAC address). The router and the local network stay reachable, so access can always be restored. Devices with a "random" Wi-Fi address are better blocked in the phone settings. You can do the same with buttons in the Telegram bot.'),
				E('button', { type: 'button', class: 'nf-link', click: () => { logOn = !logOn; if (logOn) run([ 'log' ]).then(r => { logRows = r && r.ok ? r.log : []; render(); }); else render(); } }, logOn ? 'Hide log' : 'Block log') ]));
	}

	function load(force) {
		if (!force && (idle(el) || busy || EDITING || open)) return;
		run([ 'list' ]).then(r => { devs = r && r.ok ? r.devices : null; if (devs) checkedAt = Date.now(); checking = false; render(); }).catch(() => { devs = null; checking = false; render(); });
	}

	return { el, contains: n => el.contains(n), start() { load(true); timer = window.setInterval(load, 20000); } };
}

/* ---------- extra cards ---------- */

/* Cards collapsed by default (v1.26.0): a short summary in the header, a click expands; the choice is remembered in the browser */
const FOLD_KEY = 'nightfall-overview-fold-v1';
const FOLD = { 'nf-apps': 'per-app volume today', 'nf-block': 'blocks, limits and schedule', 'nf-health': 'mode, uptime, versions' };
const foldLoad = () => { try { const v = JSON.parse(window.localStorage.getItem(FOLD_KEY) || 'null'); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; } };
const foldSave = m => { try { window.localStorage.setItem(FOLD_KEY, JSON.stringify(m)); } catch (e) { /* private mode */ } };
function foldSummary(el, key) {
	let t = '';
	if (key === 'nf-apps') { const n = el.querySelector('.nf-apps-sub'); t = n ? n.textContent.replace(/^\s*Largest:\s*/, '') : ''; }
	else if (key === 'nf-block') {
		const tabs = el.querySelectorAll('.nf-blk-tabs button');
		t = Array.prototype.map.call(tabs, b => {
			const label = b.querySelector('.nf-blk-tab-label');
			const count = b.querySelector('.nf-blk-tab-count');
			return [ label ? label.textContent.trim() : '', count ? count.textContent.trim() : '' ].filter(Boolean).join(' ');
		}).filter(Boolean).join(' · ');
	}
	return (t || FOLD[key]).slice(0, 110);
}
function xcard(cls, title, body) {
	const el = E('div', { class: 'cbi-section nf-xcard ' + cls + ' fade-in' }, [ E('div', { class: 'cbi-title' }, E('h3', {}, title)), body ]);
	const key = Object.keys(FOLD).filter(k => cls.split(' ').indexOf(k) >= 0)[0];
	if (!key) return el;
	const head = el.querySelector('.cbi-title'), sum = E('span', { class: 'nf-fold-sum' }), arrow = E('span', { class: 'nf-fold-arrow', 'aria-hidden': 'true' });
	head.appendChild(sum); head.appendChild(arrow);
	el.classList.add('nf-fold');
	const paint = () => { const open = !!foldLoad()[key]; el.classList.toggle('nf-open', open); head.setAttribute('aria-expanded', String(open)); sum.textContent = open ? '' : foldSummary(el, key); arrow.textContent = open ? '▴' : '▾'; };
	head.setAttribute('role', 'button'); head.setAttribute('tabindex', '0');
	const toggle = ev => {
		if (ev.target.closest && ev.target.closest('.nf-grip, .nf-pin, .nf-size, .nf-rs')) return;
		const m = foldLoad(); if (m[key]) delete m[key]; else m[key] = 1; foldSave(m); paint(); window.dispatchEvent(new Event('resize'));
	};
	head.addEventListener('click', toggle);
	head.addEventListener('keydown', ev => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target === head) { ev.preventDefault(); toggle(ev); } });
	new MutationObserver(() => { if (!el.classList.contains('nf-open')) sum.textContent = foldSummary(el, key); }).observe(body, { childList: true, subtree: true, characterData: true });
	paint();
	return el;
}

function idle(el) { return document.hidden || window.getComputedStyle(el).display === 'none'; }

/* nf-temps:begin */
/* ---------- "Temperatures": own card instead of the stock "Temperature" one (v1.18.0) ----------
   Data: nightfall-history temps fine|coarse (the collector records all sensors: one hour at 15 s steps and 7 days at 5 min steps). */
const TEMP_RANGES = [ [ '5m', '5 min', 300, 'fine' ], [ '1h', 'Hour', 3600, 'fine' ], [ '24h', 'Day', 86400, 'coarse' ], [ '7d', 'Week', 604800, 'coarse' ] ];
const TEMP_KEY = 'nightfall-temps-range';
const TEMP_WIFI = /phy|mt76|mt79|wifi|wlan|ath|iwlwifi/i;

function tempLabel(raw) {
	const b = String(raw).replace(/#\d+$/, '');
	const ph = /phy(\d+)/i.exec(b);
	if (TEMP_WIFI.test(b)) return ph ? 'Wi‑Fi, radio ' + (+ph[1] + 1) : 'Wi‑Fi';
	if (/cpu|soc|core|a53|a73|a72|thermal/i.test(b)) return 'CPU';
	if (/nvme|ssd|drive|disk/i.test(b)) return 'Drive';
	if (/gpu/i.test(b)) return 'GPU';
	return b;
}
/* rate of change, °C per minute: slope of a line fitted to the last 2 minutes of samples (single sensor spikes do not break it) */
function tempSlope(times, vals, win) {
	win = win || 120;
	const n = times.length, pts = [];
	if (!n) return null;
	const end = times[n - 1];
	for (let i = 0; i < n; i++) if (vals[i] != null && end - times[i] <= win) pts.push([ times[i], vals[i] ]);
	if (pts.length < 4 || pts[pts.length - 1][0] - pts[0][0] < 45) return null;
	const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length, my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
	let sxy = 0, sxx = 0;
	for (const p of pts) { sxy += (p[0] - mx) * (p[1] - my); sxx += (p[0] - mx) * (p[0] - mx); }
	return sxx > 0 ? 60 * sxy / sxx : null;
}
const tempLevel = r => r == null ? '' : r <= 0.5 ? 'ok' : r <= 2 ? 'warn' : 'bad';
/* chart scale: one degree of headroom and no narrower than 6 °C, so a 1 °C sensor step does not look like a sawtooth */
function tempScale(vals) {
	const v = vals.filter(x => x != null);
	if (!v.length) return [ 20, 100 ];
	let lo = Math.floor(Math.min(...v)) - 1, hi = Math.ceil(Math.max(...v)) + 1;
	if (hi - lo < 6) { const c = (hi + lo) / 2; lo = Math.floor(c - 3); hi = lo + 6; }
	return [ lo, hi ];
}

function tempCard() {
	let range = '5m';
	try { const v = localStorage.getItem(TEMP_KEY); if (TEMP_RANGES.some(r => r[0] === v)) range = v; } catch (e) { /* ignore */ }
	const body = E('div', { class: 'nf-tt-b' }, E('div', { class: 'nf-empty' }, 'Collecting data…'));
	const btns = TEMP_RANGES.map(r => E('button', { type: 'button', class: 'nf-linkbtn' + (r[0] === range ? ' on' : ''), 'data-r': r[0],
		click: ev => { ev.stopPropagation(); range = r[0]; try { localStorage.setItem(TEMP_KEY, range); } catch (e) { /* ignore */ } btns.forEach(b => b.classList.toggle('on', b.getAttribute('data-r') === range)); render(); load(); } }, r[1]));
	const el = E('div', { class: 'cbi-section nf-temps fade-in' }, [
		E('div', { class: 'cbi-title nf-top-t' }, [ E('h3', {}, 'Temperatures'), E('span', { class: 'nf-top-m', role: 'group', 'aria-label': 'Period' }, btns) ]), body ]);
	const tiles = new Map();
	const syncStock = () => { if (el.parentNode) hideStockTemp(el.parentNode, [ { el, isReady: () => ready } ]); };
	let fine = null, coarse = null, coarseAt = 0, timer = null, ready = false;

	const run = args => fs.exec(HIST, args).then(r => { try { return JSON.parse(r.stdout); } catch (e) { return null; } }).catch(() => null);

	function seriesOf(d, idx, win) {
		const t = [], v = [];
		if (!d || !Array.isArray(d.rows) || !d.rows.length) return { t, v };
		const end = d.rows[d.rows.length - 1][0];
		for (const r of d.rows) {
			if (end - r[0] > win) continue;
			t.push(r[0]); v.push(r[idx + 1] >= 0 ? r[idx + 1] : null);
		}
		return { t, v };
	}
	function tile(name) {
		let o = tiles.get(name);
		if (o) return o;
		const sp = spark([ 'nf-c-temp' ]);
		o = { sp, n: E('b', { class: 'nf-tt-n' }), raw: E('small', {}), v: E('div', { class: 'nf-tt-v' }, '–'), r: E('div', { class: 'nf-tt-r' }), m: E('div', { class: 'nf-tt-m' }) };
		o.el = E('div', { class: 'nf-tt' }, [ E('div', { class: 'nf-tt-h' }, [ o.n, o.raw ]), E('div', { class: 'nf-tt-row' }, [ o.v, o.r ]), sp.el, o.m ]);
		tiles.set(name, o);
		return o;
	}
	function render() {
		if (!fine || !Array.isArray(fine.names) || !fine.names.length) {
			ready = false; tiles.clear(); syncStock();
			body.replaceChildren(E('div', { class: 'nf-empty' }, [ E('b', {}, 'No data'), E('span', {}, fine ? 'No temperature sensors found, or the history collector has not recorded samples yet.' : 'Could not get the data. If you just updated the theme, sign out and sign in to LuCI again.') ]));
			return;
		}
		ready = true; syncStock();
		const rg = TEMP_RANGES.find(r => r[0] === range) || TEMP_RANGES[0];
		const src = rg[3] === 'coarse' && coarse && Array.isArray(coarse.rows) && coarse.rows.length ? coarse : fine;
		/* sensors missing from the latest samples (for example, renamed ones) are not shown */
		const lastRows = fine.rows.slice(-4);
		const alive = fine.names.map((n, i) => [ n, i ]).filter(([ , i ]) => lastRows.some(r => r[i + 1] >= 0));
		const order = alive.sort((a, b) => ((tempLabel(a[0]) === 'CPU' ? 0 : 1) - (tempLabel(b[0]) === 'CPU' ? 0 : 1)) || a[0].localeCompare(b[0]));
		const nodesN = order.length;
		const nodes = order.map(([ name, i ]) => {
			const o = tile(name), f = seriesOf(fine, i, Math.max(300, 5 * (+fine.step || 15))), s = seriesOf(src === fine ? fine : src, src === fine ? i : (src.names || []).indexOf(name), rg[2]);
			const swin = Math.max(120, 5 * (+fine.step || 15)), cur = f.v.length ? f.v[f.v.length - 1] : null, rate = tempSlope(f.t, f.v, swin);
			o.n.textContent = tempLabel(name);
			o.raw.textContent = tempLabel(name) !== name ? name : '';
			o.v.textContent = cur == null ? '–' : nf1.format(cur) + ' °C';
			o.r.textContent = rate == null ? 'calculating…' : Math.abs(rate) < 0.1 ? '→ stable' : (rate > 0 ? '↑ +' : '↓ ') + nf1.format(rate) + ' °C/min';
			o.r.setAttribute('data-lv', rate == null ? '' : Math.abs(rate) < 0.1 ? 'ok' : tempLevel(rate));
			o.r.title = 'Rate of temperature change over the last ' + (swin / 60) + ' min';
			const [ lo, hi ] = tempScale(s.v);
			o.sp.update(s.t, [ s.v ], hi, lo);
			const sv = s.v.filter(x => x != null);
			o.m.textContent = sv.length ? 'last ' + rg[1].toLowerCase() + ': min ' + nf1.format(Math.min(...sv)) + ' · max ' + nf1.format(Math.max(...sv)) : 'no samples for this period';
			o.el.classList.toggle('nf-tt-main', nodesN === 3 && tempLabel(name) === 'CPU');
			return o.el;
		});
		for (const k of Array.from(tiles.keys())) if (!alive.some(x => x[0] === k)) tiles.delete(k);
		if (body.firstChild && body.firstChild.className === 'nf-tt-grid') {
			const g = body.firstChild;
			if (g.children.length !== nodes.length || nodes.some((n, i) => g.children[i] !== n)) g.replaceChildren(...nodes);
		}
		else body.replaceChildren(E('div', { class: 'nf-tt-grid' }, nodes));
		/* layout by sensor count: three means CPU full width on top with two Wi‑Fi below; otherwise a regular grid */
		body.firstChild.setAttribute('data-lay', nodesN === 3 && nodes.some(n => n.classList.contains('nf-tt-main')) ? 'main3' : 'grid');
	}
	function load() {
		if (idle(el)) return Promise.resolve();
		const now = Date.now(), rg = TEMP_RANGES.find(r => r[0] === range) || TEMP_RANGES[0];
		const need = rg[3] === 'coarse' && now - coarseAt > 60000;
		return Promise.all([ run([ 'temps', 'fine' ]), need ? run([ 'temps', 'coarse' ]) : Promise.resolve(coarse) ]).then(([ f, c ]) => {
			fine = f; if (need) { coarse = c; coarseAt = now; } else coarse = c;
			render();
		});
	}
	const api = { el, contains: n => el.contains(n), isReady: () => ready, start() { load(); timer = window.setInterval(load, 10000); } };
	return api;
}
/* nf-temps:end */

/* hide the stock "Temperature" card once our own card has data; without data the stock one stays */
function hideStockTemp(view, extras) {
	const mine = (extras || []).find(x => x.el && x.el.classList.contains('nf-temps'));
	const on = !!(mine && mine.isReady());
	view.querySelectorAll(':scope > .cbi-section').forEach(sec => {
		if (sec.classList.contains('nf-temps')) return;
		const h = sec.querySelector(':scope > .cbi-title h3');
		const t = h && (h.getAttribute('data-nf-title') || h.textContent || '').trim();
		if (t && /^(Температура|Temperature)$/i.test(t)) sec.classList.toggle('nf-stock-hidden', on);
	});
}

/* collector mode: "Full" (15 s step, everything on) or Lite (for low-end routers); taken from the collector info, so it shows what is actually running */
function modeChip(mode) {
	const lite = mode === 'lite';
	return E('span', { class: 'nf-chip nf-mode ' + (lite ? 'lite' : 'full'),
		title: lite ? 'Lite mode: the collector samples every 60 seconds, without per-app accounting and Wi‑Fi history. Change it in Resource Monitor → settings (LITE).' : 'Full mode: the collector samples every 15 seconds, all features available. For a low-end router, enable Lite in the monitor settings (LITE).' },
		'Mode: ' + (lite ? 'Lite' : 'Full'));
}

function healthCard() {
	const C = 2 * Math.PI * 38;
	const ARC = 'M46 8a38 38 0 1 1 0 76a38 38 0 1 1 0-76';
	const fg = SVG('path', { class: 'fg', d: ARC, 'stroke-dasharray': C.toFixed(1), 'stroke-dashoffset': C.toFixed(1) });
	const num = E('b', {}, '–'), head = E('strong', {}, 'Collecting data…'), chips = E('div', { class: 'nf-chips' });
	const ring = E('div', { class: 'nf-ring' }, [ SVG('svg', { viewBox: '0 0 92 92' }, [ SVG('path', { class: 'bg', d: ARC }), fg ]), num ]);
	const el = xcard('nf-health', 'Router health', E('div', { class: 'nf-health-b' }, [ ring, E('div', { class: 'nf-health-t' }, [ head, chips ]) ]));
	let timer = null;

	function render() {
		const s = SHARED;
		if (s.t == null || idle(el)) return;
		let score = 100;
		const f = [];
		const add = (pen, lvl, text) => { score -= pen; f.push([ lvl, text ]); };

		if (s.online === false) add(50, 'bad', 'No internet');
		else if (s.online === true) f.push([ 'ok', 'Internet is up' ]);
		if (s.ping != null && s.ping >= 0) {
			if (s.ping > 150) add(15, 'bad', 'High ping ' + nf0.format(s.ping) + ' ms');
			else if (s.ping > 80) add(6, 'warn', 'Ping ' + nf0.format(s.ping) + ' ms');
		}
		if (s.loss != null && s.loss > 2) add(s.loss > 10 ? 20 : 10, s.loss > 10 ? 'bad' : 'warn', 'Loss ' + nf0.format(s.loss) + '%');
		const [ cpuMid, cpuBad ] = thr('cpu', 60, 85), [ memMid, memBad ] = thr('mem', 70, 88), [ tempMid, tempBad ] = thr('temp', 70, 85);
		if (s.cpu != null) {
			if (s.cpu >= cpuBad) add(20, 'bad', 'CPU ' + nf0.format(s.cpu) + '%');
			else if (s.cpu >= cpuMid) add(8, 'warn', 'CPU ' + nf0.format(s.cpu) + '%');
		}
		if (s.mem != null) {
			if (s.mem >= memBad) add(20, 'bad', 'Memory ' + nf0.format(s.mem) + '%');
			else if (s.mem >= memMid) add(8, 'warn', 'Memory ' + nf0.format(s.mem) + '%');
		}
		if (s.temp != null) {
			if (s.temp >= tempBad) add(25, 'bad', 'Hot ' + nf0.format(s.temp) + ' °C');
			else if (s.temp >= tempMid) add(12, 'warn', 'Warm ' + nf0.format(s.temp) + ' °C');
		}
		score = Math.max(0, Math.min(100, Math.round(score)));
		const bad = f.filter(x => x[0] !== 'ok');
		if (!bad.length) f.push([ 'ok', 'Load is normal' ]);

		num.textContent = String(score);
		fg.setAttribute('stroke-dashoffset', (C * (1 - score / 100)).toFixed(1));
		ring.style.setProperty('--c', score >= 85 ? 'var(--nf-g-up, #2ea043)' : score >= 65 ? '#e8a317' : 'var(--nf-g-bad, #e5484d)');
		head.textContent = score >= 85 ? 'All good' : score >= 65 ? 'Some issues' : score >= 40 ? 'Needs attention' : 'Problems';
		chips.replaceChildren(...f.slice(0, 6).map(x => E('span', { class: 'nf-chip ' + x[0] }, x[1])), ...(SHARED.mode ? [ modeChip(SHARED.mode) ] : []));
	}

	return { el, contains: n => el.contains(n), start() { render(); timer = window.setInterval(render, 3000); } };
}

function wifiCard() {
	const body = E('div', { class: 'nf-wifi-b' }, E('div', { class: 'nf-empty' }, 'Looking for connected devices…'));
	const el = xcard('nf-wifi', 'Wi‑Fi now', body);
	let names = null, timer = null;
	const BAND = { '2g': '2.4 GHz', '5g': '5 GHz', '6g': '6 GHz', '60g': '60 GHz' };

	const open = new Set();
	let lastList = null;
	const dur = s => { s = +s || 0; const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); return d ? d + ' d ' + h + ' h' : h ? h + ' h ' + m + ' min' : m + ' min'; };

	function render(list) {
		if (EDITING) return;
		lastList = list;
		if (!list.length) {
			body.replaceChildren(E('div', { class: 'nf-empty' }, [ E('b', {}, 'Nobody here'), E('span', {}, 'No devices are connected to Wi‑Fi right now.') ]));
			return;
		}
		list.sort((a, b) => b.signal - a.signal);
		body.replaceChildren(...list.map(s => {
			const lv = signalLevel(s.signal), n = lv[0] === 'ok' ? (s.signal >= -60 ? 4 : 3) : lv[0] === 'warn' ? 2 : 1;
			const mac = nameKey(s.mac), hint = names && names[mac] || {};
			const auto = hint.name || s.mac, custom = loadNames()[mac] || '', shown = custom || auto;
			const rx = s.rx && s.rx.rate ? nf0.format(s.rx.rate / 1000) : '–', tx = s.tx && s.tx.rate ? nf0.format(s.tx.rate / 1000) : '–';
			const isOpen = open.has(mac);
			const title = E('b', { title: s.mac }, shown);
			const row = E('div', { class: 'nf-sta', role: 'button', tabindex: '0', 'aria-expanded': String(isOpen) }, [
				E('div', { class: 'nf-av' }, shown.charAt(0)),
				title,
				E('div', { class: 'nf-sig', 'data-l': lv[0] }, [
					E('i', {}, [ 1, 2, 3, 4 ].map(k => E('s', { class: k <= n ? 'on' : '', style: 'height:' + (4 + k * 3) + 'px' }))),
					E('span', {}, nf0.format(s.signal) + ' dBm') ]),
				E('small', {}, [ s.ssid, s.band, '↓' + rx + ' ↑' + tx + ' Mbit/s' ].filter(Boolean).join(' · '))
			]);
			const kv = (k, v) => v == null || v === '' ? null : E('div', {}, [ E('span', {}, k), E('b', {}, v) ]);
			const snr = s.noise != null && s.noise < 0 ? s.signal - s.noise : null;
			const det = E('div', { class: 'nf-sta-d' }, [
				kv('MAC', s.mac), kv('IP', ((hint.ipaddrs || [])[0]) || ((hint.ip6addrs || [])[0])), kv('Network', [ s.ssid, s.band ].filter(Boolean).join(' · ')),
				kv('Signal', nf0.format(s.signal) + ' dBm · ' + lv[1]), kv('Noise', s.noise != null && s.noise < 0 ? nf0.format(s.noise) + ' dBm' : ''), kv('SNR', snr != null ? nf0.format(snr) + ' dB' : ''),
				kv('Rate ↓', s.rx && s.rx.rate ? nf0.format(s.rx.rate / 1000) + ' Mbit/s' + (s.rx.mhz ? ' · ' + s.rx.mhz + ' MHz' : '') : ''),
				kv('Rate ↑', s.tx && s.tx.rate ? nf0.format(s.tx.rate / 1000) + ' Mbit/s' + (s.tx.mhz ? ' · ' + s.tx.mhz + ' MHz' : '') : ''),
				kv('Connected', s.connected_time ? dur(s.connected_time) : ''), kv('Idle', s.inactive != null ? nf0.format(s.inactive) + ' ms' : ''),
				kv('Packets ↓/↑', s.rx && s.tx && s.rx.packets != null ? nf0.format(s.rx.packets) + ' / ' + nf0.format(s.tx.packets) : ''),
				kv('Mode', [ s.he ? 'Wi‑Fi 6' : s.vht ? 'Wi‑Fi 5' : s.ht ? 'Wi‑Fi 4' : '' ].filter(Boolean).join(''))
			].filter(Boolean));
			const rn = E('button', { type: 'button', class: 'nf-qa nf-rn', click: ev => {
				ev.stopPropagation();
				editName(title.parentNode.querySelector('b'), mac, auto, () => render(lastList));
			} }, custom ? 'Rename' : 'Name it');
			det.appendChild(E('div', { class: 'nf-sta-a' }, rn));
			const toggle = () => { if (open.has(mac)) open.delete(mac); else open.add(mac); render(lastList); };
			row.addEventListener('click', toggle);
			row.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(); } });
			return E('div', { class: 'nf-sta-w' + (isOpen ? ' open' : '') }, isOpen ? [ row, det ] : [ row ]);
		}));
	}

	function load() {
		if (idle(el)) return;
		Promise.all([ callWireless().then(v => v || {}, () => null), names ? null : L.resolveDefault(callHints(), {}) ]).then(r => {
			if (r[0] === null) { body.replaceChildren(E('div', { class: 'nf-empty' }, [ E('b', {}, 'No access to Wi‑Fi data'), E('span', {}, 'After updating the theme, sign out of LuCI and sign in again, then run: /etc/init.d/rpcd restart') ])); return; }
			if (r[1]) names = Object.keys(r[1]).reduce((o, k) => { o[k.toUpperCase()] = r[1][k]; return o; }, {});
			const ifs = [];
			for (const radio in r[0] || {}) {
				const rc = r[0][radio] || {};
				for (const i of rc.interfaces || []) {
					const cfg = i.config || {};
					if (i.ifname && (cfg.mode || 'ap') === 'ap')
						ifs.push({ dev: i.ifname, ssid: cfg.ssid || '', band: BAND[(rc.config || {}).band] || '' });
				}
			}
			const next = ifs.length ? Promise.resolve(ifs) : L.resolveDefault(callIwDevs(), []).then(d => (d || []).map(dev => ({ dev, ssid: '', band: '' })));
			return next.then(list => {
			if (!list.length) { body.replaceChildren(E('div', { class: 'nf-empty' }, [ E('b', {}, 'No Wi‑Fi found'), E('span', {}, 'Wireless interfaces are not configured or are turned off.') ])); return; }
			return Promise.all(list.map(i => Promise.all([ L.resolveDefault(callAssoc(i.dev), []), (i.ssid && i.band) ? null : L.resolveDefault(callIwInfo(i.dev), null) ]).then(r => {
					const inf = r[1] || {}, f = +inf.frequency || 0;
					const band = i.band || (f ? (f < 3000 ? BAND['2g'] : f < 5925 ? BAND['5g'] : BAND['6g']) : '');
					return (r[0] || []).map(s => Object.assign({}, s, { ssid: i.ssid || inf.ssid || '', band }));
				}))).then(l => render([].concat(...l)));
			});
		}).catch(() => {});
	}

	return { el, contains: n => el.contains(n), start() { load(); timer = window.setInterval(load, 8000); } };
}

function eventsCard() {
	const body = E('div', { class: 'nf-ev-b' }, E('div', { class: 'nf-empty' }, 'Reading the log…'));
	const el = xcard('nf-events', 'Event feed', body);
	let timer = null;
	const LV = { ok: 'ok', info: 'info', warn: 'warn', warning: 'warn', crit: 'bad', critical: 'bad', bad: 'bad', error: 'bad', err: 'bad' };
	const two = v => String(v).padStart(2, '0');
	function when(ts) {
		const d = new Date(ts * 1000), n = new Date();
		const hm = two(d.getHours()) + ':' + two(d.getMinutes());
		return d.toDateString() === n.toDateString() ? hm : two(d.getDate()) + '.' + two(d.getMonth() + 1) + ' ' + hm;
	}

	function load() {
		if (idle(el)) return;
		fs.exec(HIST, [ 'series', 'fine' ]).then(res => {
			let h = null;
			try { h = JSON.parse(res.stdout); } catch (e) { /* no collector */ }
			if (!h || !Array.isArray(h.events)) {
				body.replaceChildren(E('div', { class: 'nf-empty' }, [ E('b', {}, 'No data'), E('span', {}, 'History collection is not running.') ]));
				return;
			}
			const raw = h.events.slice().reverse(), list = [];
			for (const e of raw) {   /* identical neighbours collapse into one row with a counter */
				const last = list[list.length - 1];
				if (last && last[2] === e[2]) last[3]++; else list.push([ e[0], e[1], e[2], 1 ]);
				if (list.length >= 8 && !(last && last[2] === e[2])) break;
			}
			if (!list.length) { body.replaceChildren(E('div', { class: 'nf-empty' }, [ E('b', {}, 'All quiet'), E('span', {}, 'No events yet.') ])); return; }
			body.replaceChildren(...list.map(e => E('div', { class: 'nf-ev', 'data-l': LV[String(e[1]).toLowerCase()] || 'info' }, [ E('div', {}, e[3] > 1 ? e[2] + ' ×' + e[3] : e[2]), E('span', {}, when(e[0])) ])));
		}).catch(() => {});
	}

	return { el, contains: n => el.contains(n), start() { load(); timer = window.setInterval(load, 15000); } };
}

function quickCard() {
	const note = E('div', { class: 'nf-qnote', role: 'status', 'aria-live': 'polite' });
	const body = E('div', { class: 'nf-quick-b nf-quick-b-four' });
	const el = xcard('nf-quick', 'Quick actions', body);

	function icon(path) {
		const svg = SVG('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' });
		svg.setAttribute('class', 'nf-qa-icon');
		svg.innerHTML = path;
		return svg;
	}

	function action(label, confirmText, run, path) {
		let timer = null;
		const caption = E('span', {}, label);
		const b = E('button', { type: 'button', class: 'nf-qa' }, [ icon(path), caption ]);
		b.addEventListener('click', () => {
			if (!b.classList.contains('arm')) {
				b.classList.add('arm'); caption.textContent = confirmText;
				timer = window.setTimeout(() => { b.classList.remove('arm'); caption.textContent = label; }, 4000);
				return;
			}
			window.clearTimeout(timer);
			b.classList.remove('arm'); caption.textContent = label; b.disabled = true;
			Promise.resolve(run()).catch(err => {
				note.textContent = 'The action failed: ' + (err && err.message ? err.message : err || 'permission denied');
			}).then(() => { b.disabled = false; });
		});
		return b;
	}

	function waitBack() {
		let was = false;
		const t = window.setInterval(() => {
			fetch(window.location.pathname, { cache: 'no-store' }).then(r => {
				if (r.ok && was) { window.clearInterval(t); window.location.reload(); }
			}).catch(() => { was = true; });
		}, 3000);
	}

	const wifi = action('Restart Wi‑Fi', 'Click again', () => {
		note.textContent = 'Restarting Wi‑Fi… devices will reconnect on their own.';
		return fs.exec('/sbin/wifi', [ 'reload' ]).then(r => {
			note.textContent = r.code === 0 ? 'Wi‑Fi restarted.' : 'The command returned error ' + r.code;
			if (r.code !== 0) throw new Error('code ' + r.code);
		});
	}, '<path d="M5 13a10 10 0 0 1 14 0M8.5 16.5a5 5 0 0 1 7 0"/><circle cx="12" cy="20" r=".8"/>');

	const reboot = action('Reboot router', 'Really reboot?', () => {
		note.textContent = 'The router is rebooting… the page will reload by itself when it is back.';
		return callReboot().then(waitBack);
	}, '<path d="M12 3v8"/><path d="M6.5 6.5a8 8 0 1 0 11 0"/>');

	const wake = action('Wake a device', 'Enter the MAC in the dialog', () => {
		const mac = (window.prompt('Enter the device MAC address (AA:BB:CC:DD:EE:FF):') || '').trim().toUpperCase();
		if (!mac) { note.textContent = 'Wake cancelled.'; return Promise.resolve(); }
		if (!/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(mac)) throw new Error('invalid MAC address');
		note.textContent = 'Sending Wake-on-LAN packet…';
		return fs.exec('/usr/bin/etherwake', [ '-b', '-i', 'br-lan', mac ]).then(r => {
			if (r.code !== 0) throw new Error(r.stderr || ('code ' + r.code));
			note.textContent = 'Wake packet sent: ' + mac;
		});
	}, '<path d="M3 8h13v10H3z"/><path d="M16 11h3l2 2v5h-5"/><circle cx="7" cy="19" r="1.5"/><circle cx="18" cy="19" r="1.5"/>');

	const copy = action('Copy diagnostics', 'Click again', () => {
		note.textContent = 'Collecting diagnostics…';
		return Promise.all([ callBoard(), callIfaces(), callWireless() ]).then(data => {
			const report = 'Nightfall diagnostics\n' + JSON.stringify({ board: data[0], interfaces: data[1], wireless: data[2] }, null, 2);
			if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('the browser denied clipboard access');
			return navigator.clipboard.writeText(report);
		}).then(() => { note.textContent = 'Diagnostics copied to the clipboard.'; });
	}, '<path d="M7 3h8l4 4v14H7z"/><path d="M15 3v5h4M10 13h6M10 17h6"/>');

	body.append(wifi, reboot, wake, copy, note);
	return { el, contains: n => el.contains(n), start() {} };
}
/* ---------- init ---------- */

return baseclass.extend({
	blockCard: blockCard,   /* the whole "Internet access" card; the monitor's "Devices" tab shows it too */
	__init__() {
		const path = (L.env.dispatchpath || []).join('/');
		if (path !== 'admin/status/overview') return;

		const view = document.getElementById('view');
		if (!view) return;

		let strip = null, extras = [], ready = false, timer = null;
		const relayout = gridLayout(view);

		const run = () => {
			timer = null;
			if (DRAG || !cardsOf(view).length) return;

			if (!ready) {
				ready = true;
				strip = liveStrip();
				strip.resetBtn.addEventListener('click', () => { saveOrder(null); sortCards(view, null); });
				sortCards(view, loadOrder());
				view.insertBefore(strip.el, cardsOf(view)[0]);
				const nd = newDevBanner(); strip.el.insertBefore(nd.el, strip.el.firstChild); nd.start();
				strip.start();
				extras = [ healthCard(), wifiCard(), eventsCard(), quickCard(), topCard(), tempCard(), appsCard(), blockCard() ];
				extras.forEach(x => { view.appendChild(x.el); x.start(); });
			}
			else {
				sortCards(view, loadOrder());
				const first = cardsOf(view)[0];
				if (first && strip.el.nextSibling !== first && strip.el.parentNode === view)
					view.insertBefore(strip.el, first);
			}

			decorateCards(view);
			hideStockTemp(view, extras);
			syncPins(view);
			syncSizes(view);
			markNoWrap(view); decorateHosts(view); levelFree(view);
			enhanceBadges(view);
			applyColumns(view, relayout);
		};

		const schedule = muts => {
			if (timer || (muts && muts.every(m => (strip && strip.el.contains(m.target)) || extras.some(x => x.contains(m.target)) || (m.target === view && DRAG)))) return;
			timer = window.setTimeout(run, 250);
		};
		new MutationObserver(muts => {
			const own = muts.every(m => (strip && strip.el.contains(m.target)) || extras.some(x => x.contains(m.target)) || (m.target === view && DRAG));
			if (!own) { enhanceBadges(view); markNoWrap(view); decorateHosts(view); levelFree(view); stabilizeTables(view); }
			schedule(muts);
		}).observe(view, { childList: true, subtree: true, characterData: true });
		/* signal and Wi-Fi icons in tables load after the rows are inserted: account for their size right away, without waiting for the next poll */
		view.addEventListener('load', ev => { if (ev.target && ev.target.tagName === 'IMG') stabilizeTables(view); }, true);
		window.addEventListener('resize', () => { applyColumns(view); relayout(); });
		new MutationObserver(() => { applyColumns(view); relayout(); }).observe(document.documentElement, { attributes: true, attributeFilter: [ 'data-nf-ov-cols', 'data-nf-ov-size', 'data-nf-ov-wide' ] });
		schedule();
	}
});
