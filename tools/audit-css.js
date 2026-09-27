/* 一次性审计脚本：找出 style.css 中未被任何页面/脚本引用的类名
   用法：node tools/audit-css.js
   说明：动态拼接的类名（如 'rel-cell s' + n、'active' 等）会出现在白名单里。 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');

const sources = ['index.html', 'test.html', 'result.html', 'relation.html', '404.html', 'script.js',
  'sw.js', 'tools/make-type-pages.js', 'data/questions.js', 'data/profile.js']
  .map(f => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } })
  .join('\n');
const typePages = fs.readdirSync(path.join(ROOT, 'types')).map(f => fs.readFileSync(path.join(ROOT, 'types', f), 'utf8')).join('\n');

/* 已知的动态/状态类名与伪类辅助名 */
const ALLOW = new Set([
  'active', 'selected', 'done', 'show', 'rise', 'in', 'visible', 'hidden', 'open',
  'no-anim', 'reduced', 'loading', 's0', 's1', 's2', 's3', 's4', 'flat', 'high', 'low',
  'toast-show', 'is-active'
]);

const classes = new Set();
const re = /\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)/g;
let m;
while ((m = re.exec(css)) !== null) classes.add(m[1]);

const unused = [];
classes.forEach(c => {
  if (ALLOW.has(c)) return;
  const needle = new RegExp('[\\s"\'`.]' + c.replace(/[-]/g, '\\-') + '[\\s"\'`.:\\[{)]');
  if (!needle.test(sources) && !needle.test(typePages)) unused.push(c);
});

console.log('CSS 中类名总数: ' + classes.size);
console.log('未被引用的类名: ' + unused.length);
if (unused.length) console.log(unused.sort().join(', '));
