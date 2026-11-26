// Sign-in screen test: "Remember username" must save the username, restore it on the next sign-in and never store the password.
// login.js runs with LuCI stubs (ui, view, E, _) on a page with the same markup that sysauth.ut serves.
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'luci-theme-nightfall/htdocs/luci-static/resources/view/nightfall/login.js'), 'utf8');
const CSS = fs.readFileSync(path.join(__dirname, '..', 'luci-theme-nightfall/htdocs/luci-static/nightfall/cascade.css'), 'utf8');
let failed = 0; const bad = m => { failed++; console.error('ERROR: ' + m); };
const page = user => '<!doctype html><html lang="en"><head><meta charset=utf-8><style>' + CSS + '</style></head><body class="nf-blank modal-overlay-active"><div id="view" data-host="OpenWrt" data-model="Test"></div><section hidden><form method="post" class="cbi-map"><div class="cbi-value"><input name="luci_username" type="text" value="' + user + '"></div><div class="cbi-value"><div class="cbi-value-field"><input name="luci_password" type="password"></div></div></form><hr><button class="btn cbi-button-positive important">Log in</button></section></body></html>';
const SHIM = `
window.__submits = 0; HTMLFormElement.prototype.submit = function () { window.__submits++; }; HTMLFormElement.prototype.requestSubmit = function () { window.__submits++; window.__submitVisible = !!document.querySelector('input[type=password]').offsetParent; };
window._ = s => s;
window.E = function (tag, attrs, kids) {
	const n = document.createElement(tag);
	if (attrs && (attrs.nodeType || Array.isArray(attrs) || typeof attrs === 'string')) { kids = attrs; attrs = null; }
	for (const k in (attrs || {})) { const v = attrs[k]; if (typeof v === 'function') n.addEventListener(k, v); else if (k === 'class') n.className = v; else if (k === 'hidden') n.hidden = !!v; else n.setAttribute(k, v); }
	const add = c => { if (c == null) return; if (Array.isArray(c)) c.forEach(add); else n.appendChild(c.nodeType ? c : document.createTextNode(c)); };
	add(kids); return n;
};
const ui = { showModal(t, kids, cls) { const o = document.createElement('div'); o.id = 'modal_overlay'; o.className = 'active'; const m = document.createElement('div'); m.className = 'modal ' + (cls || ''); const h = document.createElement('h4'); h.textContent = t; m.appendChild(h); kids.forEach(k => m.appendChild(k)); o.appendChild(m); document.body.appendChild(o); return m; } };
const view = { extend: o => o };
window.__mod = new Function('ui', 'view', 'E', '_', window.__SRC.replace(/^\\s*'require [^']*';\\s*$/gm, '').replace('return view.extend', 'return view.extend'))(ui, view, window.E, window._);
window.__mod.render();`;
(async () => {
	const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1200, height: 800 } });
	await ctx.route('http://r.local/**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: page('root') }));
	const open = async () => { const p = await ctx.newPage(); p.on('pageerror', e => bad('script error: ' + e.message)); await p.goto('http://r.local/'); await p.evaluate(src => { window.__SRC = src; }, SRC); await p.evaluate(SHIM); await p.waitForTimeout(150); return p; };
	let p = await open();
	if (await p.isChecked('#nf-remember')) bad('checkbox already checked on first sign-in');
	await p.check('#nf-remember'); await p.fill('input[type=text]', 'admin'); await p.fill('input[type=password]', 'secret');
	await p.evaluate(() => document.querySelector('button.important').click());
	if (await p.evaluate(() => window.__submits) !== 1) bad('form was not submitted');
	if (!await p.evaluate(() => window.__submitVisible)) bad('fields hidden at form submission (the password manager will not see the sign-in)');
	await p.waitForTimeout(150);
	if (!await p.evaluate(() => !!document.querySelector('.modal .spinning'))) bad('no sign-in indicator shown after submitting');
	const ls = await p.evaluate(() => JSON.stringify(Object.entries(localStorage)));
	if (!ls.includes('"admin"')) bad('username not saved: ' + ls);
	if (ls.includes('secret')) bad('password ended up in localStorage');
	await p.close();
	p = await open();   // next visit: the server pre-fills root
	if (!await p.isChecked('#nf-remember')) bad('"Remember" checkbox not restored');
	const u = await p.inputValue('input[type=text]');
	if (u !== 'admin') bad('username not filled in: "' + u + '"');
	// uncheck: the username is forgotten
	await p.uncheck('#nf-remember'); await p.evaluate(() => document.querySelector('button.important').click());
	if ((await p.evaluate(() => JSON.stringify(Object.entries(localStorage)))).includes('admin')) bad('username not forgotten after unchecking');
	// Enter in the password field also saves
	await p.close(); p = await open(); await p.check('#nf-remember'); await p.fill('input[type=text]', 'user2'); await p.press('input[type=password]', 'Enter');
	if (!(await p.evaluate(() => JSON.stringify(Object.entries(localStorage)))).includes('user2')) bad('Enter in the password field does not save the username');
	await b.close();
	if (failed) { console.error('SIGN-IN TEST FAILED'); process.exit(1); }
	console.log('SIGN-IN TEST PASSED');
})();
