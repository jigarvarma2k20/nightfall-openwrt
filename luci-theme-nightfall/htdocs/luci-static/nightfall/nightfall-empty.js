/* Empty table rows on phones (v1.17.1): "This section contains no values yet" and "Scanning…" must span the full table width
   and be centered. LuCI styles and mobile.css sometimes shrink the cell to half the width, so if the cell is noticeably narrower
   than the table, we set the needed values directly on the elements. Independent of row class names: we look for <em> in a single-cell row. */
(function () {
	'use strict';
	try {
		var mq = window.matchMedia ? window.matchMedia('(max-width: 899px)') : null;
		var raf = 0;
		var set = function (n, o) { for (var k in o) n.style.setProperty(k, o[k], 'important'); };
		var FULL = { width: '100%', 'max-width': '100%', 'min-width': '0', margin: '0', float: 'none', 'box-sizing': 'border-box', transform: 'none' };
		var fixEm = function (em) {
			var row = em.closest('.tr, tr');
			if (!row || row.children.length !== 1) return;
			var tb = row.parentElement && row.parentElement.closest('.table, table, .cbi-section-table');
			if (!tb) return;
			var wt = tb.getBoundingClientRect().width, td = row.firstElementChild;
			if (!wt || td.getBoundingClientRect().width >= wt * 0.9) return;
			for (var n = em.parentElement; n && n !== tb; n = n.parentElement) {
				set(n, FULL);
				if (n === row) set(n, { display: 'block', position: 'static', height: 'auto', flex: '0 0 100%' });
				else if (n === td) set(n, { display: 'flex', position: 'static', height: 'auto', flex: '0 0 100%', 'flex-direction': 'column', 'align-items': 'center', 'justify-content': 'center', 'text-align': 'center', padding: '26px 16px' });
			}
		};
		var fix = function () {
			raf = 0;
			if (!mq || !mq.matches) return;
			document.querySelectorAll('.table em, .cbi-section-table em, table em').forEach(fixEm);
		};
		var sched = function () { if (!raf) raf = requestAnimationFrame(fix); };
		var start = function () {
			fix();
			new MutationObserver(sched).observe(document.body, { childList: true, subtree: true });
			window.addEventListener('resize', sched); window.addEventListener('load', sched);
		};
		if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
	} catch (e) { /* do not break the rest of the page */ }
})();
