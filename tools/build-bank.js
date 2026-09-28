/* ============================================================
   题库组装（node tools/build-bank.js）
   ------------------------------------------------------------
   把 _bank/<DIM>.json（每个维度 50 题 = 5 facet × 10 题，两极 5:5）
   校验并组装成 data/questions.js（200 题）。
   校验项（任一不过就中止，不会写出坏题库）：
   - 4 个维度齐备，每维 50 题；id 全局唯一且不重复
   - 每题字段完整：id/dim/dir/facet/pair/text；dir 为 ±1
   - 每维两极 25:25；每个 facet 10 题且两极 5:5
   - 题面 16–34 字；无对比句式；每题否定词 ≤ 1
   - pair 必须成对（同一 pair 恰好 2 题、同维、方向相反）
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const BANK_DIR = path.join(ROOT, '_bank');
const OUT = path.join(ROOT, 'data', 'questions.js');
const BANK_VERSION = 4;

const DIMS = ['EI', 'SN', 'TF', 'JP'];
const COMPARATIVE = /而不是|比起|宁愿|更愿意|与其|不如/;
const errors = [];
const fail = m => errors.push(m);

/* ---------- 读取 ---------- */
const items = [];
DIMS.forEach(dim => {
  const file = path.join(BANK_DIR, dim + '.json');
  if (!fs.existsSync(file)) { fail('缺少 ' + dim + '.json'); return; }
  let arr;
  try { arr = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { fail(dim + '.json 不是合法 JSON：' + e.message); return; }
  if (!Array.isArray(arr)) { fail(dim + '.json 不是数组'); return; }
  arr.forEach(q => items.push(q));
});

/* ---------- 校验 ---------- */
const ids = new Set();
const byPair = {};
items.forEach(q => {
  ['id', 'dim', 'dir', 'facet', 'pair', 'text'].forEach(k => {
    if (!(k in q)) fail((q.id || '?') + ' 缺字段 ' + k);
  });
  if (DIMS.indexOf(q.dim) < 0) fail(q.id + ' 维度非法：' + q.dim);
  if (q.dir !== 1 && q.dir !== -1) fail(q.id + ' dir 必须为 ±1');
  if (ids.has(q.id)) fail('id 重复：' + q.id);
  ids.add(q.id);
  const len = String(q.text || '').length;
  if (len < 16 || len > 34) fail(q.id + ' 题面长度 ' + len + '（需 16–34 字）');
  if (COMPARATIVE.test(q.text)) fail(q.id + ' 含对比句式：' + q.text);
  const neg = (String(q.text).match(/[不没别]/g) || []).length;
  if (neg > 1) fail(q.id + ' 否定词 ' + neg + ' 个（需 ≤1）');
  if (q.pair) (byPair[q.pair] = byPair[q.pair] || []).push(q);
});

DIMS.forEach(dim => {
  const list = items.filter(q => q.dim === dim);
  if (list.length !== 50) fail(dim + ' 题数 ' + list.length + '（需 50）');
  const a = list.filter(q => q.dir < 0).length, b = list.filter(q => q.dir > 0).length;
  if (a !== 25 || b !== 25) fail(dim + ' 极性 ' + a + ':' + b + '（需 25:25）');
  const facets = {};
  list.forEach(q => {
    const f = facets[q.facet] || (facets[q.facet] = { n: 0, a: 0, b: 0 });
    f.n++; q.dir < 0 ? f.a++ : f.b++;
  });
  const names = Object.keys(facets);
  if (names.length !== 5) fail(dim + ' facet 数 ' + names.length + '（需 5）');
  names.forEach(n => {
    const f = facets[n];
    if (f.n !== 10 || f.a !== 5 || f.b !== 5) fail(dim + '/' + n + ' 结构 ' + f.n + '（' + f.a + ':' + f.b + '）（需 10 且 5:5）');
  });
});

Object.keys(byPair).forEach(k => {
  const list = byPair[k];
  if (list.length !== 2) fail('镜像组 ' + k + ' 有 ' + list.length + ' 题');
  else if (list[0].dim !== list[1].dim) fail('镜像组 ' + k + ' 跨维度');
  else if (list[0].dir === list[1].dir) fail('镜像组 ' + k + ' 两题方向相同');
});

if (errors.length) {
  console.error('✘ 题库校验未通过（' + errors.length + ' 项）：');
  errors.slice(0, 40).forEach(e => console.error('   - ' + e));
  process.exit(1);
}

/* ---------- 输出 ---------- */
const ordered = [];
DIMS.forEach(dim => {
  items.filter(q => q.dim === dim)
    .sort((x, y) => (x.id < y.id ? -1 : 1))
    .forEach(q => ordered.push(q));
});

const body = ordered.map(q =>
  "  { id: '" + q.id + "', dim: '" + q.dim + "', dir: " + (q.dir > 0 ? '+1' : '-1') +
  ", facet: '" + q.facet + "', pair: " + (q.pair ? "'" + q.pair + "'" : 'null') +
  ", text: '" + q.text + "' }").join(',\n');

const out = `/* ============================================================
   题库 v4 · 200 题（两档共用，开测时按维度等比例随机抽题）
   ------------------------------------------------------------
   结构：每个维度 50 题 = 5 个内容侧面 × 10 题（每个侧面两极各 5 题）
        四个维度合计 200 题；每维两极 25 : 25，全局 100 : 100
   字段：
   - dim   ：维度 EI / SN / TF / JP（首字母为"首字母极" E/S/T/J）
   - dir   ：-1 = 同意本题 → 偏向首字母极；+1 = 同意本题 → 偏向次字母极
   - facet ：内容侧面（两极共享，每侧面两侧各 5 题）
   - pair  ：镜像题标记（同一组两题语义互为镜像、方向相反）
   - text  ：单构念、行为化、情境具体、不含对比句式

   抽题（见 script.js 的 buildQuestionSet）：
   - 快速测试：每维随机 6 题（3:3）；深度测试：每维随机 16 题（8:8）
   - 名额按内容侧面均分，优先抽最近没出现过的题；会话内题序固定
   本文件由 tools/build-bank.js 从 _bank/*.json 生成，请勿手改。
   ============================================================ */
'use strict';

var BANK_VERSION = ${BANK_VERSION};

var QUESTIONS = [
${body}
];

/* 供 Node 测试使用 */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { QUESTIONS: QUESTIONS, BANK_VERSION: BANK_VERSION };
}
`;

fs.writeFileSync(OUT, out, 'utf8');
console.log('✓ 已生成 data/questions.js：' + ordered.length + ' 题（BANK_VERSION ' + BANK_VERSION + '）');
DIMS.forEach(dim => {
  const list = ordered.filter(q => q.dim === dim);
  const facets = [...new Set(list.map(q => q.facet))];
  console.log('  ' + dim + ' ' + list.length + ' 题 · facet ' + facets.length + ' 个 · 极性 ' +
    list.filter(q => q.dir < 0).length + ':' + list.filter(q => q.dir > 0).length);
});
