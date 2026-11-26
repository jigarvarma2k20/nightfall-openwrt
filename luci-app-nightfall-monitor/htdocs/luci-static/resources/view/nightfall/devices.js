'use strict';
'require view';
'require rpc';
'require fs';
'require poll';

/*
 * Nightfall: the "Devices" page. Network map (router in the center, devices around it, live speed on the lines),
 * device card (custom name, icon, group, blocking, schedule, limit) and device groups
 * (rules for the whole group at once: disconnect, schedule, daily limit for each).
 * Data: nightfall-block list/groups, nightfall-history devices, iwinfo (Wi-Fi signal level).
 */

const BLOCK = '/usr/libexec/nightfall-block';
const HIST = '/usr/libexec/nightfall-history';
const EVERY = 3;   /* seconds between refreshes */

const callIwDevs = rpc.declare({ object: 'iwinfo', method: 'devices', expect: { devices: [] } });
const callAssoc = rpc.declare({ object: 'iwinfo', method: 'assoclist', params: [ 'device' ], expect: { results: [] } });

const ICONS = [
	[ 'phone', '📱', 'Phone' ], [ 'laptop', '💻', 'Laptop' ], [ 'pc', '🖥️', 'Computer' ], [ 'tablet', '📲', 'Tablet' ],
	[ 'tv', '📺', 'TV' ], [ 'console', '🎮', 'Console' ], [ 'speaker', '🔊', 'Speaker' ], [ 'camera', '📷', 'Camera' ],
	[ 'printer', '🖨️', 'Printer' ], [ 'iot', '💡', 'Smart home' ], [ 'watch', '⌚', 'Watch' ], [ 'router', '📡', 'Router/AP' ], [ 'other', '❔', 'Other' ]
];
const ICON = {}; ICONS.forEach(i => { ICON[i[0]] = i[1]; });
const GUESS = [
	[ /iphone|android|galaxy|pixel|redmi|xiaomi|poco|honor|huawei|oppo|realme|phone|телефон/i, 'phone' ], [ /ipad|tablet|планшет/i, 'tablet' ],
	[ /macbook|laptop|notebook|thinkpad|ноутбук/i, 'laptop' ], [ /desktop|\bpc\b|imac|компьют/i, 'pc' ], [ /tv|телев|bravia|webos|roku|chromecast|appletv/i, 'tv' ],
	[ /playstation|ps[345]|xbox|nintendo|switch|steam/i, 'console' ], [ /echo|alice|алиса|speaker|sonos|колонк/i, 'speaker' ], [ /cam|камер|ipc|reolink|hikvision/i, 'camera' ],
	[ /printer|принтер|epson|canon|brother|hp.?laser/i, 'printer' ], [ /watch|часы|band/i, 'watch' ], [ /esp|tasmota|shelly|plug|lamp|bulb|sensor|tuya|zigbee|hue/i, 'iot' ],
	[ /ap|wifi|repeater|extender|mesh|router/i, 'router' ]
];

/* device icons: one set of lines, drawn in the theme text color */
const SHAPES = {
	phone: [ [ 'rect', { x: 7, y: 2, width: 10, height: 20, rx: 2.5 } ], [ 'path', { d: 'M11 18.5h2' } ] ],
	tablet: [ [ 'rect', { x: 4, y: 3, width: 16, height: 18, rx: 2 } ], [ 'path', { d: 'M11 18h2' } ] ],
	laptop: [ [ 'rect', { x: 5, y: 5, width: 14, height: 10, rx: 1.5 } ], [ 'path', { d: 'M2 19h20' } ] ],
	pc: [ [ 'rect', { x: 3, y: 4, width: 18, height: 12, rx: 2 } ], [ 'path', { d: 'M9 20h6M12 16v4' } ] ],
	tv: [ [ 'rect', { x: 3, y: 6, width: 18, height: 12, rx: 2 } ], [ 'path', { d: 'M9 3l3 3 3-3' } ] ],
	console: [ [ 'rect', { x: 2, y: 8, width: 20, height: 9, rx: 4.5 } ], [ 'path', { d: 'M7 12.5h3M8.5 11v3' } ], [ 'circle', { cx: 15.5, cy: 12, r: .6 } ], [ 'circle', { cx: 17.5, cy: 13.5, r: .6 } ] ],
	speaker: [ [ 'rect', { x: 6, y: 2, width: 12, height: 20, rx: 3 } ], [ 'circle', { cx: 12, cy: 15, r: 3.5 } ], [ 'circle', { cx: 12, cy: 7, r: 1 } ] ],
	camera: [ [ 'path', { d: 'M2 8h4l2-3h8l2 3h4v11H2z' } ], [ 'circle', { cx: 12, cy: 13, r: 3.5 } ] ],
	printer: [ [ 'path', { d: 'M7 9V3h10v6' } ], [ 'rect', { x: 3, y: 9, width: 18, height: 8, rx: 2 } ], [ 'rect', { x: 7, y: 14, width: 10, height: 7 } ] ],
	iot: [ [ 'path', { d: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.1 1 1.9v.2h5v-.2c0-.8.4-1.4 1-1.9A6 6 0 0 0 12 3z' } ] ],
	watch: [ [ 'rect', { x: 7, y: 6, width: 10, height: 12, rx: 3 } ], [ 'path', { d: 'M9 6l.7-3h4.6l.7 3M9 18l.7 3h4.6l.7-3M12 10v2.5l1.5 1' } ] ],
	router: [ [ 'rect', { x: 3, y: 13, width: 18, height: 7, rx: 2 } ], [ 'path', { d: 'M7 16.5h.01M11 16.5h.01M12 13V9M8.5 7a5 5 0 0 1 7 0M6 4.5a8.5 8.5 0 0 1 12 0' } ] ],
	other: [ [ 'circle', { cx: 12, cy: 12, r: 9 } ], [ 'path', { d: 'M12 8v5M12 16h.01' } ] ],
	group: [ [ 'circle', { cx: 9, cy: 8, r: 3 } ], [ 'path', { d: 'M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6' } ], [ 'circle', { cx: 17, cy: 9, r: 2.4 } ], [ 'path', { d: 'M16 14.2c2.8.2 5 2.4 5 5.3' } ] ]
};
/* icon as a nested SVG: size in pixels, x and y only inside the map */
function glyph(name, size, x, y) {
	const a = { viewBox: '0 0 24 24', width: size, height: size, class: 'nf-ic', 'aria-hidden': 'true' };
	if (x != null) { a.x = x; a.y = y; }
	return svgEl('svg', a, (SHAPES[name] || SHAPES.other).map(sh => svgEl(sh[0], sh[1])));
}

const nf1 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

function bytes(b) {
	if (b >= 1073741824) return nf1.format(b / 1073741824) + ' GB';
	if (b >= 1048576) return nf1.format(b / 1048576) + ' MB';
	if (b >= 1024) return nf0.format(b / 1024) + ' KB';
	return nf0.format(b) + ' B';
}
function mbit(bps) { const m = bps * 8 / 1e6; return (m >= 10 ? nf0.format(m) : nf1.format(m)) + ' Mbit/s'; }
const iconOf = d => (SHAPES[d.icon] ? d.icon : (GUESS.find(g => g[0].test(d.name || '')) || [ 0, 'other' ])[1]);
const show = d => d.name || d.ip || d.mac;
const parse = r => { try { return JSON.parse(r.stdout); } catch (e) { return null; } };

const opt = (value, text, on) => { const o = E('option', { value: value }, text); o.selected = !!on; return o; };

function svgEl(name, attrs, kids) {
	const e = document.createElementNS('http://www.w3.org/2000/svg', name);
	Object.keys(attrs || {}).forEach(k => e.setAttribute(k, attrs[k]));
	(kids || []).forEach(k => e.appendChild(typeof k === 'string' ? document.createTextNode(k) : k));
	return e;
}

return view.extend({
	load() { return Promise.resolve(); },

	render() {
		const S = { devs: [], groups: [], rate: {}, day: {}, sig: {}, wifi: {}, sel: null, filter: '', note: '', busy: false, ok: null };
		const root = E('div', { class: 'nf-dv' });
		const mapBox = E('div', { class: 'nf-dv-map' });
		const side = E('div', { class: 'nf-dv-side' });
		const grpBox = E('div', { class: 'nf-dv-groups' });
		const chips = E('div', { class: 'nf-dv-chips' });
		const noteEl = E('div', { class: 'nf-dv-note', role: 'status' });

		const run = args => fs.exec(BLOCK, args).then(parse);
		function act(args, ok) {
			if (S.busy) return;
			S.busy = true;
			run(args).then(r => {
				S.busy = false;
				S.note = r && r.ok ? ok : ((r && r.error) || 'No response from the router. Log out of LuCI and sign in again (permissions are refreshed at sign-in).');
				refresh();
			}).catch(() => { S.busy = false; S.note = 'Could not run the command.'; refresh(); });
		}

		const shown = () => S.devs.filter(d => !S.filter || (S.filter === '-' ? !d.group : d.group === S.filter));

		/* ---- network map ---- */
		function drawMap() {
			const list = shown().filter(d => d.online || d.active).sort((a, b) => (a.group || '').localeCompare(b.group || '') || show(a).localeCompare(show(b)));
			const W = 520, cx = W / 2, n = list.length, rad = n > 14 ? 205 : 165, H = n > 14 ? 500 : 420, cy = H / 2;
			const svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'nf-dv-svg', role: 'img', 'aria-label': 'Network map' });
			const links = svgEl('g'), nodes = svgEl('g');
			svg.appendChild(links); svg.appendChild(nodes);
			list.forEach((d, i) => {
				const a = -Math.PI / 2 + 2 * Math.PI * i / Math.max(n, 1), x = cx + rad * Math.cos(a), y = cy + rad * 0.95 * Math.sin(a);
				const r = S.rate[d.ip] || [ 0, 0 ], bps = (r[0] || 0) + (r[1] || 0);
				const wifi = !!S.wifi[d.mac], busy = bps > 2000;
				const cls = 'nf-dv-link' + (wifi ? ' wifi' : '') + (d.active ? ' off' : '') + (busy ? ' busy' : '');
				const line = svgEl('line', { x1: cx, y1: cy, x2: x, y2: y, class: cls });
				if (busy) { line.style.strokeWidth = String(Math.min(6, 1.5 + Math.log10(bps / 1000))); line.style.animationDuration = Math.max(0.35, 2.4 - Math.log10(bps) * 0.3) + 's'; }
				links.appendChild(line);
				const g = svgEl('g', { class: 'nf-dv-node' + (S.sel === d.mac ? ' sel' : '') + (d.active ? ' off' : ''), tabindex: '0', role: 'button', 'aria-label': show(d) });
				g.setAttribute('transform', 'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ')');
				g.appendChild(svgEl('circle', { r: 28 }));
				g.appendChild(glyph(iconOf(d), 26, -13, -13));
				const label = show(d); g.appendChild(svgEl('text', { class: 'lb', 'text-anchor': 'middle', y: 47 }, [ label.length > 16 ? label.slice(0, 15) + '…' : label ]));
				if (busy) g.appendChild(svgEl('text', { class: 'sp', 'text-anchor': 'middle', y: 61 }, [ mbit(bps) ]));
				const pick = () => { S.sel = S.sel === d.mac ? null : d.mac; draw(); };
				g.addEventListener('click', pick);
				g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
				nodes.appendChild(g);
			});
			const hub = svgEl('g', { class: 'nf-dv-hub' }, [ svgEl('circle', { cx: cx, cy: cy, r: 38 }), glyph('router', 34, cx - 17, cy - 17) ]);
			svg.appendChild(hub);
			mapBox.replaceChildren(svg, n ? '' : E('div', { class: 'nf-dv-empty' }, 'No devices in this group are online right now.'));
		}

		/* ---- selected device card ---- */
		/* ---- schedule: several windows, each with its own days of the week ---- */
		const DAYN = [ 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun' ];
		function daysText(dy) {
			if (!dy) return 'every day';
			if (dy === '12345') return 'weekdays';
			if (dy === '67') return 'weekends';
			return dy.split('').map(x => DAYN[+x - 1]).join(', ');
		}
		function winsOf(o) {   // windows of an object: the first is in from/to/days, the rest in rules "from-to@days;…"
			const w = [];
			if (o.from && o.to) w.push({ from: o.from, to: o.to, days: o.days || '' });
			(o.rules || '').split(';').forEach(r => { const m = /^(\d\d:\d\d)-(\d\d:\d\d)(?:@([1-7]*))?$/.exec(r); if (m) w.push({ from: m[1], to: m[2], days: m[3] || '' }); });
			return w;
		}
		function schedBox(o, cmd) {   // cmd: [ 'sadd', mac ] or [ 'gsadd', group ]
			const grp = cmd[0] === 'gsadd', pre = grp ? 'gs' : 's';
			const f = E('input', { type: 'time', value: '23:00', 'aria-label': 'Disconnect from' });
			const t = E('input', { type: 'time', value: '07:00', 'aria-label': 'Reconnect at' });
			const chk = DAYN.map((n, i) => E('input', { type: 'checkbox', value: String(i + 1), checked: true, 'aria-label': n }));
			const setDays = set => chk.forEach(c => { c.checked = set.indexOf(c.value) >= 0; });
			const picked = () => { const v = chk.filter(c => c.checked).map(c => c.value).join(''); return v === '1234567' ? '' : v; };
			const preset = (txt, set) => E('button', { type: 'button', class: 'cbi-button', click: () => setDays(set) }, txt);
			const wins = winsOf(o);
			const list = wins.map((w, i) => E('div', { class: 'nf-dv-row nf-dv-win' }, [
				E('span', {}, w.from + '–' + w.to + ' · ' + daysText(w.days)),
				E('button', { class: 'cbi-button', click: () => act([ pre + 'del', cmd[1], String(i + 1) ], 'Window removed.') }, 'Remove') ]));
			if (wins.length > 1) list.push(E('div', { class: 'nf-dv-row' }, [ E('button', { class: 'cbi-button', click: () => act([ grp ? 'gsched' : 'sched', cmd[1], 'off' ], 'Schedule removed.') }, 'Remove the whole schedule') ]));
			const add = () => {
				if (!chk.some(c => c.checked)) { window.alert('Select at least one day of the week.'); return; }
				act([ cmd[0], cmd[1], f.value, t.value, picked() ], 'Window added.');
			};
			return E('div', { class: 'nf-dv-sched' }, [
				E('small', {}, wins.length ? 'Turn off internet on a schedule' : 'No schedule set'),
				E('div', {}, list),
				E('div', { class: 'nf-dv-row' }, [ E('span', {}, 'Disconnect from'), f, E('span', {}, 'to'), t ]),
				E('div', { class: 'nf-dv-row nf-dv-days' }, chk.map((c, i) => E('label', {}, [ c, DAYN[i] ]))),
				E('div', { class: 'nf-dv-row' }, [ preset('Every day', '1234567'), preset('Weekdays', '12345'), preset('Weekends', '67'),
					E('button', { class: 'cbi-button cbi-button-action', click: add }, 'Add window') ]) ]);
		}
		function sched(d) { return schedBox(d, [ 'sadd', d.mac ]); }
		function quota(d) {
			const q = E('input', { type: 'number', min: '1', max: '1000000', value: d.quota || '', placeholder: 'MB per day', 'aria-label': 'Daily limit, MB' });
			return E('div', { class: 'nf-dv-row' }, [ E('span', {}, 'Daily limit'), q, E('span', {}, 'MB'),
				E('button', { class: 'cbi-button cbi-button-action', click: () => act([ 'quota', d.mac, q.value || 'off', d.name || '' ], q.value ? 'Limit saved.' : 'Limit removed.') }, 'Save') ]);
		}
		function detail(d) {
			const day = S.day[d.ip], sig = S.sig[d.mac], r = S.rate[d.ip] || [ 0, 0 ];
			const name = E('input', { type: 'text', value: d.name || '', maxlength: '40', placeholder: 'Device name', 'aria-label': 'Device name' });
			const icon = E('select', { 'aria-label': 'Icon' }, ICONS.map(i => opt(i[0], i[1] + ' ' + i[2], (d.icon || '') === i[0])));
			if (!d.icon) icon.insertBefore(opt('', 'Auto', true), icon.firstChild);
			const grp = E('select', { 'aria-label': 'Group' }, [ opt('', 'No group', !d.group) ].concat(S.groups.map(g => opt(g.name, g.name, g.name === d.group))));
			const state = d.active ? ({ manual: 'Turned off manually', gmanual: 'Turned off by group', quota: 'Limit reached', sched: 'Turned off by schedule' }[d.reason] || 'Turned off') : (d.online ? 'Online' : 'Offline');
			return E('div', { class: 'nf-dv-card' }, [
				E('div', { class: 'nf-dv-h' }, [ E('span', { class: 'ic' }, glyph(iconOf(d), 26)), E('div', {}, [ E('b', {}, show(d)), E('small', {}, state + (d.ip ? ' · ' + d.ip : '')) ]),
					E('button', { class: 'nf-dv-x', 'aria-label': 'Close', click: () => { S.sel = null; draw(); } }, '✕') ]),
				E('div', { class: 'nf-dv-kv' }, [
					E('div', {}, [ E('small', {}, 'Today'), E('b', {}, day ? '↓ ' + bytes(day[0]) + ' ↑ ' + bytes(day[1]) : '—') ]),
					E('div', {}, [ E('small', {}, 'Now'), E('b', {}, d.online ? '↓ ' + mbit(r[0] || 0) + ' ↑ ' + mbit(r[1] || 0) : '—') ]),
					E('div', {}, [ E('small', {}, 'Connection'), E('b', {}, S.wifi[d.mac] ? 'Wi-Fi' + (sig ? ', ' + sig + ' dBm' : '') : (d.online ? 'Cable' : '—')) ]),
					E('div', {}, [ E('small', {}, 'MAC'), E('b', { class: 'mono' }, d.mac) ]) ]),
				d.quota ? E('div', { class: 'nf-dv-bar', title: 'Limit' }, [ E('i', { style: 'width:' + Math.min(100, Math.round(100 * d.used / (d.quota * 1048576))) + '%' }), E('span', {}, bytes(d.used) + ' of ' + d.quota + ' MB') ]) : '',
				E('div', { class: 'nf-dv-row' }, [ name, icon, grp,
					E('button', { class: 'cbi-button cbi-button-action', click: () => act([ 'meta', d.mac, name.value.trim(), icon.value, grp.value ], 'Saved.') }, 'Save') ]),
				E('div', { class: 'nf-dv-row' }, [ d.manual || d.reason === 'gmanual' || d.active
					? E('button', { class: 'cbi-button cbi-button-positive', click: () => act([ 'unblock', d.mac ], 'Internet restored.') }, d.manual ? 'Restore internet' : 'Restore for today')
					: E('button', { class: 'cbi-button cbi-button-negative', click: () => act([ 'block', d.mac, d.name || '' ], 'Internet turned off.') }, 'Turn off internet') ]),
				sched(d), quota(d) ]);
		}

		/* ---- groups ---- */
		function groupRow(g) {
			const members = S.devs.filter(d => d.group === g.name);
			const q = E('input', { type: 'number', min: '1', max: '1000000', value: g.quota || '', placeholder: 'MB', 'aria-label': 'Daily limit for each, MB' });
			const rules = [ g.manual ? 'turned off' : '', winsOf(g).length ? winsOf(g).map(w => w.from + '–' + w.to + ' ' + daysText(w.days)).join('; ') : '', g.quota ? 'limit ' + g.quota + ' MB' : '' ].filter(Boolean).join(' · ') || 'no rules';
			return E('div', { class: 'nf-dv-grp' + (S.filter === g.name ? ' on' : '') }, [
				E('div', { class: 'nf-dv-h' }, [ E('span', { class: 'ic' }, glyph('group', 26)), E('div', {}, [ E('b', {}, g.name), E('small', {}, members.length + ' dev. · ' + rules) ]),
					E('button', { class: 'cbi-button', click: () => { S.filter = S.filter === g.name ? '' : g.name; draw(); } }, S.filter === g.name ? 'All devices' : 'Show') ]),
				E('div', { class: 'nf-dv-row' }, [ g.manual
					? E('button', { class: 'cbi-button cbi-button-positive', click: () => act([ 'gunblock', g.name ], 'Group "' + g.name + '" is back online.') }, 'Restore internet for the group')
					: E('button', { class: 'cbi-button cbi-button-negative', click: () => act([ 'gblock', g.name ], 'Group "' + g.name + '" turned off.') }, 'Turn off the whole group') ]),
					schedBox(g, [ 'gsadd', g.name ]),
				E('div', { class: 'nf-dv-row' }, [ E('span', {}, 'Limit for each'), q, E('span', {}, 'MB/day'),
					E('button', { class: 'cbi-button cbi-button-action', click: () => act([ 'gquota', g.name, q.value || 'off' ], q.value ? 'Group limit saved.' : 'Limit removed.') }, 'Save') ]),
				E('div', { class: 'nf-dv-row' }, [ E('button', { class: 'cbi-button cbi-button-remove', click: () => { if (window.confirm('Delete group "' + g.name + '"? Its devices will be left without a group.')) { if (S.filter === g.name) S.filter = ''; act([ 'gdel', g.name ], 'Group deleted.'); } } }, 'Delete group') ]) ]);
		}
		function groupsPane() {
			const nm = E('input', { type: 'text', maxlength: '30', placeholder: 'New group: Kids, Guests, Smart home…', 'aria-label': 'Group name' });
			const add = () => { const v = nm.value.trim(); if (v) act([ 'gadd', v ], 'Group "' + v + '" created. Add devices to it in their cards.'); };
			nm.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
			return [ E('div', { class: 'nf-dv-row nf-dv-add' }, [ nm, E('button', { class: 'cbi-button cbi-button-action', click: add }, 'Create group') ]) ]
				.concat(S.groups.length ? S.groups.map(groupRow) : [ E('div', { class: 'nf-dv-empty' }, 'No groups yet. Create a group, for example "Kids": the schedule and limit will apply to all its devices at once.') ]);
		}

		/* ---- device list ---- */
		function listPane() {
			const rows = shown().slice().sort((a, b) => ((b.online ? 1 : 0) - (a.online ? 1 : 0)) || show(a).localeCompare(show(b)));
			if (!rows.length) return E('div', { class: 'nf-dv-empty' }, 'No devices.');
			return E('div', { class: 'nf-dv-list' }, rows.map(d => {
				const r = S.rate[d.ip] || [ 0, 0 ], day = S.day[d.ip];
				return E('button', { type: 'button', class: 'nf-dv-item' + (S.sel === d.mac ? ' sel' : '') + (d.active ? ' off' : '') + (d.online ? '' : ' gone'), click: () => { S.sel = S.sel === d.mac ? null : d.mac; draw(); } }, [
					E('span', { class: 'ic' }, glyph(iconOf(d), 22)),
					E('span', { class: 'tx' }, [ E('b', {}, show(d)), E('small', {}, [ d.group ? d.group + ' · ' : '', d.active ? 'turned off' : (d.online ? (S.wifi[d.mac] ? 'Wi-Fi' : 'cable') : 'offline'), day ? ' · ' + bytes(day[0] + day[1]) + ' today' : '' ].join('')) ]),
					E('span', { class: 'sp' }, d.online && (r[0] + r[1]) > 2000 ? mbit(r[0] + r[1]) : '') ]);
			}));
		}

		function draw() {
			chips.replaceChildren(...[ [ '', 'All' ] ].concat(S.groups.map(g => [ g.name, g.name ]), [ [ '-', 'No group' ] ]).map(c =>
				E('button', { type: 'button', class: 'nf-dv-chip', 'aria-pressed': String(S.filter === c[0]), click: () => { S.filter = c[0]; draw(); } }, c[1])));
			noteEl.textContent = S.note || '';
			if (S.ok === false) { mapBox.replaceChildren(E('div', { class: 'nf-dv-empty' }, 'No response from the router. Log out of LuCI and sign in again: access permissions are refreshed at sign-in.')); }
			else drawMap();
			const sel = S.devs.find(d => d.mac === S.sel);
			side.replaceChildren(...(sel ? [ detail(sel) ] : []), listPane());
			const key = JSON.stringify(S.groups) + S.filter + S.devs.map(d => d.mac + d.group).join();
			const a0 = document.activeElement;
			if (grpBox.dataset.k !== key && !(a0 && grpBox.contains(a0) && /INPUT/.test(a0.tagName))) { grpBox.replaceChildren(...groupsPane()); grpBox.dataset.k = key; }
		}

		function refresh() {
			return Promise.all([
				run([ 'list' ]).catch(() => null), run([ 'groups' ]).catch(() => null),
				fs.exec(HIST, [ 'devices' ]).then(parse).catch(() => null),
				callIwDevs().then(ds => Promise.all((ds || []).map(dv => callAssoc(dv).then(a => [ dv, a ]).catch(() => [ dv, [] ])))).catch(() => [])
			]).then(res => {
				const l = res[0], g = res[1], h = res[2];
				S.ok = !!(l && l.ok);
				if (l && l.ok) S.devs = l.devices;
				if (g && g.ok) S.groups = g.groups;
				S.rate = {}; S.day = {};
				if (h) { (h.rate || []).forEach(r => { S.rate[r[0]] = [ r[1], r[2] ]; }); (h.day || []).forEach(r => { S.day[r[0]] = [ r[1], r[2] ]; }); }
				S.wifi = {}; S.sig = {};
				(res[3] || []).forEach(p => (p[1] || []).forEach(c => { const m = String(c.mac || '').toLowerCase(); S.wifi[m] = true; if (c.signal) S.sig[m] = c.signal; }));
				const typing = document.activeElement && side.contains(document.activeElement) && /INPUT|SELECT/.test(document.activeElement.tagName);
				if (!typing || S.note) draw();
			});
		}

		root.appendChild(E('div', { class: 'nf-dv-top' }, [ E('h2', {}, 'Devices'), chips ]));
		root.appendChild(noteEl);
		root.appendChild(E('div', { class: 'nf-dv-grid' }, [ E('div', { class: 'nf-dv-col' }, [ mapBox ]), side ]));
		root.appendChild(E('h3', { class: 'nf-dv-gh' }, 'Groups'));
		root.appendChild(grpBox);
		draw();
		refresh();
		poll.add(() => { if (document.hidden) return; S.note = S.busy ? S.note : ''; return refresh(); }, EVERY);
		return root;
	},

	handleSave: null, handleSaveApply: null, handleReset: null
});
