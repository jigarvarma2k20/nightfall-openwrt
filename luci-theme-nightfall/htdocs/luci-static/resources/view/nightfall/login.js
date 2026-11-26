'use strict';
'require ui';
'require view';

/*
 * Nightfall: sign-in screen.
 * On top of the standard LuCI dialog: a router summary (from the template's data-* attributes),
 * remembering the username, Caps Lock and keyboard layout hints,
 * and a "Forgot password?" hint. The theme never stores the password (the browser may remember it).
 */

const KEY = 'nightfall-login-user';

const TEXT = {
	en: {
		net: 'Internet', up: 'Uptime', fw: 'Firmware', speed: 'Speed', test: 'Speed test', mbit: 'Mbit/s', temp: 'Temperature', cpu: 'CPU', mem: 'Memory', cl: 'Devices', dec: '.',
		online: 'online', offline: 'offline', nodata: 'no data', ms: 'ms',
		d: 'd', h: 'h', m: 'min',
		remember: 'Remember username', forgot: 'Forgot password?',
		caps: 'Caps Lock is on', layout: 'Non-Latin letters typed — check your keyboard layout',
		bad: 'Wrong username or password. Check keyboard layout and Caps Lock.',
		helpTitle: 'Getting in without a password',
		help: [
			[ 'You have SSH access', 'Connect and run: passwd' ],
			[ 'No access', 'Reboot the router and press reset while the LED blinks fast at the start of boot (the button depends on the model). Connect by cable to 192.168.1.1 via telnet and run: mount_root; passwd; reboot' ],
			[ 'Nothing worked', 'Factory reset with the reset button (about 10 seconds). All settings will be lost.' ]
		]
	}
};

function store(fn) {
	try { return fn(window.localStorage); } catch (e) { return null; }
}

return view.extend({
	render() {
		const form = document.querySelector('form');
		const btn = document.querySelector('button');
		const T = TEXT.en;
		const info = document.getElementById('view');
		const user = form.querySelector('input[type="text"]');
		const failed = !!document.querySelector('section .alert-message');

		const dlg = ui.showModal(
			_('Authorization Required'),
			Array.from(document.querySelectorAll('section > *')),
			'login'
		);

		/* --- header: name and model --- */
		const h = dlg.querySelector('h4');
		const plate = E('div', { 'class': 'nf-plate' }, [
			E('b', {}, (info && info.dataset.host) || ''),
			E('span', {}, (info && info.dataset.model) || '')
		]);
		dlg.insertBefore(plate, h ? h.nextSibling : dlg.firstChild);

		/* the summary (cards) is drawn by nightfall.js: it is always fresh, while the browser may cache this module */

		/* --- username: remember --- */
		const saved = store((s) => s.getItem(KEY));
		const remember = E('input', { type: 'checkbox', id: 'nf-remember' });
		remember.checked = saved !== null;
		if (saved && (!user.value || user.value === 'root'))
			user.value = saved;

		/* --- hint under the password --- */
		const pw = dlg.querySelector('input[type="password"]');
		const hint = E('div', { 'class': 'nf-lhint', 'aria-live': 'polite' });
		let caps = false;

		const showHint = () => {
			const msg = caps ? T.caps : /[\u0400-\u04FF]/.test(pw.value) ? T.layout : '';
			hint.textContent = msg;
			hint.classList.toggle('on', !!msg);
		};

		if (pw) {
			pw.parentNode.parentNode.appendChild(hint);
			const capsCheck = (ev) => {
				if (ev.getModifierState) {
					caps = ev.getModifierState('CapsLock');
					showHint();
				}
			};
			pw.addEventListener('keydown', capsCheck);
			pw.addEventListener('keyup', capsCheck);
			pw.addEventListener('input', showHint);
			pw.addEventListener('blur', () => { caps = false; showHint(); });
		}

		/* --- row: remember / forgot password --- */
		const helpBox = E('div', { 'class': 'nf-help', hidden: true }, [
			E('b', {}, T.helpTitle),
			E('dl', {}, T.help.map((r) => [ E('dt', {}, r[0]), E('dd', {}, r[1]) ]).flat())
		]);

		const forgot = E('button', { type: 'button', 'class': 'nf-link', 'aria-expanded': 'false',
			click: () => {
				const open = helpBox.hidden;
				helpBox.hidden = !open;
				forgot.setAttribute('aria-expanded', open);
			} }, T.forgot);

		const row = E('div', { 'class': 'nf-row' }, [
			E('label', { 'for': 'nf-remember' }, [ remember, E('span', {}, T.remember) ]),
			forgot
		]);

		const submitBtn = dlg.querySelector('button.important');
		dlg.insertBefore(row, submitBtn);
		dlg.appendChild(helpBox);

		/* --- sign-in error: highlight the field and focus --- */
		if (failed) {
			const alertEl = dlg.querySelector('.alert-message');
			if (alertEl)
				alertEl.textContent = T.bad;
			dlg.classList.add('nf-shake');
			if (pw)
				pw.classList.add('nf-bad');
		}

		form.addEventListener('keypress', (ev) => {
			if (ev.key === 'Enter')
				btn.click();
		});

		let busy = false;
		btn.addEventListener('click', () => {
			if (busy)
				return;
			busy = true;
			store((s) => remember.checked ? s.setItem(KEY, user.value) : s.removeItem(KEY));

			/* a real form submission (with a submit event while the fields are visible): this way the browser and password manager notice the sign-in
			   and offer to save the password. Previously the fields were hidden before submitting, and the "Save password?" prompt never appeared. */
			if (form.requestSubmit)
				form.requestSubmit();
			else
				form.submit();

			window.setTimeout(() => {
				dlg.querySelectorAll('*').forEach((node) => {
					node.style.display = 'none';
				});
				dlg.appendChild(E('div', {
					class: 'spinning'
				}, _('Logging in…')));
			}, 50);
		});

		/* --- lock screen clock --- */
		const lock = E('div', { 'class': 'nf-lock' }, [ E('b'), E('span') ]);
		const loc = document.documentElement.lang || undefined;
		const tick = () => {
			const now = new Date();
			lock.firstChild.textContent = now.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
			lock.lastChild.textContent = now.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' });
		};

		tick();
		window.setInterval(tick, 10000);
		document.body.appendChild(lock);

		/* --- show password --- */
		if (pw) {
			const eye = E('button', { type: 'button', 'class': 'nf-eye', title: _('Show password'), 'aria-label': _('Show password'),
				click: (ev) => {
					ev.preventDefault();
					const show = pw.type === 'password';
					pw.type = show ? 'text' : 'password';
					eye.classList.toggle('on', show);
					pw.classList.toggle('nf-pw-on', show);
					pw.focus();
				} });
			pw.parentNode.classList.add('nf-pw');
			pw.parentNode.appendChild(eye);

			/* username already known: focus the password; otherwise the username */
			if (user.value) {
				pw.focus();
				if (failed)
					pw.select();
			}
			else {
				user.focus();
			}
		}

		return '';
	},

	addFooter() {},

});
