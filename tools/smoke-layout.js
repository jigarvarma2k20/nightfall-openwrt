// Desktop layout test for LuCI dialogs and tables (catches regressions like an off-center "This section contains no values yet"
// and a narrow Wi-Fi scan dialog). The page is built from LuCI markup and theme styles; no network needed.
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const CSS = fs.readFileSync(path.join(__dirname, '..', 'luci-theme-nightfall/htdocs/luci-static/nightfall/cascade.css'), 'utf8');
const MCSS = fs.readFileSync(path.join(__dirname, '..', 'luci-theme-nightfall/htdocs/luci-static/nightfall/mobile.css'), 'utf8');
const TH = ['Interface', 'Target', 'Gateway', 'Metric', 'Table', 'Disable'].map(t => '<div class="th cbi-section-table-cell">' + t + '</div>').join('');
const html = '<!doctype html><html lang="en"><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><style>' + CSS + '</style></head>' +
	'<body class="modal-overlay-active"><div id="maincontent"><div id="view"><div class="cbi-map"><div class="cbi-section"><div class="cbi-section-node">' +
	'<div class="table cbi-section-table" id="t1"><div class="tr cbi-section-table-titles">' + TH + '</div>' +
	'<div class="tr cbi-section-table-row placeholder"><div class="td"><em>This section contains no values yet</em></div></div></div></div></div>' +
	'<div class="cbi-section"><div class="cbi-section-node"><div class="table cbi-section-table" id="t2"><div class="tr cbi-section-table-titles">' +
	['Hostname', 'MAC address', 'IPv4 address', 'Lease time', 'DUID/IAID', 'IPv6 token', 'Set tag', 'Match tag'].map(t => '<div class="th cbi-section-table-cell">' + t + '</div>').join('') +
	'</div><div class="tr cbi-section-table-row placeholder"><div class="td"><em>This section contains no values yet</em></div></div></div></div></div>' +
	'<div class="cbi-page-actions" id="pa"><button class="cbi-button cbi-button-apply">Save & Apply</button><button class="cbi-button cbi-button-save">Save</button><button class="cbi-button cbi-button-reset">Reset</button></div></div></div></div>' +
	'<div id="modal_overlay" class="active"><div class="modal" id="scan"><h4>Join Network: Wireless Scan</h4><div class="table"><div class="tr table-titles">' +
	['Signal', 'SSID', 'Channel', 'Mode', 'BSSID', 'Encryption'].map(t => '<div class="th">' + t + '</div>').join('') +
	'</div><div class="tr placeholder"><div class="td"><em class="spinning">Scanning for wireless networks…</em></div></div></div>' +
	'<div class="button-row"><button class="btn cbi-button">Dismiss</button></div></div></div></body></html>';
// sign-in dialog: a separate page, as sysauth.ut renders it
const login = '<!doctype html><html lang="en"><head><meta charset=utf-8><style>' + CSS + '</style></head><body class="nf-blank modal-overlay-active"><div id="modal_overlay" class="active"><div class="modal login"><h4>Authorization Required</h4>' +
	'<form class="cbi-map"><div class="cbi-section"><div class="cbi-section-node"><div class="cbi-value"><label class="cbi-value-title">Username</label><div class="cbi-value-field"><input type="text" value="root"></div></div>' +
	'<div class="cbi-value"><label class="cbi-value-title">Password</label><div class="cbi-value-field"><input type="password"></div></div></div></div></form><button class="btn cbi-button-positive important">Log in</button></div></div></body></html>';
let fail = 0; const bad = m => { console.log('ERROR: ' + m); fail = 1; };
(async () => {
	const b = await chromium.launch();
	const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
	p.on('pageerror', e => bad(e.message));
	await p.setContent(html); await p.waitForTimeout(700);
	const r = await p.evaluate(() => {
		const c = el => { const b = el.getBoundingClientRect(); return { l: b.left, w: b.width, cx: b.left + b.width / 2 }; };
		const t = c(document.getElementById('t1')), td = c(document.querySelector('#t1 .placeholder .td'));
		const m = c(document.getElementById('scan')), sp = c(document.querySelector('#scan .placeholder .td'));
		const mt = c(document.querySelector('#scan .table'));
		const btns = [...document.querySelectorAll('#pa button')].map(x => x.getBoundingClientRect());
		return { t, td, m, sp, mt, gap: btns[1].left - btns[0].right, h: btns.map(x => Math.round(x.height)) };
	});
	if (Math.abs(r.td.cx - r.t.cx) > 4) bad('"no values yet" not centered in the table (offset ' + Math.round(r.td.cx - r.t.cx) + ' px)');
	if (r.td.w < r.t.w - 4) bad('empty row narrower than the table (' + Math.round(r.td.w) + ' of ' + Math.round(r.t.w) + ' px)');
	// loading indicator: small (20 px) and not overlapping the text; no empty-state icon (46 px)
	const sc = await p.evaluate(() => {
		const em = document.querySelector('#scan .placeholder em'), cs = getComputedStyle(em, '::before');
		const rg = document.createRange(); rg.selectNodeContents(em); const tx = rg.getBoundingClientRect(), eb = em.getBoundingClientRect();
		return { w: parseFloat(cs.width), gap: tx.left - (eb.left + 4 + 20) };
	});
	if (sc.w > 24) bad('scan: a large circle instead of the indicator ' + Math.round(sc.w) + ' px');
	if (sc.gap < 2) bad('scan: indicator overlaps the text (gap ' + Math.round(sc.gap) + ' px)');
	const d = await p.evaluate(() => {
		const t = document.getElementById('t2'), td = t.querySelector('.placeholder .td'), tb = t.getBoundingClientRect(), b = td.getBoundingClientRect(), th = t.querySelector('.th').getBoundingClientRect();
		return { cx: Math.abs((b.left + b.width / 2) - (tb.left + tb.width / 2)), wide: b.width, tw: tb.width, bot: Math.abs(b.bottom - tb.bottom), over: b.top < th.bottom - 1, th: tb.height };
	});
	if (d.cx > 4) bad('DHCP leases table: "empty" not centered (offset ' + Math.round(d.cx) + ' px)');
	if (d.wide < d.tw - 4) bad('DHCP leases table: "empty" narrower than the table (' + Math.round(d.wide) + ' of ' + Math.round(d.tw) + ' px)');
	if (d.bot > 2 || d.over) bad('DHCP leases table: empty row overlaps the header or is not at the bottom edge');
	// table height must not depend on the empty row content (otherwise the table "floats")
	await p.evaluate(() => { document.querySelector('#t2 .placeholder .td em').textContent = 'Collecting data…'; });
	await p.waitForTimeout(100);
	const h2 = await p.evaluate(() => document.getElementById('t2').getBoundingClientRect().height);
	if (Math.abs(h2 - d.th) > 1) bad('table height changes with the empty row text: ' + Math.round(d.th) + ' → ' + Math.round(h2) + ' px');
	if (r.m.w < 900) bad('Wi-Fi scan dialog is narrow: ' + Math.round(r.m.w) + ' px, need at least 900');
	if (Math.abs(r.sp.cx - r.mt.cx) > 4) bad('scan label not centered in the dialog (offset ' + Math.round(r.sp.cx - r.mt.cx) + ' px)');
	if (r.gap < 6) bad('save bar buttons too close: ' + Math.round(r.gap) + ' px');
	if (new Set(r.h).size > 1) bad('save bar buttons have different heights: ' + r.h.join(', '));
	// sign-in dialog: the original 380 px and centered
	const lp = await b.newPage({ viewport: { width: 1400, height: 900 } });
	await lp.setContent(login); await lp.waitForTimeout(300);
	const lg = await lp.evaluate(() => { const m = document.querySelector('.modal.login').getBoundingClientRect(); return { w: m.width, cx: m.left + m.width / 2 }; });
	if (lg.w > 381) bad('sign-in dialog stretched: ' + Math.round(lg.w) + ' px, should be 380');
	if (Math.abs(lg.cx - 700) > 4) bad('sign-in dialog not centered on screen (offset ' + Math.round(lg.cx - 700) + ' px)');
	await lp.close();
	// phone (as in the theme header: mobile.css loads only on narrow screens): empty row and scan centered
	const mctx = await b.newContext({ viewport: { width: 390, height: 800 }, screen: { width: 390, height: 800 }, isMobile: true, hasTouch: true });
	const mp = await mctx.newPage();
	await mp.setContent(html.replace('</style>', MCSS + '\n@media screen { .table .tr { display: flex; flex-wrap: wrap; } .table .td { flex: 0 0 50% !important; width: 50% !important; display: inline-block !important; } }</style>')); await mp.waitForTimeout(400);
	const mo = await mp.evaluate(() => {
		const res = {};
		for (const [k, tsel, dsel] of [['settings card', '#t2', '#t2 .placeholder .td'], ['scan dialog', '#scan .table', '#scan .placeholder .td']]) {
			const t = document.querySelector(tsel), td = document.querySelector(dsel), a = t.getBoundingClientRect(), c = td.getBoundingClientRect();
			res[k] = { dx: Math.abs((c.left + c.width / 2) - (a.left + a.width / 2)), w: c.width, tw: a.width };
		}
		const em = document.querySelector('#scan .placeholder em'), cs = getComputedStyle(em, '::before');
		const rg = document.createRange(); rg.selectNodeContents(em);
		res.spin = { w: parseFloat(cs.width), gap: rg.getBoundingClientRect().left - (em.getBoundingClientRect().left + 4 + 20) };
		res.dbg = ['#t2', '#t2 .tr.placeholder', '#t2 .tr.placeholder .td', '#scan .table', '#scan .tr.placeholder', '#scan .tr.placeholder .td'].map(q => { const e = document.querySelector(q), c = getComputedStyle(e), r = e.getBoundingClientRect(); return q + ' ' + c.display + ' pos=' + c.position + ' flex=' + c.flex + ' L=' + Math.round(r.left) + ' W=' + Math.round(r.width); }).join('\n') + '\nmq=' + matchMedia('(max-device-width: 600px)').matches;
		return res;
	});
	if (process.env.DBG) console.log(mo.dbg);
	for (const k of ['settings card', 'scan dialog'])
		if (mo[k].dx > 4 || mo[k].w < mo[k].tw - 30) bad('phone, ' + k + ': "empty" not centered (offset ' + Math.round(mo[k].dx) + ', width ' + Math.round(mo[k].w) + ' of ' + Math.round(mo[k].tw) + ')');
	if (mo.spin.w > 24 || mo.spin.gap < 2) bad('phone: scan indicator: ' + Math.round(mo.spin.w) + ' px, gap to text ' + Math.round(mo.spin.gap) + ' px');
	// fallback JS: even if styles shrink the cell with !important on the row element itself (more specific than ours), nightfall.js stretches it
	const NJS = fs.readFileSync(path.join(__dirname, '..', 'luci-theme-nightfall', 'htdocs', 'luci-static', 'nightfall', 'nightfall-empty.js'), 'utf8');
	await mp.addStyleTag({ content: 'html body .table .tr.placeholder > .td { width: 40% !important; flex: 0 0 40% !important; display: inline-block !important; position: absolute !important; left: 0 !important; }' });
	await mp.evaluate(() => { const t = document.createElement('div'); t.className = 'table'; t.id = 't3'; t.innerHTML = '<div class="tr"><div class="td" style="width:44%;display:inline-block"><em>No data</em></div></div>'; document.body.appendChild(t); });
	await mp.evaluate(src => { window.eval(src); }, NJS); await mp.waitForTimeout(300);
	const fb = await mp.evaluate(() => [ '#t2', '#scan .table', '#t3' ].map(q => { const t = document.querySelector(q), td = t.querySelector('.td'), a = t.getBoundingClientRect(), c = td.getBoundingClientRect(); return { dx: Math.abs((c.left + c.width / 2) - (a.left + a.width / 2)), w: c.width, tw: a.width }; }));
	fb.forEach((r, i) => { if (r.dx > 4 || r.w < r.tw - 30) bad('phone, fallback JS did not fix empty row #' + (i + 1) + ' (offset ' + Math.round(r.dx) + ', width ' + Math.round(r.w) + ' of ' + Math.round(r.tw) + ')'); });
	// #98: words in buttons do not break mid-word (word-break: break-all on button in the stock LuCI theme)
	const wb = await mp.evaluate(() => { const b = document.createElement('button'); b.className = 'nf-linkbtn'; document.body.appendChild(b); const c = getComputedStyle(b); return c.wordBreak + '/' + c.whiteSpace; });
	if (wb.indexOf('break-all') >= 0) bad('buttons break words mid-word (word-break: ' + wb + ')');
	// collapsed menu: after clicking a section icon its flyout must not stay open when hovering another section
	const np = await b.newPage({ viewport: { width: 1400, height: 900 } });
	await np.setContent('<!doctype html><html data-nf-nav="mini"><head><meta charset=utf-8><style>' + CSS + '</style></head><body><header><ul id="topmenu" class="nav">' +
		'<li class="dropdown" id="m1"><a class="menu" href="#">Status</a><ul class="dropdown-menu"><li><a href="#x">Overview</a></li></ul></li>' +
		'<li class="dropdown" id="m2"><a class="menu" href="#">System</a><ul class="dropdown-menu"><li><a href="#y">System</a></li></ul></li></ul></header>' +
		'<div class="nf-blk-sched nf-blk-days"><label><input type="checkbox" checked>Mon</label></div></body></html>');
	await np.waitForTimeout(200);
	const vis = id => np.evaluate(i => getComputedStyle(document.querySelector('#' + i + ' > ul')).display, id);
	await np.hover('#m1 > a'); await np.mouse.down(); await np.mouse.up();
	await np.hover('#m2 > a'); await np.waitForTimeout(150);
	if (await vis('m1') !== 'none') bad('collapsed menu: the first section flyout stuck after a click');
	if (await vis('m2') === 'none') bad('collapsed menu: the second section flyout did not open on hover');
	// tooltips in port tiles must not be clipped by the tile
	const ov = await np.evaluate(() => { const d = document.createElement('div'); d.className = 'ifacebox'; d.innerHTML = '<div class="ifacebox-head">lan4</div><div class="ifacebox-body">x</div>'; document.body.appendChild(d); return getComputedStyle(d.querySelector('.ifacebox-body')).overflow; });
	if (ov !== 'visible') bad('port tile clips tooltips (overflow: ' + ov + ')');
	// port tile tooltips are hidden
	const tp = await np.evaluate(() => { const d = document.createElement('div'); d.className = 'ifacebox'; d.setAttribute('data-nf-port', 'up'); d.innerHTML = '<div class="ifacebox-body"><span class="cbi-tooltip-container">1 GbE<span class="cbi-tooltip">Received</span></span></div>'; document.body.appendChild(d); return getComputedStyle(d.querySelector('.cbi-tooltip')).display; });
	if (tp !== 'none') bad('port tile tooltip not hidden (display: ' + tp + ')');
	const cb = await np.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.nf-blk-days input')).width));
	if (cb < 12) bad('weekday checkbox collapsed (' + cb + ' px) and overlaps the label');
	await np.close();
	await mctx.close();
	fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
	await p.screenshot({ path: path.join(__dirname, 'out', 'layout.png') }).catch(() => {});
	await b.close();
	console.log(fail ? 'LAYOUT TEST FAILED' : 'LAYOUT TEST PASSED'); process.exit(fail);
})();
