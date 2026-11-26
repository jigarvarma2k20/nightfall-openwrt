/*
 * Nightfall theme: personalisation (mode, accent colour, motion).
 * Loaded from <head> so that the preferences are applied before first paint.
 * Preferences live in localStorage of the current browser, like Windows
 * "Personalization" lives in the current user profile.
 */
(function () {
	'use strict';

	var KEY = 'nightfall-prefs-v1';
	var root = document.documentElement;
	var DEFAULTS = { navOpenMode: 'click', fontFam: '', icStyle: 'line', ovThrCpu: '60,85', ovThrTemp: '70,85', ovThrMem: '70,88', ovOrder: 'net,wan,cpu,temp,mem,ct,up,cli,loss,sig,day,stor', ovHide: 'ct,up,cli,loss,sig,day,stor', ovTv: 2, ovLay: 'std', swipe: true, mode: 'auto', accent: '', motion: true, liteAuto: true, loginCells: [ 'net', 'up', 'fw' ], loginLogo: false, ovWide: false, ovCols: '0', bg: 'mica', bgScale: 100,
		density: 'normal', font: 'md', radius: 'md', glass: 'on', loginClock: true, loginInfo: true, loginBg: 'mica', ovLive: true, ovBadges: true,
		style: '', preset: 'win11', navMini: false, schedule: false, nightFrom: '20:00', dayFrom: '07:00', netBar: true, constLogin: true, constApp: false, constKind: 'net',
		updCheck: true, ovSize: 'md', glassTone: 'auto', glassBlur: 28, glassAlpha: 100, hints: true, chart: 'area', chartSmooth: true, chartPal: 'accent', chartW: '2', chartGrid: true, chartThr: false, chartShine: true, ovRing: true, wxLat: '', wxLon: '', cusOn: false, cusBg: '', cusCard: '', cusText: '', cusRadius: 0, cusFont: '', cusShadow: '', loginPhoto: false, ovTop: true, ovApps: true, ovBlock: true, ovWifi: true, ovEvents: true, ovHealth: true, ovQuick: true };

	var PRESETS = [
		[ 'win11', 'Windows 11', { style: '', accent: '', bg: 'mica', density: 'normal', font: 'md', radius: 'md', glass: 'on', motion: true } ],
		[ 'glass', 'Liquid Glass', { style: 'glass', accent: '#0a84ff', bg: 'mica', density: 'normal', font: 'md', radius: 'round', glass: 'on', motion: true } ],
		[ 'macos', 'macOS', { style: 'mac', accent: '#007aff', bg: 'flat', density: 'normal', font: 'md', radius: 'md', glass: 'on', motion: true, cusOn: false } ],
		[ 'night', 'Night', { style: '', mode: 'dark', accent: '#4f6bed', bg: 'stars', density: 'normal', font: 'md', radius: 'md', glass: 'on', motion: true } ],
		[ 'aurora', 'Aurora', { style: 'glass', mode: 'dark', accent: '#038387', bg: 'aurora', density: 'normal', font: 'md', radius: 'round', glass: 'on', motion: true } ],
		[ 'graphite', 'Graphite', { style: '', mode: 'dark', accent: '#69797e', bg: 'flat', density: 'compact', font: 'md', radius: 'sharp', glass: 'on', motion: true } ],
		[ 'sakura', 'Sakura', { style: 'glass', mode: 'light', accent: '#e3008c', bg: 'waves', density: 'normal', font: 'md', radius: 'round', glass: 'on', motion: true } ],
		[ 'nord', 'Nord', { style: '', mode: 'dark', accent: '#88c0d0', bg: 'flat', density: 'normal', font: 'md', radius: 'md', glass: 'on', motion: true, cusOn: true, cusBg: '#2e3440', cusCard: '#3b4252', cusText: '#eceff4' } ],
		[ 'dracula', 'Dracula', { style: '', mode: 'dark', accent: '#bd93f9', bg: 'flat', density: 'normal', font: 'md', radius: 'md', glass: 'on', motion: true, cusOn: true, cusBg: '#282a36', cusCard: '#343746', cusText: '#f8f8f2' } ],
		[ 'tokyo', 'Tokyo Night', { style: '', mode: 'dark', accent: '#7aa2f7', bg: 'flat', density: 'normal', font: 'md', radius: 'md', glass: 'on', motion: true, cusOn: true, cusBg: '#1a1b26', cusCard: '#24283b', cusText: '#c0caf5' } ],
		[ 'gruvbox', 'Gruvbox', { style: '', mode: 'dark', accent: '#d79921', bg: 'flat', density: 'normal', font: 'md', radius: 'md', glass: 'on', motion: true, cusOn: true, cusBg: '#282828', cusCard: '#3c3836', cusText: '#ebdbb2' } ],
		[ 'mocha', 'Catppuccin', { style: '', mode: 'dark', accent: '#cba6f7', bg: 'flat', density: 'normal', font: 'md', radius: 'md', glass: 'on', motion: true, cusOn: true, cusBg: '#1e1e2e', cusCard: '#313244', cusText: '#cdd6f4' } ],
		[ 'rosepine', 'Rosé Pine', { style: '', mode: 'dark', accent: '#ebbcba', bg: 'flat', density: 'normal', font: 'md', radius: 'md', glass: 'on', motion: true, cusOn: true, cusBg: '#191724', cusCard: '#1f1d2e', cusText: '#e0def4' } ],
		[ 'oled', 'OLED', { style: '', mode: 'dark', accent: '#0a84ff', bg: 'flat', density: 'normal', font: 'md', radius: 'md', glass: 'on', motion: true, cusOn: true, cusBg: '#000000', cusCard: '#0c0c0e', cusText: '#f2f2f2' } ],
		[ 'terminal', 'Terminal', { style: '', mode: 'dark', accent: '#33ff66', bg: 'flat', density: 'normal', font: 'md', radius: 'md', glass: 'on', motion: true, cusOn: true, cusBg: '#050a06', cusCard: '#0b140d', cusText: '#b8f5c4', cusFont: 'mono', cusRadius: 2 } ],
		[ 'paper', 'Paper', { style: '', mode: 'light', accent: '#b45309', bg: 'flat', density: 'normal', font: 'md', radius: 'md', glass: 'on', motion: true, cusOn: true, cusBg: '#f4efe6', cusCard: '#fbf7ef', cusText: '#2b2620', cusFont: 'serif' } ],
		[ 'newyear', 'New Year', { style: '', mode: 'dark', accent: '#e5484d', bg: 'garland', density: 'normal', font: 'md', radius: 'md', glass: 'on', motion: true, cusOn: true, cusBg: '#0b1a14', cusCard: '#12261d', cusText: '#f3efe6' } ],
		[ 'autumn', 'Autumn', { style: '', mode: 'light', accent: '#c2410c', bg: 'leaves', density: 'normal', font: 'md', radius: 'md', glass: 'on', motion: true, cusOn: true, cusBg: '#f6ece0', cusCard: '#fff8ef', cusText: '#3a2a1c' } ],
		[ 'solard', 'Solarized Dark', { style: '', mode: 'dark', accent: '#268bd2', bg: 'flat', density: 'normal', font: 'md', radius: 'md', glass: 'on', motion: true, cusOn: true, cusBg: '#002b36', cusCard: '#073642', cusText: '#93a1a1' } ],
		[ 'solarl', 'Solarized Light', { style: '', mode: 'light', accent: '#268bd2', bg: 'flat', density: 'normal', font: 'md', radius: 'md', glass: 'on', motion: true, cusOn: true, cusBg: '#fdf6e3', cusCard: '#eee8d5', cusText: '#586e75' } ],
		[ 'latte', 'Catppuccin Latte', { style: '', mode: 'light', accent: '#8839ef', bg: 'flat', density: 'normal', font: 'md', radius: 'md', glass: 'on', motion: true, cusOn: true, cusBg: '#eff1f5', cusCard: '#e6e9ef', cusText: '#4c4f69' } ],
		[ 'mountains', 'Mountains', { style: '', mode: 'dark', accent: '#7c9cff', bg: 'mountains', loginBg: 'mountains', density: 'normal', font: 'md', radius: 'md', glass: 'on', motion: true } ],
		[ 'city', 'Night city', { style: '', mode: 'dark', accent: '#c084fc', bg: 'city', loginBg: 'city', density: 'normal', font: 'md', radius: 'md', glass: 'on', motion: true } ],
		[ 'space', 'Space', { style: '', mode: 'dark', accent: '#8b5cf6', bg: 'space', loginBg: 'space', density: 'normal', font: 'md', radius: 'md', glass: 'on', motion: true } ],
		[ 'lava', 'Lava', { style: '', mode: 'dark', accent: '#ff6b35', bg: 'lava', loginBg: 'lava', density: 'normal', font: 'md', radius: 'md', glass: 'on', motion: true } ],
		[ 'synthwave', 'Synthwave', { style: '', mode: 'dark', accent: '#ff3d9a', bg: 'cyber', loginBg: 'cyber', density: 'normal', font: 'md', radius: 'md', glass: 'on', motion: true } ],
		[ 'rainy', 'Rainy evening', { style: '', mode: 'dark', accent: '#7fb2ff', bg: 'rainglass', loginBg: 'rainglass', density: 'normal', font: 'md', radius: 'md', glass: 'on', motion: true } ],
		[ 'nightforest', 'Night forest', { style: '', mode: 'dark', accent: '#9be15d', bg: 'forest', loginBg: 'forest', density: 'normal', font: 'md', radius: 'md', glass: 'on', motion: true } ],
		[ 'fogpeaks', 'Misty mountains', { style: '', mode: 'dark', accent: '#c58bd6', bg: 'fogmount', loginBg: 'fogmount', density: 'normal', font: 'md', radius: 'md', glass: 'on', motion: true } ],
		[ 'deepsea', 'Underwater', { style: '', mode: 'dark', accent: '#4fd1e8', bg: 'underwater', loginBg: 'underwater', density: 'normal', font: 'md', radius: 'md', glass: 'on', motion: true } ],
	];
	var BGS = [ [ 'mica', 'Mica' ], [ 'flat', 'Flat' ], [ 'dots', 'Dots' ], [ 'grid', 'Grid' ], [ 'stars', 'Stars' ], [ 'aurora', 'Aurora' ], [ 'waves', 'Waves' ], [ 'mesh', 'Mesh' ], [ 'drift', 'Particles' ], [ 'neon', 'Neon' ], [ 'sunset', 'Sunset' ], [ 'ocean', 'Ocean' ], [ 'snow', 'Snow' ], [ 'rain', 'Rain' ], [ 'tod', 'Day/night' ], [ 'weather', 'Weather' ], [ 'garland', 'Garland' ], [ 'leaves', 'Falling leaves' ], [ 'mountains', 'Mountains' ], [ 'city', 'City' ], [ 'space', 'Space' ], [ 'lava', 'Lava' ], [ 'cyber', 'Synthwave' ], [ 'rainglass', 'Downpour' ], [ 'forest', 'Forest' ], [ 'fogmount', 'Fog' ], [ 'underwater', 'Deep sea' ], [ 'live', 'Live' ] ];

	var ACCENTS = [
		[ '', 'Blue (default)', '#0067c0' ],
		[ '#4f6bed', 'Indigo' ], [ '#8764b8', 'Purple' ], [ '#b146c2', 'Orchid' ],
		[ '#e3008c', 'Pink' ], [ '#d13438', 'Red' ], [ '#ca5010', 'Orange' ],
		[ '#c19c00', 'Gold' ], [ '#498205', 'Olive' ], [ '#107c10', 'Green' ],
		[ '#038387', 'Teal' ], [ '#69797e', 'Graphite' ]
	];

	/* "Packet loss", "Wi‑Fi signal", "Traffic today", "Storage" tiles (v1.15): hidden for users who already customized tiles until they turn them on */
	function tilesV2(p) {
		if (p && typeof p === 'object' && p.ovTv !== 2) {
			if (typeof p.ovHide === 'string') {
				var h = p.ovHide.split(',').filter(Boolean);
				[ 'loss', 'sig', 'day', 'stor' ].forEach(function (k) { if (h.indexOf(k) < 0) h.push(k); });
				p.ovHide = h.join(',');
				if (!p.ovLay && p.ovHide === 'ct,up,cli,loss,sig,day,stor') p.ovLay = 'std';
			}
			p.ovTv = 2;
		}
		return p;
	}

	function load() {
		try {
			var p = tilesV2(JSON.parse(window.localStorage.getItem(KEY) || 'null'));
			return Object.assign({}, DEFAULTS, p && typeof p === 'object' ? p : {});
		} catch (e) {
			return Object.assign({}, DEFAULTS);
		}
	}

	function save() {
		try { window.localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) { /* private mode */ }
		if (!fromRouter) { setLocalT(Date.now()); push(); }
	}

	/* ---------- settings copy on the router ----------
	 * Settings live in localStorage, which is separate for every browser (and Home screen shortcut) and may be cleared.
	 * So after sign-in a copy is written to the router (/etc/nightfall-prefs.json, served as prefs.json),
	 * and when a page opens, including the sign-in screen, a newer version is pulled. */
	var TKEY = 'nightfall-prefs-t';
	var fromRouter = false, pushTimer = 0, dirty = false;
	var BASE = (function () { var s = document.currentScript; return s && s.src ? s.src.replace(/[^\/]*$/, '') : '/luci-static/nightfall/'; })();
	function localT() { try { return +window.localStorage.getItem(TKEY) || 0; } catch (e) { return 0; } }
	function setLocalT(t) { try { window.localStorage.setItem(TKEY, String(t)); } catch (e) { /* ignore */ } }
	function sid() { var l = window.L; return l && l.env && l.env.sessionid ? l.env : null; }
	var syncMsg = '';
	function syncNote(t) { syncMsg = t; var n = document.querySelector('.nf-sync-note'); if (n) n.textContent = t; }
	function hhmm() { var d = new Date(); return (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes(); }
	function pushNow(manual) {
		clearTimeout(pushTimer); pushTimer = 0;
		var env = sid();
		if (!env || !window.fetch) { if (manual === true) syncNote('The router copy is only written after signing in to LuCI.'); return Promise.resolve(); }
		if (!dirty && manual !== true) return Promise.resolve();
		dirty = false;
		var data = JSON.stringify({ t: localT() || Date.now(), p: prefs });
		return window.fetch(env.ubuspath || '/ubus/', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'call', params: [ env.sessionid, 'file', 'exec',
				{ command: '/usr/libexec/nightfall-config', params: [ 'prefs-set', data ] } ] }) })
			.then(function (r) { return r.json(); })
			.then(function (j) {
				var res = j && j.result, ok = false, why = '';
				if (res && res[0] === 0) { try { ok = !!JSON.parse((res[1] && res[1].stdout) || '{}').ok; if (!ok) why = (JSON.parse(res[1].stdout).error) || ''; } catch (e) { ok = false; } }
				else if (res && res[0] === 6) why = 'access denied: sign out and sign in to LuCI again';
				else if (j && j.error) why = j.error.message || 'rpc error';
				else why = 'the router did not respond (is the nightfall monitor package installed?)';
				if (ok) syncNote('Settings saved on the router at ' + hhmm() + ': other browsers will pick them up automatically.');
				else { dirty = true; syncNote('Could not save on the router' + (why ? ': ' + why : '') + '.'); }
			}).catch(function () { dirty = true; syncNote('Could not save on the router: no connection.'); });
	}
	function push() {
		dirty = true;
		clearTimeout(pushTimer);
		pushTimer = setTimeout(pushNow, 3000);      /* sliders must not write to flash on every step, but another browser should see changes quickly */
	}
	function pull(force) {
		if (!window.fetch) return Promise.resolve();
		return window.fetch(BASE + 'prefs.json?' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
			var lt = localT(), hasLocal = false;
			try { hasLocal = !!window.localStorage.getItem(KEY); } catch (e) { /* ignore */ }
			if (d && typeof d.t === 'number' && d.p && typeof d.p === 'object') {
				if (d.t > lt || force === true) {
					fromRouter = true;
					prefs = Object.assign({}, DEFAULTS, tilesV2(d.p));
					try { window.localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) { /* ignore */ }
					setLocalT(d.t); fromRouter = false;
					applyAll(); refreshPanel();
					return;
				}
				if (d.t === lt) return;
			}
			if (hasLocal && sid()) { if (!lt) setLocalT(Date.now()); dirty = true; pushNow(); }   /* missing or older on the router: save the current ones */
		}).catch(function () { /* no copy on the router: use the local one */ });
	}
	var lastPull = 0;
	document.addEventListener('visibilitychange', function () {
		if (document.visibilityState === 'hidden') pushNow();
		else if (Date.now() - lastPull > 20000) { lastPull = Date.now(); pull(); }      /* back in the tab: pull fresh settings from the router */
	});
	window.addEventListener('pagehide', function () { pushNow(); });
	window.addEventListener('load', function () { window.setTimeout(function () { pull(); window.setTimeout(fetchLogo, 700); window.setTimeout(fetchPhoto, 900); }, 200); window.setTimeout(loadVer, 600); });

	var prefs = load();
	var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : { matches: false };
	var mqMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

	/* ---------- colour helpers ---------- */
	function hexToRgb(h) {
		h = String(h || '').replace('#', '');
		if (h.length === 3) h = h.replace(/(.)/g, '$1$1');
		if (!/^[0-9a-f]{6}$/i.test(h)) return null;
		return [ parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16) ];
	}

	function rgbToHex(c) {
		return '#' + c.map(function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); }).join('');
	}

	function rgbToHsl(c) {
		var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
		var max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, h = 0, s = 0;
		if (max !== min) {
			var d = max - min;
			s = l > .5 ? d / (2 - max - min) : d / (max + min);
			h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
			h *= 60;
		}
		return [ h, s * 100, l * 100 ];
	}

	function hslToRgb(c) {
		var h = c[0] / 360, s = c[1] / 100, l = c[2] / 100;
		function f(p, q, t) {
			if (t < 0) t += 1; if (t > 1) t -= 1;
			if (t < 1 / 6) return p + (q - p) * 6 * t;
			if (t < 1 / 2) return q;
			if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
			return p;
		}
		if (s === 0) return [ l * 255, l * 255, l * 255 ];
		var q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
		return [ f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255 ];
	}

	function lum(c) {
		var a = c.map(function (v) { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); });
		return .2126 * a[0] + .7152 * a[1] + .0722 * a[2];
	}

	function contrast(a, b) {
		var la = lum(a), lb = lum(b);
		return (Math.max(la, lb) + .05) / (Math.min(la, lb) + .05);
	}

	function hsl(h, s, l) { return rgbToHex(hslToRgb([ h, s, Math.max(0, Math.min(100, l)) ])); }

	/* ---------- apply ---------- */
	var VARS = [ '--nf-accent', '--nf-accent-hover', '--nf-accent-press', '--nf-on-accent',
		'--primary-color-high', '--primary-color-medium', '--primary-color-low', '--on-primary-color' ];

	function mins(v, def) {
		var m = /^(\d{1,2}):(\d{2})$/.exec(String(v || ''));
		return m ? (+m[1]) * 60 + (+m[2]) : def;
	}

	function scheduleDark() {
		var d = new Date(), t = d.getHours() * 60 + d.getMinutes();
		var night = mins(prefs.nightFrom, 1200), day = mins(prefs.dayFrom, 420);

		if (night === day) return false;
		return night > day ? (t >= night || t < day) : (t >= night && t < day);
	}

	function isDark() {
		if (root.hasAttribute('data-nf-fixed'))
			return root.getAttribute('data-darkmode') === 'true';

		if (prefs.schedule) return scheduleDark();

		return prefs.mode === 'dark' || (prefs.mode !== 'light' && !!mq.matches);
	}

	function applyAccent() {
		var st = root.style, rgb = hexToRgb(prefs.accent);

		if (!rgb) {
			VARS.forEach(function (n) { st.removeProperty(n); });
			root.removeAttribute('data-nf-accent');
			return;
		}

		var c = rgbToHsl(rgb), dark = isDark(), l = c[2], n = 0;

		if (dark) {
			l = Math.max(l, 62);
		} else {
			while (n++ < 24 && contrast(hslToRgb([ c[0], c[1], l ]), [ 255, 255, 255 ]) < 3.6 && contrast(hslToRgb([ c[0], c[1], l ]), [ 0, 0, 0 ]) < 4.5)
				l -= 2;
		}

		var base = hslToRgb([ c[0], c[1], l ]);
		var on = contrast(base, [ 255, 255, 255 ]) >= 3.6 && !dark ? '#ffffff' : (contrast(base, [ 0, 0, 0 ]) >= 4.5 ? '#000000' : '#ffffff');
		var accent = rgbToHex(base), hover = hsl(c[0], c[1], l + (dark ? 5 : 7)), press = hsl(c[0], c[1], l + (dark ? -8 : 13));

		st.setProperty('--nf-accent', accent);
		st.setProperty('--nf-accent-hover', hover);
		st.setProperty('--nf-accent-press', press);
		st.setProperty('--nf-on-accent', on);
		st.setProperty('--primary-color-high', accent);
		st.setProperty('--primary-color-medium', hsl(c[0], c[1], l - 6));
		st.setProperty('--primary-color-low', hsl(c[0], c[1], l - 12));
		st.setProperty('--on-primary-color', on);
		root.setAttribute('data-nf-accent', '1');
	}

	function applyMode() {
		if (!root.hasAttribute('data-nf-fixed'))
			root.setAttribute('data-darkmode', String(isDark()));

		applyAccent();
	}

	/* ---- custom image on the sign-in screen: copy in localStorage (fast) and on the router (logo.json, for other browsers) ---- */
	var LOGOKEY = 'nightfall-logo-v1';
	function applyLogo() {
		var d = null;
		try { d = window.localStorage.getItem(LOGOKEY); } catch (e) { /* ignore */ }
		if (prefs.loginLogo && d && /^data:image\/(png|webp|jpeg);base64,[A-Za-z0-9+\/=]+$/.test(d)) {
			root.style.setProperty('--nf-logo', 'url("' + d + '")');
			root.setAttribute('data-nf-logo', 'custom');
		}
		else {
			root.style.removeProperty('--nf-logo');
			root.setAttribute('data-nf-logo', 'default');
		}
	}
	function fetchLogo() {
		if (!prefs.loginLogo || !window.fetch) return;
		try { if (window.localStorage.getItem(LOGOKEY)) return; } catch (e) { return; }
		window.fetch(BASE + 'logo.json?' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
			if (d && typeof d.d === 'string') { try { window.localStorage.setItem(LOGOKEY, d.d); } catch (e) { /* ignore */ } applyLogo(); }
		}).catch(function () { /* no image on the router */ });
	}
	function routerExec(args) {
		var env = sid();
		if (!env || !window.fetch) return Promise.reject(new Error('no session'));
		return window.fetch(env.ubuspath || '/ubus/', { method: 'POST', headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'call', params: [ env.sessionid, 'file', 'exec', { command: '/usr/libexec/nightfall-config', params: args } ] }) })
			.then(function (r) { return r.json(); }).then(function (j) {
				var o = j && j.result && j.result[1] ? j.result[1] : {};
				var out = {}; try { out = JSON.parse(o.stdout || '{}'); } catch (e) { /* ignore */ }
				if (!out.ok) throw new Error(out.error || 'the router rejected the image (after updating, sign out and sign in to LuCI again)');
			});
	}
	function readLogo(file, done) {
		var img = new Image(), url = window.URL.createObjectURL(file);
		img.onload = function () {
			var side = 256, out = '';
			for (var i = 0; i < 5; i++) {
				var sc = Math.min(1, side / Math.max(img.width, img.height) );
				var cv = document.createElement('canvas');
				cv.width = Math.max(1, Math.round(img.width * sc)); cv.height = Math.max(1, Math.round(img.height * sc));
				cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
				out = cv.toDataURL('image/webp', .9);
				if (out.indexOf('data:image/webp') !== 0) out = cv.toDataURL('image/png');
				if (out.length <= 60000) break;
				side = Math.round(side * .7);
			}
			window.URL.revokeObjectURL(url);
			done(out.length <= 80000 ? out : null);
		};
		img.onerror = function () { window.URL.revokeObjectURL(url); done(null); };
		img.src = url;
	}


	/* ---------- summary cards on the sign-in screen ----------
	 * Drawn here, not in login.js: this file is loaded with the build number and updates immediately,
	 * while the browser may keep LuCI modules cached after a theme update. */
	var LTXT = {
		en: { net: 'Internet', up: 'Uptime', fw: 'Firmware', speed: 'Speed', test: 'Speed test', mbit: 'Mbit/s', temp: 'Temperature', cpu: 'CPU', mem: 'Memory', cl: 'Devices',
			online: 'online', offline: 'offline', nodata: 'no data', ms: 'ms', d: 'd', h: 'h', m: 'min', dec: '.' }
	};
	function loginCell(key, d, T) {
		var num = function (k) { var v = d[k]; return v === '' || v === undefined || isNaN(parseFloat(v)) ? null : parseFloat(v); };
		var fmt = function (n) { return (Math.round(n * 10) / 10).toString().replace('.', T.dec); };
		var mbit = function (bps) { return fmt(parseFloat(bps) * 8 / 1e6); };
		var box = function (cls, label, val, kids, title) {
			var b = h('b', {}, kids || []); if (!kids) b.textContent = val;
			var a = { 'class': 'nf-st' + (cls ? ' ' + cls : '') }; if (title) a.title = title;
			return h('div', a, [ h('span', { text: label }), b ]);
		};
		var v;
		switch (key) {
		case 'net':
			return box('nf-st-' + (d.net || 'none'), T.net, '', [ h('i', { 'class': 'nf-dot' }), document.createTextNode(d.net === 'up' ? (d.ms !== '' ? d.ms + ' ' + T.ms : T.online) : d.net === 'down' ? T.offline : T.nodata) ]);
		case 'speed':
			v = num('rx');
			return box('nf-st-speed', T.speed, v === null ? T.nodata : '↓' + mbit(v) + ' ↑' + mbit(num('tx') || 0), null, T.mbit);
		case 'test':
			v = num('spd');
			return box('', T.test, v === null ? T.nodata : Math.round(v) + ' ' + T.mbit);
		case 'up':
			v = parseInt(d.up, 10);
			if (isNaN(v)) return null;
			var dd = Math.floor(v / 86400), hh = Math.floor(v % 86400 / 3600), mm = Math.floor(v % 3600 / 60);
			return box('', T.up, dd > 0 ? dd + T.d + ' ' + hh + T.h : hh > 0 ? hh + T.h + ' ' + mm + T.m : mm + ' ' + T.m);
		case 'fw':
			return d.rel ? box('', T.fw, d.rel) : null;
		case 'temp':
			v = num('temp');
			return box('', T.temp, v === null || v < 0 ? T.nodata : Math.round(v) + ' °C');
		case 'cpu':
			v = num('cpu');
			return box('', T.cpu, v === null || v < 0 ? T.nodata : Math.round(v) + ' %');
		case 'mem':
			v = num('mem');
			return box('', T.mem, v === null || v < 0 ? T.nodata : Math.round(v) + ' %');
		case 'clients':
			v = num('cl');
			return box('', T.cl, v === null ? T.nodata : String(v));
		}
		return null;
	}
	function renderLoginStats() {
		var info = document.getElementById('view'), plate = document.querySelector('.modal.login .nf-plate');
		if (!info || !plate || info.dataset.local !== '1') return;
		var keys = Array.isArray(prefs.loginCells) ? prefs.loginCells.slice(0, 3) : [ 'net', 'up', 'fw' ];
		var T = LTXT.en;
		var cells = keys.map(function (k) { return loginCell(k, info.dataset, T); }).filter(Boolean);
		var sig = keys.join(',') + '|' + Object.keys(info.dataset).map(function (k) { return info.dataset[k]; }).join(',');
		var old = plate.parentNode.querySelector('.nf-stats');
		if (old && old.getAttribute('data-sig') === sig) return;
		if (old) old.remove();
		if (!cells.length) return;
		var box = h('div', { 'class': 'nf-stats', 'data-n': String(cells.length), 'data-sig': sig }, cells);
		plate.parentNode.insertBefore(box, plate.nextSibling);
	}
	document.addEventListener('DOMContentLoaded', function () {
		if (!document.body || !document.body.classList.contains('nf-blank')) return;
		renderLoginStats();
		new MutationObserver(renderLoginStats).observe(document.body, { childList: true, subtree: true });
		document.addEventListener('nf-prefs', renderLoginStats);
	});

	/* weak device: little memory or few cores; animations then turn off automatically (can be disabled in Personalization) */
	function weakDevice() {
		try { return (navigator.deviceMemory && navigator.deviceMemory <= 2) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2); } catch (e) { return false; }
	}

	/* time of day for the sign-in background: morning 5–10, day 10–17, evening 17–21, night 21–5 */
	function todPart() {
		var hr = new Date().getHours();
		return hr >= 5 && hr < 10 ? 'dawn' : hr >= 10 && hr < 17 ? 'day' : hr >= 17 && hr < 21 ? 'dusk' : 'night';
	}

	function applyMotion() {
		var off = !prefs.motion || mqMotion.matches || (prefs.liteAuto !== false && weakDevice());

		if (off) root.setAttribute('data-nf-motion', 'off');
		else root.removeAttribute('data-nf-motion');
	}

	/* ---- mobile: bottom tab bar + bottom sheet built from the main menu ---- */
	var TAB_ICONS = {
		status: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
		system: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
		services: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
		network: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
		vpn: '<path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6z"/>',
		logout: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M10 8l-4 4 4 4M6 12h10"/>',
		docker: '<path d="M3 12h18v2a6 6 0 0 1-6 6H8a5 5 0 0 1-5-5z"/><path d="M6 12V9h3v3M10 12V9h3v3M14 12V9h3v3M10 9V6h3v3"/>',
		modem: '<rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 17h.01M11 17h.01M8 9a6 6 0 0 1 8 0M10.5 6a2.8 2.8 0 0 1 3 0"/>',
		more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>'
	};
	function tabIcon(k) {
		var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
		s.setAttribute('stroke-width', '1.8'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
		s.innerHTML = TAB_ICONS[k] || '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M9 12h6"/>';
		return s;
	}
	function initTabbar() {
		var menu = document.getElementById('topmenu');
		if (!menu || document.getElementById('nf-tabbar')) return;
		var bar = h('nav', { id: 'nf-tabbar', 'aria-label': 'Sections' });
		var sheet = h('div', { id: 'nf-sheet', 'aria-hidden': 'true' });
		var panel = h('div', { 'class': 'nf-sheet-p', role: 'dialog' });
		sheet.appendChild(panel);
		document.body.appendChild(bar); document.body.appendChild(sheet);

		function close() { sheet.classList.remove('open'); sheet.setAttribute('aria-hidden', 'true'); Array.prototype.forEach.call(bar.children, function (b) { b.classList.remove('sel'); }); }
		function links(li) { return Array.prototype.slice.call(li.querySelectorAll('ul a[href]')).filter(function (a) { return a.getAttribute('href') !== '#'; }); }
		function fill(items, headers) {
			panel.textContent = '';
			items.forEach(function (li) {
				var here = location.pathname + location.search;
				var own = li.firstElementChild, ls = links(li);
				/* item without a submenu (e.g. "Log out"): just a link */
				if (!ls.length && own && own.getAttribute('href') && own.getAttribute('href') !== '#') {
					var one = h('a', { href: own.getAttribute('href'), 'class': 'nf-sheet-single', text: own.textContent });
					if (li.classList.contains('active')) one.className += ' cur';
					panel.appendChild(one);
					return;
				}
				if (headers) panel.appendChild(h('div', { 'class': 'nf-sheet-h', text: own.textContent }));
				ls.forEach(function (a) {
					var l = h('a', { href: a.getAttribute('href'), text: a.textContent });
					if (a.parentNode.classList.contains('active') || a.classList.contains('active') || (a.pathname + a.search) === here) l.className = 'cur';
					panel.appendChild(l);
				});
			});
		}
		function open(btn, items, headers) {
			if (sheet.classList.contains('open') && btn.classList.contains('sel')) return close();
			close(); fill(items, headers); btn.classList.add('sel');
			sheet.classList.add('open'); sheet.setAttribute('aria-hidden', 'false');
		}
		sheet.addEventListener('click', function (ev) { if (ev.target === sheet || ev.target.tagName === 'A') close(); });
		bar.addEventListener('click', function () { buzz(8); }, true);
		/* swiping down closes the sheet (when it is scrolled to the top) */
		(function () {
			var y0 = null, dy = 0;
			panel.addEventListener('touchstart', function (ev) { y0 = panel.scrollTop <= 0 ? ev.touches[0].clientY : null; dy = 0; panel.style.transition = 'none'; }, { passive: true });
			panel.addEventListener('touchmove', function (ev) {
				if (y0 === null) return;
				dy = ev.touches[0].clientY - y0;
				if (dy > 0) panel.style.transform = 'translateY(' + dy + 'px)';
			}, { passive: true });
			panel.addEventListener('touchend', function () {
				panel.style.transition = ''; panel.style.transform = '';
				if (y0 !== null && dy > 90) { buzz(10); close(); }
				y0 = null; dy = 0;
			});
		})();
		document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') close(); });

		function build() {
			var lis = Array.prototype.filter.call(menu.children, function (li) { return li.tagName === 'LI' && !li.classList.contains('nf-nores') && li.firstElementChild; });
			if (!lis.length) return false;
			bar.textContent = '';
			var shown = lis.length > 5 ? lis.slice(0, 4) : lis, rest = lis.length > 5 ? lis.slice(4) : [];
			shown.forEach(function (li) {
				var b = h('button', { type: 'button' }, [ tabIcon(li.getAttribute('data-name')), h('span', { text: li.firstElementChild.textContent }) ]);
				if (li.classList.contains('active')) b.setAttribute('aria-current', 'page');
				b.addEventListener('click', function () {
					var ls = links(li);
					if (ls.length) open(b, [ li ], false); else if (li.firstElementChild.getAttribute('href') !== '#') location.href = li.firstElementChild.getAttribute('href');
				});
				bar.appendChild(b);
			});
			if (rest.length) {
				var m = h('button', { type: 'button' }, [ tabIcon('more'), h('span', { text: 'More' }) ]);
				if (rest.some(function (li) { return li.classList.contains('active'); })) m.setAttribute('aria-current', 'page');
				m.addEventListener('click', function () { open(m, rest, true); });
				bar.appendChild(m);
			}
			document.body.classList.add('nf-has-tabbar');
			return true;
		}
		if (!build()) {
			var mo = new MutationObserver(function () { if (build()) mo.disconnect(); });
			mo.observe(menu, { childList: true });
		}
	}

	/* "Restart Wi-Fi" shortcut: opens the Overview, highlights the button; the action is confirmed as usual */
	function initHashAction() {
		if (location.hash !== '#nf-wifi') return;
		var tries = 0, t = setInterval(function () {
			var btns = Array.prototype.slice.call(document.querySelectorAll('.nf-qa'));
			var b = btns.filter(function (x) { return /wi-?fi/i.test(x.textContent); })[0];
			if (b) { clearInterval(t); b.scrollIntoView({ block: 'center', behavior: 'smooth' }); b.classList.add('nf-pulse'); setTimeout(function () { b.classList.remove('nf-pulse'); }, 4500); }
			else if (++tries > 40) clearInterval(t);
		}, 250);
	}

	/* ---- mobile gestures and responsiveness ---- */
	function buzz(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }
	var mqPhone = window.matchMedia('(max-width: 899px)');

	/* swipe left/right: adjacent tab of the section (phone) */
	function initSwipe() {
		var x0 = null, y0 = 0, t0 = 0;
		function blocked(t) {
			for (var n = t; n && n !== document.body; n = n.parentNode) {
				if (n.nodeType !== 1) continue;
				if (/^(INPUT|SELECT|TEXTAREA|CANVAS|SVG|svg)$/.test(n.tagName) || n.isContentEditable) return true;
				if (n.matches && n.matches('.nf-pop, #nf-sheet, .modal, .cbi-dropdown, .nf-live-grid, #nf-tabbar')) return true;
				if (n.scrollWidth > n.clientWidth + 4 && /(auto|scroll)/.test(getComputedStyle(n).overflowX)) return true;
			}
			return false;
		}
		document.addEventListener('touchstart', function (ev) {
			x0 = null;
			if (prefs.swipe === false || !mqPhone.matches || ev.touches.length !== 1 || document.body.classList.contains('modal-overlay-active') || blocked(ev.target)) return;
			x0 = ev.touches[0].clientX; y0 = ev.touches[0].clientY; t0 = Date.now();
		}, { passive: true });
		document.addEventListener('touchend', function (ev) {
			if (x0 === null) return;
			var t = ev.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0; x0 = null;
			if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 2 || Date.now() - t0 > 600) return;
			var uls = document.querySelectorAll('#tabmenu ul.tabs'); if (!uls.length) return;
			var items = [].slice.call(uls[uls.length - 1].children), i = -1;
			for (var k = 0; k < items.length; k++) if (/\bactive\b/.test(items[k].className)) i = k;
			var to = items[i + (dx < 0 ? 1 : -1)], a = to && to.querySelector('a');
			if (a && i >= 0) { buzz(8); location.href = a.href; }
		});
	}

	/* pull down to refresh the page (only at the top edge and with no dialogs open) */
	function initPull() {
		var ind = h('div', { id: 'nf-ptr', 'aria-hidden': 'true' }, [ h('span') ]);
		document.body.appendChild(ind);
		var y0 = null, pull = 0, busy = false, LIM = 84;
		function blocked(t) { return !!(t.closest && t.closest('.nf-pop, #nf-sheet, .modal, input, select, textarea, .cbi-dropdown, .nf-tabscroll, .nf-live-grid, table')); }
		document.addEventListener('touchstart', function (ev) {
			y0 = null;
			if (!mqPhone.matches || busy || window.scrollY > 0 || document.body.classList.contains('modal-overlay-active') || blocked(ev.target)) return;
			y0 = ev.touches[0].clientY; pull = 0;
		}, { passive: true });
		document.addEventListener('touchmove', function (ev) {
			if (y0 === null) return;
			var d = ev.touches[0].clientY - y0;
			if (d <= 0 || window.scrollY > 0) { pull = 0; ind.style.setProperty('--pull', 0); ind.classList.remove('on'); return; }
			pull = Math.min(d * .5, LIM + 20);
			ind.classList.add('on'); ind.classList.toggle('ready', pull >= LIM);
			ind.style.setProperty('--pull', pull + 'px');
		}, { passive: true });
		document.addEventListener('touchend', function () {
			if (y0 === null) return;
			var go = pull >= LIM; y0 = null;
			if (go) { busy = true; buzz(12); ind.classList.add('spin'); setTimeout(function () { location.reload(); }, 150); }
			else { ind.classList.remove('on', 'ready'); ind.style.setProperty('--pull', 0); }
		});
	}

	/* monitoring tables: column labels in every cell so rows become cards */
	function labelTables() {
		Array.prototype.forEach.call(document.querySelectorAll('.nfm-table'), function (t) {
			var heads = Array.prototype.map.call(t.querySelectorAll('thead th'), function (th) { return th.textContent.replace(/\s*[↓↑]\s*$/, '').trim(); });
			Array.prototype.forEach.call(t.querySelectorAll('tbody tr'), function (tr) {
				Array.prototype.forEach.call(tr.children, function (td, i) { if (heads[i] && td.getAttribute('data-l') !== heads[i]) td.setAttribute('data-l', heads[i]); });
			});
		});
	}
	function initMobile() {
		initPull(); initSwipe();
		var raf = 0;
		new MutationObserver(function () { if (!raf) raf = requestAnimationFrame(function () { raf = 0; labelTables(); }); })
			.observe(document.body, { childList: true, subtree: true });
		labelTables();
		/* light vibration on Overview quick actions */
		document.addEventListener('click', function (ev) { if (ev.target.closest && ev.target.closest('.nf-qa')) buzz(10); }, true);
	}

	/* ---- term hints ---- */
	var installEvt = null;
	window.addEventListener('beforeinstallprompt', function (ev) { ev.preventDefault(); installEvt = ev; if (refs.install) refs.install.hidden = false; });

	var GLOSS = [
		[ 'MTU', 'MTU', 'Maximum size of a single packet in bytes. Usually 1500, 1492 for PPPoE. Too large a value breaks some websites.' ],
		[ 'DHCP', 'DHCP', 'A service that automatically gives devices an IP address, gateway and DNS when they join the network.' ],
		[ 'DNS', 'DNS', 'Translates website names into IP addresses. If DNS does not respond, websites will not open even though the internet works.' ],
		[ 'NAT', 'NAT', 'Address translation: all home devices go online under the router\'s single external address.' ],
		[ 'SSID', 'SSID', 'The Wi‑Fi network name shown in the network list on phones and laptops.' ],
		[ 'WPA3', 'WPA3', 'The newer Wi‑Fi security standard. More secure than WPA2, but older devices may not support it.' ],
		[ 'WPA2', 'WPA2', 'The common password-based Wi‑Fi security standard. Works with almost all devices.' ],
		[ 'VLAN', 'VLAN', 'Logical splitting of a network into isolated segments over the same cables and ports.' ],
		[ 'MAC', 'MAC address', 'The unique address of a device\'s network adapter. The router uses it to tell devices apart.' ],
		[ 'IPv6', 'IPv6', 'The newer internet addressing version with a much larger address space than IPv4.' ],
		[ 'TTL', 'TTL', 'How many "hops" through routers a packet can make before it is dropped.' ],
		[ 'QoS', 'QoS', 'Traffic prioritization: for example, calls and games get bandwidth before downloads.' ],
		[ 'SQM', 'SQM', 'Smart queue management; reduces latency under load (bufferbloat).' ],
		[ 'WAN', 'WAN', 'External network: the router\'s connection to the ISP and the internet.' ],
		[ 'LAN', 'LAN', 'Home local network: devices connected to the router by cable or Wi‑Fi.' ],
		[ 'PPPoE', 'PPPoE', 'A way to connect to the ISP with a username and password. Common with DSL and some fiber ISPs.' ],
		[ 'DMZ', 'DMZ', 'A device that receives all incoming connections. Use with caution.' ],
		[ 'DFS', 'DFS', '5 GHz channels that must be vacated when radar is detected. Often less crowded, but may switch on their own.' ],
		[ 'ARP', 'ARP', 'Maps IP addresses to MAC addresses of devices on the local network.' ],
		[ 'NTP', 'NTP', 'Time synchronization over the internet. Needed for logs and certificates.' ],
		[ 'SSH', 'SSH', 'Secure remote access to the router\'s command line.' ],
		[ 'Gateway', 'Gateway', 'The address of the device through which traffic leaves your network, usually the ISP\'s router.' ],
		[ 'шлюз', 'Gateway', 'The address of the device through which traffic leaves your network, usually the ISP\'s router.' ],
		[ 'Netmask', 'Subnet mask', 'Defines which part of an IP address belongs to the network and which to the device. Most often 255.255.255.0.' ],
		[ 'маска', 'Subnet mask', 'Defines which part of an IP address belongs to the network and which to the device. Most often 255.255.255.0.' ],
		[ 'мост', 'Bridge', 'Combines several ports or networks into one, as if they were connected to a single switch.' ],
		[ 'Bridge', 'Bridge', 'Combines several ports or networks into one, as if they were connected to a single switch.' ],
		[ 'Beamforming', 'Beamforming', 'The router steers the Wi‑Fi signal toward the device, improving speed and range.' ],
		[ 'Mesh', 'Mesh', 'Several access points form one Wi‑Fi network with seamless roaming between them.' ],
		[ 'DDNS', 'DDNS', 'A permanent name for the router, even if the ISP changes the external IP address.' ],
		[ 'Firewall', 'Firewall', 'Decides which traffic to allow and which to block.' ],
		[ 'Межсетевой экран', 'Firewall', 'Decides which traffic to allow and which to block.' ]
	].map(function (g) {
		var w = g[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		return { re: new RegExp('(^|[^\\p{L}\\d])' + w + '(?![\\p{L}\\d])', 'iu'), t: g[1], d: g[2] };
	});
	var tip = null, tipOwner = null;

	function showTip(el) {
		if (!el.getAttribute('data-t') || document.body.classList.contains('nf-blank')) return;
		if (!tip) { tip = document.createElement('div'); tip.id = 'nf-tip'; tip.setAttribute('role', 'tooltip'); document.body.appendChild(tip); }
		tip.textContent = '';
		tip.appendChild(h('b', { text: el.getAttribute('data-t') }));
		tip.appendChild(document.createTextNode(el.getAttribute('data-d')));
		var r = el.getBoundingClientRect();
		tip.style.left = '0px'; tip.style.top = '0px';
		var w = tip.offsetWidth, hh = tip.offsetHeight;
		var x = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
		var y = r.bottom + 8 + hh > window.innerHeight ? r.top - hh - 8 : r.bottom + 8;
		tip.style.left = x + 'px'; tip.style.top = Math.max(8, y) + 'px';
		tip.classList.add('on'); tipOwner = el;
	}
	function hideTip() { if (tip) tip.classList.remove('on'); tipOwner = null; }

	function addHints() {
		if (prefs.hints === false) return;
		var list = document.querySelectorAll('#maincontent .cbi-value-title:not([data-nfh]), #maincontent .table .th:not([data-nfh])');
		Array.prototype.forEach.call(list, function (el) {
			el.setAttribute('data-nfh', '1');
			var txt = el.textContent || '';
			if (txt.length > 90) return;
			for (var i = 0; i < GLOSS.length; i++) {
				if (GLOSS[i].re.test(txt)) {
					el.appendChild(h('i', { 'class': 'nf-hint', tabindex: '0', role: 'note', 'data-t': GLOSS[i].t, 'data-d': GLOSS[i].d, 'aria-label': GLOSS[i].t + ': ' + GLOSS[i].d, text: '?' }));
					break;
				}
			}
		});
	}
	/* Called right from the MutationObserver (before the frame is painted): LuCI rebuilds tables on every poll,
	   and a "?" icon added later on a timer shifted the headers and made the page jump every time. */
	function scheduleHints() { addHints(); }
	document.addEventListener('DOMContentLoaded', function () {
		scheduleHints();
		new MutationObserver(scheduleHints).observe(document.body, { childList: true, subtree: true });
		document.addEventListener('mouseover', function (ev) { var t = ev.target.closest && ev.target.closest('.nf-hint'); if (t) showTip(t); });
		document.addEventListener('mouseout', function (ev) { var t = ev.target.closest && ev.target.closest('.nf-hint'); if (t) hideTip(); });
		document.addEventListener('focusin', function (ev) { var t = ev.target.closest && ev.target.closest('.nf-hint'); if (t) showTip(t); });
		document.addEventListener('focusout', hideTip);
		document.addEventListener('click', function (ev) {
			var t = ev.target.closest && ev.target.closest('.nf-hint');
			if (t) { ev.preventDefault(); ev.stopPropagation(); if (tipOwner === t) hideTip(); else showTip(t); } else hideTip();
		}, true);
		window.addEventListener('scroll', hideTip, true);
	});

	/* ---- icons in card titles (Overview, Monitor): one set, drawn per style in CSS ---- */
	var TITLE_ICONS = [
		[ /internet|интернет/i, 'globe' ], [ /\bports?\b|порт/i, 'port' ], [ /wireless|wi.?fi|\bradio|беспровод|радио|эфир/i, 'wifi' ], [ /router health|\bhealth|состояние роутера|здоров/i, 'pulse' ],
		[ /^network|^сеть|interface|address|gateway|сетев|интерфейс|адрес|шлюз/i, 'net' ], [ /processor|\bload\b|^system|^cpu|процессор|нагрузка|системн|^система/i, 'cpu' ], [ /memory|\bram\b|памят|озу/i, 'mem' ],
		[ /storage|\bdisk|\bdrive|flash|хранил|диск|накопит|флеш/i, 'disk' ], [ /dhcp|lease|client|device|аренд|клиент|устройств/i, 'users' ], [ /event|\blogs?\b|событ|журнал|лог/i, 'bell' ],
		[ /quick|action|быстр|действ/i, 'bolt' ], [ /\btop\b|traffic|speed|graph|chart|statistic|топ|трафик|скорост|график|статистик/i, 'chart' ], [ /connection|conntrack|соединен/i, 'link' ],
		[ /\brout(e|es|ing)\b|маршрут/i, 'route' ], [ /firewall|protect|security|\bzones?\b|брандмауэр|защит|зон/i, 'shield' ], [ /temperat|cooling|температур|охлажд/i, 'temp' ], [ /process|процесс/i, 'cpu' ]
	];
	function iconFor(text) {
		for (var i = 0; i < TITLE_ICONS.length; i++) if (TITLE_ICONS[i][0].test(text)) return TITLE_ICONS[i][1];
		return 'grid';
	}
	function addIcons() {
		Array.prototype.forEach.call(document.querySelectorAll('#maincontent .nf-ttl:not([data-ic]), #maincontent .nfm-card-title:not([data-ic])'), function (t) {
			var grip = t.querySelector(':scope > .nf-grip');
			var text = (t.textContent || '').replace(/[⋮\s]+/g, ' ').trim();
			if (!text) return;
			t.setAttribute('data-ic', '1');
			var ic = h('span', { 'class': 'nf-ic', 'data-ic': iconFor(text), 'aria-hidden': 'true' });
			if (grip) t.insertBefore(ic, grip.nextSibling); else t.insertBefore(ic, t.firstChild);
		});
	}
	/* same for card title icons: no delay, so the title does not jump after a poll */
	function scheduleIcons() { addIcons(); }

	/* ---- the active menu item is a pill that glides to the item under the cursor and back ---- */
	function initPill() {
		var menu = document.getElementById('topmenu');
		if (!menu || menu.querySelector('.nf-pill') || !window.requestAnimationFrame) return;
		var pill = h('span', { 'class': 'nf-pill', 'aria-hidden': 'true' });
		menu.insertBefore(pill, menu.firstChild);
		document.body.classList.add('nf-pill-on');
		var hover = null, raf = 0;
		function current() { return menu.querySelector('li.open .dropdown-menu li.active > a') || menu.querySelector(':scope > li.active > a'); }
		function place() {
			raf = 0;
			var a = hover || current();
			if (!a || !a.offsetWidth) { pill.style.opacity = '0'; return; }
			var m = menu.getBoundingClientRect(), r = a.getBoundingClientRect();
			pill.style.opacity = '1';
			pill.classList.toggle('hov', !!hover && a !== current());
			pill.style.transform = 'translate(' + Math.round(r.left - m.left) + 'px,' + Math.round(r.top - m.top) + 'px)';
			pill.style.width = Math.round(r.width) + 'px'; pill.style.height = Math.round(r.height) + 'px';
		}
		function sched() { if (!raf) raf = window.requestAnimationFrame(place); }
		menu.addEventListener('mouseover', function (ev) { var a = ev.target.closest && ev.target.closest('a'); if (a && menu.contains(a)) { hover = a; sched(); } });
		menu.addEventListener('mouseleave', function () { hover = null; sched(); });
		menu.addEventListener('transitionend', sched);
		new MutationObserver(sched).observe(menu, { subtree: true, attributes: true, attributeFilter: [ 'class' ], childList: true });
		if (window.ResizeObserver) new ResizeObserver(sched).observe(menu);
		window.addEventListener('resize', sched);
		window.setTimeout(sched, 350);
		sched();
	}


	function applyBg() {
		var ok = BGS.some(function (b) { return b[0] === prefs.bg; });
		root.setAttribute('data-nf-bg', ok ? prefs.bg : 'mica');
		root.style.setProperty('--nf-bgs', String(Math.max(40, Math.min(250, +prefs.bgScale || 100)) / 100));
	}

	/* ---------- constellation background (animated dots that connect and gather near the cursor) ---------- */
	var cst = null;

	function accentRgb() {
		var a = hexToRgb(getComputedStyle(root).getPropertyValue('--nf-accent').trim()) || [ 0, 103, 192 ];
		return isDark() ? a.map(function (v) { return Math.round(v + (255 - v) * .35); }) : a;
	}

	function stopConst() {
		if (!cst) return;
		window.cancelAnimationFrame(cst.raf);
		window.removeEventListener('resize', cst.size);
		window.removeEventListener('pointermove', cst.move);
		window.removeEventListener('pointerleave', cst.leave);
		if (cst.cv.parentNode) cst.cv.parentNode.removeChild(cst.cv);
		cst = null;
	}

	var CONST_KINDS = [ 'net', 'fire', 'bubbles', 'snow', 'meteors', 'rain', 'sparks', 'matrix', 'petals', 'ripples', 'orbits', 'confetti' ];

	function startConst(mode, kind) {
		var cv = document.createElement('canvas'), ctx = cv.getContext && cv.getContext('2d');
		if (!ctx) return;
		cv.id = 'nf-const';
		cv.setAttribute('aria-hidden', 'true');
		document.body.insertBefore(cv, document.body.firstChild);

		var W = 0, H = 0, pts = [], streaks = [], mouse = { x: -1e4, y: -1e4 }, col = accentRgb(), colAt = 0, nextStreak = 0;
		var LINK = 120, PULL = 190, login = mode === 'login', rnd = Math.random;
		var S = cst = { cv: cv, mode: mode, kind: kind, raf: 0 };

		function mk(first) {
			var x = rnd() * W, y = rnd() * H;
			if (kind === 'fire') return { x: x, y: y, ang: rnd() * 6.28, sp: .15 + rnd() * .35, ph: rnd() * 6.28, tw: .6 + rnd() * 1.4, r: 3 + rnd() * 6 };
			if (kind === 'bubbles') return { x: x, y: first ? y : H + 40, r: 5 + rnd() * (login ? 30 : 22), vy: .25 + rnd() * .7, ph: rnd() * 6.28, wob: .25 + rnd() * .6 };
			if (kind === 'snow') { var r = .8 + rnd() * 2.4; return { x: x, y: first ? y : -10, r: r, vy: .3 + r * .28, ph: rnd() * 6.28, sw: .3 + rnd() * .6 }; }
			if (kind === 'meteors') return { x: x, y: y, r: .6 + rnd() * 1.4, ph: rnd() * 6.28, tw: .5 + rnd() * 1.6 };
			if (kind === 'rain') return { x: x, y: first ? y : -30, len: 10 + rnd() * 18, vy: 9 + rnd() * 8, a: .25 + rnd() * .45 };
			if (kind === 'sparks') return { x: x, y: first ? y : H + 10, r: .8 + rnd() * 1.8, vy: .5 + rnd() * 1.3, ph: rnd() * 6.28, sw: .4 + rnd() * .9 };
			if (kind === 'matrix') return { x: pts.length * 16 + 8, y: first ? rnd() * H : -rnd() * H * .5, sp: 1.6 + rnd() * 2.6, len: 8 + Math.round(rnd() * 12), g: [], t: 0 };
			if (kind === 'petals') return { x: x, y: first ? y : -14, r: 4 + rnd() * 5, vy: .5 + rnd() * .8, ph: rnd() * 6.28, sw: .5 + rnd(), rot: rnd() * 6.28, vr: (rnd() - .5) * .05 };
			if (kind === 'orbits') return { rad: 60 + rnd() * Math.min(W, H) * .5, a: rnd() * 6.28, sp: (.0004 + rnd() * .0012) * (rnd() < .5 ? -1 : 1), r: .9 + rnd() * 1.7, k: .45 + rnd() * .4, tilt: rnd() * 3.14 };
			if (kind === 'confetti') return { x: x, y: first ? y : -12, w: 4 + rnd() * 5, h: 2 + rnd() * 3, vy: .8 + rnd() * 1.4, ph: rnd() * 6.28, sw: .5 + rnd(), rot: rnd() * 6.28, vr: (rnd() - .5) * .12, hue: Math.round(rnd() * 360) };
			return { x: x, y: y, vx: (rnd() - .5) * .3, vy: (rnd() - .5) * .3, r: .9 + rnd() * 1.5 };
		}

		S.size = function () {
			var dpr = Math.min(window.devicePixelRatio || 1, 2);
			W = window.innerWidth; H = window.innerHeight;
			cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			var area = W * H, n;
			if (kind === 'fire') n = Math.max(18, Math.min(44, Math.round(area / 40000)));
			else if (kind === 'bubbles') n = Math.max(12, Math.min(34, Math.round(area / 55000)));
			else if (kind === 'snow') n = Math.max(50, Math.min(170, Math.round(area / 12000)));
			else if (kind === 'meteors') n = Math.max(40, Math.min(130, Math.round(area / 16000)));
			else if (kind === 'rain') n = Math.max(60, Math.min(200, Math.round(area / 9000)));
			else if (kind === 'sparks') n = Math.max(40, Math.min(120, Math.round(area / 18000)));
			else if (kind === 'matrix') n = Math.ceil(W / 16);
			else if (kind === 'petals') n = Math.max(16, Math.min(46, Math.round(area / 45000)));
			else if (kind === 'orbits') n = Math.max(50, Math.min(130, Math.round(area / 14000)));
			else if (kind === 'confetti') n = Math.max(30, Math.min(90, Math.round(area / 22000)));
			else if (kind === 'ripples') n = 0;
			else n = Math.max(28, Math.min(login ? 110 : 55, Math.round(area / 15000)));
			while (pts.length < n) pts.push(mk(true));
			pts.length = n;
		};
		S.move = function (ev) { mouse.x = ev.clientX; mouse.y = ev.clientY; };
		S.leave = function () { mouse.x = mouse.y = -1e4; };

		function frameNet() {
			var i, j, a, b, dx, dy, d, k;
			for (i = 0; i < pts.length; i++) {
				a = pts[i];
				dx = mouse.x - a.x; dy = mouse.y - a.y; d = Math.sqrt(dx * dx + dy * dy);
				if (d < PULL && d > 1) { k = (1 - d / PULL) * .035; a.vx += dx / d * k; a.vy += dy / d * k; }
				a.vx *= .995; a.vy *= .995;
				var sp = Math.sqrt(a.vx * a.vx + a.vy * a.vy);
				if (sp > 1.4) { a.vx *= 1.4 / sp; a.vy *= 1.4 / sp; }
				if (sp < .08) { a.vx += (rnd() - .5) * .02; a.vy += (rnd() - .5) * .02; }
				a.x += a.vx; a.y += a.vy;
				if (a.x < -10) a.x = W + 10; else if (a.x > W + 10) a.x = -10;
				if (a.y < -10) a.y = H + 10; else if (a.y > H + 10) a.y = -10;
			}
			var rgb = col.join(','), la = login ? .5 : .22;
			ctx.lineWidth = 1;
			for (i = 0; i < pts.length; i++) {
				a = pts[i];
				for (j = i + 1; j < pts.length; j++) {
					b = pts[j]; dx = a.x - b.x; dy = a.y - b.y;
					if (dx > LINK || dx < -LINK || dy > LINK || dy < -LINK) continue;
					d = Math.sqrt(dx * dx + dy * dy);
					if (d >= LINK) continue;
					ctx.strokeStyle = 'rgba(' + rgb + ',' + ((1 - d / LINK) * la).toFixed(3) + ')';
					ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
				}
			}
			ctx.fillStyle = 'rgba(' + rgb + ',' + (login ? .85 : .5) + ')';
			for (i = 0; i < pts.length; i++) { a = pts[i]; ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, 6.2832); ctx.fill(); }
		}

		/* fireflies: soft glowing dots that drift, pulse and lean toward the cursor */
		function frameFire(t) {
			var rgb = col.join(','), i, a, dx, dy, d, g, al;
			for (i = 0; i < pts.length; i++) {
				a = pts[i];
				a.ang += Math.sin(t * .0004 + a.ph) * .03;
				dx = mouse.x - a.x; dy = mouse.y - a.y; d = Math.sqrt(dx * dx + dy * dy);
				if (d < 220 && d > 1) { a.x += dx / d * .35; a.y += dy / d * .35; }
				a.x += Math.cos(a.ang) * a.sp; a.y += Math.sin(a.ang) * a.sp;
				if (a.x < -20) a.x = W + 20; else if (a.x > W + 20) a.x = -20;
				if (a.y < -20) a.y = H + 20; else if (a.y > H + 20) a.y = -20;
				al = .25 + .75 * Math.pow(Math.sin(t * .001 * a.tw + a.ph) * .5 + .5, 2);
				g = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, a.r * 3.2);
				g.addColorStop(0, 'rgba(' + rgb + ',' + (al * (login ? .95 : .55)).toFixed(3) + ')');
				g.addColorStop(.35, 'rgba(' + rgb + ',' + (al * .28).toFixed(3) + ')');
				g.addColorStop(1, 'rgba(' + rgb + ',0)');
				ctx.fillStyle = g; ctx.beginPath(); ctx.arc(a.x, a.y, a.r * 3.2, 0, 6.2832); ctx.fill();
			}
		}

		/* bubbles: translucent rings rise with a gentle sway; the cursor pushes them away */
		function frameBubbles(t) {
			var rgb = col.join(','), i, a, dx, dy, d;
			for (i = 0; i < pts.length; i++) {
				a = pts[i];
				a.y -= a.vy; a.x += Math.sin(t * .0008 * a.wob + a.ph) * .4;
				dx = a.x - mouse.x; dy = a.y - mouse.y; d = Math.sqrt(dx * dx + dy * dy);
				if (d < a.r + 70 && d > 1) { a.x += dx / d * 1.6; a.y += dy / d * 1.2; }
				if (a.y < -a.r - 10) { pts[i] = mk(false); pts[i].x = rnd() * W; continue; }
				ctx.fillStyle = 'rgba(' + rgb + ',' + (login ? .07 : .045) + ')';
				ctx.strokeStyle = 'rgba(' + rgb + ',' + (login ? .5 : .28) + ')';
				ctx.lineWidth = 1.2;
				ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, 6.2832); ctx.fill(); ctx.stroke();
				ctx.strokeStyle = 'rgba(255,255,255,' + (login ? .55 : .3) + ')';
				ctx.beginPath(); ctx.arc(a.x, a.y, a.r * .7, 3.6, 4.5); ctx.stroke();
			}
		}

		/* snow: soft flakes, bigger ones fall faster */
		function frameSnow(t) {
			var rgb = isDark() ? '255,255,255' : col.join(','), i, a, dx;
			for (i = 0; i < pts.length; i++) {
				a = pts[i];
				a.y += a.vy; a.x += Math.sin(t * .0006 * a.sw + a.ph) * .45;
				dx = a.x - mouse.x; if (Math.abs(dx) < 60 && Math.abs(a.y - mouse.y) < 60) a.x += dx > 0 ? .6 : -.6;
				if (a.y > H + 10) { pts[i] = mk(false); pts[i].y = -10; continue; }
				if (a.x < -10) a.x = W + 10; else if (a.x > W + 10) a.x = -10;
				ctx.fillStyle = 'rgba(' + rgb + ',' + ((login ? .85 : .55) * Math.min(1, .35 + a.r / 2.6)).toFixed(3) + ')';
				ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, 6.2832); ctx.fill();
			}
		}

		/* twinkling stars with an occasional shooting star */
		function frameMeteors(t) {
			var rgb = isDark() ? '255,255,255' : col.join(','), i, a, s;
			for (i = 0; i < pts.length; i++) {
				a = pts[i];
				ctx.fillStyle = 'rgba(' + rgb + ',' + ((.15 + .65 * (Math.sin(t * .001 * a.tw + a.ph) * .5 + .5)) * (login ? 1 : .7)).toFixed(3) + ')';
				ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, 6.2832); ctx.fill();
			}
			if (t > nextStreak) {
				nextStreak = t + 1800 + rnd() * 3500;
				var ang = .6 + rnd() * .35, v = 9 + rnd() * 6;
				streaks.push({ x: rnd() * W * 1.1, y: -20, vx: -Math.cos(ang) * v, vy: Math.sin(ang) * v, life: 1 });
			}
			for (i = streaks.length - 1; i >= 0; i--) {
				s = streaks[i]; s.x += s.vx; s.y += s.vy; s.life -= .012;
				if (s.life <= 0 || s.y > H + 40) { streaks.splice(i, 1); continue; }
				var g = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * 9, s.y - s.vy * 9);
				g.addColorStop(0, 'rgba(' + rgb + ',' + (s.life * (login ? .95 : .6)).toFixed(3) + ')');
				g.addColorStop(1, 'rgba(' + rgb + ',0)');
				ctx.strokeStyle = g; ctx.lineWidth = 1.6;
				ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 9, s.y - s.vy * 9); ctx.stroke();
			}
		}

		/* rain: thin slanted streaks; the cursor leaves a small splash ring */
		function frameRain() {
			var rgb = isDark() ? '200,220,255' : col.join(','), i, a;
			ctx.lineWidth = 1; ctx.lineCap = 'round';
			for (i = 0; i < pts.length; i++) {
				a = pts[i]; a.y += a.vy; a.x -= a.vy * .12;
				if (a.y > H + 30) { pts[i] = mk(false); pts[i].x = rnd() * (W + 120); continue; }
				ctx.strokeStyle = 'rgba(' + rgb + ',' + (a.a * (login ? .8 : .45)).toFixed(3) + ')';
				ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x + a.len * .12, a.y - a.len); ctx.stroke();
			}
		}

		/* sparks: warm embers rise, sway and fade out towards the top */
		function frameSparks(t) {
			var i, a, f, al, g;
			for (i = 0; i < pts.length; i++) {
				a = pts[i]; a.y -= a.vy; a.x += Math.sin(t * .0009 * a.sw + a.ph) * .5;
				if (a.y < -10) { pts[i] = mk(false); continue; }
				f = a.y / H; al = Math.max(0, Math.min(1, f * 1.3)) * (login ? .95 : .6);
				g = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, a.r * 4);
				g.addColorStop(0, 'rgba(255,' + Math.round(150 + 90 * f) + ',70,' + al.toFixed(3) + ')');
				g.addColorStop(.4, 'rgba(255,' + Math.round(90 + 60 * f) + ',40,' + (al * .35).toFixed(3) + ')');
				g.addColorStop(1, 'rgba(255,80,30,0)');
				ctx.fillStyle = g; ctx.beginPath(); ctx.arc(a.x, a.y, a.r * 4, 0, 6.2832); ctx.fill();
			}
		}

		/* matrix: columns of falling glyphs with a bright head and a fading tail */
		var GLY = '01アイウエオカキクケコサシスセソ<>/=+*#$';
		function frameMatrix(t) {
			var rgb = col.join(','), i, j, a, y, al;
			ctx.font = '14px monospace'; ctx.textAlign = 'center';
			for (i = 0; i < pts.length; i++) {
				a = pts[i]; a.y += a.sp;
				if (t - a.t > 140 || !a.g.length) { a.t = t; a.g.unshift(GLY.charAt(Math.floor(rnd() * GLY.length))); if (a.g.length > a.len) a.g.pop(); }
				if (a.y - a.len * 16 > H) { pts[i] = mk(false); pts[i].x = i * 16 + 8; pts[i].y = 0; continue; }
				for (j = 0; j < a.g.length; j++) {
					y = a.y - j * 16; if (y < -16 || y > H + 16) continue;
					al = (1 - j / a.len) * (login ? .9 : .5);
					ctx.fillStyle = j === 0 ? 'rgba(235,255,240,' + al.toFixed(3) + ')' : 'rgba(' + rgb + ',' + al.toFixed(3) + ')';
					ctx.fillText(a.g[j], a.x, y);
				}
			}
		}

		/* petals: soft leaves tumble down while turning */
		function framePetals(t) {
			var rgb = col.join(','), i, a;
			for (i = 0; i < pts.length; i++) {
				a = pts[i]; a.y += a.vy; a.x += Math.sin(t * .0007 * a.sw + a.ph) * .7 + .15; a.rot += a.vr;
				if (a.y > H + 14 || a.x > W + 20) { pts[i] = mk(false); continue; }
				ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(a.rot);
				ctx.fillStyle = 'rgba(' + rgb + ',' + (login ? .55 : .32) + ')';
				ctx.beginPath(); ctx.ellipse(0, 0, a.r, a.r * .55, 0, 0, 6.2832); ctx.fill();
				ctx.strokeStyle = 'rgba(' + rgb + ',' + (login ? .7 : .4) + ')'; ctx.lineWidth = .8;
				ctx.beginPath(); ctx.moveTo(-a.r, 0); ctx.lineTo(a.r, 0); ctx.stroke();
				ctx.restore();
			}
		}

		/* ripples: rings spread out on their own and under the cursor */
		var rings = [], nextRing = 0, lastMx = -1;
		function frameRipples(t) {
			var rgb = col.join(','), i, r, k;
			if (t > nextRing) { nextRing = t + 900 + rnd() * 1500; rings.push({ x: rnd() * W, y: rnd() * H, r: 0, max: 90 + rnd() * 120 }); }
			if (mouse.x > -1e3 && Math.abs(mouse.x - lastMx) > 140) { lastMx = mouse.x; rings.push({ x: mouse.x, y: mouse.y, r: 0, max: 110 }); }
			if (rings.length > 24) rings.shift();
			ctx.lineWidth = 1.4;
			for (i = rings.length - 1; i >= 0; i--) {
				r = rings[i]; r.r += 1.1; k = 1 - r.r / r.max;
				if (k <= 0) { rings.splice(i, 1); continue; }
				ctx.strokeStyle = 'rgba(' + rgb + ',' + (k * (login ? .6 : .32)).toFixed(3) + ')';
				ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, 6.2832); ctx.stroke();
				if (r.r > 18) { ctx.strokeStyle = 'rgba(' + rgb + ',' + (k * (login ? .35 : .18)).toFixed(3) + ')'; ctx.beginPath(); ctx.arc(r.x, r.y, r.r - 16, 0, 6.2832); ctx.stroke(); }
			}
		}

		/* orbits: dots circle a centre that slowly follows the cursor */
		var ocx = 0, ocy = 0;
		function frameOrbits(t) {
			var rgb = col.join(','), i, a, tx = mouse.x > -1e3 ? mouse.x : W / 2, ty = mouse.y > -1e3 ? mouse.y : H / 2, x, y, c, s;
			if (!ocx) { ocx = tx; ocy = ty; }
			ocx += (tx - ocx) * .04; ocy += (ty - ocy) * .04;
			for (i = 0; i < pts.length; i++) {
				a = pts[i]; a.a += a.sp * 16;
				c = Math.cos(a.tilt); s = Math.sin(a.tilt);
				x = Math.cos(a.a) * a.rad; y = Math.sin(a.a) * a.rad * a.k;
				ctx.fillStyle = 'rgba(' + rgb + ',' + (login ? .8 : .45) + ')';
				ctx.beginPath(); ctx.arc(ocx + x * c - y * s, ocy + x * s + y * c, a.r, 0, 6.2832); ctx.fill();
			}
			ctx.strokeStyle = 'rgba(' + rgb + ',' + (login ? .12 : .07) + ')'; ctx.lineWidth = 1;
			for (i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(ocx, ocy, 90 + i * 90, (90 + i * 90) * .62, i * .8, 0, 6.2832); ctx.stroke(); }
		}

		/* confetti: small coloured flakes spin down, hues spread around the accent */
		function frameConfetti(t) {
			var i, a;
			for (i = 0; i < pts.length; i++) {
				a = pts[i]; a.y += a.vy; a.x += Math.sin(t * .0008 * a.sw + a.ph) * .6; a.rot += a.vr;
				if (a.y > H + 12) { pts[i] = mk(false); continue; }
				ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(a.rot);
				ctx.fillStyle = 'hsla(' + a.hue + ',80%,' + (isDark() ? 65 : 52) + '%,' + (login ? .8 : .5) + ')';
				ctx.fillRect(-a.w / 2, -a.h / 2, a.w, a.h * Math.abs(Math.cos(t * .003 * a.sw + a.ph)) + .6);
				ctx.restore();
			}
		}

		var DRAW = { net: frameNet, fire: frameFire, bubbles: frameBubbles, snow: frameSnow, meteors: frameMeteors, rain: frameRain, sparks: frameSparks, matrix: frameMatrix, petals: framePetals, ripples: frameRipples, orbits: frameOrbits, confetti: frameConfetti }[kind] || frameNet;

		function frame(t) {
			S.raf = window.requestAnimationFrame(frame);
			if (document.hidden) return;
			if (t - colAt > 1500) { col = accentRgb(); colAt = t; }
			ctx.clearRect(0, 0, W, H);
			DRAW(t);
		}

		S.size();
		window.addEventListener('resize', S.size);
		window.addEventListener('pointermove', S.move, { passive: true });
		window.addEventListener('pointerleave', S.leave);
		S.raf = window.requestAnimationFrame(frame);
	}

	function syncConst() {
		if (!document.body) return;

		var want = null;
		if (!root.hasAttribute('data-nf-motion')) {
			if (document.body.classList.contains('nf-blank') && prefs.constLogin !== false) want = 'login';
			else if (document.body.classList.contains('nf-app') && prefs.constApp) want = 'app';
		}

		var kind = pick(prefs.constKind, CONST_KINDS, 'net');
		if (cst && (cst.mode !== want || cst.kind !== kind)) stopConst();
		if (want && !cst) startConst(want, kind);
	}

	document.addEventListener('DOMContentLoaded', syncConst);

	/* Entrance animations are for the first paint only. LuCI re-creates whole blocks on every
	   poll (status pages every 5 s), and replaying the fade/rise each time made the panel twitch. */
	document.addEventListener('DOMContentLoaded', function () {
		window.setTimeout(function () { root.setAttribute('data-nf-settled', '1'); }, 2500);
	});

	var FONT = { sm: .92, md: 1, lg: 1.1 };
	function pick(v, list, def) { return list.indexOf(v) >= 0 ? v : def; }


	/* ---- "Day/night" and "Weather" backgrounds ---- */
	var TILE_NAMES = { net: 'Internet', wan: 'WAN traffic', cpu: 'CPU', temp: 'Temperature', mem: 'Memory', ct: 'Connections', up: 'Uptime', cli: 'Wi‑Fi clients', loss: 'Packet loss', sig: 'Wi‑Fi signal', day: 'Traffic today', stor: 'Storage' };
	/* one-click "Now" layouts: which tiles are visible, in what order, and how many card columns */
	var LAYOUTS = [
		[ 'std', 'Standard', { ovOrder: DEFAULTS.ovOrder, ovHide: DEFAULTS.ovHide, ovCols: '0', ovSize: 'md' } ],
		[ 'home', 'Home', { ovOrder: 'net,wan,day,cli,up,temp,cpu,mem,ct,loss,sig,stor', ovHide: 'cpu,mem,ct,loss,sig,stor', ovCols: '0', ovSize: 'md' } ],
		[ 'min', 'Minimal', { ovOrder: 'net,wan,cpu,temp,mem,ct,up,cli,loss,sig,day,stor', ovHide: 'temp,mem,ct,up,cli,loss,sig,day,stor', ovCols: '2', ovSize: 'sm' } ],
		[ 'admin', 'Admin', { ovOrder: 'net,wan,cpu,temp,mem,ct,up,cli,loss,sig,day,stor', ovHide: '', ovCols: '3', ovSize: 'md' } ]
	];
	var WX_CITIES = [ [ 'Belgorod', '50.60', '36.59' ], [ 'Stroitel (Yakovlevsky district)', '50.79', '36.49' ], [ 'Moscow', '55.75', '37.62' ], [ 'Saint Petersburg', '59.94', '30.31' ], [ 'Novosibirsk', '55.03', '82.92' ], [ 'Yekaterinburg', '56.84', '60.61' ], [ 'Kazan', '55.79', '49.12' ],
		[ 'Nizhny Novgorod', '56.33', '44.0' ], [ 'Chelyabinsk', '55.16', '61.4' ], [ 'Samara', '53.2', '50.15' ], [ 'Omsk', '54.99', '73.37' ], [ 'Rostov-on-Don', '47.24', '39.71' ], [ 'Ufa', '54.74', '55.97' ],
		[ 'Krasnoyarsk', '56.01', '92.85' ], [ 'Voronezh', '51.67', '39.18' ], [ 'Perm', '58.01', '56.23' ], [ 'Volgograd', '48.71', '44.51' ], [ 'Krasnodar', '45.04', '38.98' ], [ 'Saratov', '51.53', '46.03' ],
		[ 'Tyumen', '57.15', '65.53' ], [ 'Izhevsk', '56.85', '53.2' ], [ 'Barnaul', '53.35', '83.77' ], [ 'Irkutsk', '52.29', '104.3' ], [ 'Khabarovsk', '48.48', '135.08' ], [ 'Vladivostok', '43.12', '131.89' ],
		[ 'Yaroslavl', '57.63', '39.87' ], [ 'Kaliningrad', '54.71', '20.51' ], [ 'Murmansk', '68.97', '33.07' ], [ 'Sochi', '43.6', '39.73' ], [ 'Minsk', '53.9', '27.57' ], [ 'Almaty', '43.24', '76.89' ], [ 'Kyiv', '50.45', '30.52' ] ];
	var wxCode = '', wxTimer = 0, wxAt = 0;
	function todPhase() { var hr = new Date().getHours(); return hr >= 5 && hr < 8 ? 'dawn' : hr >= 8 && hr < 17 ? 'day' : hr >= 17 && hr < 21 ? 'dusk' : 'night'; }
	function wxKind(code, day) {
		if (code === 0 || code === 1) return day ? 'sun' : 'clear';
		if (code === 2 || code === 3) return 'cloud';
		if (code === 45 || code === 48) return 'fog';
		if (code >= 95) return 'storm';
		if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
		if (code >= 51) return 'rain';
		return 'cloud';
	}
	/* WWO codes (wttr.in) → our weather kinds */
	function wwoKind(c, day) {
		if (c === 113) return day ? 'sun' : 'clear';
		if (c === 116 || c === 119 || c === 122) return 'cloud';
		if (c === 143 || c === 248 || c === 260) return 'fog';
		if (c === 200 || (c >= 386 && c <= 395)) return 'storm';
		if ([ 179, 182, 185, 227, 230, 323, 326, 329, 332, 335, 338, 350, 368, 371, 374, 377 ].indexOf(c) >= 0) return 'snow';
		if (c >= 176) return 'rain';
		return 'cloud';
	}
	function wxDone(kind, la, lo) {
		wxCode = kind; wxAt = Date.now();
		try { window.sessionStorage.setItem('nightfall-wx', JSON.stringify({ k: wxCode, t: wxAt, la: la, lo: lo })); } catch (e) { /* ignore */ }
		skyUpdate(); return true;
	}
	function getJson(url) { return window.fetch(url, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('http'); return r.json(); }); }
	function wxFetch() {
		var la = parseFloat(prefs.wxLat), lo = parseFloat(prefs.wxLon);
		if (!window.fetch || !isFinite(la) || !isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) return Promise.resolve(false);
		/* Open-Meteo first; if unavailable (often blocked in Russia), wttr.in */
		return getJson('https://api.open-meteo.com/v1/forecast?latitude=' + la.toFixed(2) + '&longitude=' + lo.toFixed(2) + '&current=weather_code,is_day')
			.then(function (j) { var c = j && j.current; if (!c) throw new Error('no'); return wxDone(wxKind(+c.weather_code, +c.is_day === 1), la, lo); })
			.catch(function () {
				return getJson('https://wttr.in/' + la.toFixed(2) + ',' + lo.toFixed(2) + '?format=j1')
					.then(function (j) { var c = j && j.current_condition && j.current_condition[0]; if (!c) throw new Error('no'); return wxDone(wwoKind(+c.weatherCode, todPhase() !== 'night'), la, lo); });
			}).catch(function () { return false; });
	}
	function skyUpdate() {
		root.setAttribute('data-nf-tod', todPhase());
		if (prefs.bg === 'weather') {
			if (!wxCode) { try { var c = JSON.parse(window.sessionStorage.getItem('nightfall-wx') || 'null'); if (c && Date.now() - c.t < 1800000) { wxCode = c.k; wxAt = c.t; } } catch (e) { /* ignore */ } }
			root.setAttribute('data-nf-wx', wxCode || (todPhase() === 'night' ? 'clear' : 'sun'));
			if (!wxCode || Date.now() - wxAt > 1800000) wxFetch();
		}
		else root.removeAttribute('data-nf-wx');
		if (!wxTimer && (prefs.bg === 'weather' || prefs.bg === 'tod')) wxTimer = setInterval(function () { skyUpdate(); }, 300000);
	}
	function applyLook() {
		var d = pick(prefs.density, [ 'normal', 'compact' ], 'normal'), f = pick(prefs.font, [ 'sm', 'md', 'lg' ], 'md');
		var r = pick(prefs.radius, [ 'sharp', 'md', 'round' ], 'md'), g = pick(prefs.glass, [ 'on', 'off' ], 'on');
		var on = function (v) { return v === false ? 'off' : 'on'; };

		root.setAttribute('data-nf-density', d);
		root.setAttribute('data-nf-radius', r);
		root.setAttribute('data-nf-glass', g);
		root.setAttribute('data-nf-login-clock', on(prefs.loginClock));
		root.setAttribute('data-nf-login-info', on(prefs.loginInfo));
		root.setAttribute('data-nf-login-bg', pick(prefs.loginBg, [ 'mica', 'flat', 'aurora', 'waves', 'tod', 'rain', 'sunset', 'mountains', 'city', 'space', 'lava', 'cyber', 'rainglass', 'forest', 'fogmount', 'underwater', 'photo' ], 'mica'));
		root.setAttribute('data-nf-tod', todPart());
		root.setAttribute('data-nf-ov-wide', prefs.ovWide ? 'on' : 'off');
		root.setAttribute('data-nf-ov-cols', pick(String(prefs.ovCols), [ '0', '1', '2', '3' ], '0'));
		applyLogo();
		root.setAttribute('data-nf-ov-live', on(prefs.ovLive));
		root.setAttribute('data-nf-ov-badges', on(prefs.ovBadges));
		root.setAttribute('data-nf-ov-size', pick(prefs.ovSize, [ 'sm', 'md', 'lg' ], 'md'));
		[ 'Top', 'Apps', 'Block', 'Wifi', 'Events', 'Health', 'Quick' ].forEach(function (k) { root.setAttribute('data-nf-ov-' + k.toLowerCase(), on(prefs['ov' + k])); });
		root.setAttribute('data-nf-hints', on(prefs.hints));
		root.setAttribute('data-nf-gtone', pick(prefs.glassTone, [ 'auto', 'light', 'dark' ], 'auto'));
		root.style.setProperty('--nf-gblur', Math.max(0, Math.min(60, +prefs.glassBlur || 0)) + 'px');
		root.style.setProperty('--nf-gk', String(Math.max(30, Math.min(170, +prefs.glassAlpha || 100)) / 100));
		root.setAttribute('data-nf-style', pick(prefs.style, [ '', 'glass', 'mac' ], ''));
		root.setAttribute('data-nf-chart', pick(prefs.chart, [ 'area', 'line', 'bars', 'step' ], 'area'));
		root.setAttribute('data-nf-lw', pick(String(prefs.chartW), [ '1', '2', '3' ], '2'));
		root.setAttribute('data-nf-grid', prefs.chartGrid === false ? 'off' : 'on');
		root.setAttribute('data-nf-thr', prefs.chartThr ? 'on' : 'off');
		root.setAttribute('data-nf-shine', prefs.chartShine === false ? 'off' : 'on');
		[ 'Cpu', 'Temp', 'Mem' ].forEach(function (k) { root.setAttribute('data-nf-thr-' + k.toLowerCase(), String(prefs['ovThr' + k] || DEFAULTS['ovThr' + k])); });
		var ord = String(prefs.ovOrder || DEFAULTS.ovOrder).split(',').filter(function (k) { return TILE_NAMES[k]; });
		Object.keys(TILE_NAMES).forEach(function (k) { if (ord.indexOf(k) < 0) ord.push(k); });
		ord.forEach(function (k, i) { root.style.setProperty('--nf-ord-' + k, String(i)); });
		root.setAttribute('data-nf-hide', ' ' + String(prefs.ovHide == null ? DEFAULTS.ovHide : prefs.ovHide).split(',').filter(function (k) { return TILE_NAMES[k]; }).join(' ') + ' ');
		root.setAttribute('data-nf-lay', prefs.ovLay || '');
		root.setAttribute('data-nf-ring', prefs.ovRing === false ? 'off' : 'on');
		skyUpdate();
		root.setAttribute('data-nf-chart-smooth', prefs.chartSmooth === false ? 'off' : 'on');
		root.setAttribute('data-nf-gpal', pick(prefs.chartPal, [ 'accent', 'vivid', 'mono', 'warm', 'cool', 'sunset', 'neon', 'pastel', 'nord', 'dracula' ], 'accent'));
		root.setAttribute('data-nf-nav', prefs.navMini ? 'mini' : 'full');
		root.setAttribute('data-nf-netbar', on(prefs.netBar));
		root.setAttribute('data-nf-const', prefs.constApp ? 'app' : 'login');
		root.style.setProperty('--nf-fsz', String(FONT[f]));
	}


	/* ---- custom theme editor: colors, corner radius, font and shadows on top of the chosen base ---- */
	var CUS_VARS = [ '--nf-bg', '--nf-bg-glow', '--nf-bg-glow2', '--nf-card', '--nf-card-alt', '--nf-flyout', '--nf-header-bg', '--nf-text', '--nf-text-dim', '--nf-stroke', '--nf-stroke-strong',
		'--nf-hover', '--nf-ctrl', '--nf-ctrl-hover', '--nf-ctrl-active', '--nf-input-bg', '--nf-input-line', '--nf-info-bg', '--background-color-high', '--background-color-medium', '--background-color-low',
		'--text-color-highest', '--text-color-high', '--text-color-medium', '--text-color-low', '--nf-radius', '--nf-radius-sm', '--nf-radius-in', '--font-sans', '--nf-shadow-card' ];
	var CUS_FONTS = { system: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
		rounded: 'ui-rounded, "SF Pro Rounded", "Nunito", "Varela Round", system-ui, -apple-system, "Segoe UI", sans-serif',
		serif: '"Iowan Old Style", "Palatino Linotype", Georgia, "Times New Roman", serif',
		humanist: '"Gill Sans", "Gill Sans MT", "Trebuchet MS", "Segoe UI", Candara, sans-serif',
		mono: 'var(--font-mono)' };
	var CUS_SHADOWS = { none: 'none', soft: '0 2px 10px rgba(0, 0, 0, .08)', deep: '0 10px 30px rgba(0, 0, 0, .22), 0 2px 6px rgba(0, 0, 0, .12)' };
	function hex6(v) { return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : ''; }
	/* font and icon style are separate settings that work with any theme */
	function applyFont() {
		var f = prefs.fontFam;
		if (f && CUS_FONTS[f]) root.style.setProperty('--font-sans', CUS_FONTS[f]);
		else if (!(prefs.cusOn && CUS_FONTS[prefs.cusFont]) && !CUS_FONTS[prefs.cusFont]) root.style.removeProperty('--font-sans');
		root.setAttribute('data-nf-ic', pick(prefs.icStyle, [ 'line', 'duo', 'big' ], 'line'));
	}
	function applyCustom() {
		var st = root.style;
		CUS_VARS.forEach(function (n) { st.removeProperty(n); });
		root.removeAttribute('data-nf-cus');
		if (!prefs.cusOn) return;
		var bg = hex6(prefs.cusBg), card = hex6(prefs.cusCard), tx = hex6(prefs.cusText), mix = function (a, pc, b) { return 'color-mix(in srgb, ' + a + ' ' + pc + '%, ' + b + ')'; };
		if (bg) {
			st.setProperty('--nf-bg', bg); st.setProperty('--nf-bg-glow', mix('var(--nf-accent)', 14, bg)); st.setProperty('--nf-bg-glow2', mix('var(--nf-accent)', 7, bg));
			st.setProperty('--nf-header-bg', mix(bg, 78, 'transparent')); st.setProperty('--background-color-medium', bg);
			if (!card) card = mix('var(--nf-text)', 4, bg);
		}
		if (card) {
			st.setProperty('--nf-card', card); st.setProperty('--nf-flyout', card); st.setProperty('--background-color-high', card);
			st.setProperty('--nf-card-alt', mix('var(--nf-text)', 4, card)); st.setProperty('--nf-info-bg', mix('var(--nf-text)', 4, card));
			st.setProperty('--nf-ctrl', mix('var(--nf-text)', 5, card)); st.setProperty('--nf-ctrl-hover', mix('var(--nf-text)', 9, card)); st.setProperty('--nf-ctrl-active', mix('var(--nf-text)', 3, card));
			st.setProperty('--nf-input-bg', mix('var(--nf-text)', 5, card)); st.setProperty('--background-color-low', mix('var(--nf-text)', 4, card));
		}
		if (tx) {
			var base = card || bg || 'transparent';
			st.setProperty('--nf-text', tx); st.setProperty('--nf-text-dim', mix(tx, 66, base)); st.setProperty('--nf-stroke', mix(tx, 12, 'transparent'));
			st.setProperty('--nf-stroke-strong', mix(tx, 24, 'transparent')); st.setProperty('--nf-hover', mix(tx, 7, 'transparent')); st.setProperty('--nf-input-line', mix(tx, 50, 'transparent'));
			st.setProperty('--text-color-highest', tx); st.setProperty('--text-color-high', tx); st.setProperty('--text-color-medium', mix(tx, 66, base)); st.setProperty('--text-color-low', mix(tx, 40, base));
		}
		var r = Math.max(0, Math.min(28, +prefs.cusRadius || 0));
		if (r) { st.setProperty('--nf-radius', r + 'px'); st.setProperty('--nf-radius-sm', Math.max(2, Math.round(r / 2)) + 'px'); st.setProperty('--nf-radius-in', Math.round(r * .65) + 'px'); root.setAttribute('data-nf-radius', 'md'); }
		if (CUS_FONTS[prefs.cusFont]) st.setProperty('--font-sans', CUS_FONTS[prefs.cusFont]);
		if (CUS_SHADOWS[prefs.cusShadow]) st.setProperty('--nf-shadow-card', CUS_SHADOWS[prefs.cusShadow]);
		root.setAttribute('data-nf-cus', '1');
	}

	/* ---- custom photo on the sign-in screen: same approach as the logo (copy in the browser and on the router, bg.json) ---- */
	var PHOTOKEY = 'nightfall-photo-v1';
	function applyPhoto() {
		var d = null;
		try { d = window.localStorage.getItem(PHOTOKEY); } catch (e) { /* ignore */ }
		if (prefs.loginBg === 'photo' && d && /^data:image\/(webp|jpeg);base64,[A-Za-z0-9+\/=]+$/.test(d)) root.style.setProperty('--nf-photo', 'url("' + d + '")');
		else root.style.removeProperty('--nf-photo');
	}
	function fetchPhoto() {
		if (prefs.loginBg !== 'photo' || !window.fetch) return;
		try { if (window.localStorage.getItem(PHOTOKEY)) return; } catch (e) { return; }
		window.fetch(BASE + 'bg.json?' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
			if (d && typeof d.d === 'string') { try { window.localStorage.setItem(PHOTOKEY, d.d); } catch (e) { /* ignore */ } applyPhoto(); }
		}).catch(function () { /* no photo on the router */ });
	}
	function readPhoto(file, done) {
		var img = new Image(), url = window.URL.createObjectURL(file);
		img.onload = function () {
			var side = 1280, q = .7, out = '';
			for (var i = 0; i < 7; i++) {
				var sc = Math.min(1, side / Math.max(img.width, img.height));
				var cv = document.createElement('canvas');
				cv.width = Math.max(1, Math.round(img.width * sc)); cv.height = Math.max(1, Math.round(img.height * sc));
				cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
				out = cv.toDataURL('image/webp', q);
				if (out.indexOf('data:image/webp') !== 0) out = cv.toDataURL('image/jpeg', q);
				if (out.length <= 100000) break;
				side = Math.round(side * .8); q = Math.max(.4, q - .06);
			}
			window.URL.revokeObjectURL(url);
			done(out.length <= 110000 ? out : null);
		};
		img.onerror = function () { window.URL.revokeObjectURL(url); done(null); };
		img.src = url;
	}

	function applyAll() { root.setAttribute('data-nf-nav-open', prefs.navOpenMode === 'hover' ? 'hover' : 'click'); applyMode(); applyMotion(); applyBg(); applyLook(); applyCustom(); applyFont(); applyPhoto(); syncConst(); try { document.dispatchEvent(new CustomEvent('nf-prefs')); } catch (e) { /* old browser */ } }

	var txTimer;
	function themeFade() {
		var h = document.documentElement;
		if (h.getAttribute('data-nf-motion') === 'off') return;
		h.classList.add('nf-tx'); clearTimeout(txTimer);
		txTimer = setTimeout(function () { h.classList.remove('nf-tx'); }, 600);
	}

	function set(key, value) {
		if (key !== 'wxLat' && key !== 'wxLon') themeFade();
		prefs[key] = value;
		if (key === 'radius') prefs.cusRadius = 0;
		if (key === 'ovOrder' || key === 'ovHide') prefs.ovLay = '';
		if (key !== 'preset' && key !== 'schedule' && key !== 'nightFrom' && key !== 'dayFrom' && key !== 'mode' && key !== 'navMini' && key !== 'navOpenMode' && key !== 'netBar' && key !== 'swipe' && key !== 'fontFam' && key !== 'icStyle' && key.indexOf('login') !== 0 && key.indexOf('const') !== 0 && key.indexOf('ov') !== 0) prefs.preset = '';
		save();
		applyAll();
		refreshPanel();
	}

	function applyLayout(name) {
		var l = LAYOUTS.filter(function (x) { return x[0] === name; })[0];
		if (!l) return;
		themeFade();
		Object.assign(prefs, l[2], { ovLay: name });
		save(); applyAll(); refreshPanel();
	}

	if (mq.addEventListener) mq.addEventListener('change', applyMode);
	if (mqMotion.addEventListener) mqMotion.addEventListener('change', applyMotion);

	/* changes made in another tab */
	window.addEventListener('storage', function (ev) {
		if (ev.key === KEY) { prefs = load(); applyAll(); refreshPanel(); }
	});

	applyAll();
	window.setInterval(function () { if (prefs.schedule) applyMode(); }, 30000);

	/* ---------- personalisation panel ---------- */
	var pop = null, btn = null;

	function h(tag, attrs, kids) {
		var el = document.createElement(tag);
		Object.keys(attrs || {}).forEach(function (k) {
			if (k === 'text') el.textContent = attrs[k];
			else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), attrs[k]);
			else el.setAttribute(k, attrs[k]);
		});
		(kids || []).forEach(function (c) { if (c) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
		return el;
	}

	var refs = {};

	function buildPanel() {
		refs.mode = {};
		refs.sw = [];

		var seg = h('div', { 'class': 'nf-seg', role: 'group', 'aria-label': 'Mode' }, [
			[ 'auto', 'Auto' ], [ 'light', 'Light' ], [ 'dark', 'Dark' ]
		].map(function (m) {
			return refs.mode[m[0]] = h('button', { type: 'button', text: m[1], onclick: function () { set('mode', m[0]); } });
		}));

		var grid = h('div', { 'class': 'nf-swatches' }, ACCENTS.map(function (a) {
			var b = h('button', { type: 'button', 'class': 'nf-sw', title: a[1], 'aria-label': a[1], style: '--c:' + (a[2] || a[0]),
				onclick: function () { set('accent', a[0]); } });
			refs.sw.push([ a[0], b ]);
			return b;
		}));

		refs.color = h('input', { type: 'color', 'class': 'nf-color', 'aria-label': 'Custom color',
			oninput: function (ev) { set('accent', ev.target.value); } });

		refs.bg = {};
		var bgseg = h('div', { 'class': 'nf-seg nf-seg-wrap', role: 'group', 'aria-label': 'Background' }, BGS.map(function (b) {
			return refs.bg[b[0]] = h('button', { type: 'button', text: b[1], onclick: function () { set('bg', b[0]); } });
		}));
		refs.scale = h('input', { type: 'range', min: '40', max: '250', step: '10', 'aria-label': 'Pattern scale',
			oninput: function (ev) { set('bgScale', +ev.target.value); } });

		function seg2(key, label, items, grid) {
			var m = refs[key] = {};
			var el = h('div', { 'class': 'nf-seg' + (grid ? ' nf-seg-grid' : ''), role: 'group', 'aria-label': label }, items.map(function (i) {
				return m[i[0]] = h('button', { type: 'button', text: i[1], onclick: function () { set(key, i[0]); } });
			}));
			return [ h('div', { 'class': 'nf-pop-l', text: label }), el ];
		}
		function sw(key, label) {
			var c = refs[key] = h('input', { type: 'checkbox', onchange: function (ev) { set(key, ev.target.checked); } });
			return h('label', { 'class': 'nf-pop-row' }, [ h('span', { text: label }), h('span', { 'class': 'cbi-checkbox' }, [ c ]) ]);
		}
		refs.preset = {};
		var presets = h('div', { 'class': 'nf-seg nf-presets', role: 'group', 'aria-label': 'Style' }, PRESETS.map(function (pr) {
			return refs.preset[pr[0]] = h('button', { type: 'button', text: pr[1], onclick: function () {
				Object.assign(prefs, { cusOn: false, cusBg: '', cusCard: '', cusText: '', cusFont: '', cusRadius: 0 }, pr[2], { preset: pr[0] }); save(); applyAll(); refreshPanel();
			} });
		}));
		refs.schedule = h('input', { type: 'checkbox', onchange: function (ev) { set('schedule', ev.target.checked); } });
		var tin = function (key) {
			return refs[key] = h('input', { type: 'time', 'class': 'nf-time', 'aria-label': key === 'nightFrom' ? 'Dark from' : 'Light from',
				oninput: function (ev) { if (/^\d\d:\d\d$/.test(ev.target.value)) set(key, ev.target.value); } });
		};
		var sched = h('div', { 'class': 'nf-pop-sec' }, [
			h('label', { 'class': 'nf-pop-row' }, [ h('span', { text: 'Dark on a schedule' }), h('span', { 'class': 'cbi-checkbox' }, [ refs.schedule ]) ]),
			h('div', { 'class': 'nf-pop-times', 'data-sched': '' }, [ h('span', { text: 'Dark from' }), tin('nightFrom'), h('span', { text: 'light from' }), tin('dayFrom') ])
		]);
		function rng(label, input, unit) {
			input.setAttribute('data-unit', unit);
			return h('label', { 'class': 'nf-rng' }, [ h('span', { 'class': 'nf-rng-t' }, [ h('span', { text: label }), h('output', { 'class': 'nf-rng-v' }) ]), input ]);
		}
		refs.gblur = h('input', { type: 'range', min: '0', max: '48', step: '2', 'aria-label': 'Glass blur', oninput: function (ev) { set('glassBlur', +ev.target.value); } });
		refs.galpha = h('input', { type: 'range', min: '40', max: '160', step: '10', 'aria-label': 'Glass opacity', oninput: function (ev) { set('glassAlpha', +ev.target.value); } });
		refs.install = h('button', { type: 'button', 'class': 'nf-pop-reset', hidden: '', text: 'Install as an app', onclick: function () {
			if (!installEvt) return; installEvt.prompt(); installEvt = null; refs.install.hidden = true;
		} });
		var look = [].concat(
			seg2('density', 'Density', [ [ 'normal', 'Normal' ], [ 'compact', 'Compact' ] ]),
			seg2('font', 'Text size', [ [ 'sm', 'Smaller' ], [ 'md', 'Normal' ], [ 'lg', 'Larger' ] ]),
			seg2('fontFam', 'Font', [ [ '', 'Theme default' ], [ 'system', 'System' ], [ 'rounded', 'Rounded' ], [ 'humanist', 'Humanist' ], [ 'serif', 'Serif' ], [ 'mono', 'Mono' ] ], true),
			seg2('icStyle', 'Icons', [ [ 'line', 'Line' ], [ 'duo', 'Gradient' ], [ 'big', 'Large' ] ]),
			seg2('radius', 'Corner radius', [ [ 'sharp', 'Sharp' ], [ 'md', 'Medium' ], [ 'round', 'Round' ] ]),
			seg2('glass', 'Glass and blur', [ [ 'on', 'On' ], [ 'off', 'Off' ] ]),
			seg2('chart', 'Charts', [ [ 'area', 'Area' ], [ 'line', 'Line' ], [ 'bars', 'Bars' ], [ 'step', 'Steps' ] ], true),
			seg2('chartPal', 'Chart colors', [ [ 'accent', 'Accent' ], [ 'vivid', 'Vivid' ], [ 'mono', 'Mono' ], [ 'warm', 'Warm' ], [ 'cool', 'Cool' ], [ 'sunset', 'Sunset' ], [ 'neon', 'Neon' ], [ 'pastel', 'Pastel' ], [ 'nord', 'Nord' ], [ 'dracula', 'Dracula' ] ], true),
			[ sw('chartSmooth', 'Smooth chart lines'), sw('chartGrid', 'Chart grid'), sw('ovRing', 'Rings on Overview tiles'), sw('chartThr', 'Line color by load (green, yellow, red)'), sw('chartShine', 'Moving shine along the line') ],
			seg2('chartW', 'Line width', [ [ '1', 'Thin' ], [ '2', 'Normal' ], [ '3', 'Thick' ] ]),
			seg2('glassTone', 'Glass tint', [ [ 'auto', 'Auto' ], [ 'light', 'Light' ], [ 'dark', 'Dark' ] ]),
			[ rng('Blur', refs.gblur, 'px'), rng('Glass opacity', refs.galpha, '%') ]
		);
		/* what the sign-in cards show, and a custom image instead of the logo */
		var CELL_OPTS = [ [ 'net', 'Internet (ping)' ], [ 'speed', 'Current speed' ], [ 'test', 'Last speed test' ], [ 'up', 'Uptime' ], [ 'fw', 'Firmware' ], [ 'temp', 'Temperature' ], [ 'cpu', 'CPU' ], [ 'mem', 'Memory' ], [ 'clients', 'Devices on the network' ], [ 'none', '— empty —' ] ];
		function loginExtras() {
			var arr = [ h('div', { 'class': 'nf-pop-l', text: 'Sign-in cards' }) ];
			refs.cells = [];
			[ 0, 1, 2 ].forEach(function (i) {
				var sel = h('select', { 'class': 'nf-sel', 'aria-label': 'Card ' + (i + 1), onchange: function (ev) {
					var c = (Array.isArray(prefs.loginCells) ? prefs.loginCells : [ 'net', 'up', 'fw' ]).slice(); while (c.length < 3) c.push('none');
					c[i] = ev.target.value; set('loginCells', c);
				} }, CELL_OPTS.map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
				refs.cells.push(sel);
				arr.push(h('label', { 'class': 'nf-pop-row' }, [ h('span', { text: 'Card ' + (i + 1) }), sel ]));
			});
			refs.logoNote = h('div', { 'class': 'nf-pop-note', text: '' });
			var file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/svg+xml,image/gif', hidden: true, onchange: function (ev) {
				var f = ev.target.files && ev.target.files[0]; ev.target.value = '';
				if (!f) return;
				refs.logoNote.textContent = 'Processing the image…';
				readLogo(f, function (d) {
					if (!d) { refs.logoNote.textContent = 'Could not read the image. Try a smaller PNG or JPG.'; return; }
					try { window.localStorage.setItem(LOGOKEY, d); } catch (e) { /* private mode */ }
					routerExec([ 'logo-set', d ]).then(function () { refs.logoNote.textContent = 'The image is also saved on the router: it shows at sign-in in any browser.'; })
						.catch(function (e) { refs.logoNote.textContent = 'The image works in this browser. Not saved on the router: ' + e.message; });
					set('loginLogo', true);
				});
			} });
			arr.push(h('div', { 'class': 'nf-pop-l', text: 'Custom sign-in image' }));
			arr.push(h('div', { 'class': 'nf-logo-row' }, [
				h('button', { type: 'button', 'class': 'cbi-button', text: 'Choose image', onclick: function () { file.click(); } }),
				h('button', { type: 'button', 'class': 'cbi-button', text: 'Remove', onclick: function () {
					try { window.localStorage.removeItem(LOGOKEY); } catch (e) { /* ignore */ }
					routerExec([ 'logo-set', 'off' ]).catch(function () { /* nothing to remove */ });
					refs.logoNote.textContent = '';
					set('loginLogo', false);
				} }), file ]));
			arr.push(refs.logoNote);
			/* custom photo for the sign-in background (the "Custom photo" choice above) */
			refs.photoNote = h('div', { 'class': 'nf-pop-note', text: '' });
			var pfile = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', hidden: true, onchange: function (ev) {
				var f = ev.target.files && ev.target.files[0]; ev.target.value = '';
				if (!f) return;
				refs.photoNote.textContent = 'Processing the photo…';
				readPhoto(f, function (d) {
					if (!d) { refs.photoNote.textContent = 'Could not resize the photo. Try another one.'; return; }
					try { window.localStorage.setItem(PHOTOKEY, d); } catch (e) { /* private mode */ }
					routerExec([ 'bg-set', d ]).then(function () { refs.photoNote.textContent = 'The photo is also saved on the router: it shows at sign-in in any browser.'; })
						.catch(function (e) { refs.photoNote.textContent = 'The photo works in this browser. Not saved on the router: ' + e.message; });
					set('loginBg', 'photo');
				});
			} });
			arr.push(h('div', { 'class': 'nf-pop-l', text: 'Custom sign-in background photo' }));
			arr.push(h('div', { 'class': 'nf-logo-row' }, [
				h('button', { type: 'button', 'class': 'cbi-button', text: 'Choose photo', onclick: function () { pfile.click(); } }),
				h('button', { type: 'button', 'class': 'cbi-button', text: 'Remove', onclick: function () {
					try { window.localStorage.removeItem(PHOTOKEY); } catch (e) { /* ignore */ }
					routerExec([ 'bg-set', 'off' ]).catch(function () { /* nothing to remove */ });
					refs.photoNote.textContent = '';
					if (prefs.loginBg === 'photo') set('loginBg', 'mica'); else applyPhoto();
				} }), pfile ]));
			arr.push(refs.photoNote);
			return arr;
		}
		var more = h('div', { 'class': 'nf-pop-sec' }, [
			h('div', { 'class': 'nf-pop-l', text: 'Sign-in screen' }),
			sw('loginClock', 'Clock and date'), sw('loginInfo', 'Router summary'), sw('constLogin', 'Animated background')
		].concat(seg2('constKind', 'Animation', [ [ 'net', 'Constellations' ], [ 'fire', 'Fireflies' ], [ 'bubbles', 'Bubbles' ], [ 'snow', 'Snow' ], [ 'meteors', 'Shooting stars' ], [ 'rain', 'Rain' ], [ 'sparks', 'Sparks' ], [ 'matrix', 'Code' ], [ 'petals', 'Petals' ], [ 'ripples', 'Ripples' ], [ 'orbits', 'Orbits' ], [ 'confetti', 'Confetti' ] ], true)).concat(seg2('loginBg', 'Sign-in background', [ [ 'mica', 'Theme default' ], [ 'flat', 'Solid' ], [ 'aurora', 'Aurora' ], [ 'waves', 'Waves' ], [ 'tod', 'Time of day' ], [ 'rain', 'Rain' ], [ 'sunset', 'Sunset' ], [ 'mountains', 'Mountains' ], [ 'city', 'City' ], [ 'space', 'Space' ], [ 'lava', 'Lava' ], [ 'cyber', 'Synthwave' ], [ 'rainglass', 'Downpour' ], [ 'forest', 'Forest' ], [ 'fogmount', 'Fog' ], [ 'underwater', 'Deep sea' ], [ 'photo', 'Custom photo' ] ], true)).concat(loginExtras()));
		function desk(nodes) { nodes = [].concat(nodes); nodes.forEach(function (n) { if (n && n.classList) n.classList.add('nf-desk'); }); return nodes; }   /* desktop-only items: hidden on phones */
		var ov = h('div', { 'class': 'nf-pop-sec' }, [
			h('div', { 'class': 'nf-pop-l', text: 'Show on Overview' }),
			sw('ovLive', '"Now" strip'), sw('ovBadges', 'Color badges'),
			sw('ovTop', 'Top clients'), sw('ovApps', 'App traffic'), sw('ovBlock', 'Internet access'), sw('ovWifi', 'Wi‑Fi now'), sw('ovHealth', 'Router health'), sw('ovEvents', 'Event feed'), sw('ovQuick', 'Quick actions')
		]);
		/* tile color thresholds and tile order */
		var thrBox = h('div', { 'class': 'nf-pop-sec' }), ordBox = h('div', { 'class': 'nf-pop-sec' });
		function thrRow(key, label, lo, hi) {
			var v = String(prefs[key] || DEFAULTS[key]).split(','), a, b;
			function save() {
				var m = parseFloat(a.value), r = parseFloat(b.value);
				if (!isFinite(m) || !isFinite(r)) return;
				m = Math.max(1, Math.min(m, r - 1)); r = Math.max(m + 1, Math.min(r, 150));
				set(key, m + ',' + r);
			}
			a = h('input', { type: 'number', inputmode: 'decimal', min: lo, max: hi, value: v[0], 'aria-label': label + ': warning', onchange: save });
			b = h('input', { type: 'number', inputmode: 'decimal', min: lo, max: hi, value: v[1], 'aria-label': label + ': overload', onchange: save });
			return h('div', { 'class': 'nf-thr-row' }, [ h('span', { text: label }), h('label', {}, [ h('i', { 'class': 'nf-thr-d mid' }), a ]), h('label', {}, [ h('i', { 'class': 'nf-thr-d bad' }), b ]) ]);
		}
		function renderOv() {
			thrBox.replaceChildren.apply(thrBox, [ h('div', { 'class': 'nf-pop-l', text: 'Tile color thresholds' }),
				thrRow('ovThrCpu', 'CPU, %', 5, 100), thrRow('ovThrTemp', 'Temperature, °C', 20, 120), thrRow('ovThrMem', 'Memory, %', 5, 100),
				h('div', { 'class': 'nf-pop-note', text: 'Yellow means "warning", red means "overload". Works when color badges are on.' }),
				h('div', { 'class': 'nf-pop-io' }, [ h('button', { type: 'button', text: 'Reset thresholds', onclick: function (ev) { ev.stopPropagation(); set('ovThrCpu', DEFAULTS.ovThrCpu); set('ovThrTemp', DEFAULTS.ovThrTemp); set('ovThrMem', DEFAULTS.ovThrMem); renderOv(); } }) ]) ]);
			var ord = String(prefs.ovOrder || DEFAULTS.ovOrder).split(',').filter(function (k) { return TILE_NAMES[k]; });
			Object.keys(TILE_NAMES).forEach(function (k) { if (ord.indexOf(k) < 0) ord.push(k); });
			function arrow(t, lbl, off, fn) { var o = { type: 'button', text: t, 'aria-label': lbl, onclick: function (ev) { ev.stopPropagation(); fn(); } }; if (off) o.disabled = 'disabled'; return h('button', o); }
			function move(i, d) { var j = i + d; if (j < 0 || j >= ord.length) return; var t = ord[i]; ord[i] = ord[j]; ord[j] = t; set('ovOrder', ord.join(',')); renderOv(); }
			var hid = String(prefs.ovHide == null ? DEFAULTS.ovHide : prefs.ovHide).split(',').filter(function (k) { return TILE_NAMES[k]; });
			function toggle(k, on) { var l = hid.filter(function (x) { return x !== k; }); if (!on) l.push(k); set('ovHide', l.join(',')); renderOv(); }
			var lay = h('div', { 'class': 'nf-seg nf-presets', role: 'group', 'aria-label': '"Now" layout' }, LAYOUTS.map(function (l) {
				return h('button', { type: 'button', text: l[1], 'aria-pressed': String(prefs.ovLay === l[0]), onclick: function (ev) { ev.stopPropagation(); applyLayout(l[0]); } });
			}));
			ordBox.replaceChildren.apply(ordBox, [ h('div', { 'class': 'nf-pop-l', text: 'One-click "Now" layout' }), lay,
				h('div', { 'class': 'nf-pop-note', text: 'Changes which tiles are visible, their order, the number of columns and the card size. You can fine-tune everything afterwards.' }),
				h('div', { 'class': 'nf-pop-l', text: '"Now" tiles: visibility and order' }) ].concat(ord.map(function (k, i) {
				var on = hid.indexOf(k) < 0;
				return h('div', { 'class': 'nf-ord-row' }, [ h('label', { 'class': 'nf-ord-vis' }, [ h('input', { type: 'checkbox', checked: on ? 'checked' : null, 'aria-label': 'Show "' + TILE_NAMES[k] + '"', onchange: function (ev) { toggle(k, ev.target.checked); } }),
						h('span', { text: TILE_NAMES[k] }) ]),
					arrow('▲', 'Move up', i === 0, function () { move(i, -1); }), arrow('▼', 'Move down', i === ord.length - 1, function () { move(i, 1); }) ]);
			})).concat([ h('div', { 'class': 'nf-pop-io' }, [ h('button', { type: 'button', text: 'Defaults', onclick: function (ev) { ev.stopPropagation(); set('ovOrder', DEFAULTS.ovOrder); set('ovHide', DEFAULTS.ovHide); renderOv(); } }) ]) ]));
		}
		refs.renderOv = renderOv; renderOv();
		var ovLay = h('div', { 'class': 'nf-pop-sec nf-desk' }, [ h('div', { 'class': 'nf-pop-l', text: 'Card layout' }), sw('ovWide', 'Single column (full-width cards)') ]
			.concat(seg2('ovCols', 'Columns (no gaps)', [ [ '0', 'Auto' ], [ '1', '1' ], [ '2', '2' ], [ '3', '3' ] ], true))
			.concat(seg2('ovSize', 'Card size', [ [ 'sm', 'Compact' ], [ 'md', 'Normal' ], [ 'lg', 'Large' ] ], true)));
		var ui = h('div', { 'class': 'nf-pop-sec' }, [ h('div', { 'class': 'nf-pop-l', text: 'Interface' }) ].concat(desk(sw('navMini', 'Collapsed menu (icons)')), seg2('navOpenMode', 'Menu opens', [ [ 'click', 'On click' ], [ 'hover', 'On hover' ] ], true), [ sw('constApp', 'Animation behind pages'), sw('netBar', 'Internet status bar'), sw('swipe', 'Swipe between page tabs') ], desk(sw('hints', 'Term hints')), [ refs.install,
			h('div', { 'class': 'nf-pop-note', text: 'App: in Chrome and Edge installing works over HTTPS; on iPhone use "Share → Add to Home Screen".' })
		]));

		refs.motion = h('input', { type: 'checkbox', onchange: function (ev) { set('motion', ev.target.checked); } });
		refs.liteAuto = h('input', { type: 'checkbox', onchange: function (ev) { set('liteAuto', ev.target.checked); } });

		var TABS = [ [ 'theme', 'Theme' ], [ 'look', 'Look' ], [ 'login', 'Sign-in' ], [ 'ov', 'Overview' ], [ 'more', 'More' ] ];
		var tabbar = h('div', { 'class': 'nf-tabs', role: 'tablist' }, TABS.map(function (t) {
			return h('button', { type: 'button', role: 'tab', 'data-t': t[0], text: t[1], onclick: function () { showTab(t[0]); } });
		}));
		function pane(id, kids) { return h('div', { 'class': 'nf-pane', 'data-pane': id, role: 'tabpanel' }, kids); }
		refs.syncNote = h('div', { 'class': 'nf-pop-ionote nf-sync-note', role: 'status', text: syncMsg });
		var tabNow = 'theme';
		try { tabNow = window.sessionStorage.getItem('nightfall-tab') || 'theme'; } catch (e) { /* ignore */ }
		function showTab(id) {
			if (!TABS.some(function (t) { return t[0] === id; })) id = 'theme';
			pop.setAttribute('data-tab', id);
			Array.prototype.forEach.call(tabbar.children, function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-t') === id)); });
			try { window.sessionStorage.setItem('nightfall-tab', id); } catch (e) { /* ignore */ }
		}

		pop = h('div', { 'class': 'nf-pop', role: 'dialog', 'aria-label': 'Personalization' }, [
			h('div', { 'class': 'nf-pop-h' }, [ h('span', { text: 'Personalization' }), h('button', { type: 'button', 'class': 'nf-pop-x', 'aria-label': 'Close', title: 'Close', text: '×', onclick: function () { toggle(false); } }) ]),
			tabbar,
			pane('theme', [
				h('div', { 'class': 'nf-pop-l', text: 'Style' }), presets,
				h('button', { type: 'button', 'class': 'nf-ed-open', text: '🎨 Custom theme editor', onclick: function () { openEditor(); } }),
				h('div', { 'class': 'nf-pop-l', text: 'Mode' }), seg, sched,
				h('div', { 'class': 'nf-pop-l', text: 'Accent color' }), grid,
				h('label', { 'class': 'nf-pop-c' }, [ h('span', { text: 'Custom color' }), refs.color ])
			]),
			pane('look', [
				h('div', { 'class': 'nf-pop-l', text: 'Background' }), bgseg,
				rng('Pattern scale', refs.scale, '%'),
				refs.wxSec = h('div', { 'class': 'nf-pop-sec', hidden: true }, [
					h('div', { 'class': 'nf-pop-l', text: 'Weather for the background' }),
					h('div', { 'class': 'nf-pop-note', text: 'The background follows your local weather: sun, clouds, rain, snow, fog, thunderstorm. Choose a city or enter coordinates. Data is fetched by your browser from the free Open-Meteo and wttr.in services, no sign-up needed; the router sends nothing. If both are blocked by your ISP, use a VPN on the device.' }),
					refs.wxCity = h('select', { 'class': 'nf-sel', 'aria-label': 'City', onchange: function (ev) {
						var c = WX_CITIES[+ev.target.value]; if (!c) return;
						set('wxLat', c[1]); set('wxLon', c[2]); wxCode = ''; refreshPanel();
						refs.wxNote.textContent = 'Fetching the weather…'; wxFetch().then(function (ok) { refs.wxNote.textContent = ok ? 'Now: ' + wxCode : 'Failed: the weather service is unavailable (a VPN may be needed in Russia).'; });
					} }, [ h('option', { value: '-1', text: 'Choose a city…' }) ].concat(WX_CITIES.map(function (c, i) { return h('option', { value: String(i), text: c[0] }); }))),
					h('div', { 'class': 'nf-wx-ll' }, [
						h('label', {}, [ h('span', { text: 'Latitude' }), refs.wxLat = h('input', { type: 'text', inputmode: 'decimal', placeholder: '55.75', 'aria-label': 'Latitude', onchange: function (ev) { set('wxLat', ev.target.value.replace(',', '.').trim()); wxCode = ''; skyUpdate(); } }) ]),
						h('label', {}, [ h('span', { text: 'Longitude' }), refs.wxLon = h('input', { type: 'text', inputmode: 'decimal', placeholder: '37.62', 'aria-label': 'Longitude', onchange: function (ev) { set('wxLon', ev.target.value.replace(',', '.').trim()); wxCode = ''; skyUpdate(); } }) ])
					]),
					h('div', { 'class': 'nf-pop-io' }, [
						h('button', { type: 'button', text: 'My location', onclick: function () {
							if (!navigator.geolocation) { refs.wxNote.textContent = 'This browser cannot detect location. Choose a city.'; return; }
							refs.wxNote.textContent = 'Locating…';
							navigator.geolocation.getCurrentPosition(function (pos) {
								set('wxLat', pos.coords.latitude.toFixed(2)); set('wxLon', pos.coords.longitude.toFixed(2)); wxCode = ''; refreshPanel();
								wxFetch().then(function (ok) { refs.wxNote.textContent = ok ? 'Done: ' + wxCode : 'Could not get the weather.'; });
							}, function () { refs.wxNote.textContent = 'No access to location (HTTPS and permission required). Choose a city.'; }, { timeout: 8000 });
						} }),
						h('button', { type: 'button', text: 'Check', onclick: function () { wxCode = ''; refs.wxNote.textContent = 'Fetching…'; wxFetch().then(function (ok) { refs.wxNote.textContent = ok ? 'Now: ' + wxCode : 'Failed: the weather service is unavailable (a VPN may be needed in Russia).'; }); } })
					]),
					refs.wxNote = h('div', { 'class': 'nf-pop-ionote', role: 'status' })
				]),
				h('div', { 'class': 'nf-pop-sec' }, look),
				h('label', { 'class': 'nf-pop-row' }, [ h('span', { text: 'Animations' }), h('span', { 'class': 'cbi-checkbox' }, [ refs.motion ]) ]),
				h('label', { 'class': 'nf-pop-row' }, [ h('span', { text: 'Turn off animations on low-end phones' }), h('span', { 'class': 'cbi-checkbox' }, [ refs.liteAuto ]) ])
			]),
			pane('login', [ more ]),
			pane('ov', [ ov, ovLay, ordBox, thrBox ]),
			pane('more', [
				ui,
				h('div', { 'class': 'nf-pop-sec' }, [
					h('div', { 'class': 'nf-pop-l', text: 'Settings copy' }),
					h('div', { 'class': 'nf-pop-note', text: 'Settings are saved on the router automatically and picked up in other browsers after signing in to LuCI.' }),
					h('div', { 'class': 'nf-pop-io' }, [
						h('button', { type: 'button', text: 'To router', onclick: function () { syncNote('Sending…'); pushNow(true); } }),
						h('button', { type: 'button', text: 'From router', onclick: function () { syncNote('Loading…'); pull(true).then(function () { syncNote('Settings loaded from the router.'); }); } })
					]),
					refs.syncNote,
					h('div', { 'class': 'nf-pop-io' }, [
						h('button', { type: 'button', text: 'To file', onclick: exportPrefs }),
						h('button', { type: 'button', text: 'From file', onclick: function () { refs.file.click(); } }),
						refs.file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: function (ev) { importPrefs(ev.target.files && ev.target.files[0]); ev.target.value = ''; } })
					]),
					refs.ioNote = h('div', { 'class': 'nf-pop-ionote', role: 'status' })
				]),
				h('div', { 'class': 'nf-pop-sec nf-backup-sec' }, [
					h('div', { 'class': 'nf-pop-l', text: 'Router settings backup' }),
					h('div', { 'class': 'nf-pop-note', text: 'Creates an archive of Nightfall settings on the router and downloads it to this device right away. To restore, choose a previously saved archive. Telegram secrets and OpenWrt network settings are not included.' }),
					h('div', { 'class': 'nf-pop-io' }, [
						h('button', { type: 'button', text: 'Create and download', onclick: createAndDownloadBackup }),
						h('button', { type: 'button', text: 'Choose archive', onclick: function () { refs.backupFile.click(); } }),
						refs.backupFile = h('input', { type: 'file', accept: '.tar.gz,application/gzip,application/x-gzip', hidden: true, onchange: function (ev) { uploadAndPreviewBackup(ev.target.files && ev.target.files[0]); ev.target.value = ''; } })
					]),
					h('div', { 'class': 'nf-pop-io' }, [ refs.backupApply = h('button', { type: 'button', text: 'Restore settings', hidden: true, onclick: applyUploadedBackup }) ]),
					refs.backupNote = h('div', { 'class': 'nf-pop-ionote', role: 'status', 'aria-live': 'polite' })
				]),
				h('div', { 'class': 'nf-pop-sec nf-pop-about' }, [
					h('div', { 'class': 'nf-pop-l', text: 'About the theme' }),
					refs.ver = h('div', { 'class': 'nf-ver' }),
					h('label', { 'class': 'nf-pop-row' }, [ h('span', { text: 'Check for updates weekly' }), h('span', { 'class': 'cbi-checkbox' }, [ refs.upd = h('input', { type: 'checkbox', onchange: function (ev) { set('updCheck', ev.target.checked); } }) ]) ]),
					h('div', { 'class': 'nf-pop-io' }, [
						h('button', { type: 'button', text: 'What\'s new', onclick: showWhatsNew }),
						h('button', { type: 'button', text: 'Check', onclick: function () { checkUpdate(true); } }),
						h('a', { 'class': 'nf-pop-btn', href: 'https://github.com/' + REPO + '/releases', target: '_blank', rel: 'noopener', text: 'Releases page' })
					]),
					refs.updNote = h('div', { 'class': 'nf-pop-ionote', role: 'status' })
				]),
				h('button', { type: 'button', 'class': 'nf-pop-reset', text: 'Reset all', onclick: function () {
					prefs = Object.assign({}, DEFAULTS); save(); applyAll(); refreshPanel();
				} })
			])
		]);
		showTab(tabNow);

		pop.addEventListener('input', function (ev) { if (ev.target.type === 'range') paintRange(ev.target); });
		document.body.appendChild(pop);
		var IC = { 'Style': 'style', 'Mode': 'mode', 'Accent color': 'color', 'Background': 'bg', 'Weather for the background': 'wx', 'Settings copy': 'sync', 'About the theme': 'info',
			'Sign-in screen': 'login', 'Show on Overview': 'ov', 'Card layout': 'ov', '"Now" tile order': 'ov', 'Tile color thresholds': 'ov', 'Interface': 'ui', 'Sign-in cards': 'login', 'Share theme': 'sync' };
		[].forEach.call(pop.querySelectorAll('.nf-pop-l'), function (l) { var k = IC[l.textContent.trim()]; if (k) l.setAttribute('data-ic', k); });
		refreshPanel();
	}


	/* ---------- custom theme editor ----------
	 * A window with colors, corner radius, font and shadows. The page around it is the preview: everything applies immediately.
	 * A theme can be sent to someone else as a one-line text code and applied on their side. */
	var ed = null, edRefs = {};
	var CODE_KEYS = [ 'mode', 'accent', 'style', 'bg', 'bgScale', 'radius', 'density', 'font', 'glass', 'glassTone', 'glassBlur', 'glassAlpha', 'chart', 'chartSmooth', 'chartPal', 'chartW', 'chartGrid', 'chartThr', 'chartShine', 'cusOn', 'cusBg', 'cusCard', 'cusText', 'cusRadius', 'cusFont', 'cusShadow' ];
	function themeCode() {
		var o = {}; CODE_KEYS.forEach(function (k) { o[k] = prefs[k]; });
		var js = JSON.stringify(o), b;
		try { b = window.btoa(unescape(encodeURIComponent(js))); } catch (e) { b = ''; }
		return 'NF1:' + b;
	}
	function applyCode(txt) {
		var m = /^\s*NF1:([A-Za-z0-9+\/=]+)\s*$/.exec(String(txt || ''));
		if (!m) return 'This is not a Nightfall theme code (it starts with NF1:).';
		var src = null;
		try { src = JSON.parse(decodeURIComponent(escape(window.atob(m[1])))); } catch (e) { return 'The code is corrupted.'; }
		var clean = src && typeof src === 'object' ? cleanPrefs(src) : null;
		if (!clean) return 'The code contains no theme settings.';
		var out = {}; CODE_KEYS.forEach(function (k) { if (Object.prototype.hasOwnProperty.call(clean, k)) out[k] = clean[k]; });
		Object.assign(prefs, out, { preset: '' }); save(); applyAll(); refreshPanel(); refreshEditor();
		return '';
	}
	function refreshEditor() {
		if (!ed) return;
		edRefs.on.checked = !!prefs.cusOn;
		ed.toggleAttribute('data-off', !prefs.cusOn);
		[ [ 'cusBg', '#f3f3f3', '#202020' ], [ 'cusCard', '#fcfcfc', '#2b2b2b' ], [ 'cusText', '#1a1a1a', '#ffffff' ] ].forEach(function (c) {
			edRefs[c[0]].value = hex6(prefs[c[0]]) || (isDark() ? c[2] : c[1]);
			edRefs[c[0] + 'x'].hidden = !hex6(prefs[c[0]]);
		});
		edRefs.base.light.setAttribute('aria-pressed', String(!isDark())); edRefs.base.dark.setAttribute('aria-pressed', String(isDark()));
		edRefs.radius.value = String(+prefs.cusRadius || 0); paintRange(edRefs.radius);
		[ [ 'cusFont', '' ], [ 'cusShadow', '' ] ].forEach(function (k) { Object.keys(edRefs[k[0]]).forEach(function (v) { edRefs[k[0]][v].setAttribute('aria-pressed', String((prefs[k[0]] || '') === (v === '_' ? '' : v))); }); });
		edRefs.color.value = hexToRgb(prefs.accent) ? prefs.accent : '#0067c0';
	}
	function openEditor() {
		if (!ed) buildEditor();
		if (pop) toggle(false);
		ed.classList.add('open'); refreshEditor();
		var x = ed.querySelector('.nf-pop-x'); if (x) x.focus();
	}
	function buildEditor() {
		function color(key, label) {
			var inp = edRefs[key] = h('input', { type: 'color', 'class': 'nf-color', 'aria-label': label, oninput: function (ev) { prefs.cusOn = true; set(key, ev.target.value); refreshEditor(); } });
			var x = edRefs[key + 'x'] = h('button', { type: 'button', 'class': 'nf-ed-x', title: 'Revert to theme default', 'aria-label': 'Reset: ' + label, text: '↺', onclick: function () { set(key, ''); refreshEditor(); } });
			return h('div', { 'class': 'nf-ed-c' }, [ h('span', { text: label }), inp, x ]);
		}
		function seg(key, label, items) {
			var m = edRefs[key] = {};
			var el = h('div', { 'class': 'nf-seg nf-seg-wrap', role: 'group', 'aria-label': label }, items.map(function (i) {
				return m[i[0]] = h('button', { type: 'button', text: i[1], onclick: function () { prefs.cusOn = true; set(key, i[0] === '_' ? '' : i[0]); refreshEditor(); } });
			}));
			return [ h('div', { 'class': 'nf-pop-l', text: label }), el ];
		}
		edRefs.on = h('input', { type: 'checkbox', onchange: function (ev) { set('cusOn', ev.target.checked); refreshEditor(); } });
		edRefs.base = {
			light: h('button', { type: 'button', text: 'Light base', onclick: function () { prefs.schedule = false; set('mode', 'light'); refreshEditor(); } }),
			dark: h('button', { type: 'button', text: 'Dark base', onclick: function () { prefs.schedule = false; set('mode', 'dark'); refreshEditor(); } })
		};
		edRefs.color = h('input', { type: 'color', 'class': 'nf-color', 'aria-label': 'Accent color', oninput: function (ev) { set('accent', ev.target.value); refreshEditor(); } });
		edRefs.radius = h('input', { type: 'range', min: '0', max: '28', step: '1', 'aria-label': 'Corner radius, pixels', oninput: function (ev) { prefs.cusOn = true; set('cusRadius', +ev.target.value); } });
		edRefs.radius.setAttribute('data-unit', 'px');
		edRefs.code = h('textarea', { 'class': 'nf-ed-code', rows: '3', spellcheck: 'false', 'aria-label': 'Theme code', placeholder: 'Paste someone else\'s theme code here (starts with NF1:)' });
		edRefs.note = h('div', { 'class': 'nf-pop-ionote', role: 'status' });
		var note = function (t, bad) { edRefs.note.textContent = t; edRefs.note.classList.toggle('bad', !!bad); };
		var rngRow = h('label', { 'class': 'nf-rng' }, [ h('span', { 'class': 'nf-rng-t' }, [ h('span', { text: 'Corner radius' }), h('output', { 'class': 'nf-rng-v' }) ]), edRefs.radius ]);
		ed = h('div', { 'class': 'nf-pop nf-ed', role: 'dialog', 'aria-label': 'Theme editor' }, [
			h('div', { 'class': 'nf-pop-h' }, [ h('span', { text: 'Theme editor' }), h('button', { type: 'button', 'class': 'nf-pop-x', 'aria-label': 'Close', title: 'Close', text: '×', onclick: function () { ed.classList.remove('open'); } }) ]),
			h('div', { 'class': 'nf-pop-note', text: 'Changes show up on this page right away. Choose a base and adjust the colors, shape and font.' }),
			h('label', { 'class': 'nf-pop-row' }, [ h('span', { text: 'Use custom theme' }), h('span', { 'class': 'cbi-checkbox' }, [ edRefs.on ]) ]),
			h('div', { 'class': 'nf-seg', role: 'group', 'aria-label': 'Base' }, [ edRefs.base.light, edRefs.base.dark ]),
			h('div', { 'class': 'nf-ed-body' }, [
				color('cusBg', 'Page background'), color('cusCard', 'Cards'), color('cusText', 'Text'),
				h('div', { 'class': 'nf-ed-c' }, [ h('span', { text: 'Accent' }), edRefs.color ]),
				rngRow
			].concat(seg('cusFont', 'Font', [ [ '_', 'Theme default' ], [ 'system', 'System' ], [ 'rounded', 'Rounded' ], [ 'humanist', 'Soft' ], [ 'serif', 'Serif' ], [ 'mono', 'Mono' ] ]),
				seg('cusShadow', 'Card shadows', [ [ '_', 'Theme default' ], [ 'none', 'No shadows' ], [ 'soft', 'Soft' ], [ 'deep', 'Deep' ] ]),
				[ h('div', { 'class': 'nf-ed-prev' }, [ h('b', { text: 'This is how a card looks' }), h('span', { text: 'Text, links and buttons in the chosen colors.' }), h('button', { type: 'button', 'class': 'cbi-button cbi-button-action', text: 'Button' }) ]) ])),
			h('div', { 'class': 'nf-pop-l', text: 'Share theme' }),
			edRefs.code,
			h('div', { 'class': 'nf-pop-io' }, [
				h('button', { type: 'button', text: 'Show my theme code', onclick: function () { edRefs.code.value = themeCode(); edRefs.code.select(); note('Copy the code and send it: on the other router paste it here and press "Apply code".'); } }),
				h('button', { type: 'button', text: 'Copy', onclick: function () {
					if (!edRefs.code.value) edRefs.code.value = themeCode(); edRefs.code.select();
					var ok = false; try { ok = document.execCommand('copy'); } catch (e) { /* ignore */ }
					if (!ok && navigator.clipboard) { navigator.clipboard.writeText(edRefs.code.value).then(function () { note('Code copied.'); }, function () { note('Select the code and copy it manually.', true); }); return; }
					note(ok ? 'Code copied.' : 'Select the code and copy it manually.', !ok);
				} }),
				h('button', { type: 'button', text: 'Apply code', onclick: function () { var e = applyCode(edRefs.code.value); note(e || 'Theme applied.', !!e); } })
			]),
			edRefs.note,
			h('button', { type: 'button', 'class': 'nf-pop-reset', text: 'Reset custom theme', onclick: function () {
				[ 'cusBg', 'cusCard', 'cusText', 'cusFont', 'cusShadow' ].forEach(function (k) { prefs[k] = ''; }); prefs.cusRadius = 0; prefs.cusOn = false; save(); applyAll(); refreshPanel(); refreshEditor();
			} })
		]);
		ed.addEventListener('input', function (ev) { if (ev.target.type === 'range') paintRange(ev.target); });
		document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && ed.classList.contains('open')) ed.classList.remove('open'); });
		document.body.appendChild(ed);
	}

	/* ---------- Nightfall settings backup on the router ---------- */
	var backupRestorePath = '', backupBusy = false;
	function backupNote(text, bad) {
		if (!refs.backupNote) return;
		refs.backupNote.textContent = text;
		refs.backupNote.classList.toggle('bad', !!bad);
	}
	function backupExec(args) {
		var env = sid();
		if (!env || !window.fetch) return Promise.reject(new Error('Sign in to LuCI first.'));
		return window.fetch(env.ubuspath || '/ubus/', { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'call', params: [ env.sessionid, 'file', 'exec', { command: '/usr/libexec/nightfall-backup', params: args } ] })
		}).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(function (j) {
			var res = j && j.result;
			if (!res || res[0] !== 0) throw new Error(res && res[0] === 6 ? 'No permission to back up. Sign out and sign in to LuCI again.' : (j && j.error && j.error.message) || 'Router call failed.');
			var data = res[1] || {};
			if (data.code !== undefined && +data.code !== 0) throw new Error(String(data.stderr || data.stdout || 'The command failed.').trim());
			return String(data.stdout || '').replace(/\s+$/, '');
		});
	}
	function backupBusyState(on) {
		backupBusy = !!on;
		if (!pop) return;
		Array.prototype.forEach.call(pop.querySelectorAll('.nf-backup-sec button'), function (b) { b.disabled = backupBusy; });
	}
	function decodeBackupChunk(b64) {
		var raw = window.atob(b64), bytes = new Uint8Array(raw.length);
		for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
		return bytes;
	}
	function saveBackupBlob(parts, name) {
		var blob = new Blob(parts, { type: 'application/gzip' }), url = URL.createObjectURL(blob), a = h('a', { href: url, download: name });
		a.addEventListener('click', function (ev) { ev.stopPropagation(); });
		document.body.appendChild(a); a.click();
		window.setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
	}
	function createAndDownloadBackup() {
		if (backupBusy) return;
		backupBusyState(true); backupNote('Creating a backup…');
		backupExec([ 'create' ]).then(function (out) {
			var m = out.match(/Backup created:\s*(\/[^\s]+\.tar\.gz)/);
			if (!m) throw new Error(out || 'The router did not report the archive path.');
			var name = m[1].split('/').pop(), parts = [], offset = 0, chunkSize = 24576;
			return backupExec([ 'download-info', name ]).then(function (info) {
				var sm = info.match(/(?:^|\s)size=(\d+)(?:\s|$)/), hm = info.match(/(?:^|\s)sha256=([a-f0-9]{64})(?:\s|$)/i);
				if (!sm || !hm) throw new Error('The router did not report the archive size and checksum.');
				var expectedSize = Number(sm[1]), expectedHash = hm[1].toLowerCase();
				if (!isFinite(expectedSize) || expectedSize < 1 || expectedSize > 5 * 1024 * 1024) throw new Error('Invalid archive size: ' + expectedSize + ' bytes.');
				backupNote('Archive created (' + expectedSize + ' bytes). Downloading to the device…');
				function next() {
					if (offset >= expectedSize) return Promise.resolve();
					return backupExec([ 'download', name, String(offset), String(chunkSize) ]).then(function (b64) {
						if (!b64) throw new Error('The router returned an empty chunk at offset ' + offset + ' of ' + expectedSize + ' bytes.');
						var bytes = decodeBackupChunk(b64), expectedChunk = Math.min(chunkSize, expectedSize - offset);
						if (bytes.length !== expectedChunk) throw new Error('Incomplete chunk received: ' + bytes.length + ' of ' + expectedChunk + ' bytes.');
						parts.push(bytes); offset += bytes.length;
						backupNote('Downloaded ' + Math.round(offset / expectedSize * 100) + '%…');
						return next();
					});
				}
				return next().then(function () {
					var blob = new Blob(parts, { type: 'application/gzip' });
					if (blob.size !== expectedSize) throw new Error('Downloaded file size mismatch: ' + blob.size + ' of ' + expectedSize + ' bytes.');
					if (!parts.length || parts[0].length < 2 || parts[0][0] !== 31 || parts[0][1] !== 139) throw new Error('The received file has no gzip header.');
					/* SHA-256 is verified where the browser allows Web Crypto (usually HTTPS/localhost). */
					var verifyHash = Promise.resolve(false);
					if (window.crypto && window.crypto.subtle && blob.arrayBuffer) {
						verifyHash = blob.arrayBuffer().then(function (buffer) {
							return window.crypto.subtle.digest('SHA-256', buffer);
						}).then(function (digest) {
							var actualHash = Array.prototype.map.call(new Uint8Array(digest), function (v) { return ('0' + v.toString(16)).slice(-2); }).join('');
							if (actualHash !== expectedHash) throw new Error('SHA-256 of the downloaded file does not match the router.');
							return true;
						});
					}
					return verifyHash.then(function (hashChecked) {
						/* In browsers with DecompressionStream, also verify the gzip CRC and stream length. */
						if (window.DecompressionStream && blob.stream && window.Response) {
							return new window.Response(blob.stream().pipeThrough(new window.DecompressionStream('gzip'))).arrayBuffer().then(function () {
								saveBackupBlob(parts, name);
								backupNote('Backup downloaded and verified: ' + name + ' (' + expectedSize + ' bytes). ' + (hashChecked ? 'SHA-256 confirmed.' : 'Router SHA-256: ' + expectedHash));
							}).catch(function () { throw new Error('gzip check failed: the archive is corrupted or incomplete.'); });
						}
						saveBackupBlob(parts, name);
						backupNote('Backup downloaded: ' + name + ' (' + expectedSize + ' bytes). ' + (hashChecked ? 'SHA-256 confirmed.' : 'Router SHA-256: ' + expectedHash));
					});
				});
			});
		}).catch(function (e) { backupNote('Could not create or download the archive: ' + e.message, true); }).then(function () { backupBusyState(false); }, function (e) { backupNote('Error: ' + e.message, true); backupBusyState(false); });
	}
	function readFileChunk(file, start, end) {
		return new Promise(function (resolve, reject) {
			var rd = new FileReader();
			rd.onload = function () { var s = String(rd.result || ''), i = s.indexOf(','); resolve(i >= 0 ? s.slice(i + 1) : ''); };
			rd.onerror = function () { reject(new Error('Could not read the selected file.')); };
			rd.readAsDataURL(file.slice(start, end));
		});
	}
	function uploadAndPreviewBackup(file) {
		if (!file || backupBusy) return;
		if (!/\.tar\.gz$/i.test(file.name) || file.size < 1 || file.size > 5 * 1024 * 1024) { backupNote('Choose a .tar.gz archive up to 5 MB.', true); return; }
		var id = (Date.now().toString(16) + Math.floor(Math.random() * 0xffffffff).toString(16)).slice(-8).toLowerCase();
		backupRestorePath = ''; refs.backupApply.hidden = true;
		backupBusyState(true); backupNote('Preparing to upload the archive…');
		var chunkSize = 24576, offset = 0;
		backupExec([ 'upload-start', id ]).then(function sendNext() {
			if (offset >= file.size) return backupExec([ 'upload-finish', id ]);
			var start = offset, end = Math.min(file.size, start + chunkSize);
			return readFileChunk(file, start, end).then(function (b64) {
				return backupExec([ 'upload-chunk', id, b64 ]).then(function () { offset = end; backupNote('Uploaded ' + Math.round(offset / file.size * 100) + '%…'); return sendNext(); });
			});
		}).then(function (out) {
			var m = out.match(/Archive uploaded:\s*(\/[^\s]+\.tar\.gz)/);
			if (!m) throw new Error(out || 'Could not verify the uploaded archive.');
			backupRestorePath = m[1]; refs.backupApply.hidden = false;
			backupNote(out + '\nArchive verified. Press "Restore settings" when you are ready.');
		}).catch(function (e) {
			backupExec([ 'upload-abort', id ]).catch(function () {});
			backupNote('Upload or verification failed: ' + e.message, true);
		}).then(function () { backupBusyState(false); });
	}
	function applyUploadedBackup() {
		if (!backupRestorePath || backupBusy) return;
		if (!window.confirm('Restore Nightfall settings from the selected archive? Current Nightfall settings will be replaced. OpenWrt network settings are not changed; the current TG_TOKEN is kept.')) return;
		backupBusyState(true); backupNote('Restoring settings…');
		backupExec([ 'restore', backupRestorePath, 'apply' ]).then(function (out) {
			backupNote(out + '\nReload the LuCI page to apply the personalization settings.');
			backupRestorePath = ''; refs.backupApply.hidden = true;
		}).catch(function (e) { backupNote('Restore failed: ' + e.message, true); }).then(function () { backupBusyState(false); });
	}

	/* ---------- export and import of appearance settings as one file ---------- */
	function ioNote(text, bad) {
		if (!refs.ioNote) return;
		refs.ioNote.textContent = text; refs.ioNote.classList.toggle('bad', !!bad);
		window.clearTimeout(ioNote.t); ioNote.t = window.setTimeout(function () { refs.ioNote.textContent = ''; }, 6000);
	}
	function exportPrefs() {
		var out = {};
		Object.keys(DEFAULTS).forEach(function (k) { out[k] = prefs[k]; });
		var blob = new Blob([ JSON.stringify({ app: 'nightfall', v: 1, prefs: out }, null, 2) ], { type: 'application/json' });
		var a = h('a', { href: URL.createObjectURL(blob), download: 'nightfall-settings.json' });
		a.addEventListener('click', function (ev) { ev.stopPropagation(); });   /* otherwise the panel thinks the click was outside and closes */
		document.body.appendChild(a); a.click();
		window.setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
		ioNote('nightfall-settings.json saved.');
	}
	/* take only known keys with the same value type from the file; colors and times are checked against a pattern */
	function cleanPrefs(src) {
		var out = {}, n = 0;
		Object.keys(DEFAULTS).forEach(function (k) {
			if (!Object.prototype.hasOwnProperty.call(src, k)) return;
			var v = src[k], d = DEFAULTS[k];
			if (typeof v !== typeof d) return;
			if (typeof v === 'string') {
				if (v.length > 32) return;
				if ((k === 'accent' || k === 'cusBg' || k === 'cusCard' || k === 'cusText') && v !== '' && !/^#[0-9a-fA-F]{6}$/.test(v)) return;
				if ((k === 'nightFrom' || k === 'dayFrom') && !/^\d\d:\d\d$/.test(v)) return;
				if (k !== 'accent' && k !== 'cusBg' && k !== 'cusCard' && k !== 'cusText' && k !== 'nightFrom' && k !== 'dayFrom' && !/^[A-Za-z0-9_-]*$/.test(v)) return;
			}
			if (typeof v === 'number' && (!isFinite(v) || v < 0 || v > 1000 || (k === 'cusRadius' && v > 28))) return;
			out[k] = v; n++;
		});
		return n ? out : null;
	}
	function importPrefs(file) {
		if (!file) return;
		if (file.size > 65536) { ioNote('The file is too large to be a settings file.', true); return; }
		var rd = new FileReader();
		rd.onload = function () {
			var d = null;
			try { d = JSON.parse(String(rd.result)); } catch (e) { /* reported below */ }
			var src = d && typeof d === 'object' ? (d.prefs || d.p || d) : null;
			var clean = src && typeof src === 'object' ? cleanPrefs(src) : null;
			if (!clean) { ioNote('This is not a Nightfall settings file.', true); return; }
			prefs = Object.assign({}, DEFAULTS, clean); save(); applyAll(); refreshPanel();
			ioNote('Settings loaded.');
		};
		rd.onerror = function () { ioNote('Could not read the file.', true); };
		rd.readAsText(file);
	}

	/* ---------- theme version and update check ----------
	 * The version is in version.json next to the theme (written by the release build). Once a week the browser (not the router) asks GitHub
	 * for the latest release and compares versions. Nothing is installed: it is only a hint. Can be turned off in the panel. */
	var REPO = 'jigarvarma2k20/nightfall-openwrt', UKEY = 'nightfall-upd-v', verInfo = null;
	function versionParts(s) {
		var m = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/i.exec(String(s || '').trim());
		if (!m) return null;
		return { core: [ +m[1] || 0, +m[2] || 0, +m[3] || 0 ], pre: m[4] ? m[4].split('.') : null };
	}
	function isNewer(a, b) {   /* is b newer than a? A stable release is newer than a prerelease of the same version. */
		var x = versionParts(a), y = versionParts(b);
		if (!x || !y) return false;
		for (var i = 0; i < 3; i++) if (x.core[i] !== y.core[i]) return y.core[i] > x.core[i];
		if (!x.pre && y.pre) return false;
		if (x.pre && !y.pre) return true;
		if (!x.pre && !y.pre) return false;
		for (var j = 0; j < Math.max(x.pre.length, y.pre.length); j++) {
			if (j >= x.pre.length) return true;
			if (j >= y.pre.length) return false;
			var xi = x.pre[j], yi = y.pre[j], xn = /^\d+$/.test(xi), yn = /^\d+$/.test(yi);
			if (xn && yn) { if (+xi !== +yi) return +yi > +xi; }
			else if (xn !== yn) return xn;
			else if (xi !== yi) return yi > xi;
		}
		return false;
	}
	function updCache() { try { return JSON.parse(window.localStorage.getItem(UKEY) || 'null'); } catch (e) { return null; } }
	function updAvail() { var c = updCache(); return verInfo && c && c.tag && isNewer(verInfo.version, c.tag) ? c.tag : ''; }
	function paintVer() {
		var tag = updAvail();
		if (refs.ver) refs.ver.textContent = verInfo ? 'Nightfall v' + verInfo.version + (verInfo.build ? ' · build ' + verInfo.build : '') : 'Version unknown (version.json not found)';
		if (refs.updNote && tag) { refs.updNote.textContent = fullTag(tag) + ' is available. '; refs.updNote.classList.remove('bad'); refs.updNote.appendChild(h('a', { href: '#', text: 'Update', onclick: function (ev) { ev.preventDefault(); offerUpdate(true); } })); }
		document.querySelectorAll('.nf-pers-main').forEach(function (b) { b.classList.toggle('nf-has-upd', !!tag); });
	}
	function loadVer() {
		if (!window.fetch) return;
		window.fetch(BASE + 'version.json?' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
			verInfo = d && typeof d.version === 'string' ? d : null; paintVer(); checkWhatsNew(); loginCheck();
		}).catch(function () { /* without a version, just show nothing */ });
	}
	/* The latest release number comes first from latest.json in the repo (raw.githubusercontent.com, no rate limits;
	 * the release build updates the file), and if that fails, from the GitHub API (limited to 60 requests per hour per address). */
	function getLatestTag() {
		function ok(t) { return typeof t === 'string' && /^v?\d+(\.\d+){0,2}$/.test(t) ? t : ''; }
		return window.fetch('https://raw.githubusercontent.com/' + REPO + '/main/latest.json?' + Math.floor(Date.now() / 300000), { cache: 'no-store' })
			.then(function (r) { if (!r.ok) throw new Error('raw'); return r.json(); })
			.then(function (d) { var t = ok(d && d.version); if (!t) throw new Error('raw-tag'); return t; })
			.catch(function () {
				return window.fetch('https://api.github.com/repos/' + REPO + '/releases/latest', { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' })
					.then(function (r) { if (!r.ok) throw new Error('api'); return r.json(); })
					.then(function (d) { var t = ok(d && d.tag_name); if (!t) throw new Error('api-tag'); return t; });
			});
	}
	function checkUpdate(manual, announce) {
		if (!window.fetch) return;
		if (manual && refs.updNote) { refs.updNote.textContent = 'Checking…'; refs.updNote.classList.remove('bad'); }
		getLatestTag().then(function (tag) {
			try { window.localStorage.setItem(UKEY, JSON.stringify({ tag: tag, t: Date.now() })); } catch (e) { /* ignore */ }
			paintVer(); if (announce) offerUpdate(false);
			if (manual && refs.updNote && !updAvail()) { refs.updNote.textContent = 'The latest version is installed (' + (/^v/i.test(tag) ? tag : 'v' + tag) + ').'; refs.updNote.classList.remove('bad'); }
		}).catch(function () {
			if (announce) offerUpdate(false);
			if (manual && refs.updNote) { refs.updNote.textContent = 'Check failed: GitHub did not respond or the request limit was reached. Try again later.'; refs.updNote.classList.add('bad'); }
		});
	}

	/* ---------- updating from the UI ----------
	 * "New version available" window -> the router downloads and installs the release itself (/usr/libexec/nightfall-update,
	 * sha256 check, rollback on error) -> "Installed" window and session sign-out (permissions refresh at sign-in) ->
	 * after sign-in, the "What's new" window from CHANGELOG.md. Downloading on the router needs curl (apk add curl). */
	var SKIPKEY = 'nightfall-upd-skip', SEENKEY = 'nightfall-seen-ver', ACKKEY = 'nightfall-whatsnew-ack-v1', updModal = null, updBusy = false;
	function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
	function lsSet(k, v) { try { if (v === null) window.localStorage.removeItem(k); else window.localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
	function fullTag(t) { return /^v/i.test(t) ? t : 'v' + t; }
	function updExec(arg) {
		var env = sid();
		if (!env || !window.fetch) return Promise.reject(new Error('nosession'));
		return window.fetch(env.ubuspath || '/ubus/', { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'call', params: [ env.sessionid, 'file', 'exec', { command: '/usr/libexec/nightfall-update', params: [ arg ] } ] }) })
			.then(function (r) { if (!r.ok) throw new Error('http'); return r.json(); })
			.then(function (d) {
				var res = d && d.result;
				if (!res || res[0] !== 0 || !res[1]) throw new Error('denied');
				try { return JSON.parse(res[1].stdout || ''); } catch (e) { throw new Error('parse'); }
			});
	}
	document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && updModal && !updBusy && updModal.querySelector('.nf-upd-card')) closeUpd(); });
	function closeUpd() { if (updModal) { updModal.remove(); updModal = null; } document.documentElement.classList.remove('nf-upd-open'); }
	function openUpd(title, kids, wide) {
		closeUpd();
		var box = h('div', { 'class': 'nf-upd-box' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, (kids[0] && kids[0].classList && kids[0].classList.contains('nf-upd-hero') ? [] : [ h('h4', { text: title }) ]).concat(kids));
		updModal = h('div', { 'class': 'nf-upd-modal' }, [ box ]);
		document.body.appendChild(updModal);
		document.documentElement.classList.add('nf-upd-open');
		return box;
	}
	/* CHANGELOG.md: "## v1.0.9 ..." sections containing "- ..." items and "### ..." subheadings */
	function parseChangelog(md) {
		var out = [], cur = null;
		String(md || '').split(/\r?\n/).forEach(function (ln) {
			var m = /^##\s+v?(\d+(?:\.\d+){0,2})\b\s*(.*)$/.exec(ln);
			if (m) { cur = { v: m[1], t: m[2].replace(/^[\-–—·:\s]+/, ''), lines: [] }; out.push(cur); }
			else if (cur && ln.trim()) cur.lines.push(ln.trim());
		});
		return out;
	}
	/* **bold** and `code` from CHANGELOG.md */
	function inlineMd(el, text) {
		String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/).forEach(function (part) {
			if (!part) return;
			if (/^\*\*[^*]+\*\*$/.test(part)) el.appendChild(h('b', { text: part.slice(2, -2) }));
			else if (/^`[^`]+`$/.test(part)) el.appendChild(h('code', { text: part.slice(1, -1) }));
			else el.appendChild(document.createTextNode(part));
		});
		return el;
	}
	/* item type: tag or first words: new / fixed / important / improved.
	 * Russian tags and words are kept on purpose: release notes already published on GitHub are in Russian. */
	var CL_TAG = /^\[(New|Added|Improved|Fixed|Important|Новое|Улучшено|Исправлено|Важно)\]\s*/i;
	var CL_TAG_KIND = { 'new': 'new', 'added': 'new', 'improved': 'imp', 'fixed': 'fix', 'important': 'warn', 'новое': 'new', 'улучшено': 'imp', 'исправлено': 'fix', 'важно': 'warn' };
	var CL_LABEL = { 'new': 'New', imp: 'Improved', fix: 'Fixed', warn: 'Important' };
	function clKind(k) { return [ k, CL_LABEL[k] ]; }
	function lineKind(t) {
		var m = CL_TAG.exec(t), x;
		if (m) return clKind(CL_TAG_KIND[m[1].toLowerCase()]);
		x = t.replace(/^\*\*/, '');
		if (/^(Important|Required|You need|You must|After updat|Update (the|your)|Нужно|Важно|После обновления|Обновите)/i.test(x)) return clKind('warn');
		if (/^(Fix|Resolved|No longer)|\bno longer |\b(doesn't|does not|don't|do not|won't|is not|are not|isn't|aren't) (jitter|jump|break|drop|stretch|show)|\b(disappeared|removed) |without (a )?(break|drop)|^(Исправ|Починил|Устранен)|больше не |не (дёргаются|обрывается|растягиваются|показывается)|пропал[аио]? |убран[аоы]? |без обрыва/i.test(x)) return clKind('fix');
		if (/^(New|Added|Add |Now|Number|Choice|Choose|You can|Can |Window|Editor|Check|Нов|Добавл|Появил|Теперь|Число|Выбор|Можно|Окно|Редактор|Проверка)/i.test(x) || /^\*\*/.test(t)) return clKind('new');
		return clKind('imp');
	}
	function renderChanges(sections) {
		var wrap = h('div', { 'class': 'nf-upd-log' });
		sections.forEach(function (s) {
			var head = h('div', { 'class': 'nf-cl-head' }, [ h('span', { 'class': 'nf-cl-v', text: 'v' + s.v }) ]);
			if (s.t) head.appendChild(h('span', { 'class': 'nf-cl-t', text: s.t }));
			var sec = h('section', { 'class': 'nf-cl' }, [ head ]);
			s.lines.forEach(function (ln) {
				if (/^[-*]\s+/.test(ln)) {
					var txt = ln.replace(/^[-*]\s+/, ''), k = lineKind(txt); txt = txt.replace(CL_TAG, '');
					sec.appendChild(h('div', { 'class': 'nf-cl-row' }, [ h('span', { 'class': 'nf-cl-b ' + k[0], text: k[1] }), inlineMd(h('span', { 'class': 'nf-cl-x' }), txt) ]));
				} else sec.appendChild(h(/^###/.test(ln) ? 'h6' : 'p', { text: ln.replace(/^#+\s*/, '') }));
			});
			wrap.appendChild(sec);
		});
		return wrap;
	}
	/* card with a header: icon, title, version transition; centered on desktop, at the bottom on phones */
	function openCard(title, sub, from, to, body, btns, extra) {
		var chips = h('div', { 'class': 'nf-upd-vers' });
		if (from) chips.appendChild(h('span', { 'class': 'nf-upd-chip old', text: fullTag(from) }));
		if (from && to) chips.appendChild(h('span', { 'class': 'nf-upd-arrow', text: '→' }));
		if (to) chips.appendChild(h('span', { 'class': 'nf-upd-chip new', text: fullTag(to) }));
		var hero = h('div', { 'class': 'nf-upd-hero' }, [
			h('img', { 'class': 'nf-upd-logo', src: BASE + 'logo.svg', alt: '', width: 48, height: 48 }),
			h('div', { 'class': 'nf-upd-ht' }, [ h('h4', { text: title }), h('p', { text: sub || '' }), chips ])
		]);
		var box = openUpd(title, [ hero ].concat(body, [ h('div', { 'class': 'nf-upd-btns' }, btns) ]), true);
		box.classList.add('nf-upd-card');
		if (extra) box.parentNode.classList.add(extra);
		var first = box.querySelector('.nf-upd-go'); if (first) try { first.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
		return box;
	}
	function loadChangelog(url) {
		return window.fetch(url, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('nolog'); return r.text(); }).then(parseChangelog);
	}
	function showWhatsNew() {
		if (!verInfo || !window.fetch) return;
		loadChangelog(BASE + 'CHANGELOG.md?' + Date.now()).then(function (all) {
			var list = all.filter(function (s) { return !isNewer(verInfo.version, s.v); }).slice(0, 4);
			if (!list.length) {
				openCard('What\'s new', 'Change history', null, verInfo.version, [
					h('p', { 'class': 'nf-upd-note', text: 'There is no published CHANGELOG.md section for the installed version yet.' })
				], [ h('button', { type: 'button', 'class': 'nf-upd-go', text: 'Close', onclick: closeUpd }) ]);
				return;
			}
			openCard('What\'s new', 'Panel updated', list[list.length - 1].v, verInfo.version, [ renderChanges(list) ], [
				h('button', { type: 'button', 'class': 'nf-upd-go', text: 'Got it', onclick: function () {
					lsSet(ACKKEY, verInfo.version); lsSet(SEENKEY, verInfo.version); closeUpd();
				} })
			]);
		}).catch(function () {
			openCard('What\'s new', 'Could not load the changelog', null, verInfo.version, [
				h('p', { 'class': 'nf-upd-note', text: 'CHANGELOG.md is temporarily unavailable. Try again later.' })
			], [ h('button', { type: 'button', 'class': 'nf-upd-go', text: 'Close', onclick: closeUpd }) ]);
		});
	}
	/* After an update we show the CHANGELOG. The version counts as seen
	 * only after pressing "Got it", not before the file is fetched over the network.
	 * This allows a retry if the CHANGELOG is temporarily unavailable.
	 */
	function checkWhatsNew() {
		if (!verInfo || document.body.classList.contains('nf-blank') || !window.fetch) return;
		var seen = lsGet(SEENKEY), ack = lsGet(ACKKEY), cur = verInfo.version;
		var legacy = !ack && !!seen;
		/* First run of a fresh install: no window. For existing installs
		 * migrate the old marker: the previous code could mark the version as seen
		 * before loading the CHANGELOG and lose the notice forever.
		 */
		if (!ack && !seen) { lsSet(SEENKEY, cur); lsSet(ACKKEY, cur); return; }
		if (ack && (ack === cur || !isNewer(ack, cur))) return;
		loadChangelog(BASE + 'CHANGELOG.md?' + Date.now()).then(function (all) {
			var list = legacy
				? all.filter(function (s) { return !isNewer(cur, s.v); }).slice(0, 4)
				: all.filter(function (s) { return isNewer(ack, s.v) && !isNewer(cur, s.v); }).slice(0, 4);
			if (!list.length) {
				/* Do not acknowledge: the CHANGELOG may not be published with the release yet. */
				return;
			}
			openCard('What\'s new', 'Panel updated', legacy ? list[list.length - 1].v : ack, cur, [ renderChanges(list) ], [
				h('button', { type: 'button', 'class': 'nf-upd-go', text: 'Got it', onclick: function () {
					lsSet(ACKKEY, cur); lsSet(SEENKEY, cur); closeUpd();
				} })
			]);
		}).catch(function () { /* not marked as seen: retry after the next sign-in */ });
	}
	function restartSession() {
		var env = window.L && window.L.env;
		lsSet(SKIPKEY, null);
		window.location.href = ((env && env.scriptname) || '/cgi-bin/luci') + '/admin/logout';
	}
	function runUpdate(tag) {
		if (updBusy) return;
		updBusy = true;
		var bar = h('i'), msg = h('p', { 'class': 'nf-upd-msg', text: 'Starting…' });
		openUpd('Nightfall update', [ h('div', { 'class': 'nf-upd-bar' }, [ bar ]), msg, h('p', { 'class': 'nf-upd-note', text: 'Do not close the page or turn off the router.' }) ]);
		var errs = 0, t0 = Date.now(), lastPct = 0;
		function finish(ok, text, canRestart) {
			updBusy = false;
			var btns = [];
			if (canRestart) { lsSet(SEENKEY, verInfo ? verInfo.version : null); btns.push(h('button', { type: 'button', 'class': 'nf-upd-go', text: 'Restart session', onclick: restartSession })); }
			else btns.push(h('button', { type: 'button', 'class': 'nf-upd-go', text: 'Close', onclick: closeUpd }));
			openUpd(ok ? 'Update installed' : 'Update failed', [ h('p', { 'class': 'nf-upd-msg' + (ok ? '' : ' bad'), text: text }), h('div', { 'class': 'nf-upd-btns' }, btns) ]);
			if (canRestart) window.setTimeout(function () { if (updModal) restartSession(); }, 4000);
		}
		function poll() {
			updExec('status').then(function (s) {
				errs = 0;
				if (s.state === 'done') return finish(true, (s.msg || 'Installed.') + ' The session will now restart; sign in again to apply all changes.', true);
				if (s.state === 'error' || s.state === 'rolledback') return finish(false, s.msg || 'Unknown error.', false);
				if (s.state === 'idle' && Date.now() - t0 > 15000) return finish(false, 'The update did not start.', false);
				lastPct = Math.max(lastPct, +s.pct || 0);
				bar.style.width = lastPct + '%'; msg.textContent = s.msg || '…';
				window.setTimeout(poll, 1500);
			}).catch(function () {
				/* rpcd may not respond while restarting: if installation was already under way, treat it as finished */
				errs++;
				if (errs >= 4 && lastPct >= 65) return finish(true, 'The update appears to be installed (the router restarted the service). Sign in again.', true);
				if (errs >= 8) return finish(false, 'No response from the router. Reload the page and check the version.', false);
				window.setTimeout(poll, 2000);
			});
		}
		lsSet(SEENKEY, verInfo ? verInfo.version : null);
		updExec('start').then(function () { window.setTimeout(poll, 1200); }).catch(function (e) {
			finish(false, e && e.message === 'denied' ? 'No permission to run the update. Sign out and sign in again, then retry; if that does not help, update manually (install-update.sh).' : 'Could not start the update.', false);
		});
	}
	var SNZKEY = 'nightfall-upd-snooze', LOGKEY = 'nightfall-upd-login';
	function offerUpdate(force) {
		var tag = updAvail();
		if (!tag || updBusy || document.body.classList.contains('nf-blank') || !sid()) return;
		if (!force && (updModal || lsGet(SNZKEY) === sid().sessionid)) return;      /* "Later" lasts until the next sign-in */
		var log = h('div', { 'class': 'nf-upd-more' }), loaded = false, moreBtn;
		function toggleMore() {
			var open = log.classList.toggle('open');
			moreBtn.textContent = open ? 'Hide' : 'What will change';
			box.classList.toggle('expanded', open);
			if (open && !loaded) {
				loaded = true;
				log.appendChild(h('p', { 'class': 'nf-upd-note', text: 'Loading the list of changes…' }));
				loadChangelog('https://raw.githubusercontent.com/' + REPO + '/main/CHANGELOG.md?' + Math.floor(Date.now() / 300000)).then(function (all) {
					var list = all.filter(function (x) { return verInfo && isNewer(verInfo.version, x.v) && !isNewer(tag, x.v); }).slice(0, 4);
					log.textContent = '';
					log.appendChild(list.length ? renderChanges(list) : h('p', { 'class': 'nf-upd-note', text: 'No list of changes found for this version.' }));
				}).catch(function () { log.textContent = ''; log.appendChild(h('p', { 'class': 'nf-upd-note', text: 'Could not load the list of changes (GitHub did not respond).' })); });
			}
		}
		moreBtn = h('button', { type: 'button', text: 'What will change', onclick: toggleMore });
		var box = openCard('New version available', 'Nightfall ' + fullTag(tag), verInfo && verInfo.version, tag, [
			h('p', { 'class': 'nf-upd-msg', text: 'The router will download and install the update itself, verify the signature and roll back on error. After installing, you need to sign in to LuCI again.' }),
			log
		], [
			moreBtn,
			h('button', { type: 'button', text: 'Later', onclick: function () { lsSet(SNZKEY, sid() ? sid().sessionid : '1'); closeUpd(); } }),
			h('button', { type: 'button', 'class': 'nf-upd-go', text: 'Update', onclick: function () { runUpdate(tag); } })
		], 'sheet');
	}
	/* check at every LuCI sign-in and once more a minute after */
	function loginCheck() {
		var env = sid();
		if (!env || document.body.classList.contains('nf-blank') || prefs.updCheck === false) return;
		var st = null;
		try { st = JSON.parse(lsGet(LOGKEY) || 'null'); } catch (e) { st = null; }
		if (!st || st.sid !== env.sessionid) st = { sid: env.sessionid, t: Date.now(), a: 0, b: 0 };
		function save() { lsSet(LOGKEY, JSON.stringify(st)); }
		save();
		if (!st.a) { st.a = 1; save(); checkUpdate(false, true); }
		if (!st.b) {
			window.setTimeout(function () {
				var cur = null; try { cur = JSON.parse(lsGet(LOGKEY) || 'null'); } catch (e) { cur = null; }
				if (!cur || cur.sid !== env.sessionid || cur.b) return;
				cur.b = 1; lsSet(LOGKEY, JSON.stringify(cur));
				checkUpdate(false, true);
			}, Math.max(500, 60000 - (Date.now() - st.t)));
		}
	}

	function paintRange(el) {
		var lo = +el.min || 0, hi = +el.max || 100, p = hi > lo ? (el.value - lo) / (hi - lo) * 100 : 0;
		el.style.setProperty('--p', p + '%');
		var out = el.parentNode && el.parentNode.querySelector('.nf-rng-v');
		if (out) out.textContent = el.value + (el.getAttribute('data-unit') === 'px' ? ' px' : '%');
	}

	function refreshPanel() {
		refreshQuick();
		if (!pop) return;
		if (refs.renderOv) refs.renderOv();

		Object.keys(refs.mode).forEach(function (k) {
			refs.mode[k].setAttribute('aria-pressed', String(prefs.mode === k));
		});

		refs.sw.forEach(function (p) { p[1].setAttribute('aria-pressed', String(prefs.accent === p[0])); });
		Object.keys(refs.bg).forEach(function (k) { refs.bg[k].setAttribute('aria-pressed', String(prefs.bg === k)); });
		refs.scale.value = String(prefs.bgScale);
		refs.scale.disabled = prefs.bg === 'mica' || prefs.bg === 'flat' || prefs.bg === 'aurora' || prefs.bg === 'waves' || prefs.bg === 'mesh' || prefs.bg === 'sunset' || prefs.bg === 'ocean' || prefs.bg === 'tod' || prefs.bg === 'weather';
		if (refs.wxSec) refs.wxSec.hidden = prefs.bg !== 'weather';
		if (refs.wxLat) { refs.wxLat.value = prefs.wxLat || ''; refs.wxLon.value = prefs.wxLon || ''; }
		refs.color.value = hexToRgb(prefs.accent) ? prefs.accent : '#0067c0';
		[ [ 'density', 'normal' ], [ 'font', 'md' ], [ 'fontFam', '' ], [ 'icStyle', 'line' ], [ 'radius', 'md' ], [ 'glass', 'on' ], [ 'chart', 'area' ], [ 'chartPal', 'accent' ], [ 'chartW', '2' ], [ 'loginBg', 'mica' ], [ 'constKind', 'net' ], [ 'glassTone', 'auto' ], [ 'ovSize', 'md' ] ].forEach(function (k) {
			Object.keys(refs[k[0]]).forEach(function (v) { refs[k[0]][v].setAttribute('aria-pressed', String((prefs[k[0]] || k[1]) === v)); });
		});
		Object.keys(refs.navOpenMode).forEach(function (k) { refs.navOpenMode[k].setAttribute('aria-pressed', String((prefs.navOpenMode || 'click') === k)); });
		Object.keys(refs.preset).forEach(function (k) { refs.preset[k].setAttribute('aria-pressed', String(prefs.preset === k)); });
		refs.schedule.checked = !!prefs.schedule;
		if (refs.upd) refs.upd.checked = prefs.updCheck !== false;
		paintVer();
		refs.nightFrom.value = prefs.nightFrom || '20:00';
		refs.dayFrom.value = prefs.dayFrom || '07:00';
		pop.querySelector('.nf-pop-times').toggleAttribute('data-on', !!prefs.schedule);
		[ 'chartSmooth', 'loginClock', 'loginInfo', 'ovLive', 'ovBadges', 'navMini', 'netBar', 'constLogin', 'constApp', 'hints', 'ovTop', 'ovApps', 'ovBlock', 'ovWifi', 'ovEvents', 'ovHealth', 'ovQuick' ].forEach(function (k) { refs[k].checked = k === 'constApp' ? !!prefs[k] : prefs[k] !== false; });
		refs.motion.checked = !!prefs.motion;
		refs.liteAuto.checked = prefs.liteAuto !== false;
		refs.ovWide.checked = !!prefs.ovWide;
		var cc = Array.isArray(prefs.loginCells) ? prefs.loginCells : [ 'net', 'up', 'fw' ];
		refs.cells.forEach(function (sel, i) { sel.value = cc[i] || 'none'; });
		refs.gblur.value = String(prefs.glassBlur == null ? 28 : prefs.glassBlur);
		refs.galpha.value = String(prefs.glassAlpha || 100);
		refs.gblur.disabled = refs.galpha.disabled = prefs.style !== 'glass';
		refs.motion.disabled = !!mqMotion.matches;
		Array.prototype.forEach.call(pop.querySelectorAll('input[type="range"]'), paintRange);
		pop.querySelector('.nf-seg[aria-label="Mode"]').toggleAttribute('data-fixed', root.hasAttribute('data-nf-fixed') || !!prefs.schedule);
	}

	function toggle(open) {
		if (!pop) buildPanel();

		var show = open == null ? !pop.classList.contains('open') : open;
		pop.classList.toggle('open', show);
		if (btn) btn.setAttribute('aria-expanded', String(show));
	}

	var MODE_NEXT = { auto: 'light', light: 'dark', dark: 'auto' };
	var MODE_NAME = { auto: 'Auto', light: 'Light', dark: 'Dark' };
	var qbtn = null;

	function refreshQuick() {
		if (!qbtn) return;
		qbtn.setAttribute('data-mode', prefs.mode);
		var nm = prefs.schedule ? 'Scheduled' : MODE_NAME[prefs.mode];
		qbtn.setAttribute('title', 'Theme: ' + nm + ' (click to change)');
		qbtn.firstChild.textContent = 'Theme: ' + nm;
		qbtn.disabled = root.hasAttribute('data-nf-fixed');
	}

	document.addEventListener('DOMContentLoaded', function () {
		btn = document.querySelector('.nf-pers');
		if (!btn) return;

		/* quick Auto / Light / Dark switch */
		qbtn = h('button', { type: 'button', 'class': 'nf-pers nf-qmode', onclick: function () { if (prefs.schedule) set('schedule', false); else set('mode', MODE_NEXT[prefs.mode] || 'auto'); } }, [ h('span') ]);
		btn.parentNode.insertBefore(qbtn, btn);
		btn.classList.remove('nf-pers'); btn.classList.add('nf-pers-main', 'nf-pers');
		btn = document.querySelector('.nf-pers-main');
		refreshQuick();

		initTabbar();
		initMobile();
		initHashAction();
		initPill();
		scheduleIcons();
		new MutationObserver(scheduleIcons).observe(document.body, { childList: true, subtree: true });

		/* collapse the menu to icons */
		var nb = h('button', { type: 'button', 'class': 'nf-navbtn', title: 'Collapse / expand menu', onclick: function () { set('navMini', !prefs.navMini); } }, [ h('span', { text: 'Collapse menu' }) ]);
		qbtn.parentNode.insertBefore(nb, qbtn);

		/* Ctrl/Cmd+K or "/" focuses the menu search */
		document.addEventListener('keydown', function (ev) {
			var t = ev.target, typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
			var hit = ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') || (ev.key === '/' && !typing && !ev.ctrlKey && !ev.metaKey && !ev.altKey);
			var f = document.getElementById('nf-find');
			if (!hit || !f) return;
			ev.preventDefault();
			document.body.classList.add('nf-nav-open');
			f.focus(); f.select();
		});

		btn.addEventListener('click', function (ev) { ev.stopPropagation(); toggle(); });
		document.addEventListener('click', function (ev) {
			if (pop && pop.classList.contains('open') && !pop.contains(ev.target)) toggle(false);
		});
		document.addEventListener('keydown', function (ev) {
			if (ev.key === 'Escape' && pop && pop.classList.contains('open')) { toggle(false); btn.focus(); }
		});
	});


	/* ripple on buttons */
	document.addEventListener('pointerdown', function (ev) {
		if (root.getAttribute('data-nf-motion') === 'off') return;
		var b = ev.target.closest && ev.target.closest('.cbi-button, .btn, .nf-pop-io button, .nf-ed-open');
		if (!b || b.disabled) return;
		var r = b.getBoundingClientRect();
		b.style.setProperty('--rx', (ev.clientX - r.left) + 'px'); b.style.setProperty('--ry', (ev.clientY - r.top) + 'px');
		b.classList.remove('nf-rp'); void b.offsetWidth; b.classList.add('nf-rp');
		setTimeout(function () { b.classList.remove('nf-rp'); }, 650);
	}, true);

	window.Nightfall = { prefs: function () { return Object.assign({}, prefs); }, set: set, layout: applyLayout, layouts: LAYOUTS.map(function (l) { return [ l[0], l[1] ]; }), accents: ACCENTS };
})();

/* v1.10.4: sliding "pill" under the active menu item and Monitor tab, slider track fill */
(function () {
	'use strict';
	var hoverOk = window.matchMedia && window.matchMedia('(hover: hover)').matches;

	function pill(box, itemSel, activeSel, follow) {
		if (box.__nfPill) return;
		var p = document.createElement('span');
		p.className = 'nf-pill'; p.setAttribute('aria-hidden', 'true');
		box.insertBefore(p, box.firstChild);
		box.__nfPill = p;
		var shown = false, queued = false;
		function place(el) {
			if (!el || !box.offsetParent || !el.offsetParent) { p.removeAttribute('data-on'); box.removeAttribute('data-pill'); shown = false; return; }
			var cr = box.getBoundingClientRect(), er = el.getBoundingClientRect();
			if (!er.width) return;
			box.setAttribute('data-pill', '1');
			p.style.width = er.width + 'px'; p.style.height = er.height + 'px';
			p.style.transform = 'translate(' + (er.left - cr.left - box.clientLeft + box.scrollLeft) + 'px,' + (er.top - cr.top - box.clientTop + box.scrollTop) + 'px)';
			if (!shown) { p.style.transition = 'none'; void p.offsetWidth; p.style.transition = ''; shown = true; }
			p.setAttribute('data-on', '1');
		}
		function home() { place(box.querySelector(activeSel)); }
		function later() { if (queued) return; queued = true; requestAnimationFrame(function () { queued = false; home(); }); }
		if (follow && hoverOk) {
			box.addEventListener('mouseover', function (ev) { var a = ev.target.closest && ev.target.closest('a'); if (a && a.parentNode && a.parentNode.parentNode === box) place(a); });
			box.addEventListener('mouseleave', home);
		}
		new MutationObserver(function (m) { if (m.some(function (x) { return x.target !== p; })) later(); }).observe(box, { attributes: true, attributeFilter: ['class', 'hidden', 'style'], childList: true, subtree: true });
		window.addEventListener('resize', later);
		box.addEventListener('click', function () { setTimeout(home, 260); });
		box.addEventListener('scroll', later, { passive: true });
		home(); setTimeout(home, 300);
	}

	function range(r) {
		var set = function () { var mn = +r.min || 0, mx = r.max === '' ? 100 : +r.max, v = +r.value; r.style.setProperty('--p', (mx > mn ? (v - mn) / (mx - mn) * 100 : 0) + '%'); };
		set(); r.__nfRange = 1;
	}

	var q = false;
	function scan() {
		q = false;
		document.querySelectorAll('.nfm-tabs:not(.nfm-diag-chips)').forEach(function (b) { pill(b, '.nfm-tab', '.nfm-tab.on', false); });
		var nav = document.querySelector('header ul.nav:not(.dropdown-menu)');
		if (nav) pill(nav, 'a', ':scope > li.active > a', true);
		document.querySelectorAll('input[type="range"]').forEach(function (r) { if (!r.__nfRange) range(r); });
	}
	function sched() { if (!q) { q = true; requestAnimationFrame(scan); } }
	document.addEventListener('input', function (ev) { var r = ev.target; if (r && r.type === 'range') range(r); }, true);
	function start() { scan(); new MutationObserver(sched).observe(document.body, { childList: true, subtree: true }); }
	if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
