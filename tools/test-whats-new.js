'use strict';
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('luci-theme-nightfall/htdocs/luci-static/nightfall/nightfall.js', 'utf8');
const start = source.indexOf('\tfunction versionParts(');
const end = source.indexOf('\n\tfunction updCache()', start);
if (start < 0 || end < 0) throw new Error('Version comparison helpers were not found');

const context = {};
vm.runInNewContext(source.slice(start, end) + '\nglobalThis.compareVersions = isNewer;', context);

const cases = [
  ['1.27.7-alpha.1-test5', '1.27.7', true],
  ['1.27.7', '1.27.7-alpha.1-test5', false],
  ['1.27.6', '1.27.7', true],
  ['1.27.7', '1.27.7', false],
  ['1.27.7-alpha.1', '1.27.7-alpha.2', true],
  ['1.27.7-alpha.2', '1.27.7-alpha.1', false],
  ['1.27.7-beta.1', '1.27.7-rc.1', true],
  ['1.27.7-rc.1', '1.27.7', true]
];
for (const [oldVersion, newVersion, expected] of cases) {
  const actual = context.compareVersions(oldVersion, newVersion);
  if (actual !== expected) {
    throw new Error(oldVersion + ' -> ' + newVersion + ': expected ' + expected + ', got ' + actual);
  }
}
console.log('Version precedence tests passed.');

// What's new classifier: English tags/words from CHANGELOG.md plus Russian ones from releases already published on GitHub.
const kStart = source.indexOf('\tvar CL_TAG = ');
const kEnd = source.indexOf('\n\tfunction renderChanges(', kStart);
if (kStart < 0 || kEnd < 0) throw new Error('Changelog classifier was not found');
const kctx = {};
vm.runInNewContext(source.slice(kStart, kEnd) + '\nglobalThis.lineKind = lineKind; globalThis.CL_TAG = CL_TAG;', kctx);
const kinds = [
  ['[Added] **Router log center**: recognizes syslog levels', 'new', 'New'],
  ['[New] Something new', 'new', 'New'],
  ['[Improved] **Monitor settings**: tidier', 'imp', 'Improved'],
  ['[Fixed] **LuCI navigation**: closes the previous menu', 'fix', 'Fixed'],
  ['[Important] Diagnostics analyzes existing logs', 'warn', 'Important'],
  ['[Tests] Added checks for syslog levels', 'imp', 'Improved'],
  ['Added a backup button', 'new', 'New'],
  ['Now the panel remembers the tab', 'new', 'New'],
  ['Fixed the empty table width', 'fix', 'Fixed'],
  ['Tooltips no longer get clipped', 'fix', 'Fixed'],
  ['After updating, sign in again', 'warn', 'Important'],
  ['Faster chart rendering', 'imp', 'Improved'],
  ['**Bold lead** text', 'new', 'New'],
  // Russian release notes (already published)
  ['[Исправлено] **Навигация LuCI**', 'fix', 'Fixed'],
  ['[Новое] Окно журнала', 'new', 'New'],
  ['[Важно] После обновления войдите заново', 'warn', 'Important'],
  ['Исправлена ширина таблиц', 'fix', 'Fixed'],
  ['Подсказки больше не обрезаются', 'fix', 'Fixed'],
  ['Добавлена кнопка резервной копии', 'new', 'New'],
  ['Быстрее рисуются графики', 'imp', 'Improved']
];
for (const [line, kind, label] of kinds) {
  const actual = kctx.lineKind(line);
  if (actual[0] !== kind || actual[1] !== label) {
    throw new Error('lineKind(' + JSON.stringify(line) + '): expected ' + kind + '/' + label + ', got ' + actual.join('/'));
  }
}
if ('[Fixed] **X**: y'.replace(kctx.CL_TAG, '') !== '**X**: y') throw new Error('CL_TAG does not strip English tags');
if ('[Исправлено] X'.replace(kctx.CL_TAG, '') !== 'X') throw new Error('CL_TAG does not strip Russian tags');
console.log('What\'s new classifier tests passed.');
