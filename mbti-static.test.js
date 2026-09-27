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

const js = read('script.js');
const css = read('style.css');
const pages = {};
PAGES.forEach(p => { pages[p] = read(p); });
const htmlAll = PAGES.map(p => pages[p]).join('\n');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✔ ' + name); }
  else { fail++; console.log('  ✘ ' + name + (detail ? '  → ' + detail : '')); }
}

console.log('MBTI 静态契约测试\n');

/* ---------- A. 文件与页面结构 ---------- */
{
  const files = ['index.html', 'test.html', 'result.html', 'style.css', 'script.js',
    'data/questions.js', 'data/profile.js', 'README.md', '开发文档.md',
    'mbti-logic.test.js', 'mbti-smoke.test.js', 'package.json', '.github/workflows/ci.yml'];
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
  PAGES.forEach(p => {
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

  check('题库共 60 题', qbank.QUESTIONS.length === 60, String(qbank.QUESTIONS.length));
  check('题库版本号 ≥2', qbank.BANK_VERSION >= 2, String(qbank.BANK_VERSION));

  const quick = qbank.QUESTIONS.filter(q => q.quick);
  check('快速档共 24 题', quick.length === 24, String(quick.length));

  const dims = ['EI', 'SN', 'TF', 'JP'];
  check('题库维度仅为 EI/SN/TF/JP', qbank.QUESTIONS.every(q => dims.indexOf(q.dim) >= 0));
  dims.forEach(d => {
    const items = qbank.QUESTIONS.filter(q => q.dim === d);
    const first = items.filter(q => q.dir < 0).length;
    const second = items.filter(q => q.dir > 0).length;
    check('深度档 ' + d + ' 15 题且极性差 ≤1', items.length === 15 && Math.abs(first - second) <= 1,
      items.length + ' 题 / ' + first + ':' + second);
    const q = quick.filter(x => x.dim === d);
    check('快速档 ' + d + ' 6 题且极性 3:3', q.length === 6 && q.filter(x => x.dir < 0).length === 3,
      q.length + ' 题');
  });

  check('每题字段完整（id/dim/dir/facet/quick/text）',
    qbank.QUESTIONS.every(q => q.id && q.dim && (q.dir === 1 || q.dir === -1) &&
      q.facet && typeof q.quick === 'boolean' && typeof q.text === 'string' && q.text.length > 6));
  check('题目 id 唯一', new Set(qbank.QUESTIONS.map(q => q.id)).size === 60);
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

console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
if (fail > 0) process.exit(1);
