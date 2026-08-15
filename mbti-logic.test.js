/* ============================================================
   MBTI 计分逻辑冒烟测试（Node 运行：node mbti-logic.test.js）
   ------------------------------------------------------------
   覆盖：
   1. 纯 E/S/T/J 作答 → 应得 ESTJ
   2. 纯 I/N/F/P 作答 → 应得 INFP
   3. 全部"不同意" → 四维中立 → 触发彩蛋（easterEgg）
   4. 全部"同意" → 同样中立（乱答/中庸作答被识别）
   5. 未答（null）不崩溃，count 正确
   ============================================================ */
'use strict';

const { QUESTIONS, TYPES, TYPE_EXTRA, TYPE_GROWTH, computeResult, DIMS } = require('./script.js');

let pass = 0, fail = 0;

function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ✔ ' + name); }
  else { fail++; console.log('  ✘ ' + name + (detail ? '  → ' + detail : '')); }
}

function answersFor(pole) {
  // pole = 'first'（E/S/T/J）或 'second'（I/N/F/P）
  return QUESTIONS.map(q => {
    const agreeSecond = q.dir > 0;
    const wantAgree = (pole === 'second') ? agreeSecond : !agreeSecond;
    return wantAgree ? 3 : -3; // 强同意 / 强不同意
  });
}

console.log('MBTI 计分逻辑测试\n');

// 1. 纯 E/S/T/J
{
  const res = computeResult(answersFor('first'));
  assert('纯 E/S/T/J 作答 → ESTJ', res.letters === 'ESTJ', '得到 ' + res.letters);
  assert('每个维度 letter 正确', DIMS.every(d => res.dims[d].letter === d[0]), JSON.stringify(res.dims));
  assert('TYPES 中能找到 ESTJ', !!TYPES['ESTJ']);
}

// 2. 纯 I/N/F/P
{
  const res = computeResult(answersFor('second'));
  assert('纯 I/N/F/P 作答 → INFP', res.letters === 'INFP', '得到 ' + res.letters);
  assert('每个维度 letter 正确', DIMS.every(d => res.dims[d].letter === d[1]));
}

// 3. 全部"不同意"（-1）→ 四维中立 → 彩蛋
{
  const res = computeResult(QUESTIONS.map(() => -1));
  assert('全"不同意"触发彩蛋 easterEgg', res.easterEgg === true);
  assert('全"不同意"四维全部 amb', DIMS.every(d => res.dims[d].amb === true));
  assert('全"不同意"各维度 pctB=50', DIMS.every(d => res.dims[d].pctB === 50));
}

// 4. 全部"同意"（+1）→ 同样中立（识别中庸作答）
{
  const res = computeResult(QUESTIONS.map(() => 1));
  assert('全"同意"同样被识别为中立', res.easterEgg === true);
}

// 5. 未答（null）不崩溃
{
  const res = computeResult(Array(QUESTIONS.length).fill(null));
  assert('全 null 不崩溃且判为中立', res.easterEgg === true);
}

// 6. 强度边界：单维度轻微偏向
{
  const a = answersFor('first');
  // 把 I 向第 1 题（下标2）从强不同意改为"同意"，让 EI 维度强度下降但不翻向
  a[2] = 1;
  const res = computeResult(a);
  assert('EI 维度仍为 E（首字母极）', res.dims.EI.letter === 'E', '得到 ' + res.dims.EI.letter);
  assert('EI 维度 pctB < 50', res.dims.EI.pctB < 50, 'pctB=' + res.dims.EI.pctB);
}

// 7. 题库结构完整性
{
  assert('共 24 题', QUESTIONS.length === 24);
  const byDim = {};
  QUESTIONS.forEach(q => { byDim[q.dim] = (byDim[q.dim] || 0) + 1; });
  DIMS.forEach(d => assert(d + ' 维度 6 题', byDim[d] === 6, JSON.stringify(byDim)));
  assert('16 型描述齐全', Object.keys(TYPES).length === 16);
}

// 8. 16 型扩展内容（人设/超能力/成长建议/英文名/主题色）完整性
{
  const keys = Object.keys(TYPE_EXTRA);
  assert('TYPE_EXTRA 覆盖 16 型', keys.length === 16, '实际 ' + keys.length);
  const miss = keys.filter(k =>
    !TYPE_EXTRA[k].tagline || !TYPE_EXTRA[k].superpower || !TYPE_EXTRA[k].growth);
  assert('每型都有 人设/超能力/成长建议', miss.length === 0, '缺失: ' + miss.join(','));
  const metaMiss = keys.filter(k =>
    !TYPE_EXTRA[k].en || !TYPE_EXTRA[k].color || !TYPE_EXTRA[k].soft || !TYPE_EXTRA[k].group);
  assert('每型都有 英文名/主题色/淡色/气质群组', metaMiss.length === 0, '缺失: ' + metaMiss.join(','));
  const orphan = keys.filter(k => !TYPES[k]);
  assert('TYPE_EXTRA 与 TYPES 一一对应', orphan.length === 0);
}

// 9. 16 型成长中心数据（解读/职业/人生）完整性
{
  const keys = Object.keys(TYPE_GROWTH);
  assert('TYPE_GROWTH 覆盖 16 型', keys.length === 16, '实际 ' + keys.length);
  const miss = keys.filter(k =>
    !Array.isArray(TYPE_GROWTH[k].strengths) || TYPE_GROWTH[k].strengths.length < 3 ||
    !Array.isArray(TYPE_GROWTH[k].weaknesses) || TYPE_GROWTH[k].weaknesses.length < 3 ||
    !TYPE_GROWTH[k].drive || !TYPE_GROWTH[k].workStyle ||
    !Array.isArray(TYPE_GROWTH[k].roles) || TYPE_GROWTH[k].roles.length < 3 ||
    !Array.isArray(TYPE_GROWTH[k].careerTips) || TYPE_GROWTH[k].careerTips.length < 2 ||
    !Array.isArray(TYPE_GROWTH[k].lifeTips) || TYPE_GROWTH[k].lifeTips.length < 3 ||
    !TYPE_GROWTH[k].relationTip);
  assert('每型字段齐全（优势≥3/劣势≥3/驱动力/职场风格/岗位≥3/职业建议≥2/人生指导≥3/人际）', miss.length === 0, '缺失: ' + miss.join(','));
  const orphan = keys.filter(k => !TYPES[k]);
  assert('TYPE_GROWTH 与 TYPES 一一对应', orphan.length === 0);
}

console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
if (fail > 0) process.exit(1);
