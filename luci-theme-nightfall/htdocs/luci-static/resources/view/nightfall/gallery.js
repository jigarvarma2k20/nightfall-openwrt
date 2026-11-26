'use strict';
'require view';
'require ui';

/*
 * Nightfall: a page with every UI element (System → "Nightfall: all elements").
 * Used to quickly check the theme on a phone and a computer in light and dark mode after any change:
 * tabs, buttons, forms, tables (including the Wi-Fi client list), notifications, dialogs.
 * At the bottom there is a simulated LuCI poll: the block is recreated every 5 seconds, like on the "Status" and "Wi-Fi" pages,
 * so you can see right away whether the page jumps.
 */

const nf = new Intl.NumberFormat('ru-RU');
const CLIENTS = [
	[ 'Access point "2.4 GHz" (phy0-ap0)', '60:3D:61:C4:8A:A4', 'Yandex-Station3.lan (192.168.1.132, fd61:bde8:2d8d::805)', -71, '72.2 Mbit/s, 20 MHz, MCS 7, Short GI' ],
	[ 'Access point "2.4 GHz" (phy0-ap0)', '3A:09:E7:7F:81:FE', '192.168.1.174', -73, '65 Mbit/s, 20 MHz, MCS 7' ],
	[ 'Access point "5 GHz" (phy1-ap0)', '24:55:9A:72:CB:07', 'BULAT.lan (192.168.1.113, fe80::c2:a4b2:8ad0:6c64)', -44, '1200.9 Mbit/s, 80 MHz, HE-MCS 11, HE-NSS 2' ]
];

function section(title, nodes) {
	return E('div', { 'class': 'cbi-section' }, [ E('h3', {}, title) ].concat(nodes));
}

function row(title, widget, descr) {
	return E('div', { 'class': 'cbi-value' }, [
		E('label', { 'class': 'cbi-value-title' }, title),
		E('div', { 'class': 'cbi-value-field' }, [ widget, descr ? E('div', { 'class': 'cbi-value-description' }, descr) : '' ])
	]);
}

function table(cols, rows, cls) {
	return E('div', { 'class': 'table ' + (cls || 'cbi-section-table') }, [
		E('div', { 'class': 'tr table-titles cbi-section-table-titles' }, cols.map(c => E('div', { 'class': 'th cbi-section-table-cell' }, c))),
		...rows.map(r => E('div', { 'class': 'tr cbi-section-table-row' }, r.map(c => E('div', { 'class': 'td cbi-section-table-cell' }, c))))
	]);
}

function clientsTable(jitter) {
	return table([ 'Network', 'MAC address', 'Host', 'Signal / Noise', 'RX rate / TX rate', '' ],
		CLIENTS.map(c => [
			E('span', { 'class': 'ifacebadge' }, c[0]), c[1], c[2],
			E('span', { 'class': 'ifacebadge' }, (c[3] + (jitter ? Math.round(Math.random() * 6 - 3) : 0)) + ' / -92 dBm'),
			c[4],
			E('button', { 'class': 'cbi-button cbi-button-remove' }, 'Disconnect')
		]), 'assoclist');
}

return view.extend({
	render() {
		let simTimer = null, simTicks = 0;
		const simBox = E('div'), simInfo = E('div', { 'class': 'cbi-value-description' });

		const simTick = () => {
			simTicks++;
			simInfo.textContent = 'Updates: ' + simTicks + '. If the page jumps, something is visibly being redrawn.';
			/* like LuCI: new nodes every time, including the fade-in class and table headers */
			simBox.replaceChildren(E('div', { 'class': 'cbi-section fade-in' }, [ E('h3', {}, 'Connected clients (simulated poll)'), clientsTable(true) ]));
		};
		const simToggle = on => {
			window.clearInterval(simTimer); simTimer = null;
			if (on) { simTick(); simTimer = window.setInterval(simTick, 5000); }
			else { simBox.replaceChildren(); simInfo.textContent = 'Off.'; }
		};
		const simCb = E('input', { type: 'checkbox', change: ev => simToggle(ev.target.checked) });

		const tabs = E('ul', { 'class': 'cbi-tabmenu' }, [
			E('li', { 'class': 'cbi-tab' }, E('a', { href: '#' }, 'Active')),
			E('li', { 'class': 'cbi-tab-disabled' }, E('a', { href: '#' }, 'Second')),
			E('li', { 'class': 'cbi-tab-disabled' }, E('a', { href: '#' }, 'Ad blocking')),
			E('li', { 'class': 'cbi-tab-disabled' }, E('a', { href: '#' }, 'DNS over HTTPS')),
			E('li', { 'class': 'cbi-tab-disabled' }, E('a', { href: '#' }, 'Remote access')),
			E('li', { 'class': 'cbi-tab-disabled' }, E('a', { href: '#' }, 'Resource Monitor'))
		]);
		tabs.addEventListener('click', ev => {
			const li = ev.target.closest && ev.target.closest('li');
			if (!li) return;
			ev.preventDefault();
			tabs.querySelectorAll('li').forEach(x => { x.className = x === li ? 'cbi-tab' : 'cbi-tab-disabled'; });
		});

		const dd = new ui.Dropdown('b', { a: 'First option', b: 'Second option', c: 'Third option, a bit longer' }, {});
		const sel = new ui.Select('b', { a: 'Automatic', b: '2.4 GHz', c: '5 GHz' }, {});

		return E('div', {}, [
			E('h2', { name: 'content' }, 'Nightfall: all UI elements'),
			E('div', { 'class': 'cbi-map-descr' }, 'Open this page on a phone and on a computer, in light and dark theme, and scroll to the end. Everything should be readable, with no clipped or overlapping elements.'),

			section('Tabs', [ tabs, E('p', {}, 'Click a tab: the active one is highlighted with the accent color.') ]),

			section('Notifications', [
				E('div', { 'class': 'alert-message info' }, [ E('h4', {}, 'Information'), E('p', {}, 'A regular message for the user.') ]),
				E('div', { 'class': 'alert-message warning' }, [ E('h4', {}, 'Warning'), E('p', {}, 'Something needs attention, but it is not critical.') ]),
				E('div', { 'class': 'alert-message danger' }, [ E('h4', {}, 'Error'), E('p', {}, 'The action could not be completed.') ]),
				E('div', {}, [
					E('button', { 'class': 'cbi-button', click: () => ui.addNotification(null, E('p', {}, 'Test notification'), 'info') }, 'Show notification'),
					' ',
					E('button', { 'class': 'cbi-button', click: () => ui.showModal('Test dialog', [ E('p', {}, 'This is what modal dialogs look like.'), E('div', { 'class': 'right' }, E('button', { 'class': 'btn', click: ui.hideModal }, 'Close')) ]) }, 'Show dialog')
				])
			]),

			section('Buttons', [
				E('div', {}, [
					E('button', { 'class': 'cbi-button' }, 'Default'), ' ',
					E('button', { 'class': 'cbi-button cbi-button-action important' }, 'Primary'), ' ',
					E('button', { 'class': 'cbi-button cbi-button-positive' }, 'Save'), ' ',
					E('button', { 'class': 'cbi-button cbi-button-negative' }, 'Delete'), ' ',
					E('button', { 'class': 'cbi-button', disabled: true }, 'Disabled')
				])
			]),

			section('Form', [
				row('Text field', new ui.Textfield('value', { placeholder: 'Enter text' }).render(), 'Caption under the field.'),
				row('Password', new ui.Textfield('secret', { password: true }).render()),
				row('List (select)', sel.render()),
				row('Dropdown', dd.render()),
				row('Toggle', new ui.Checkbox(true, { value_enabled: '1', value_disabled: '0' }).render()),
				row('Single choice', E('label', {}, [ E('input', { type: 'radio', name: 'g', checked: true }), ' One  ', E('input', { type: 'radio', name: 'g' }), ' Two' ])),
				row('Multiline field', new ui.Textarea('line 1\nline 2', { rows: 3 }).render()),
				row('Progress bar', E('div', { 'class': 'cbi-progressbar', title: '42%' }, E('div', { style: 'width:42%' })))
			]),

			section('Table', [
				table([ 'Name', 'Address', 'Status' ], [
					[ 'lan', '192.168.1.1/24', 'up' ],
					[ 'wan', 'very-long-device-name-without-spaces.example.org', 'no link' ],
					[ 'wg0', 'fd61:bde8:2d8d:0:2d8:4d03:f7b:da35', 'up' ]
				])
			]),

			section('Connected clients (as on the Wi-Fi page)', [ clientsTable(false) ]),

			section('Simulated poll (jitter check)', [
				row('Refresh every 5 seconds', simCb, 'Turn it on and watch for 20–30 seconds: the page should not flicker or jump.'),
				simInfo, simBox
			])
		]);
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
