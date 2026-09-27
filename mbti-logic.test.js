/* ============================================================
   逻辑测试 v2（Node 运行：node mbti-logic.test.js）
   ------------------------------------------------------------
   覆盖：
   1. 题库结构：60 题 / 每维 15 题 / 快速档 24 题 / 极性配平 / 无对比句式 / 配对题成组
   2. 选题器：双档位题量、快速子集、深度档维度分块连续
   3. 计分：极端作答的字母与置信度
   4. 中立与彩蛋
   5. 一致性检查（镜像配对题矛盾检出）
   6. 档位置信度差异与元信息
   7. 部分作答 / 未作答的鲁棒性
   8. 16 型内容数据完整性（TYPES / TYPE_EXTRA / TYPE_GROWTH / TYPE_PROFILE）
   ============================================================ */
'use strict';

/* 注入浏览器全局依赖：题库与画像数据来自 data/ 目录 */
const qbank = require('./data/questions.js');
global.QUESTIONS = qbank.QUESTIONS;
global.BANK_VERSION = qbank.BANK_VERSION;
global.TYPE_PROFILE = require('./data/profile.js').TYPE_PROFILE;

const api = require('./script.js');
const {
  computeResult, buildQuestionSet, questionBank, bankVersion,
  MODES, DIMS, TYPES, TYPE_EXTRA, TYPE_GROWTH, TYPE_PROFILE,
  computeRelation, TYPE_CODES
} = api;

let pass = 0, fail = 0;

function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  ✔ ' + name); }
  else { fail++; console.log('  ✘ ' + name + (detail ? '  → ' + detail : '')); }
}

/* 构造"全部偏向某一极"的作答 */
function answersFor(set, pole) {
  const a = {};
  set.forEach(q => {
    const agreeSecond = q.dir > 0;
    const wantAgree = (pole === 'second') ? agreeSecond : !agreeSecond;
    a[q.id] = wantAgree ? 3 : -3; // 强同意 / 强不同意
  });
  return a;
}

console.log('MBTI 逻辑测试 v2\n');

// 1. 题库结构
{
  const bank = questionBank();
  assert('题库共 60 题', bank.length === 60, '实际 ' + bank.length);
  assert('题库版本已定义', bankVersion() >= 2, String(bankVersion()));
  DIMS.forEach(d => assert(d + ' 维度 15 题', bank.filter(q => q.dim === d).length === 15));

  const quick = bank.filter(q => q.quick);
  assert('快速档共 24 题', quick.length === 24, '实际 ' + quick.length);
  DIMS.forEach(d => {
    const qs = quick.filter(q => q.dim === d);
    const first = qs.filter(q => q.dir < 0).length;
    const second = qs.filter(q => q.dir > 0).length;
    assert('快速档 ' + d + ' 6 题且极性 3:3', qs.length === 6 && first === 3 && second === 3, qs.length + ' / ' + first + ':' + second);
  });
  DIMS.forEach(d => {
    const qs = bank.filter(q => q.dim === d);
    const first = qs.filter(q => q.dir < 0).length;
    const second = qs.filter(q => q.dir > 0).length;
    assert('深度档 ' + d + ' 极性差 ≤1', Math.abs(first - second) <= 1, first + ':' + second);
  });

  assert('题目 id 唯一', new Set(bank.map(q => q.id)).size === bank.length);
  assert('每题都有 facet 标注', bank.every(q => !!q.facet));
  assert('每题 dir 为 ±1', bank.every(q => q.dir === 1 || q.dir === -1));

  const badText = bank.filter(q => /而不是|比起|比.*更重要/.test(q.text));
  assert('题干无对比句式', badText.length === 0, badText.map(q => q.id).join(','));

  const pairs = {};
  bank.filter(q => q.pair).forEach(q => { (pairs[q.pair] = pairs[q.pair] || []).push(q); });
  const pairKeys = Object.keys(pairs);
  assert('配对题成组（每组 2 题）', pairKeys.length >= 2 && pairKeys.every(k => pairs[k].length === 2), pairKeys.map(k => k + ':' + pairs[k].length).join(', '));
}

// 2. 选题器
{
  const quick = buildQuestionSet('quick');
  const deep = buildQuestionSet('deep');
  assert('快速档选题 24 题', quick.length === 24, String(quick.length));
  assert('深度档选题 60 题', deep.length === 60, String(deep.length));
  assert('快速档题目全部来自 quick 标记', quick.every(q => q.quick));
  assert('深度档覆盖全部题库', new Set(deep.map(q => q.id)).size === 60);
  DIMS.forEach(d => {
    const idx = deep.map((q, i) => [q, i]).filter(x => x[0].dim === d).map(x => x[1]);
    const sorted = idx.slice().sort((a, b) => a - b);
    assert(d + ' 在深度档中为连续维度块', JSON.stringify(idx) === JSON.stringify(sorted));
  });
  assert('未知档位回退到默认档', ['quick', 'deep'].indexOf(api.modeConf('nope').key) >= 0);
  assert('MODES 定义了 quick 与 deep', !!MODES.quick && !!MODES.deep && MODES.quick.count === 24 && MODES.deep.count === 60);
}

// 3. 计分正确性
{
  const set = buildQuestionSet('deep');
  const first = computeResult(answersFor(set, 'first'), 'deep');
  assert('全首字母极作答 → E/S/T/J', DIMS.every(d => first.dims[d].letter === d[0]), first.letters);
  const second = computeResult(answersFor(set, 'second'), 'deep');
  assert('全次字母极作答 → I/N/F/P', DIMS.every(d => second.dims[d].letter === d[1]), second.letters);
  assert('极端作答置信度 ≥80', second.overallConfidence >= 80, String(second.overallConfidence));
  assert('极端作答不触发彩蛋', second.easterEgg === false);
  assert('TYPES 中存在该类型', !!TYPES[second.letters]);
}

// 4. 中立与彩蛋
{
  const set = buildQuestionSet('quick');
  const neutral = {};
  set.forEach(q => { neutral[q.id] = -1; });
  const res = computeResult(neutral, 'quick');
  assert('全部"不同意" → 四维中立', DIMS.every(d => res.dims[d].amb === true));
  assert('全部"不同意" → 触发彩蛋', res.easterEgg === true);
  assert('全部"不同意" → 各维 pctB=50', DIMS.every(d => res.dims[d].pctB === 50));
  const mid = {};
  set.forEach(q => { mid[q.id] = 1; });
  assert('全部"同意"同样中立', computeResult(mid, 'quick').easterEgg === true);
}

// 5. 一致性检查（镜像配对题矛盾）
{
  const set = buildQuestionSet('deep');
  const a = answersFor(set, 'first');
  const pairIds = questionBank().filter(q => q.pair === 'C-EI-1').map(q => q.id);
  assert('C-EI-1 配对存在两题', pairIds.length === 2, pairIds.join(','));
  pairIds.forEach(id => { a[id] = 3; }); // 两题都强同意 → 自相矛盾
  const res = computeResult(a, 'deep');
  assert('矛盾作答被检出', res.consistencyIssues >= 1, 'issues=' + res.consistencyIssues);
  const clean = computeResult(answersFor(set, 'first'), 'deep');
  assert('一致性作答不误报', clean.consistencyIssues === 0, 'issues=' + clean.consistencyIssues);
  assert('一致作答的置信度更高', clean.overallConfidence > res.overallConfidence);
}

// 6. 档位差异与元信息
{
  const rq = computeResult(answersFor(buildQuestionSet('quick'), 'second'), 'quick');
  const rd = computeResult(answersFor(buildQuestionSet('deep'), 'second'), 'deep');
  assert('快速档置信度不高于深度档', rq.overallConfidence <= rd.overallConfidence, rq.overallConfidence + ' vs ' + rd.overallConfidence);
  assert('结果带档位与题库版本', rq.mode === 'quick' && rd.mode === 'deep' && rd.bankVersion === bankVersion());
  assert('结果带作答数与模式名', rd.answered === 60 && typeof rd.modeLabel === 'string');
}

// 7. 部分作答与空作答
{
  const set = buildQuestionSet('deep');
  const partial = {};
  set.filter(q => q.dim === 'EI').forEach(q => { partial[q.id] = (q.dir > 0 ? 3 : -3); });
  const res = computeResult(partial, 'deep');
  assert('部分作答不崩溃', !!res.dims.EI && res.dims.SN.answered === 0);
  assert('已答维度计数正确', res.dims.EI.answered === 15 && res.answered === 15, 'answered=' + res.answered);
  assert('未答维度置信度为 0', res.dims.SN.confidence === 0);
  assert('空作答不崩溃', computeResult({}, 'deep').answered === 0);
  assert('null 作答不崩溃', computeResult(null, 'deep').easterEgg === true);
}

// 8. 16 型内容完整性
{
  const keys = Object.keys(TYPES);
  assert('TYPES 覆盖 16 型', keys.length === 16, '实际 ' + keys.length);

  const extraMiss = keys.filter(k => {
    const e = TYPE_EXTRA[k];
    return !e || !e.tagline || !e.superpower || !e.growth || !e.en || !e.color || !e.soft || !e.group;
  });
  assert('TYPE_EXTRA 字段齐全', extraMiss.length === 0, extraMiss.join(','));

  const growthMiss = keys.filter(k => {
    const g = TYPE_GROWTH[k];
    return !g || !g.strengths || g.strengths.length < 3 || !g.weaknesses || g.weaknesses.length < 3 ||
      !g.drive || !g.workStyle || !g.roles || g.roles.length < 3 || !g.careerTips || g.careerTips.length < 2 ||
      !g.lifeTips || g.lifeTips.length < 3 || !g.relationTip;
  });
  assert('TYPE_GROWTH 字段齐全', growthMiss.length === 0, growthMiss.join(','));

  assert('TYPE_PROFILE 覆盖 16 型', Object.keys(TYPE_PROFILE).length === 16, '实际 ' + Object.keys(TYPE_PROFILE).length);
  const profileMiss = keys.filter(k => {
    const p = TYPE_PROFILE[k];
    return !p || !p.relations || !p.relations.love || !p.relations.friend || !p.relations.family || !p.relations.work ||
      !p.stress || !p.stress.signal || !p.stress.react || !p.stress.recover ||
      !p.comm || !p.team || !p.learn || !p.money ||
      !Array.isArray(p.checklist) || p.checklist.length !== 6;
  });
  assert('TYPE_PROFILE 字段齐全（关系 4 / 压力 3 / 画像 4 / 清单 6）', profileMiss.length === 0, profileMiss.join(','));
  assert('TYPE_PROFILE 与 TYPES 一一对应', keys.every(k => !!TYPE_PROFILE[k]));
}

// 10. 关系匹配引擎（16×16 = 256 组合）
{
  assert('类型代码表为 16 型', Array.isArray(TYPE_CODES) && TYPE_CODES.length === 16, String(TYPE_CODES && TYPE_CODES.length));

  let err = 0, minScore = 100, maxScore = 0, golden = 0, zeroShared = 0, noCautions = 0;
  TYPE_CODES.forEach(a => {
    TYPE_CODES.forEach(b => {
      const r = computeRelation(a, b);
      const okStruct = r && Array.isArray(r.common) && Array.isArray(r.complement) &&
        Array.isArray(r.cautions) && Array.isArray(r.tips) &&
        r.common.length + r.complement.length === 4 && r.tips.length >= 1;
      if (!okStruct) err++;
      if (!r.cautions.length) noCautions++;
      if (a === b && r.score !== 100) err++;
      minScore = Math.min(minScore, r.score);
      maxScore = Math.max(maxScore, r.score);
      if (r.golden) golden++;
      if (r.score === 0) zeroShared++;
    });
  });
  assert('256 组合结构完整（共同点+互补=4，建议≥1）', err === 0, err + ' 组异常');
  assert('所有组合都有"容易踩的坑"（含四维全异兜底）', noCautions === 0, noCautions + ' 组为空');
  assert('相似度范围为 0%~100%', minScore === 0 && maxScore === 100, minScore + '%~' + maxScore + '%');
  assert('四维全异组合共 16 组（每型 1 个完全相反型）', zeroShared === 16, String(zeroShared));

  const same = computeRelation('INTJ', 'INTJ');
  assert('同型相似度 100% 且互补 0', same.score === 100 && same.complementary === 0);
  const opposite = computeRelation('INTJ', 'ESFP');
  assert('完全相反型相似度 0% 且互补 4', opposite.score === 0 && opposite.complementary === 4);
  assert('完全相反型有兜底提醒', opposite.cautions.length === 1 && opposite.common.length === 0);

  assert('经典互补搭档可识别（INTJ×ENFP）', computeRelation('INTJ', 'ENFP').golden === true);
  assert('经典互补搭档双向对称（ENFP×INTJ）', computeRelation('ENFP', 'INTJ').golden === true);
  assert('非搭档组合不会误判（INTJ×ENTJ）', computeRelation('INTJ', 'ENTJ').golden === false);
  /* 数据里 8 组搭档各写了两遍（A→B 与 B→A），因此有序组合为 8×2=16 */
  assert('经典互补有序组合共 16 组', golden === 16, String(golden));

  assert('共同点/差异点文字来自维度规则', /E\/I|S\/N|T\/F|J\/P/.test(computeRelation('INTJ', 'ESFP').complement.join('')));
}

console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
if (fail > 0) process.exit(1);
