/* ============================================================
   静态契约测试（Node 运行：node mbti-static.test.js）
   ------------------------------------------------------------
   不依赖 DOM/浏览器，直接解析源文件，检查 "HTML ↔ JS ↔ CSS ↔ 数据" 的契约，
   用于发现人工维护中容易出现的漂移：ID 改名、类名丢失、括号失衡、数据文件缺失。
   检查项：
   A. 文件与页面结构（根元素、数据脚本引入顺序）
   B. script.js 引用的每个 #id 必须存在于某个页面
   C. script.js 动态生成的 class 必须在 style.css 有定义
   D. 交互修饰类（show/current/done/active/...）必须有样式
   E. 每个页面内 id 唯一
   F. style.css 花括号配平
   G. 数据契约（题库字段、快速档数量、画像字段、类型键一致）
   H. 回归护栏（无遗留旧题库内联定义、无已移除元素的引用）
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const root = __dirname;
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const exists = f => fs.existsSync(path.join(root, f));

const PAGES = ['index.html', 'test.html', 'result.html'];
const TYPE_KEYS = ['INTJ', 'INTP', 'ENTJ', 'ENTP', 'INFJ', 'INFP', 'ENFJ', 'ENFP',
  'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ', 'ISTP', 'ISFP', 'ESTP', 'ESFP'];
const SITE = 'https://shay-ckm.github.io/-mbti-test/';

const js = read('script.js');
const css = read('style.css');
/* 结构检查针对 3 个主流程页面；ID/唯一性契约需覆盖全部会被 script.js 驱动的页面 */
const EXTRA_PAGES = ['relation.html'];
const ALL_PAGES = PAGES.concat(EXTRA_PAGES);
const pages = {};
ALL_PAGES.forEach(p => { pages[p] = read(p); });
const htmlAll = ALL_PAGES.map(p => pages[p]).join('\n');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✔ ' + name); }
  else { fail++; console.log('  ✘ ' + name + (detail ? '  → ' + detail : '')); }
}

console.log('MBTI 静态契约测试\n');

/* ---------- A. 文件与页面结构 ---------- */
{
  const files = ['index.html', 'test.html', 'result.html', 'relation.html', '404.html', 'style.css', 'script.js', 'sw.js',
    'data/questions.js', 'data/profile.js', 'README.md', '开发文档.md', 'LICENSE',
    'favicon.svg', 'manifest.json', 'robots.txt', 'sitemap.xml',
    'assets/og-image.png', 'assets/icon-192.png', 'assets/icon-512.png', 'assets/apple-touch-icon.png',
    'assets/fonts/fonts.css', 'assets/fonts/inter-var.woff2',
    'tools/make-icons.js', 'tools/fetch-fonts.js', 'tools/make-type-pages.js', 'tools/push-via-api.js',
    'tools/verify-deploy.js', 'tools/audit-css.js', 'tools/audit-bank.js',
    'mbti-static.test.js', 'mbti-logic.test.js', 'mbti-psychometrics.test.js', 'mbti-smoke.test.js', 'mbti-sw.test.js',
    'package.json', '.github/workflows/ci.yml'];
  const missing = files.filter(f => !exists(f));
  check('必需文件齐备（' + files.length + ' 个）', missing.length === 0, missing.join(', '));

  check('首页根元素为 page-home', /id="page-home"/.test(pages['index.html']));
  check('答题页根元素为 page-test', /id="page-test"/.test(pages['test.html']));
  check('结果页根元素为 page-result', /id="page-result"/.test(pages['result.html']));

  PAGES.forEach(p => {
    const inQ = pages[p].indexOf('data/questions.js');
    const inP = pages[p].indexOf('data/profile.js');
    const inS = pages[p].indexOf('src="script.js"');
    check(p + ' 引入题库数据', inQ >= 0);
    check(p + ' 引入画像数据', inP >= 0);
    check(p + ' 数据脚本在 script.js 之前加载', inQ >= 0 && inS >= 0 && inQ < inS && inP < inS);
  });
}

/* ---------- B. #id 契约 ---------- */
{
  const jsIds = new Set();
  for (const m of js.matchAll(/\$\$?\('#([A-Za-z0-9_-]+)/g)) jsIds.add(m[1]);
  const htmlIds = new Set();
  for (const m of htmlAll.matchAll(/id="([A-Za-z0-9_-]+)"/g)) htmlIds.add(m[1]);
  const missing = [...jsIds].filter(id => !htmlIds.has(id));
  check('script.js 引用的 ' + jsIds.size + ' 个 #id 均存在于页面中', missing.length === 0, missing.join(', '));
}

/* ---------- C. class 契约 ---------- */
{
  const classes = new Set();
  const addRaw = raw => {
    raw.split(/\s+/).forEach(tok => {
      const t = tok.replace(/[^A-Za-z0-9_-].*$/, ''); // 去掉模板拼接残留
      if (t && /^[A-Za-z][A-Za-z0-9_-]*$/.test(t)) classes.add(t);
    });
  };
  for (const m of js.matchAll(/class="([^"']*)/g)) addRaw(m[1]);
  for (const m of js.matchAll(/className\s*=\s*'([^']*)'/g)) addRaw(m[1]);

  const missing = [...classes].filter(c => !css.includes('.' + c));
  check('script.js 动态生成的 ' + classes.size + ' 个 class 均有样式定义', missing.length === 0, missing.join(', '));
}

/* ---------- D. 交互修饰类 ---------- */
{
  const mods = ['show', 'current', 'done', 'active', 'thin', 'high', 'mid', 'low', 'up', 'down', 'right', 'ghost'];
  const missing = mods.filter(m => !css.includes('.' + m));
  check('交互修饰类（' + mods.length + ' 个）均有样式', missing.length === 0, missing.join(', '));
}

/* ---------- E. 页面内 id 唯一 ---------- */
{
  ALL_PAGES.forEach(p => {
    const ids = [...pages[p].matchAll(/id="([A-Za-z0-9_-]+)"/g)].map(m => m[1]);
    const dup = ids.filter((v, i) => ids.indexOf(v) !== i);
    check(p + ' 内 id 唯一（' + ids.length + ' 个）', dup.length === 0, dup.join(', '));
  });
}

/* ---------- F. CSS 结构 ---------- */
{
  const open = (css.match(/\{/g) || []).length;
  const close = (css.match(/\}/g) || []).length;
  check('style.css 花括号配平（' + open + ' 组）', open === close, open + ' / ' + close);
  check('style.css 定义了类型主题色变量', css.includes('--tcolor'));
  check('style.css 含减少动效媒体查询', css.includes('prefers-reduced-motion'));
}

/* ---------- G. 数据契约 ---------- */
{
  const qbank = require('./data/questions.js');
  const profile = require('./data/profile.js').TYPE_PROFILE;

  check('题库共 64 题（v3）', qbank.QUESTIONS.length === 64, String(qbank.QUESTIONS.length));
  check('题库版本号 ≥2', qbank.BANK_VERSION >= 2, String(qbank.BANK_VERSION));

  const quick = qbank.QUESTIONS.filter(q => q.quick);
  check('快速档共 24 题', quick.length === 24, String(quick.length));

  const dims = ['EI', 'SN', 'TF', 'JP'];
  check('题库维度仅为 EI/SN/TF/JP', qbank.QUESTIONS.every(q => dims.indexOf(q.dim) >= 0));
  dims.forEach(d => {
    const items = qbank.QUESTIONS.filter(q => q.dim === d);
    const first = items.filter(q => q.dir < 0).length;
    const second = items.filter(q => q.dir > 0).length;
    check('深度档 ' + d + ' 16 题且极性 8:8', items.length === 16 && first === 8 && second === 8,
      items.length + ' 题 / ' + first + ':' + second);
    const q = quick.filter(x => x.dim === d);
    check('快速档 ' + d + ' 6 题且极性 3:3', q.length === 6 && q.filter(x => x.dir < 0).length === 3,
      q.length + ' 题');
  });

  check('每题字段完整（id/dim/dir/facet/quick/text）',
    qbank.QUESTIONS.every(q => q.id && q.dim && (q.dir === 1 || q.dir === -1) &&
      q.facet && typeof q.quick === 'boolean' && typeof q.text === 'string' && q.text.length > 6));
  check('题目 id 唯一', new Set(qbank.QUESTIONS.map(q => q.id)).size === qbank.QUESTIONS.length,
    new Set(qbank.QUESTIONS.map(q => q.id)).size + '/' + qbank.QUESTIONS.length);
  check('题干无对比句式（而不是/比起/比…更重要）',
    !qbank.QUESTIONS.some(q => /而不是|比起|比.*更重要/.test(q.text)));

  const pairs = {};
  qbank.QUESTIONS.filter(q => q.pair).forEach(q => { (pairs[q.pair] = pairs[q.pair] || []).push(q); });
  check('一致性配对题成组（每组 2 题）',
    Object.keys(pairs).length >= 2 && Object.keys(pairs).every(k => pairs[k].length === 2),
    Object.keys(pairs).map(k => k + ':' + pairs[k].length).join(', '));

  const pKeys = Object.keys(profile);
  check('画像数据覆盖 16 型', pKeys.length === 16, String(pKeys.length));
  check('画像类型键与标准 16 型一致', TYPE_KEYS.every(k => pKeys.indexOf(k) >= 0) && pKeys.length === TYPE_KEYS.length,
    pKeys.filter(k => TYPE_KEYS.indexOf(k) < 0).join(', '));
  check('画像字段完整（relations4/stress3/comm/team/learn/money/checklist6）',
    pKeys.every(k => {
      const p = profile[k];
      return p && p.relations && p.relations.love && p.relations.friend && p.relations.family && p.relations.work &&
        p.stress && p.stress.signal && p.stress.react && p.stress.recover &&
        p.comm && p.team && p.learn && p.money && Array.isArray(p.checklist) && p.checklist.length === 6;
    }));

  /* 题库与引擎引用的类型数据一致（16 型） */
  const knownTypes = TYPE_KEYS.filter(k => new RegExp('^  ' + k + ': \\{', 'm').test(js));
  check('script.js 内 16 型资料齐全（TYPES/TYPE_EXTRA/TYPE_GROWTH）', knownTypes.length === 16, knownTypes.length + '/16');
}

/* ---------- H. 回归护栏 ---------- */
{
  check('script.js 无遗留的旧版内联题库', !/var QUESTIONS = \[/.test(js));
  check('script.js 不再引用已移除的元素', !/\$\('#(gauges|gcBody|gcTabs|typeLetters|superpowerText|growthText|careers)'\)/.test(js));
  check('script.js 不再引用旧 24 题数组式作答', !/answers\[testState\.index\]/.test(js));
  check('已删除的旧渲染函数不再存在', !/function renderGauges|function renderGrowthCenter/.test(js));
  check('script.js 暴露 Node 测试导出', /module\.exports/.test(js));
  check('首页含双档位选择卡', /id="modeCards"/.test(pages['index.html']) && /data-mode="quick"/.test(pages['index.html']) && /data-mode="deep"/.test(pages['index.html']));
  check('结果页含新增板块容器',
    ['metaBar', 'confPanel', 'relCard', 'stressCard', 'moreCard', 'checklistCard', 'historyCard', 'shareNativeBtn']
      .every(id => pages['result.html'].indexOf('id="' + id + '"') >= 0));
  check('答题页含题号跳转与里程碑容器',
    /id="jumpGrid"/.test(pages['test.html']) && /id="milestone"/.test(pages['test.html']));
}

/* ---------- I. 传播 / SEO 基建 ---------- */
{
  PAGES.forEach(p => {
    const h = pages[p];
    check(p + ' 引入 favicon', /rel="icon"[^>]*favicon\.svg/.test(h));
    check(p + ' 引入 manifest', /rel="manifest"[^>]*manifest\.json/.test(h));
    check(p + ' 含 og:title / og:description / og:image', /property="og:title"/.test(h) && /property="og:description"/.test(h) && /property="og:image"/.test(h));
    check(p + ' og:image 指向站点 OG 图', h.indexOf(SITE + 'assets/og-image.png') >= 0);
    check(p + ' 含 twitter:card', /name="twitter:card"/.test(h));
    check(p + ' 含 canonical', /rel="canonical"/.test(h));
  });

  const sitemap = read('sitemap.xml');
  check('sitemap.xml 至少含 3 个主页面 URL', (sitemap.match(/<loc>/g) || []).length >= 3, String((sitemap.match(/<loc>/g) || []).length));
  check('sitemap.xml 含三个主页面', ['index.html', 'test.html', 'result.html'].every(f => sitemap.indexOf(SITE + f) >= 0));
  check('sitemap.xml 域名正确', sitemap.indexOf(SITE) >= 0);

  const robots = read('robots.txt');
  check('robots.txt 允许抓取并声明 sitemap', /User-agent: \*/.test(robots) && /Allow: \//.test(robots) && robots.indexOf(SITE + 'sitemap.xml') >= 0);

  const manifest = JSON.parse(read('manifest.json'));
  check('manifest.json 字段完整', !!(manifest.name && manifest.short_name && manifest.start_url && manifest.theme_color && Array.isArray(manifest.icons) && manifest.icons.length >= 2));
  manifest.icons.forEach(i => check('manifest 图标存在: ' + i.src, exists(i.src)));

  const og = fs.readFileSync(path.join(root, 'assets/og-image.png'));
  const pngOk = og.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]));
  const ogW = og.readUInt32BE(16), ogH = og.readUInt32BE(20);
  const ogEnd = og.slice(-8, -4).toString('ascii') === 'IEND';
  check('og-image.png 为有效 PNG（签名 + IEND）', pngOk && ogEnd);
  check('og-image.png 尺寸为 1200×630', ogW === 1200 && ogH === 630, ogW + '×' + ogH);
  check('og-image.png 体积合理（<300KB）', og.length < 300 * 1024, Math.round(og.length / 1024) + 'KB');

  check('404.html 复用站点样式并含返回入口', /style\.css/.test(read('404.html')) && /href="index\.html"/.test(read('404.html')));
  check('LICENSE 为 MIT', /MIT License/.test(read('LICENSE')));
  check('package.json 含 push 与 icons 脚本', /"push"/.test(read('package.json')) && /"icons"/.test(read('package.json')));
  check('已无死 CSS（旧仪表盘/旧 Tab 样式已清理）',
    !/^\.gauges\b/m.test(css) && !/^\.gauge\b/m.test(css) && !/^\.gc-tabs\b/m.test(css) && !/^\.gc-tab\b/m.test(css) &&
    !/^\.type-letters\b/m.test(css) && !/^\.career-chip\b/m.test(css) && !/^\.grad-border\b/m.test(css));
}

/* ---------- J. 本地字体（不依赖外部 CDN） ---------- */
{
  check('assets/fonts/fonts.css 存在', exists('assets/fonts/fonts.css'));
  const fontsCss = read('assets/fonts/fonts.css');
  check('fonts.css 含 font-display: swap', /font-display:\s*swap/.test(fontsCss));
  check('fonts.css 全部引用本地文件', !/https?:\/\//.test(fontsCss));

  const fontDir = path.join(root, 'assets', 'fonts');
  const woff2 = fs.readdirSync(fontDir).filter(f => f.endsWith('.woff2'));
  let fontBytes = 0, badSig = 0;
  woff2.forEach(f => {
    const b = fs.readFileSync(path.join(fontDir, f));
    fontBytes += b.length;
    if (b.slice(0, 4).toString('ascii') !== 'wOF2') badSig++;
  });
  check('woff2 文件签名有效（' + woff2.length + ' 个）', woff2.length > 0 && badSig === 0, 'badSig=' + badSig);
  /* 防回归：可变字体只需 1 份文件；历史上一度按字重下载了 5 份重复内容（浪费 188KB） */
  check('字体文件无冗余（≤2 个文件）', woff2.length <= 2, woff2.join(', '));
  check('字体总体积 < 100KB', fontBytes < 100 * 1024, (fontBytes / 1024).toFixed(1) + 'KB');

  PAGES.forEach(p => {
    check(p + ' 不再外链 Google Fonts', pages[p].indexOf('fonts.googleapis.com') < 0 && pages[p].indexOf('fonts.gstatic.com') < 0);
    check(p + ' 引用本地 fonts.css', pages[p].indexOf('assets/fonts/fonts.css') >= 0);
    check(p + ' 预加载字体文件', /rel="preload"[^>]*inter-var\.woff2/.test(pages[p]));
  });
  check('404.html 也使用本地字体', read('404.html').indexOf('fonts.googleapis.com') < 0);

  check('手写体栈为中文楷体（Caveat 已移除）', /--font-hand:[^;]*Kai/.test(css) && css.indexOf('Caveat') < 0);
}

/* ---------- K. 类型百科页（静态生成） ---------- */
{
  const CODES = ['INTJ', 'INTP', 'ENTJ', 'ENTP', 'INFJ', 'INFP', 'ENFJ', 'ENFP',
    'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ', 'ISTP', 'ISFP', 'ESTP', 'ESFP'];
  const typeDir = path.join(root, 'types');
  check('types/ 目录存在', fs.existsSync(typeDir));
  const files = fs.existsSync(typeDir) ? fs.readdirSync(typeDir).filter(f => f.endsWith('.html')) : [];
  check('生成 16 个类型页', files.length === 16, files.length + ' 个');

  const missingFiles = CODES.filter(c => files.indexOf(c.toLowerCase() + '.html') < 0);
  check('类型页覆盖全部 16 型', missingFiles.length === 0, missingFiles.join(', '));

  const REQUIRED = ['关于你', '优势清单', '注意点', '内在驱动力', '职业规划', '人生指导',
    '关系与社交', '压力下的你', '更多画像', '成长清单', '冷知识'];
  let badSections = 0, badMeta = 0, badLink = 0, totalBytes = 0;
  CODES.forEach(code => {
    const file = code.toLowerCase() + '.html';
    if (files.indexOf(file) < 0) return;
    const raw = fs.readFileSync(path.join(typeDir, file));
    const h = raw.toString('utf8');
    totalBytes += raw.length;
    if (!REQUIRED.every(s => h.indexOf(s) >= 0)) { badSections++; console.log('    ! ' + file + ' 缺少章节'); }
    if (h.indexOf('id="page-type"') < 0 || h.indexOf('rel="canonical"') < 0 ||
        h.indexOf('og:image') < 0 || h.indexOf('application/ld+json') < 0 ||
        h.indexOf(code) < 0) { badMeta++; console.log('    ! ' + file + ' 元信息不完整'); }
    if (h.indexOf('../test.html') < 0 || h.indexOf('../style.css') < 0 || h.indexOf('type-nav') < 0) {
      badLink++; console.log('    ! ' + file + ' 缺少回流入口/样式/类型导航');
    }
  });
  check('类型页章节完整（11 个栏目）', badSections === 0, badSections + ' 个不完整');
  check('类型页元信息完整（canonical/og/JSON-LD/类型标识）', badMeta === 0, badMeta + ' 个不完整');
  check('类型页含回流入口与类型导航', badLink === 0, badLink + ' 个不完整');
  check('类型页平均体积合理（<20KB）', totalBytes / 16 < 20 * 1024, (totalBytes / 16 / 1024).toFixed(1) + 'KB');

  const sm = read('sitemap.xml');
  check('sitemap 含 20 个 URL（4 主页 + 16 类型页）', (sm.match(/<loc>/g) || []).length === 20, String((sm.match(/<loc>/g) || []).length));
  check('sitemap 收录类型页', sm.indexOf('/types/intj.html') >= 0 && sm.indexOf('/types/esfp.html') >= 0);
  check('类型页含关系匹配入口', /\.\.\/relation\.html/.test(read('types/intj.html')));

  check('结果页提供类型档案入口', pages['result.html'].indexOf('id="typePageLink"') >= 0);
  check('script.js 按类型设置档案页链接', /typePageLink/.test(js) && /types\/' \+ res\.letters\.toLowerCase\(\)/.test(js));
  check('类型页样式齐备（.type-nav / .cl-item-static）', css.indexOf('.type-nav') >= 0 && css.indexOf('.cl-item-static') >= 0);
}

/* ---------- L. 关系匹配矩阵页 ---------- */
{
  check('relation.html 存在', exists('relation.html'));
  const rel = read('relation.html');
  check('关系页根元素为 page-relation', /id="page-relation"/.test(rel));
  ['relSlotA', 'relSlotB', 'relPickGrid', 'relRandom', 'relHint', 'relResult', 'relMatrix']
    .forEach(id => check('关系页含 #' + id, rel.indexOf('id="' + id + '"') >= 0));
  check('关系页含 canonical/og/JSON-LD',
    /rel="canonical"/.test(rel) && /property="og:image"/.test(rel) && /application\/ld\+json/.test(rel));
  check('关系页使用本地字体与站点样式',
    rel.indexOf('assets/fonts/fonts.css') >= 0 && rel.indexOf('style.css') >= 0 && rel.indexOf('fonts.googleapis.com') < 0);
  check('关系页含回流入口', rel.indexOf('href="test.html"') >= 0 && rel.indexOf('href="types/') < 0);
  check('sitemap 收录关系页', read('sitemap.xml').indexOf(SITE + 'relation.html') >= 0);
  check('首页与结果页均链接关系页',
    pages['index.html'].indexOf('relation.html') >= 0 && pages['result.html'].indexOf('relation.html') >= 0);
  check('关系页样式齐备（.rel-picker/.rel-cell/.rel-side）',
    ['.rel-picker', '.rel-cell', '.rel-side', '.rel-bar'].every(c => css.indexOf(c) >= 0));
  check('关系引擎已导出（可被测试与工具复用）', /computeRelation:\s*computeRelation/.test(js) && /RELATION_RULES/.test(js));
}

/* ---------- M. PWA / Service Worker（离线可用） ---------- */
{
  check('sw.js 存在', exists('sw.js'));
  const sw = read('sw.js');
  check('sw.js 定义缓存版本号', /CACHE_VERSION\s*=\s*'[^']+'/.test(sw));
  check('sw.js 含 install / activate / fetch 处理器',
    /addEventListener\('install'/.test(sw) && /addEventListener\('activate'/.test(sw) && /addEventListener\('fetch'/.test(sw));
  check('sw.js 导航请求网络优先 + 离线兜底', /mode === 'navigate'/.test(sw) && /caches\.match\('\.\/index\.html'\)/.test(sw));
  check('sw.js 只接管同源请求', /url\.origin !== self\.location\.origin/.test(sw));
  check('sw.js 清理旧版本缓存', /caches\.delete\(/.test(sw));

  /* 预缓存清单里的每个路径都必须真实存在（防止改名后离线失效） */
  const m = sw.match(/const PRECACHE = \[([\s\S]*?)\];/);
  check('sw.js 含预缓存清单', !!m);
  const list = m ? (m[1].match(/'([^']+)'/g) || []).map(s => s.slice(1, -1)) : [];
  const bad = list.filter(p => p !== './' && !exists(p.replace(/^\.\//, '')));
  check('预缓存清单 ' + list.length + ' 项全部存在', bad.length === 0, bad.join(', '));
  ['index.html', 'test.html', 'result.html', 'relation.html', 'style.css', 'script.js',
    'data/questions.js', 'data/profile.js', 'assets/fonts/inter-var.woff2', 'manifest.json']
    .forEach(f => check('预缓存包含 ' + f, list.indexOf('./' + f) >= 0));

  check('script.js 注册 Service Worker 且带协议守卫',
    /serviceWorker\.register\('sw\.js'\)/.test(js) && /location\.protocol !== 'http:'/.test(js));
  check('init() 中调用 Service Worker 注册', /initServiceWorker\(\)/.test(js));
  const manifest = JSON.parse(read('manifest.json'));
  check('manifest 支持独立窗口与启动路径', manifest.display === 'standalone' && !!manifest.start_url);
  check('manifest 声明的图标均已生成', manifest.icons.every(i => exists(i.src)));
}

/* ---------- N. 报告导出（长图 / 打印 PDF） ---------- */
{
  check('样式含打印媒体查询', /@media print/.test(css));
  check('打印时设置页边距与防跨页断开', /@page/.test(css) && /break-inside:\s*avoid/.test(css));
  check('打印时隐藏交互元素', /@media print[\s\S]*\.actions[\s\S]*display:\s*none/.test(css));
  check('打印时强制输出颜色（徽章/进度条）', /print-color-adjust:\s*exact/.test(css));

  check('结果页含完整报告长图按钮', pages['result.html'].indexOf('id="reportImgBtn"') >= 0);
  check('结果页含打印按钮', pages['result.html'].indexOf('id="printBtn"') >= 0);
  check('script.js 实现 buildReportImage（两遍排版）',
    /function buildReportImage/.test(js) && /var blocks = \[\]/.test(js) && /cv\.height = H/.test(js));
  check('script.js 提供通用下载 helper', /function downloadCanvas/.test(js));
  check('script.js 绑定长图与打印按钮',
    /#reportImgBtn'\)\.addEventListener/.test(js) && /window\.print\(\)/.test(js));
  check('长图包含完整报告栏目（优势/职业/关系/压力/清单）',
    ['优势', '职业规划', '关系与社交', '压力下的你', '成长清单', '冷知识']
      .every(k => new RegExp("pushTitle\\('" + k).test(js) || js.indexOf("'" + k + "'") >= 0));
  check('类型页也提供打印入口', /window\.print\(\)/.test(read('types/intj.html')));
}

/* ---------- O. 无障碍 ---------- */
{
  ALL_PAGES.concat(['404.html']).forEach(p => {
    const h = read(p);
    check(p + ' 有跳到主内容链接', /class="skip-link"[^>]*href="#main"/.test(h));
    check(p + ' 主内容有 id="main"', /id="main"/.test(h));
  });
  check('类型页也有跳过链接与主内容锚点',
    /class="skip-link"[^>]*href="#main"/.test(read('types/intj.html')) && /id="main"/.test(read('types/intj.html')));
  check('样式定义 .skip-link（默认隐藏、聚焦显示）',
    /\.skip-link\s*\{/.test(css) && /\.skip-link:focus\s*\{/.test(css));

  const testPg = pages['test.html'];
  check('答题页进度条为 progressbar 并带 ARIA 值',
    /role="progressbar"/.test(testPg) && /aria-valuenow/.test(testPg) && /aria-valuemax/.test(testPg));
  check('答题页题干为 aria-live 区域', /id="qText"[^>]*aria-live="polite"/.test(testPg));
  check('答题页选项为 radiogroup（而非一堆普通按钮）', /id="options"[^>]*role="radiogroup"/.test(testPg));
  check('答题页实时提示为 aria-live', /id="liveBubble"[^>]*aria-live="polite"/.test(testPg));

  const resPg = pages['result.html'];
  check('搭档弹窗为 dialog + aria-modal + 标签关联',
    /id="partnerModal"[^>]*role="dialog"/.test(resPg) && /aria-modal="true"/.test(resPg) &&
    /aria-labelledby="partnerZh"/.test(resPg) && /aria-describedby="partnerText"/.test(resPg));
  check('关系场景 Tab 具备 tablist / tabpanel 语义',
    /id="relTabs"[^>]*role="tablist"/.test(resPg) && /id="relText"[^>]*role="tabpanel"/.test(resPg));
  check('关系页类型选择为 group', /id="relPickGrid"[^>]*role="group"/.test(pages['relation.html']));

  check('引擎实现弹窗焦点陷阱与焦点恢复',
    /function trapModalTab/.test(js) && /modalState\.lastFocus/.test(js) && /closeBtn\.focus\(\)/.test(js));
  check('引擎维护选项 aria-checked', /setAttribute\('aria-checked'/.test(js) && /setAttribute\('role', 'radio'\)/.test(js));
  check('引擎维护 Tab aria-selected', /setAttribute\('aria-selected'/.test(js));
  check('引擎更新进度条 aria-valuenow', /setAttribute\('aria-valuenow'/.test(js));
  check('引擎给矩阵格子可访问名称', /aria-label="' \+ ra/.test(js));
  check('引擎维护类型选择 aria-pressed', /setAttribute\('aria-pressed'/.test(js));

  /* 对比度：浅底文字色 & 移除低对比灰 */
  const inkCount = (js.match(/ink: '#[0-9A-Fa-f]{6}'/g) || []).length;
  check('16 型均定义浅底文字色 --tcolor-ink', inkCount === 16, String(inkCount));
  check('CSS 文本色回退到 --tcolor-ink', /var\(--tcolor-ink, var\(--tcolor\)\)/.test(css));
  check('不再使用低对比灰 #9AA3AF', css.indexOf('#9AA3AF') < 0);
  check('强调色徽章对比度已提升（#8A5A00）', css.indexOf('#8A5A00') >= 0);
}

/* ---------- P. 性能与缓存 ---------- */
{
  PAGES.concat(['relation.html']).forEach(p => {
    check(p + ' 脚本以 defer 加载（不阻塞解析）', /<script src="script\.js" defer><\/script>/.test(pages[p]));
    check(p + ' 无外部样式/脚本依赖（全本地）',
      !/<link[^>]+rel="(stylesheet|preload|preconnect|dns-prefetch)"[^>]+href="https?:\/\//.test(pages[p]) &&
      !/<script[^>]+src="https?:\/\//.test(pages[p]));
  });

  const size = f => fs.statSync(path.join(root, f)).size;
  const firstLoad = ['index.html', 'style.css', 'script.js', 'data/questions.js', 'data/profile.js',
    'assets/fonts/fonts.css', 'assets/fonts/inter-var.woff2'].reduce((s, f) => s + size(f), 0);
  check('首屏载荷 < 400KB（当前 ' + (firstLoad / 1024).toFixed(1) + 'KB）', firstLoad < 400 * 1024);
  check('script.js < 130KB', size('script.js') < 130 * 1024, (size('script.js') / 1024).toFixed(1) + 'KB');
  check('style.css < 60KB', size('style.css') < 60 * 1024, (size('style.css') / 1024).toFixed(1) + 'KB');
  check('字体已预加载且为单文件可变字体', /rel="preload"[^>]*inter-var\.woff2/.test(pages['index.html']));

  /* CSS 冗余护栏：style.css 里的类名必须被页面/脚本/类型页引用
     （w3 来自 SVG data URI 中的命名空间，属误报） */
  const DYNAMIC = new Set(['active', 'selected', 'done', 'show', 'rise', 'in', 'visible', 'hidden',
    'open', 'no-anim', 'reduced', 'loading', 's0', 's1', 's2', 's3', 's4', 'flat', 'toast-show', 'w3']);
  const sources = ALL_PAGES.concat(['404.html']).map(p => pages[p]).join('\n') + js +
    read('tools/make-type-pages.js') + read('data/questions.js') + read('data/profile.js') +
    read('sw.js') + read('types/intj.html');
  const classNames = new Set();
  let cm;
  const reCls = /\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)/g;
  while ((cm = reCls.exec(css)) !== null) classNames.add(cm[1]);
  const unusedCls = [];
  classNames.forEach(c => {
    if (DYNAMIC.has(c)) return;
    const needle = new RegExp('[\\s"\'`.]' + c.replace(/-/g, '\\-') + '[\\s"\'`.:\\[{)]');
    if (!needle.test(sources)) unusedCls.push(c);
  });
  check('无未使用的 CSS 类（' + classNames.size + ' 个类名全部被引用）', unusedCls.length === 0, unusedCls.join(', '));
  check('提供 CSS 冗余审计工具', exists('tools/audit-css.js'));
}

console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
if (fail > 0) process.exit(1);
