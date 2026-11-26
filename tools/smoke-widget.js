// Bot widget test (Bot API 10.4): renders widgets in Chromium with a fake TelegramWidget in light and dark themes,
// checks data, ring colors and sizes, and saves screenshots to tools/out/. The real Telegram environment (QuickJS) is stricter,
// so network and external resources are also forbidden here.
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path'); const zlib = require('zlib');
const DIR = path.join(__dirname, '..', 'luci-app-nightfall-monitor/root/usr/share/nightfall/widgets');
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
let fail = 0; const bad = m => { console.log('ERROR: ' + m); fail = 1; };
const D1 = { h: 'Cudy-WR3000U', c: 12, m: 60, r: 38, t: 61.5, p: 12, d: 10.4, u: 1.2, w: 273000 };
const D2 = { h: 'Cudy-WR3000U', c: 95, m: 88, r: 92, t: 88, p: -1, d: 0, u: 0, w: 273006 };
const themes = {
	light: { scheme: 'light', bg: '#ffffff', text: '#000000', hint: '#6d6d72' },
	dark: { scheme: 'dark', bg: '#1c1c1e', text: '#ffffff', hint: '#98989f' },
};
(async () => {
	const b = await chromium.launch();
	for (const file of fs.readdirSync(DIR).filter(f => f.endsWith('.html'))) {
		const html = fs.readFileSync(path.join(DIR, file), 'utf8');
		const z = zlib.deflateSync(Buffer.from(html), { level: 9 }).length;
		if (Buffer.byteLength(html) > 32768 || z > 4096) bad(file + ': size ' + Buffer.byteLength(html) + ' (compressed ' + z + ') exceeds the Telegram limit');
		if (/https?:\/\/(?!www\.w3\.org)|<link|<iframe|@import|fetch\(|XMLHttpRequest|WebSocket/.test(html)) bad(file + ': external resources and network are not available in the widget sandbox');
		for (const [tn, th] of Object.entries(themes)) {
			const p = await b.newPage({ viewport: { width: 360, height: 400 }, deviceScaleFactor: 2, colorScheme: th.scheme });
			const errs = []; p.on('pageerror', e => errs.push(e.message));
			let calls = 0;
			await p.addInitScript(([d1, d2, th]) => {
				window.__calls = [];
				window.TelegramWidget = {
					profile: 1, isActive: true, colorScheme: th.scheme, chatData: JSON.stringify(d1), ready() {},
					onEvent() {}, isProfileAtLeast() { return true; },
					request(q) { window.__calls.push(q); return new Promise(resolve => setTimeout(() => resolve({ result: JSON.stringify(window.__n ? d2 : d1) }), 80)); },
				};
				const st = document.createElement('style');   // Telegram theme: variables on the root element
				st.textContent = ':root{--tg-theme-text-color:' + th.text + ';--tg-theme-hint-color:' + th.hint + ';background:' + th.bg + '}';
				document.addEventListener('DOMContentLoaded', () => document.head.appendChild(st));
			}, [D1, D2, th]);
			await p.route('http://w.local/', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset=utf-8></head><body>' + html + '</body></html>' }));
			await p.goto('http://w.local/'); await p.mouse.click(180, 100); await p.waitForTimeout(400);
			const s1 = await p.evaluate(() => ({
				c: document.getElementById('cv').textContent, t: document.getElementById('t').textContent, p: document.getElementById('p').textContent,
				dn: document.getElementById('dn').textContent, host: document.getElementById('hn').textContent, f: document.getElementById('f').textContent,
				col: document.getElementById('c').getAttribute('stroke'), dot: document.getElementById('d').className,
				calls: window.__calls.length, w: document.documentElement.scrollWidth, h: document.body.scrollHeight,
			}));
			if (s1.c !== '12%') bad(file + ' ' + tn + ': CPU ring shows ' + s1.c);
			if (s1.t !== '62 °C') bad(file + ' ' + tn + ': temperature ' + s1.t);
			if (s1.p !== '12 ms') bad(file + ' ' + tn + ': ping ' + s1.p);
			if (s1.host !== 'Cudy-WR3000U') bad(file + ' ' + tn + ': name ' + s1.host);
			if (s1.col !== '#34c759') bad(file + ' ' + tn + ': color at normal load ' + s1.col);
			if (!/^(Up|Uptime|Running):? 3 d 3 h/.test(s1.f)) bad(file + ' ' + tn + ': uptime "' + s1.f + '"');
			if (s1.calls !== 1) bad(file + ' ' + tn + ': parallel request on show/tap (' + s1.calls + ' instead of 1)');
			if (s1.w > 360) bad(file + ' ' + tn + ': horizontal scrolling (' + s1.w + ' px)');
			if (s1.h > 600) bad(file + ' ' + tn + ': height ' + s1.h + ' px exceeds 600');
			await p.screenshot({ path: path.join(OUT, 'widget-' + file.replace('.html', '') + '-' + tn + '.png') });
			await p.evaluate(() => { window.__n = 1; }); await p.mouse.click(180, 100); await p.waitForTimeout(300);
			const s2 = await p.evaluate(() => ({ col: document.getElementById('c').getAttribute('stroke'), dot: document.getElementById('d').className, p: document.getElementById('p').textContent }));
			if (s2.col !== '#ff453a') bad(file + ' ' + tn + ': high load did not turn red (' + s2.col + ')');
			if (!/^(none|no|n\/a|—|offline)$/i.test(s2.p) || !/x/.test(s2.dot)) bad(file + ' ' + tn + ': no connection not shown (' + s2.p + ')');
			await p.screenshot({ path: path.join(OUT, 'widget-' + file.replace('.html', '') + '-' + tn + '-alert.png') });
			if (errs.length) bad(file + ' ' + tn + ': JS errors: ' + errs.join('; '));
			await p.close();
		}
	}
	await b.close();
	console.log(fail ? 'WIDGET TEST FAILED' : 'WIDGET TEST PASSED'); process.exit(fail);
})();
