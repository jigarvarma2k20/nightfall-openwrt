// Test of the "Temperatures" card (v1.18.0): the code is taken from nightfall-overview.js and run in a browser with LuCI stubs.
// Run: node tools/test-temp.js
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'luci-theme-nightfall/htdocs/luci-static/resources/nightfall-overview.js'), 'utf8');
const a = src.indexOf('/* nf-temps:begin */'), z = src.indexOf('function healthCard()');
if (a < 0 || z < 0) { console.log('ERROR: temperature block not found in nightfall-overview.js'); process.exit(1); }
const code = src.slice(a, z);
let fail = 0; const bad = m => { console.log('ERROR: ' + m); fail = 1; };
(async () => {
	const b = await chromium.launch(), p = await b.newPage();
	await p.setContent('<!doctype html><body><div id="view"><div class="cbi-section" id="stock"><div class="cbi-title"><h3 data-nf-title="Temperature">Temperature</h3></div></div></div></body>');
	const r = await p.evaluate(async c => {
		const E = (t, a, ch) => { const e = document.createElement(t); for (const k in a || {}) { if (typeof a[k] === 'function') e.addEventListener(k, a[k]); else e.setAttribute(k, a[k]); } [].concat(ch == null ? [] : ch).forEach(x => e.append(x && x.nodeType ? x : String(x))); return e; };
		const nf1 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
		const calls = []; const spark = () => ({ el: document.createElementNS('http://www.w3.org/2000/svg', 'svg'), update: (t, v, hi, lo) => calls.push({ n: t.length, hi, lo }) });
		let reply = null; const fsx = { exec: () => Promise.resolve({ stdout: JSON.stringify(reply) }) };
		const mk = new Function('E', 'nf1', 'spark', 'fs', 'HIST', 'idle', 'localStorage', c + '; return { tempLabel, tempSlope, tempLevel, tempScale, tempCard, hideStockTemp };');
		const api = mk(E, nf1, spark, fsx, 'x', () => false, { getItem: () => null, setItem: () => {} });
		const out = {};
		out.labels = [ 'cpu_thermal', 'mt7915_phy0', 'mt7915_phy1', 'nvme', 'foo', 'mt7915_phy0#2' ].map(api.tempLabel).join('|');
		const t = [], up = [], flat = [], spike = [];
		for (let i = 0; i < 9; i++) { t.push(1000 + i * 15); up.push(60 + i * 0.5); flat.push(65); spike.push(i === 4 ? 70 : 65); }
		out.up = api.tempSlope(t, up); out.flat = api.tempSlope(t, flat); out.spike = api.tempSlope(t, spike); out.short = api.tempSlope([ 0, 15 ], [ 50, 51 ]);
		out.lv = [ 0.2, 1, 3 ].map(api.tempLevel).join(',');
		out.scale = api.tempScale([ 65, 65.4 ]); out.scale2 = api.tempScale([ 40, 80 ]);
		// card: no data → the stock card stays
		const view = document.getElementById('view'), card = api.tempCard(); view.appendChild(card.el);
		reply = { names: [], rows: [] }; card.start(); await new Promise(r => setTimeout(r, 50));
		out.stockNoData = document.getElementById('stock').classList.contains('nf-stock-hidden');
		// data present: 3 sensors, CPU rising
		const rows = []; for (let i = 0; i < 9; i++) rows.push([ 1000 + i * 15, 60 + i * 0.5, 65, 66 ]);
		reply = { names: [ 'mt7915_phy0', 'cpu_thermal', 'mt7915_phy1' ], rows: rows.map(r => [ r[0], r[2], r[1], r[3] ]) };
		card.start(); await new Promise(r => setTimeout(r, 50));
		out.tiles = card.el.querySelectorAll('.nf-tt').length;
		out.first = card.el.querySelector('.nf-tt .nf-tt-n').textContent;
		out.value = card.el.querySelector('.nf-tt .nf-tt-v').textContent;
		out.rate = card.el.querySelector('.nf-tt .nf-tt-r').textContent; out.rlv = card.el.querySelector('.nf-tt .nf-tt-r').getAttribute('data-lv');
		out.flatTxt = card.el.querySelectorAll('.nf-tt .nf-tt-r')[1].textContent;
		out.stockHidden = document.getElementById('stock').classList.contains('nf-stock-hidden');
		reply = { names: [ 'cpu-thermal', 'cpu_thermal' ], rows: [ [ 1000, 70, -1 ], [ 1015, 70, -1 ], [ 1030, -1, 71 ], [ 1045, -1, 71 ], [ 1060, -1, 71 ], [ 1075, -1, 71 ] ] };
		card.start(); await new Promise(r => setTimeout(r, 50));
		out.stale = card.el.querySelectorAll('.nf-tt').length;
		reply = { names: [ 'mt7915_phy0', 'cpu_thermal', 'mt7915_phy1' ], rows: rows.map(r => [ r[0], r[2], r[1], r[3] ]) };
		card.start(); await new Promise(r => setTimeout(r, 50));
		out.lay = card.el.querySelector('.nf-tt-grid').getAttribute('data-lay'); out.mainFirst = card.el.querySelector('.nf-tt').classList.contains('nf-tt-main'); out.mainCount = card.el.querySelectorAll('.nf-tt-main').length;
		out.min = card.el.querySelector('.nf-tt .nf-tt-m').textContent;
		return out;
	}, code);
	if (r.labels !== 'CPU|Wi‑Fi, radio 1|Wi‑Fi, radio 2|Drive|foo|Wi‑Fi, radio 1') bad('sensor names: ' + r.labels);
	if (!(r.up > 1.9 && r.up < 2.1)) bad('rise slope +0.5 °C per 15 s: ' + r.up + ', expected about 2 °C/min');
	if (r.flat !== 0) bad('a flat line must give 0: ' + r.flat);
	if (!(Math.abs(r.spike) < 0.5)) bad('a single sensor spike distorted the rate: ' + r.spike);
	if (r.short !== null) bad('with less than 45 s of history the rate must be empty: ' + r.short);
	if (r.lv !== 'ok,warn,bad') bad('color thresholds: ' + r.lv);
	if (r.scale[1] - r.scale[0] < 6 || r.scale[0] > 64 || r.scale[1] < 66) bad('the scale has no headroom: ' + r.scale);
	if (r.scale2[0] > 39 || r.scale2[1] < 81) bad('wide scale: ' + r.scale2);
	if (r.stockNoData) bad('the stock card is hidden although there is no data');
	if (r.tiles !== 3) bad('sensor tiles: ' + r.tiles);
	if (r.first !== 'CPU') bad('the CPU must come first, not ' + r.first);
	if (!/^64\.0 °C$/.test(r.value)) bad('CPU value: ' + r.value);
	if (!/^↑ \+2\.0 °C\/min$/.test(r.rate) || r.rlv !== 'warn') bad('heating rate: "' + r.rate + '" ' + r.rlv);
	if (r.flatTxt !== '→ stable') bad('stable sensor: ' + r.flatTxt);
	if (!r.stockHidden) bad('the stock card is not hidden when data is present');
	if (r.stale !== 1) bad('a renamed sensor stayed as a tile: ' + r.stale + ' tiles instead of 1');
	if (r.lay !== 'main3' || !r.mainFirst || r.mainCount !== 1) bad('three-sensor layout: ' + r.lay + ', main tile first: ' + r.mainFirst + ', count ' + r.mainCount);
	if (!/min 60\.0 · max 64\.0/.test(r.min)) bad('min/max: ' + r.min);
	await b.close();
	console.log(fail ? 'TEMPERATURE TEST FAILED' : 'TEMPERATURE TEST PASSED'); process.exit(fail);
})();
