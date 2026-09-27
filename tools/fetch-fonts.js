/* ============================================================
   字体本地化工具（把 Google Fonts 拉取为本地 woff2 + 生成 fonts.css）
   ------------------------------------------------------------
   为什么：外部字体 CDN 是渲染阻塞资源，且离线/被墙时版式会退化。
   做法：请求 Google Fonts CSS API（只取 latin 子集）→ 下载 woff2 →
        生成本地 @font-face（font-display: swap），页面改为引用本地文件。
   用法：node tools/fetch-fonts.js
   产物：assets/fonts/*.woff2、assets/fonts/fonts.css
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
/* 只本地化 Inter：它承载数字/拉丁字符（题号、百分比、E/I、Strategist 等）。
   中文正文依赖系统字体（PingFang / 微软雅黑），手写称号改用系统楷体栈，
   因此没有再引入 Caveat（它是拉丁手写体，对中文文案不起作用）。

   注意：Inter 走「可变字体」请求（wght 100..900）→ 单个 woff2 覆盖全部字重，
   实测同一文件对每个字重都会返回相同字节（5 个字重 = 5 份重复，浪费 188KB），
   因此工具会按内容做去重，只保留一份。 */
const CSS_URL = 'https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap';
const OUT_DIR = path.join(__dirname, '..', 'assets', 'fonts');

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': UA }, timeout: 30000 }, res => {
      if (res.statusCode !== 200) { reject(new Error('HTTP ' + res.statusCode + ' for ' + url)); return; }
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject).on('timeout', function () { this.destroy(); reject(new Error('超时: ' + url)); });
  });
}

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log('拉取 Google Fonts CSS …');
  const css = (await fetchBuffer(CSS_URL)).toString('utf8');

  /* 解析：按子集注释分组，取每组里的 @font-face 规则 */
  const blocks = [];
  const re = /\/\*\s*([a-z0-9-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/gi;
  let m;
  while ((m = re.exec(css)) !== null) {
    const subset = m[1].toLowerCase();
    const body = m[2];
    const family = (body.match(/font-family:\s*'([^']+)'/) || [])[1];
    const weight = (body.match(/font-weight:\s*([^;]+);/) || [])[1];
    const style = (body.match(/font-style:\s*(\w+)/) || [])[1] || 'normal';
    const url = (body.match(/url\((https:\/\/[^)]+\.woff2)\)/) || [])[1];
    const range = (body.match(/unicode-range:\s*([^;]+);/) || [])[1] || '';
    if (family && weight && url) blocks.push({ subset, family, weight: weight.trim(), style, url, range });
  }
  console.log('解析到 @font-face 块: ' + blocks.length);

  const latin = blocks.filter(b => b.subset === 'latin');
  console.log('其中 latin 子集: ' + latin.length);
  if (!latin.length) { console.error('✘ 未找到 latin 子集，终止'); process.exit(1); }

  const faces = [];
  const byHash = new Map();   // 内容 SHA-256 → 已保存的文件名（避免重复下载/存储）
  const crypto = require('crypto');
  let total = 0;
  for (const b of latin) {
    const variant = b.weight.indexOf(' ') >= 0 ? 'var' : b.weight;   // 可变字体（如 "100 900"）
    const file = b.family.toLowerCase().replace(/\s+/g, '-') + '-' + variant +
      (b.style === 'italic' ? '-italic' : '') + '.woff2';
    const target = path.join(OUT_DIR, file);
    let buf = null;
    if (fs.existsSync(target)) {
      buf = fs.readFileSync(target);
    } else {
      const fresh = await fetchBuffer(b.url);
      if (fresh.slice(0, 4).toString('ascii') !== 'wOF2') { console.error('  ✘ ' + file + ' 不是有效 woff2，跳过'); continue; }
      buf = fresh;
    }
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    if (byHash.has(hash)) {
      console.log('  ↺ ' + file + ' 与 ' + byHash.get(hash) + ' 内容相同，复用（跳过重复存储）');
      const existing = byHash.get(hash);
      faces.push({ family: b.family, weight: b.weight, style: b.style, file: existing, range: b.range });
      continue;
    }
    if (!fs.existsSync(target)) fs.writeFileSync(target, buf);
    byHash.set(hash, file);
    total += buf.length;
    console.log('  ✓ ' + file + '  ' + (buf.length / 1024).toFixed(1) + ' KB  字重=' + b.weight);
    faces.push({ family: b.family, weight: b.weight, style: b.style, file, range: b.range });
  }

  /* 清理不再需要的旧字体文件（例如切换字体方案后残留的） */
  const keep = new Set(faces.map(f => f.file));
  for (const f of fs.readdirSync(OUT_DIR)) {
    if (f.endsWith('.woff2') && !keep.has(f)) {
      fs.unlinkSync(path.join(OUT_DIR, f));
      console.log('  ✗ 清理无用字体 ' + f);
    }
  }

  /* 生成 fonts.css */
  const cssOut = [
    '/* ============================================================',
    '   本地字体（由 tools/fetch-fonts.js 生成，请勿手改）',
    '   来源：Google Fonts · latin 子集 · font-display: swap',
    '   ============================================================ */',
    ''
  ];
  for (const f of faces) {
    cssOut.push('@font-face {');
    cssOut.push("  font-family: '" + f.family + "';");
    cssOut.push('  font-style: ' + f.style + ';');
    cssOut.push('  font-weight: ' + f.weight + ';');
    cssOut.push('  font-display: swap;');
    cssOut.push('  src: url(' + f.file + ") format('woff2');");
    if (f.range) cssOut.push('  unicode-range: ' + f.range + ';');
    cssOut.push('}');
    cssOut.push('');
  }
  fs.writeFileSync(path.join(OUT_DIR, 'fonts.css'), cssOut.join('\n'));
  console.log('\n✓ 生成 assets/fonts/fonts.css（' + faces.length + ' 个 @font-face）');
  console.log('✓ 字体总体积: ' + (total / 1024).toFixed(1) + ' KB');
})().catch(e => { console.error('FAIL: ' + e.message); process.exit(1); });
