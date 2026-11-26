// Browser test of the "Resource Monitor": substitutes a LuCI mock and runs the real router scripts
// (nightfall-stats, nightfall-sec, nightfall-diag) on stubs; opens every tab and checks that it renders without errors.
const { chromium } = require('playwright'); const fs = require('fs'); const os = require('os'); const path = require('path'); const cp = require('child_process'); const vm = require('vm');
const THEME_SRC = fs.readFileSync(path.join(__dirname, '../luci-theme-nightfall/htdocs/luci-static/nightfall/nightfall.js'), 'utf8');
const PRESET_START = THEME_SRC.indexOf('var PRESETS = ['), PRESET_END = THEME_SRC.indexOf('\n\t];', PRESET_START) + 4;
if (PRESET_START < 0 || PRESET_END <= PRESET_START) throw new Error('Nightfall theme presets not found');
const PRESETS = vm.runInNewContext(THEME_SRC.slice(PRESET_START, PRESET_END) + '\nPRESETS');
const ROOT = path.join(__dirname, '..');
const LIB = path.join(ROOT, 'luci-app-nightfall-monitor/root/usr/libexec');
const SRC = fs.readFileSync(path.join(ROOT, 'luci-app-nightfall-monitor/htdocs/luci-static/resources/view/nightfall/monitor.js'), 'utf8');
const CHARTS_SRC = fs.readFileSync(path.join(ROOT, 'luci-app-nightfall-monitor/htdocs/luci-static/resources/nightfall-monitor-charts.js'), 'utf8');
const CSS = path.join(ROOT, 'luci-theme-nightfall/htdocs/luci-static/nightfall/cascade.css');
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'nfmon-'));
const NOW = Math.floor(Date.now() / 1000);
cp.execFileSync('sh', [path.join(__dirname, 'sec-fixtures.sh'), T]);
const ENV = Object.assign({}, process.env, { NF_LOGREAD: path.join(T, 'logread'), NF_PROC: path.join(T, 'proc'), NF_KNOWN: path.join(T, 'known'), NF_UCI: path.join(T, 'uci'), NF_UPDATEBIN: path.join(T, 'upd'), NF_SHADOW: path.join(T, 'shadow'), NF_DIR: path.join(T, 'd'), NF_NFT: path.join(T, 'nft'), NFT_LOG: path.join(T, 'nft.log') });
const run = (script, args, extra) => { try { return cp.execFileSync('sh', [path.join(LIB, script)].concat(args), { env: Object.assign({}, ENV, extra || {}), timeout: 20000 }).toString(); } catch (e) { return String(e.stdout || ''); } };
let fail = 0; const bad = m => { console.log('ERROR: ' + m); fail = 1; };
const EXEC = (cmd, args) => {
	const n = path.basename(cmd);
	if (n === 'nightfall-stats') return run('nightfall-stats', args);
	if (n === 'nightfall-sec' || n === 'nightfall-diag' || n === 'nightfall-log') return run(n, args);
	if (n === 'nightfall-dns') return run(n, args, { NF_LOGREAD: path.join(T, 'dnslogread'), NF_UCI: path.join(T, 'uci_dns') });
	if (n === 'nightfall-history') return args[0] === 'apps' ? JSON.stringify({ enabled: 1, lite: 0, today: '20261118', day: [["192.168.1.20", "VK", "VPN", 1048576, 51200], ["192.168.1.20", "Other · okcdn.ru", "Direct", 2097152, 1024], ["192.168.1.20", "Other · No DNS name", "Unknown", 512000, 1000], ["192.168.1.20", "Telegram", "VPN", 256000, 1000]], hist: [] }) : args[0] === 'devices' ? JSON.stringify({ now: NOW, ts: NOW - 10, rate: [], day: [["192.168.1.20", 5000000, 1000000]], yday: [], neigh: [["192.168.1.20", "aa:bb:cc:dd:ee:01"]], info: {} }) : args[0] === 'wifi' && !args[1] ? JSON.stringify({ now: NOW, rows: [], events: [[NOW - 60, "aa:bb:cc:dd:ee:01", "join", "phy0"], [NOW - 120, "aa:bb:cc:dd:ee:01", "leave", "phy0"]] }) : args[0] === 'extip' ? JSON.stringify({ now: NOW, rows: [[NOW - 86400, "203.0.113.7", 0], [NOW - 60, "100.64.3.9", 1]] }) : args[0] === 'procmem' ? JSON.stringify({ now: NOW, rows: Array.from({ length: 8 }, (_, i) => [NOW - (7 - i) * 900, [["dnsmasq", 10000 + i * 3000], ["uhttpd", 3000]]]) }) : args[0] === 'known' ? '{"now":1794786100,"rows":[["AA:BB:CC:DD:EE:01","x",1794700000]]}' : args[0] === 'mode' ? '{"mode":"full","step":15}' : args[0] === 'journal' ? JSON.stringify({ now: NOW, rows: [[ NOW - 120, 'outage', 120, 'no internet' ], [ NOW - 600, 'boot', 0, 'Router boot' ]] }) : '{}';
	if (n === 'nightfall-block') return args[0] === 'log' ? JSON.stringify({ ok: true, log: [[ NOW - 20, 'aa:bb', 'Camera', 'on', 'manual (interface)' ], [ NOW - 10, 'aa:bb', 'Camera', 'off', 'on schedule' ]] }) : '{"ok":true}';
	return '';
};
const BOOT = `
function E(tag, attr, data) {
	const el = document.createElement(tag);
	if (attr != null && (typeof attr !== 'object' || Array.isArray(attr) || attr instanceof Node)) { data = attr; attr = {}; }
	for (const k in (attr || {})) {
		const v = attr[k];
		if (typeof v === 'function') el.addEventListener(k, v);
		else if (k === 'class') el.className = v;
		else if (v === true || v === '') el.setAttribute(k, '');
		else if (v === false || v == null) continue;
		else el.setAttribute(k, v);
	}
	const add = d => { if (d == null || d === false) return; if (Array.isArray(d)) d.forEach(add); else if (d instanceof Node) el.appendChild(d); else el.appendChild(document.createTextNode(String(d))); };
	add(data);
	return el;
}
window.E = E; window._ = s => s;
function SVG(tag, attrs, children) {
	const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
	for (const k in (attrs || {})) if (attrs[k] != null) el.setAttribute(k, attrs[k]);
	const add = d => { if (d == null) return; if (Array.isArray(d)) d.forEach(add); else el.appendChild(d); };
	add(children);
	return el;
}
window.SVG = SVG;
const ok = v => Promise.resolve(v);
window.L = { resolveDefault: (p, d) => Promise.resolve(p).catch(() => d), require: n => /overview/.test(n) ? ok({ blockCard: () => ({ el: E('div', { class: 'cbi-section' }, [ E('h3', {}, 'Internet access'), E('div', {}, 'card') ]), start() {} }) }) : ok({ identify: () => null, parseUA: () => null }), bind: (f, o) => f.bind(o) };
const viewM = { extend: o => o };
const rpcM = { declare: spec => (...a) => ok(spec.object === 'system' ? { model: 'Test router', hostname: 'test' } : spec.object === 'network.interface' ? { interface: [] } : spec.object === 'luci-rpc' ? {} : spec.expect && Array.isArray(spec.expect.results) ? [] : {}) };
const fsM = { exec: (c, a) => window.__exec(c, a || []).then(s => ({ code: 0, stdout: s, stderr: '' })), read: () => ok(''), stat: () => ok(null), lines: () => ok([]) };
const uiM = { addNotification() {}, showModal(t, c) { const d = document.createElement('div'); d.id = 'mock-modal'; d.append(t); [].concat(c).forEach(x => d.append(x)); document.body.append(d); }, hideModal() { const d = document.getElementById('mock-modal'); if (d) d.remove(); }, tabs: {}, createHandlerFn: f => f };
// The smoke test checks a static set of fixtures. The LuCI polling timer is disabled here:
// a periodic rerender replaced the tab DOM during a Playwright click and caused random timeouts.
// Polling stays controlled: the test runs one tick after each tab switch.
const pollM = { fn: null, add(f) { this.fn = f; }, remove() {}, start() {}, stop() {} };
window.__runMonitorTick = () => pollM.fn ? pollM.fn() : Promise.resolve();
const netM = { getWifiNetworks: () => ok([]), getHostHints: () => ok({ getMACHints: () => [] }) };
const Charts = new Function('baseclass', CHARTS_SRC.replace(/^'require[^\\n]*\\n/gm, ''))({ extend: o => o });
window.__mod = (new Function('view', 'rpc', 'fs', 'poll', 'ui', 'network', 'DevId', 'Charts', SRC.replace(/^'require[^\\n]*\\n/gm, '')))(viewM, rpcM, fsM, pollM, uiM, netM, { identify: () => null }, Charts);
`;
(async () => {
	const b = await chromium.launch();
	const names = { wifi: 'Wi-Fi clients', devs: 'Internet access', apps: 'Traffic by category', diag: 'Network diagnostics', sec: 'Security summary', log: 'Event log' };
	for (const [vn, vp] of [
		[ 'desktop', { width: 1280, height: 900 } ],
		[ 'mobile', { width: 390, height: 800 } ],
		[ 'iphone-15-pro-max', { width: 430, height: 932 } ],
		[ 'iphone-16-pro-max', { width: 440, height: 956 } ]
	]) {
		const mobile = vn !== 'desktop';
		const p = await b.newPage({ viewport: vp, isMobile: mobile, hasTouch: mobile });
		const errs = [];
		p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
		await p.exposeFunction('__exec', (c, a) => EXEC(c, a));
		await p.route('**/*', r => {
			const u = new URL(r.request().url());
			if (u.pathname === '/page') return r.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="ru"><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><link rel=stylesheet href="http://t.local/c.css"></head><body><div id=m></div></body></html>' });
			if (u.pathname === '/c.css') return r.fulfill({ contentType: 'text/css', body: fs.readFileSync(CSS) });
			return r.fulfill({ status: 404, body: '' });
		});
		await p.goto('http://t.local/page');
		await p.addScriptTag({ content: 'const SRC = ' + JSON.stringify(SRC) + ';\nconst CHARTS_SRC = ' + JSON.stringify(CHARTS_SRC) + ';\n' + BOOT });
		await p.evaluate(async () => { const m = window.__mod; const d = await m.load(); document.getElementById('m').appendChild(m.render(d)); });
		await p.waitForTimeout(2500);
		const tabs = await p.$$eval('.nfm-tab.nfm-ti', els => els.map(e => e.getAttribute('data-ic')));
		for (const k of [ 'overview', 'net', 'wifi', 'devs', 'apps', 'procs', 'svcs', 'diag', 'sec', 'log', 'hist' ]) if (!tabs.includes(k)) bad(vn + ': missing tab ' + k);
		for (const k of [ 'overview', 'procs', 'wifi', 'devs', 'apps', 'diag', 'sec', 'log', 'net', 'hist' ]) {
			await p.click(`.nfm-tab.nfm-ti[data-ic="${k}"]`); await p.evaluate(() => window.__runMonitorTick()); await p.waitForTimeout(k === 'sec' || k === 'log' ? 3000 : 1500);
			const vis = await p.evaluate(() => Array.from(document.querySelectorAll('.nfm > div[hidden], .nfm > div:not([hidden])')).filter(x => !x.hasAttribute('hidden') && x.className === '').map(x => x.textContent.slice(0, 4000)).join('\n'));
			if (names[k] && !vis.includes(names[k])) bad(vn + ': tab ' + k + ' did not show "' + names[k] + '"');
			if (k === 'sec') {
				for (const w of [ 'failed sign-ins', '203.0.113.5', 'dropbear', 'uhttpd', 'Camera', 'Web: TCP 8080', 'v1.0.0' ]) if (!vis.includes(w)) bad(vn + ': "Security" is missing "' + w + '"');
				await p.screenshot({ path: path.join(OUT, 'monitor-sec-' + vn + '.png'), fullPage: true });
			}
			if (k === 'log') {
				for (const w of [ 'Outage', 'Camera: access blocked', 'Camera: access allowed' ]) if (!vis.includes(w)) bad(vn + ': "Log" is missing "' + w + '"');
				await p.fill('.nfm-search[aria-label="Search the log"]', 'schedule'); await p.waitForTimeout(300);
				const f = await p.evaluate(() => Array.from(document.querySelectorAll('.nfm-ev-i')).filter(e => e.offsetParent).map(e => e.textContent).join('|'));
				if (!f.includes('allowed') || f.includes('Outage')) bad(vn + ': log search did not filter: ' + f);
				await p.screenshot({ path: path.join(OUT, 'monitor-log-' + vn + '.png') });
			}
			if (k === 'sec') {
				p.once('dialog', d => d.accept());
				await p.click('text=Block for 24 h >> nth=0'); await p.waitForTimeout(800);
				const lg = fs.readFileSync(path.join(T, 'nft.log'), 'utf8');
				if (!lg.includes('add element inet nightfall_ban b4 { 203.0.113.5 timeout 24h }')) bad(vn + ': the "Block for 24 h" button did not block the address: ' + lg);
				await p.waitForTimeout(1500);
				const t2 = await p.evaluate(() => document.body.textContent);
				if (!t2.includes('23h59m10s')) bad(vn + ': the blocked address list did not show the expiry');
			}
			if (k === 'log') {
				await p.waitForTimeout(1500);
				const rl = await p.evaluate(() => Array.from(document.querySelectorAll('.nfm-rlog .nfm-ev-i')).map(e => e.textContent).join('|'));
				if (!rl.includes('dropbear') || !rl.includes('Bad password attempt')) bad(vn + ': router log is empty: ' + rl.slice(0, 80));
				const severity = await p.evaluate(() => ({
					err: document.querySelectorAll('.nfm-rlog-item > .nfm-ev-i.crit').length,
					warn: document.querySelectorAll('.nfm-rlog-item > .nfm-ev-i.warn').length,
					detail: !!document.querySelector('.nfm-rlog-item > .nfm-ev-i.crit + .nfm-log-detail'),
					controls: !!document.querySelector('.nfm-log-tools') && !!document.querySelector('.nfm-log-summary')
				}));
				if (severity.err < 1) bad(vn + ': kern.err level is not highlighted as an error');
				if (severity.warn < 1) bad(vn + ': the steer[warn] tag is not recognized as a warning');
				const cronDispatch = await p.evaluate(() => Array.from(document.querySelectorAll('.nfm-rlog-item')).some(e => e.textContent.includes('backend.sh zm_watch') && !!e.querySelector('.nfm-log-level.notice')));
				if (!cronDispatch) bad(vn + ': a normal cron run is wrongly classified as an error');
				if (!severity.detail || !severity.controls) bad(vn + ': log details or tools are not shown');
				const intelligence = await p.evaluate(() => ({
					wan: Array.from(document.querySelectorAll('.nfm-log-diagnostic')).some(e => e.textContent.includes('WAN / internet')),
					dns: Array.from(document.querySelectorAll('.nfm-log-diagnostic')).some(e => e.textContent.includes('DNS')),
					repeat: Array.from(document.querySelectorAll('.nfm-log-repeat')).some(e => e.textContent.includes('× 3'))
				}));
				if (!intelligence.wan || !intelligence.dns) bad(vn + ': diagnostics did not detect the test WAN/DNS events');
				if (!intelligence.repeat) bad(vn + ': identical messages are not grouped');
				const repeatedGroup = p.locator('.nfm-rlog-item:has(.nfm-log-repeat)').first();
				const repeatedKey = await repeatedGroup.getAttribute('data-log-key');
				await repeatedGroup.locator('summary').click();
				await p.waitForTimeout(100);
				await p.evaluate(() => window.__runMonitorTick());
				const stayedOpen = await p.evaluate(key => { const el = Array.from(document.querySelectorAll('.nfm-rlog-item')).find(x => x.getAttribute('data-log-key') === key); return !!el && el.open; }, repeatedKey);
				if (!stayedOpen) bad(vn + ': an expanded repeat group collapsed after a UI refresh');
				const currentRepeated = p.locator('.nfm-rlog-item[data-log-key]').filter({ has: p.locator('.nfm-log-repeat') }).first();
				await currentRepeated.locator('summary').click();
				await p.waitForTimeout(100);
				await p.evaluate(() => window.__runMonitorTick());
				const stayedClosed = await p.evaluate(key => { const el = Array.from(document.querySelectorAll('.nfm-rlog-item')).find(x => x.getAttribute('data-log-key') === key); return !!el && !el.open; }, repeatedKey);
				if (!stayedClosed) bad(vn + ': a collapsed group expanded by itself after a UI refresh');
				await p.locator('.nfm-log-diagnostic').filter({ hasText: 'WAN / internet' }).click();
				await p.waitForTimeout(200);
				const focused = await p.evaluate(() => ({
					text: Array.from(document.querySelectorAll('.nfm-rlog-item')).map(e => e.textContent).join('|'),
					active: Array.from(document.querySelectorAll('.nfm-log-diagnostic.on')).map(e => e.textContent).join('|')
				}));
				if (!focused.active.includes('WAN / internet') || !focused.text.includes('netifd') || focused.text.includes('dropbear') || focused.text.includes('dnsmasq')) bad(vn + ': the WAN filter did not narrow the records: ' + focused.text.slice(0, 160));
				await p.locator('.nfm-log-diagnostic.on').filter({ hasText: 'WAN / internet' }).click();
				await p.click('button:has-text("Repeats: grouped")');
				await p.waitForTimeout(200);
				if (await p.locator('.nfm-log-repeat').count()) bad(vn + ': turning grouping off did not show separate records');
				await p.click('button:has-text("Repeats: separate")');
				await p.fill('.nfm-search[aria-label="Search the router log"]', 'luci'); await p.waitForTimeout(300);
				const f2 = await p.evaluate(() => Array.from(document.querySelectorAll('.nfm-rlog .nfm-ev-i')).map(e => e.textContent).join('|'));
				if (f2.includes('dropbear') || !f2.includes('failed login')) bad(vn + ': router log search did not work: ' + f2.slice(0, 80));
			}
			if (k === 'overview') {
				await p.waitForTimeout(1500);
				const ot = await p.evaluate(() => document.body.textContent);
				for (const w of [ 'Top consumers now', 'Network now', 'Reboot router', 'More on the "Network" tab' ]) if (!ot.includes(w)) bad(vn + ': "Overview" is missing "' + w + '"');
				if (!/All good|Some issues|Needs attention/.test(ot)) bad(vn + ': no verdict line in "Overview"');
				if (await p.evaluate(() => { const d = document.querySelector('.nfm-more'); return d && d.open; })) bad(vn + ': the "⋯" menu is open by default');
				await p.screenshot({ path: path.join(OUT, 'monitor-overview-' + vn + '.png') });
			}
			if (k === 'wifi') {
				await p.waitForTimeout(1500);
				const wt = await p.evaluate(() => document.body.textContent);
				for (const w of [ 'Bands: 2.4 and 5 GHz', 'Recommendations', 'Connects and disconnects', ' connected', ' disconnected' ]) if (!wt.includes(w)) bad(vn + ': "Wi‑Fi" is missing "' + w + '"');
			}
			if (k === 'sec') {
				const st = await p.evaluate(() => document.body.textContent);
				for (const w of [ 'Settings checks', 'Root password is not set', "Network 'Guest' has no password", 'LuCI is available over http' ]) if (!st.includes(w)) bad(vn + ': "Security" is missing "' + w + '"');
			}
			if (k === 'log') {
				const csv = await p.evaluate(() => !!Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Download CSV'));
				if (!csv) bad(vn + ': no "Download CSV" button');
				await p.selectOption('select[aria-label="Period"]', '86400'); await p.waitForTimeout(300);
			}
			if (k === 'net') {
				await p.waitForTimeout(1500);
				const dn = await p.evaluate(() => document.body.textContent);
				if (!dn.includes('DNS queries') || !dn.includes('Most requested')) bad(vn + ': no DNS card on the "Network" tab');
				if (!dn.includes('WAN address and CGNAT') || !dn.includes('CGNAT')) bad(vn + ': no CGNAT card on the "Network" tab');
			}
			if (k === 'diag') {
				await p.click('text=Check everything: gateway, internet, DNS'); await p.waitForTimeout(6000);
				const o = await p.evaluate(() => document.querySelector('.nfm-diag-out').textContent);
				if (!/Gateway|Default route/.test(o)) bad(vn + ': the diagnostics check printed nothing: ' + o);
			}
			if (k === 'hist') {
				const ht = await p.evaluate(() => document.body.textContent);
				for (const w of [ 'Daily summary', 'Weekly summary', 'Traffic by month', 'Period comparison', 'Hourly heat map', 'CPU, memory, temperature', 'Internet: latency', 'Connection quality', 'Internet speed (WAN)', 'History storage and flash wear', 'Data export to CSV', 'Storage', 'Alert settings' ])
					if (!ht.includes(w)) bad(vn + ': the "History" tab is missing "' + w + '"');
				if (/NaN|undefined/.test(ht)) bad(vn + ': the "History" tab shows an invalid numeric value');
				const geometry = await p.evaluate(() => {
					const cards = Array.from(document.querySelectorAll('.nfm-grid > *')).map(el => {
						const r = el.getBoundingClientRect();
						return { right: r.right, width: r.width, scroll: el.scrollWidth, client: el.clientWidth };
					});
					const charts = Array.from(document.querySelectorAll('.nfm-history .nfm-chart')).map(el => {
						const r = el.getBoundingClientRect();
						return { width: r.width, height: r.height };
					});
					const switches = Array.from(document.querySelectorAll('.nfm-cfg-toggle input.nfm-toggle')).map(el => {
						const r = el.getBoundingClientRect();
						return { width: r.width, height: r.height };
					});
					return { viewportWidth: window.innerWidth, cards, charts, switches, cfgGroups: document.querySelectorAll('.nfm-cfg-layout > .nfm-cfg-g').length };
				});
				if (geometry.charts.length < 3 || geometry.charts.some(x => x.width < 80 || x.height < 60)) bad(vn + ': history charts did not get a valid size; found=' + geometry.charts.length + ', sizes=' + JSON.stringify(geometry.charts.map(x => ({ width: Math.round(x.width), height: Math.round(x.height) }))));
				if (geometry.cards.some(x => x.right > geometry.viewportWidth + 1 || x.scroll > x.client + 3)) bad(vn + ': a history card overflows its bounds or clips its content');
				if (geometry.cfgGroups !== 6) bad(vn + ': the history settings grid must contain six main groups');
				if (geometry.switches.some(x => Math.abs(x.width - 40) > 1 || Math.abs(x.height - 23) > 1)) bad(vn + ': settings switches have the wrong size');
				for (const dark of [ false, true ]) {
					await p.evaluate(d => d ? document.documentElement.setAttribute('data-darkmode', 'true') : document.documentElement.removeAttribute('data-darkmode'), dark);
					await p.evaluate(isDark => {
						const root = document.documentElement.style;
						root.setProperty('--nf-accent', '#1688f8');
						root.setProperty('--nf-card', isDark ? '#202631' : '#ffffff');
						root.setProperty('--nf-card-alt', isDark ? '#293342' : '#f1f4f8');
						root.setProperty('--nf-stroke', isDark ? '#424a58' : '#d6dce5');
						root.setProperty('--text-color-highest', isDark ? '#f5f7fb' : '#20242b');
						root.setProperty('--text-color-medium', isDark ? '#aab2c0' : '#687181');
						root.setProperty('--nf-radius', '12px');
					}, dark);
					const chartCount = await p.locator('.nfm-history .nfm-chart').count();
					if (chartCount < 3) bad(vn + ': charts disappeared in ' + (dark ? 'dark' : 'light') + ' mode');
				}
				await p.evaluate(() => { for (const k of [ '--nf-accent', '--nf-card', '--nf-card-alt', '--nf-stroke', '--text-color-highest', '--text-color-medium', '--nf-radius' ]) document.documentElement.style.removeProperty(k); document.documentElement.removeAttribute('data-darkmode'); });
				await p.screenshot({ path: path.join(OUT, 'monitor-history-' + vn + '.png'), fullPage: true });
				if (vn === 'desktop') {
					for (const [id, label, preset] of PRESETS) {
						const darkPreset = preset.mode === 'dark';
						const accent = preset.accent || (darkPreset ? '#60cdff' : '#0067c0');
						const bg = preset.cusBg || (darkPreset ? '#2b2b2b' : '#fcfcfc');
						const card = preset.cusCard || (darkPreset ? '#333333' : '#f3f3f3');
						const text = preset.cusText || (darkPreset ? '#f2f2f2' : '#202020');
						const radius = preset.cusRadius != null ? preset.cusRadius : preset.radius === 'round' ? 16 : preset.radius === 'sharp' ? 4 : 8;
						await p.evaluate(v => {
							const root = document.documentElement, style = root.style;
							if (v.dark) root.setAttribute('data-darkmode', 'true'); else root.removeAttribute('data-darkmode');
							style.setProperty('--nf-accent', v.accent);
							style.setProperty('--nf-card', v.card);
							style.setProperty('--nf-card-alt', v.bg);
						style.setProperty('--nf-stroke', v.dark ? 'rgba(255,255,255,.14)' : 'rgba(0,0,0,.12)');
						style.setProperty('--text-color-highest', v.text);
						style.setProperty('--text-color-medium', v.dark ? '#aab2c0' : '#687181');
						style.setProperty('--nf-radius', v.radius + 'px');
						}, { dark: darkPreset, accent, card, bg, text, radius });
						const result = await p.evaluate(() => {
							const root = getComputedStyle(document.querySelector('.nfm'));
							const cards = Array.from(document.querySelectorAll('.nfm-grid > *')).map(el => {
								const r = el.getBoundingClientRect(); return { right: r.right, scroll: el.scrollWidth, client: el.clientWidth };
							});
							return { viewportWidth: window.innerWidth, card: root.getPropertyValue('--nfm-card').trim(), text: root.getPropertyValue('--nfm-text').trim(), accent: root.getPropertyValue('--nfm-accent').trim(), cards };
						});
						if (!result.card || !result.text || !result.accent) bad('theme ' + label + ' (' + id + '): Nightfall variables were not applied');
						if (result.cards.some(x => x.right > result.viewportWidth + 1 || x.scroll > x.client + 3)) bad('theme ' + label + ' (' + id + '): history cards overflow their bounds');
					}
					await p.evaluate(() => { for (const k of [ '--nf-accent', '--nf-card', '--nf-card-alt', '--nf-stroke', '--text-color-highest', '--text-color-medium', '--nf-radius' ]) document.documentElement.style.removeProperty(k); document.documentElement.removeAttribute('data-darkmode'); });
				}
			}
			if (k === 'devs') {
				const dt = await p.evaluate(() => document.body.textContent);
				for (const w of [ 'Who is home', 'Unusual activity' ]) if (!dt.includes(w)) bad(vn + ': "Devices" is missing "' + w + '"');
			}
			if (k === 'apps') {
				const at = await p.evaluate(() => document.body.textContent);
				for (const w of [ 'App traffic', 'Traffic by category', 'Distribution by category', 'Social networks', 'CDN & infrastructure', 'Unrecognized', 'VPN', 'Direct' ]) if (!at.includes(w)) bad(vn + ': the "Traffic" tab is missing "' + w + '"');
				const donut = await p.evaluate(() => {
					const el = document.querySelector('.nfm-app-donut');
					return el ? getComputedStyle(el).backgroundImage : '';
				});
				if (!donut.includes('conic-gradient')) bad(vn + ': the category chart was not drawn');
				await p.evaluate(() => document.documentElement.setAttribute('data-darkmode', 'true'));
				const darkDonut = await p.evaluate(() => getComputedStyle(document.querySelector('.nfm-app-donut')).backgroundImage);
				if (!darkDonut.includes('conic-gradient')) bad(vn + ': the chart disappeared in the dark theme');
				await p.evaluate(() => document.documentElement.removeAttribute('data-darkmode'));
				await p.click('.nfm-app-category summary >> nth=0');
				await p.evaluate(() => window.__runMonitorTick());
				if (!(await p.$eval('.nfm-app-category', el => el.open))) bad(vn + ': an expanded category closed on a regular monitor refresh');
				await p.selectOption('select[aria-label="Device for app statistics"]', '192.168.1.20');
				await p.selectOption('select[aria-label="App statistics period"]', '7');
				await p.waitForTimeout(250);
				const geometry = await p.evaluate(() => {
					const panel = document.querySelector('.nfm-app-distribution');
					const donut = document.querySelector('.nfm-app-donut');
					const legend = document.querySelector('.nfm-app-legend');
					const a = panel.getBoundingClientRect(), d = donut.getBoundingClientRect(), l = legend.getBoundingClientRect();
					return { panelRight: a.right, viewport: innerWidth, donutTop: d.top, donutBottom: d.bottom, donutRight: d.right, legendTop: l.top, legendLeft: l.left, legendWidth: l.width, panelWidth: a.width };
				});
				if (geometry.panelRight > geometry.viewport + 1) bad(vn + ': the distribution panel is wider than the screen');
				if (mobile && geometry.legendTop < geometry.donutBottom - 12) bad(vn + ': the legend is not below the chart on a phone');
				if (!mobile && geometry.legendLeft < geometry.donutRight - 12) bad(vn + ': the legend is not to the right of the chart on desktop');
				await p.screenshot({ path: path.join(OUT, 'monitor-app-traffic-' + vn + '.png'), fullPage: true });
			}
			if (k === 'procs') {
				await p.waitForTimeout(1500);
				const pt = await p.evaluate(() => document.body.textContent);
				if (!pt.includes('Program memory over the period') || !pt.includes('possible leak')) bad(vn + ': no program memory card with the leak flag');
			}
			if (k === 'log') {
				/* Reset search and date range before testing pinning. Fixture timestamps are relative to now. */
				await p.fill('.nfm-search[aria-label="Search the log"]', '');
				await p.selectOption('select[aria-label="Period"]', '0');
				await p.waitForTimeout(300);
				await p.click('.nfm-pin >> nth=0'); await p.waitForTimeout(300);
				const pn = await p.evaluate(() => window.localStorage.getItem('nfm_pins'));
				if (!pn || pn === '[]') bad(vn + ': log record pinning was not saved');
				await p.click('.nfm-tabs button[data-k="pin"]'); await p.waitForTimeout(300);
				const pc = await p.evaluate(() => document.querySelectorAll('.nfm-evlist .nfm-ev-i .nfm-pin.on').length);
				if (pc < 1) bad(vn + ': the "Pinned" filter is empty');
				await p.click('.nfm-tabs button[data-k="all"]');
			}
			if (k === 'diag') {
				const gt = await p.evaluate(() => document.body.textContent);
				for (const w of [ 'Route loss', 'Latency under load test', 'Check history' ]) if (!gt.includes(w)) bad(vn + ': "Diagnostics" is missing "' + w + '"');
			}
			if (k === 'devs') {
				await p.waitForTimeout(1200);
				await p.click('tr.nfm-rowlink >> nth=0'); await p.waitForTimeout(1200);
				const mt = await p.evaluate(() => (document.getElementById('mock-modal') || { textContent: '' }).textContent);
				if (!mt.includes('Traffic over 14 days') || !mt.includes('192.168.1.20') || !mt.includes('First seen')) bad(vn + ': the device card did not open: ' + mt.slice(0, 120));
				if (/NaN|undefined/.test(mt)) bad(vn + ': the device card contains non-numeric traffic');
				if (!/MB|GB|KB|B/.test(mt)) bad(vn + ': the device card did not format the traffic volume');
				await p.screenshot({ path: path.join(OUT, 'monitor-devcard-' + vn + '.png') });
				await p.evaluate(() => { const d = document.getElementById('mock-modal'); if (d) d.remove(); });
			}
			if (k === 'devs') await p.screenshot({ path: path.join(OUT, 'monitor-devs-' + vn + '.png') });
		}
		const hs = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
		if (hs > 2) bad(vn + ': horizontal page scroll (' + hs + 'px)');
		errs.filter(e => !/Failed to load resource|404/.test(e)).forEach(e => bad(vn + ': console error: ' + e));
		await p.close();
	}
	await b.close(); fs.rmSync(T, { recursive: true, force: true });
	console.log(fail ? 'MONITOR TEST FAILED' : 'MONITOR TEST PASSED'); process.exit(fail);
})();
