/* ============================================================
   16 型百科页生成器（静态站 • 面向 SEO）
   ------------------------------------------------------------
   为每种人格生成独立落地页：types/intj.html … types/esfp.html
   - 内容全部烘焙进 HTML（爬虫无需执行 JS 即可读到完整档案）
   - 复用站点样式与数据，不新增运行时依赖
   - 同时重写 sitemap.xml（含首页/答题页/结果页 + 16 个类型页）
   用法：npm run types
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

/* 注入浏览器全局依赖，复用引擎里已有的类型数据 */
global.QUESTIONS = require('../data/questions.js').QUESTIONS;
global.BANK_VERSION = require('../data/questions.js').BANK_VERSION;
global.TYPE_PROFILE = require('../data/profile.js').TYPE_PROFILE;
const api = require('../script.js');
const { TYPES, TYPE_EXTRA, TYPE_GROWTH } = api;

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'types');
const SITE = 'https://shay-ckm.github.io/-mbti-test/';
const ORDER = ['INTJ', 'INTP', 'ENTJ', 'ENTP', 'INFJ', 'INFP', 'ENFJ', 'ENFP',
  'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ', 'ISTP', 'ISFP', 'ESTP', 'ESFP'];

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function emblemSvg(letters, color) {
  return '<svg viewBox="0 0 120 120" class="emblem-svg" aria-hidden="true">' +
    '<defs><linearGradient id="embGrad" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="' + color + '"/><stop offset="1" stop-color="#00D2D3"/>' +
    '</linearGradient></defs>' +
    '<polygon points="60,6 108,33 108,87 60,114 12,87 12,33" fill="url(#embGrad)" stroke="rgba(255,255,255,0.55)" stroke-width="2"/>' +
    '<polygon points="60,16 100,38 100,82 60,104 20,82 20,38" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1"/>' +
    '<text x="60" y="68" text-anchor="middle" font-family="Inter, sans-serif" font-size="24" font-weight="800" ' +
    'fill="#FFFFFF" letter-spacing="2">' + letters + '</text></svg>';
}

/* 静态列表 / 编号列表（与结果页视觉一致） */
const ul = items => '<ul class="gc-list">' + (items || []).map(s =>
  '<li><span class="gc-ico">✦</span><span class="gc-li-text">' + esc(s) + '</span></li>').join('') + '</ul>';
const ol = items => '<ol class="gc-list">' + (items || []).map((s, i) =>
  '<li><span class="gc-num">' + (i + 1) + '</span><span class="gc-li-text">' + esc(s) + '</span></li>').join('') + '</ol>';
const chips = items => '<div class="gc-chips">' + (items || []).map(s =>
  '<span class="gc-chip">' + esc(s) + '</span>').join('') + '</div>';

function typeNav(current) {
  return '<div class="type-nav">' + ORDER.map(code => {
    const t = TYPES[code], e = TYPE_EXTRA[code] || {};
    const active = code === current ? ' active' : '';
    return '<a class="type-nav-item' + active + '" href="' + code.toLowerCase() + '.html" ' +
      'style="--tcolor:' + (e.color || '#6C63FF') + '">' +
      '<b>' + code + '</b><span>' + esc(t.zh) + '</span></a>';
  }).join('') + '</div>';
}

function buildPage(code) {
  const t = TYPES[code];
  const e = TYPE_EXTRA[code] || { color: '#6C63FF', soft: '#E7E4FF' };
  const g = TYPE_GROWTH[code] || {};
  const p = (typeof TYPE_PROFILE !== 'undefined' && TYPE_PROFILE[code]) || {};
  const rel = p.relations || {};
  const stress = p.stress || {};
  const title = code + ' ' + t.zh + ' · 性格特点｜职业规划｜关系与成长';
  const desc = code + '（' + t.zh + ' / ' + (e.en || '') + '）完整人格档案：核心特质、优势与注意点、职业规划、关系与社交、压力反应与成长清单。' + (e.tagline || '');
  const url = SITE + 'types/' + code.toLowerCase() + '.html';

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    description: desc,
    url: url,
    inLanguage: 'zh-CN',
    isPartOf: { '@type': 'WebSite', name: 'MBTI 人格实验室', url: SITE }
  };

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)} — MBTI 人格实验室</title>
  <meta name="description" content="${esc(desc)}">
  <meta name="theme-color" content="${e.color}">
  <link rel="canonical" href="${url}">
  <link rel="icon" href="../favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="../assets/apple-touch-icon.png">
  <link rel="manifest" href="../manifest.json">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="MBTI 人格实验室">
  <meta property="og:locale" content="zh_CN">
  <meta property="og:title" content="${esc(code + ' ' + t.zh + ' · ' + (e.en || ''))}">
  <meta property="og:description" content="${esc(e.tagline || desc)}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${SITE}assets/og-image.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(code + ' ' + t.zh)}">
  <meta name="twitter:description" content="${esc(e.tagline || '')}">
  <meta name="twitter:image" content="${SITE}assets/og-image.png">
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  <link rel="preload" as="font" type="font/woff2" href="../assets/fonts/inter-var.woff2" crossorigin>
  <link rel="stylesheet" href="../assets/fonts/fonts.css?v=5.1.0">
  <link rel="stylesheet" href="../style.css?v=5.1.0">
</head>
<body id="page-type" style="--tcolor:${e.color};--tcolor-ink:${e.ink || e.color};--tcolor-soft:${e.soft}">
  <a class="skip-link" href="#main">跳到主内容</a>
  <div class="noise" aria-hidden="true"></div>
  <main class="result-wrap" id="main">
    <header class="result-head">
      <div class="emblem">${emblemSvg(code, e.color)}<span class="emblem-emoji">${t.emoji}</span></div>
      <h1 class="type-zh">${esc(t.zh)}</h1>
      <p class="type-en">${esc(e.en || '')} · ${code}</p>
      <p class="type-quote">「${esc(e.tagline || '')}」</p>
      <div class="tags">${(t.tags || []).map(x => '<span class="tag">' + esc(x) + '</span>').join('')}</div>
      <div class="meta-bar">
        <span class="meta-chip">✦ ${esc(e.group || '')}</span>
        <span class="meta-chip">${code}</span>
        <span class="meta-chip">${esc(t.zh)}</span>
      </div>
    </header>

    <div class="desc-card">
      <h2>📖 关于你</h2>
      <p class="desc-text">${esc(t.desc)}</p>
    </div>

    <div class="result-duo">
      <div class="desc-card"><h2>⚡ 优势清单</h2>${ul(g.strengths)}</div>
      <div class="desc-card"><h2>⚠️ 注意点</h2>${ul(g.weaknesses)}</div>
    </div>

    <div class="gc-card"><h2>🧬 内在驱动力</h2><p class="gc-text">${esc(g.drive)}</p></div>

    <div class="result-duo">
      <div class="desc-card"><h2>🦸 隐藏超能力</h2><p class="desc-text">${esc(e.superpower)}</p></div>
      <div class="desc-card"><h2>🧗 进阶修炼</h2><p class="desc-text">${esc(e.growth)}</p></div>
    </div>

    <div class="gc-card">
      <h2>💼 职业规划</h2>
      <p class="gc-text">${esc(g.workStyle)}</p>
      <h3 class="gc-sub">🎯 推荐岗位</h3>${chips(g.roles)}
      <h3 class="gc-sub">📈 职业建议</h3>${ol(g.careerTips)}
    </div>

    <div class="gc-card">
      <h2>🧭 人生指导</h2>
      <h3 class="gc-sub">🌱 成长方向</h3>${ol(g.lifeTips)}
      <h3 class="gc-sub">🤝 人际相处</h3><p class="gc-text">${esc(g.relationTip)}</p>
    </div>

    <div class="gc-card">
      <h2>💞 关系与社交</h2>
      <h3 class="gc-sub">💗 恋爱</h3><p class="gc-text">${esc(rel.love)}</p>
      <h3 class="gc-sub">🤝 友谊</h3><p class="gc-text">${esc(rel.friend)}</p>
      <h3 class="gc-sub">🏠 家庭</h3><p class="gc-text">${esc(rel.family)}</p>
      <h3 class="gc-sub">💼 职场协作</h3><p class="gc-text">${esc(rel.work)}</p>
    </div>

    <div class="gc-card">
      <h2>🌊 压力下的你</h2>
      <div class="stress-grid">
        <div class="stress-item"><span class="si-ico">🚨</span><div class="si-body"><b class="si-title">压力信号</b><p class="gc-text">${esc(stress.signal)}</p></div></div>
        <div class="stress-item"><span class="si-ico">🌀</span><div class="si-body"><b class="si-title">典型反应</b><p class="gc-text">${esc(stress.react)}</p></div></div>
        <div class="stress-item"><span class="si-ico">🌤️</span><div class="si-body"><b class="si-title">修复动作</b><p class="gc-text">${esc(stress.recover)}</p></div></div>
      </div>
    </div>

    <div class="gc-card">
      <h2>🔍 更多画像</h2>
      <div class="more-grid">
        <div class="more-item"><b class="mi-title">💬 沟通风格</b><p class="gc-text">${esc(p.comm)}</p></div>
        <div class="more-item"><b class="mi-title">🧩 团队角色</b><p class="gc-text">${esc(p.team)}</p></div>
        <div class="more-item"><b class="mi-title">📚 学习风格</b><p class="gc-text">${esc(p.learn)}</p></div>
        <div class="more-item"><b class="mi-title">💰 金钱与决策</b><p class="gc-text">${esc(p.money)}</p></div>
      </div>
    </div>

    <div class="gc-card">
      <h2>✅ 成长清单</h2>
      <div class="checklist-static">
        ${(p.checklist || []).map(s => '<div class="cl-item-static"><span class="cl-box" aria-hidden="true"></span><span class="cl-text">' + esc(s) + '</span></div>').join('')}
      </div>
      <p class="gc-text cl-tip">在<a href="../test.html">测试结果页</a>可以逐条打卡并保存进度。</p>
    </div>

    <div class="fact-card">
      <span class="fact-icon">💡</span>
      <div><h2>冷知识</h2><p>${esc(t.fact)}</p></div>
    </div>

    <div class="actions">
      <a class="btn btn-primary" href="../test.html">⚡ 测一测你是哪一种</a>
      <a class="btn btn-ghost" href="../relation.html">💞 关系匹配矩阵</a>
      <button type="button" class="btn btn-ghost" onclick="window.print()">🖨️ 打印 / 存为 PDF</button>
      <a class="btn btn-ghost" href="../index.html">🏠 返回首页</a>
    </div>

    <h2 class="section-title">✦ 其他 15 种人格 ✦</h2>
    ${typeNav(code)}

    <p class="result-note">MBTI 是偏好参考，不是科学判刑；人格是流动的，别让标签定义你 😉</p>
  </main>
</body>
</html>
`;
}

/* ---------- 生成 ---------- */
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

let total = 0;
const missing = [];
for (const code of ORDER) {
  if (!TYPES[code]) { missing.push(code); continue; }
  const html = buildPage(code);
  const file = path.join(OUT_DIR, code.toLowerCase() + '.html');
  fs.writeFileSync(file, html);
  total += Buffer.byteLength(html);
  console.log('  ✓ types/' + code.toLowerCase() + '.html  ' + (Buffer.byteLength(html) / 1024).toFixed(1) + ' KB');
}
if (missing.length) { console.error('✘ 缺少类型数据: ' + missing.join(', ')); process.exit(1); }

/* ---------- 同步 sitemap.xml（3 个主页面 + 16 个类型页） ---------- */
const urls = ['index.html', 'test.html', 'result.html', 'relation.html'].map(f => SITE + f)
  .concat(ORDER.map(c => SITE + 'types/' + c.toLowerCase() + '.html'));
const sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls.map((u, i) =>
    '  <url>\n    <loc>' + u + '</loc>\n    <lastmod>2026-09-27</lastmod>\n' +
    '    <changefreq>weekly</changefreq>\n    <priority>' + (i === 0 ? '1.0' : (i < 3 ? '0.8' : '0.6')) + '</priority>\n  </url>'
  ).join('\n') + '\n</urlset>\n';
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemap);
console.log('\n✓ 生成 16 个类型页，合计 ' + (total / 1024).toFixed(1) + ' KB');
console.log('✓ 已同步 sitemap.xml（' + urls.length + ' 个 URL）');
