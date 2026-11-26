// Browser test of the "Status → Overview" page (v1.26.0): runs the real nightfall-overview.js with a LuCI mock and checks
// the summary line, the "View" menu, layout mode (drag handles visible only there) and collapsed cards.
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path'); const cp = require('child_process');
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'luci-theme-nightfall/htdocs/luci-static/resources/nightfall-overview.js'), 'utf8');
const CSS = path.join(ROOT, 'luci-theme-nightfall/htdocs/luci-static/nightfall/cascade.css');
const LIB = path.join(ROOT, 'luci-app-nightfall-monitor/root/usr/libexec');
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
let fail = 0; const bad = m => { console.log('ERROR: ' + m); fail = 1; };
const EXEC = (cmd, args) => {
	const n = path.basename(cmd);
	if (n === 'nightfall-stats') { try { return cp.execFileSync('sh', [path.join(LIB, 'nightfall-stats')].concat(args), { timeout: 20000 }).toString(); } catch (e) { return ''; } }
	if (n === 'nightfall-history' && args[0] === 'alerts') return '{"now":' + Math.floor(Date.now() / 1000) + ',"active":[],"rows":[]}';
	return '{}';
};
const BOOT = `
function E(tag, attr, data) {
	const el = document.createElement(tag);
	if (attr != null && (typeof attr !== 'object' || Array.isArray(attr) || attr instanceof Node)) { data = attr; attr = {}; }
	for (const k in (attr || {})) { const v = attr[k];
		if (typeof v === 'function') el.addEventListener(k, v); else if (k === 'class') el.className = v; else if (v === true || v === '') el.setAttribute(k, ''); else if (v === false || v == null) continue; else el.setAttribute(k, v); }
	const add = d => { if (d == null || d === false) return; if (Array.isArray(d)) d.forEach(add); else if (d instanceof Node) el.appendChild(d); else el.appendChild(document.createTextNode(String(d))); };
	add(data); return el;
}
window.E = E; window._ = s => s;
const ok = v => Promise.resolve(v);
window.L = { env: { dispatchpath: [ 'admin', 'status', 'overview' ] }, require: () => ok({}), resolveDefault: (p, d) => Promise.resolve(p).catch(() => d) };
window.Nightfall = { set() {}, layout() {}, prefs: () => ({}) };
const baseclass = { extend: o => o };
const fs = { exec: (c, a) => window.__exec(c, a || []).then(s => ({ code: 0, stdout: s, stderr: '' })), read: () => ok(''), stat: () => ok(null), lines: () => ok([]) };
const rpc = { declare: spec => (...a) => ok(spec.method === 'dump' ? { interface: [] } : {}) };
const mod = (new Function('baseclass', 'fs', 'rpc', 'NfQr', SRC.replace(/^'require[^\\n]*\\n/gm, '')))(baseclass, fs, rpc, {});
window.__mod = mod; mod.__init__();
`;
(async () => {
	const b = await chromium.launch();
	for (const [vn, vp] of [ [ 'desktop', { width: 1280, height: 1000 } ], [ 'mobile', { width: 390, height: 900 } ] ]) {
		const p = await b.newPage({ viewport: vp, isMobile: vn === 'mobile', hasTouch: vn === 'mobile' });
		const errs = []; p.on('pageerror', e => errs.push(e.message));
		await p.exposeFunction('__exec', (c, a) => EXEC(c, a));
		await p.route('**/*', r => {
			const u = new URL(r.request().url());
			if (u.pathname === '/page') return r.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="en" data-nf-theme="dark"><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><link rel=stylesheet href="/c.css"></head><body><main><div id="view"><h2>Status</h2>' +
				[ 'System', 'Memory', 'Network', 'Wi-Fi' ].map(t => '<div class="cbi-section"><div class="cbi-title"><h3>' + t + '</h3></div><div class="table"><div class="tr"><div class="td left">Row</div><div class="td left">value</div></div></div></div>').join('') +
				'<div class="ifacebox"><div class="ifacebox-head">lan1</div><div class="ifacebox-body"><img src="/icons/port_down.svg"><br>no link</div></div>' +
				'</div></main></body></html>' });
			if (u.pathname === '/c.css') return r.fulfill({ contentType: 'text/css', body: fs.readFileSync(CSS) });
			return r.fulfill({ status: 404, body: '' });
		});
		await p.goto('http://t.local/page');
		await p.addScriptTag({ content: 'const SRC = ' + JSON.stringify(SRC) + ';\n' + BOOT });
		await p.waitForTimeout(3500);
		if (await p.locator('.ifacebox .nf-port-edit').count() !== 1) bad(vn + ': port rename button missing with a LuCI text title');
		await p.evaluate(() => { window.prompt = () => 'Test port'; });
		await p.click('.ifacebox .nf-port-edit');
		const portName = await p.locator('.ifacebox .nf-port-title').textContent().catch(() => '');
		if (portName !== 'Test port') bad(vn + ': custom port label not applied');
		if (await p.evaluate(() => JSON.parse(localStorage.getItem('nightfall-port-labels-v1') || '{}').lan1) !== 'Test port') bad(vn + ': port label not saved in localStorage');
		const t0 = await p.evaluate(() => document.body.textContent);
		if (!/All good|Some issues|Needs attention/.test(t0)) bad(vn + ': no summary line');
		if (!t0.includes('⚙ View')) bad(vn + ': no "View" menu');
		const vis = sel => p.evaluate(s => Array.from(document.querySelectorAll(s)).filter(e => e.offsetParent !== null || getComputedStyle(e).display !== 'none').length, sel);
		if (await p.evaluate(() => document.querySelectorAll('.nf-grip').length) === 0) bad(vn + ': cards got no drag handles (check is meaningless)');
		const shown = () => p.evaluate(() => Array.from(document.querySelectorAll('.nf-grip')).filter(e => getComputedStyle(e).display !== 'none').length);
		if (await shown() !== 0) bad(vn + ': drag handles visible outside layout mode');
		await p.click('.nf-viewmenu > summary'); await p.waitForTimeout(200);
		if (!(await p.evaluate(() => document.querySelector('.nf-viewmenu').open))) bad(vn + ': "View" menu did not open');
		await p.screenshot({ path: path.join(OUT, 'overview-menu-' + vn + '.png') });
		await p.click('.nf-editbtn'); await p.waitForTimeout(300);
		if (await shown() === 0) bad(vn + ': drag handles did not appear in layout mode');
		if (!(await p.evaluate(() => document.documentElement.hasAttribute('data-nf-edit')))) bad(vn + ': layout mode did not turn on');
		await p.screenshot({ path: path.join(OUT, 'overview-edit-' + vn + '.png') });
		await p.click('.nf-viewmenu > summary'); await p.click('.nf-editbtn');
		await p.waitForTimeout(300);
		if (await shown() !== 0) bad(vn + ': handles remained after "Done"');
		const folds = await p.evaluate(() => Array.from(document.querySelectorAll('.nf-fold')).map(e => ({ t: (e.querySelector('h3') || {}).textContent, open: e.classList.contains('nf-open'), bodyHidden: Array.from(e.children).filter(c => !c.classList.contains('cbi-title') && !c.classList.contains('nf-rs')).every(c => getComputedStyle(c).display === 'none') })));
		if (folds.length < 3) bad(vn + ': collapsed cards ' + folds.length + ', expected 3');
		for (const f of folds) if (f.open || !f.bodyHidden) bad(vn + ': card "' + f.t + '" not collapsed by default');
		if (folds.length) { await p.click('.nf-fold > .cbi-title >> nth=0'); await p.waitForTimeout(200);
			if (!(await p.evaluate(() => document.querySelector('.nf-fold').classList.contains('nf-open')))) bad(vn + ': collapsed card did not expand on click'); }
		await p.screenshot({ path: path.join(OUT, 'overview-' + vn + '.png'), fullPage: true });
		if (errs.length) bad(vn + ': page errors: ' + errs.slice(0, 3).join(' | '));
		await p.close();
	}
	await b.close();
	console.log(fail ? 'OVERVIEW TEST FAILED' : 'OVERVIEW TEST PASSED'); process.exit(fail);
})();
