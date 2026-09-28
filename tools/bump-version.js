/* ============================================================
   发版工具（npm run bump -- 4.5.0）
   ------------------------------------------------------------
   一处改版、全站生效需要同步多个位置，手工改极易漏。本工具统一更新：
   1. package.json 的 version
   2. sw.js 的 CACHE_VERSION（mbti-vX.Y.Z）与预缓存清单里的 ?v=
   3. 各页面 <link>/<script> 上的 ?v=（缓存击穿：新 URL 必然回源，
      即使 Service Worker 里还留着旧缓存也不会命中）
   4. 类型页生成器模板里的 ?v=
   5. tools/verify-deploy.js 里对线上缓存版本的断言
   6. script.js 里的 BUILD 常量（页脚/控制台可见，便于确认线上版本）
   用法：node tools/bump-version.js 4.5.0
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const version = (process.argv[2] || '').trim();
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('用法：node tools/bump-version.js <major.minor.patch>   例如 4.5.0');
  process.exit(1);
}
const cacheVersion = 'mbti-v' + version;
const changes = [];

function edit(rel, fn) {
  const p = path.join(ROOT, rel);
  const before = fs.readFileSync(p, 'utf8');
  const after = fn(before);
  if (after !== before) {
    fs.writeFileSync(p, after, 'utf8');
    changes.push(rel);
  }
}

/* 1. package.json */
edit('package.json', s => s.replace(/"version":\s*"[^"]+"/, '"version": "' + version + '"'));

/* 2. sw.js：缓存版本 + 预缓存清单的 ?v= */
edit('sw.js', s => {
  s = s.replace(/const CACHE_VERSION = '[^']+';/, "const CACHE_VERSION = '" + cacheVersion + "';");
  /* 清单里形如 './style.css' / './style.css?v=1.0.0' 统一带上版本号 */
  return s.replace(/'(\.\/(?:style\.css|script\.js|data\/questions\.js|data\/profile\.js|assets\/fonts\/fonts\.css))(\?v=[^']*)?'/g,
    (m, file) => "'" + file + '?v=' + version + "'");
});

/* 3. 页面与生成器：只改 href/src 属性里的资源链接
      （注意不能碰 require('../script.js') 这类模块路径） */
const HTML = ['index.html', 'test.html', 'result.html', 'relation.html', '404.html',
  'tools/make-type-pages.js'];
const ATTR = /(href|src)="([^"]*?)(style\.css|script\.js|data\/questions\.js|data\/profile\.js|assets\/fonts\/fonts\.css)(\?v=[^"]*)?"/g;
HTML.forEach(f => edit(f, s => s.replace(ATTR, (m, attr, prefix, file) => attr + '="' + prefix + file + '?v=' + version + '"')));

/* 4. 部署验证器：线上缓存版本断言 */
edit('tools/verify-deploy.js', s => {
  s = s.replace(/缓存版本 v[\d.]+/, '缓存版本 v' + version);
  return s.replace(/\/mbti-v[\d.]+\\\.[\d.]+\\\.[\d.]+\//, '/mbti-v' + version.replace(/\./g, '\\.') + '/');
});

/* 5. script.js：BUILD 常量 */
edit('script.js', s => s.replace(/var BUILD = '[^']*';/, "var BUILD = '" + version + "';"));

console.log('版本已更新为 ' + version + '（缓存 ' + cacheVersion + '）');
console.log('改动文件：' + (changes.length ? changes.join(', ') : '无'));
console.log('提示：接着执行 npm test → git commit → npm run push → npm run verify');
