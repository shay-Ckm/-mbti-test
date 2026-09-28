/* ============================================================
   逻辑测试 v2（Node 运行：node mbti-logic.test.js）
   ------------------------------------------------------------
   覆盖：
   1. 题库结构：64 题 / 每维 16 题（8:8）/ 4 个共享 facet / 快速档 24 题（3:3）/ 无对比句式 / 镜像题成组
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

// 1. 题库结构（v4 契约：200 题，每维 50 = 5 侧面 × 10 题，两极 25:25）
{
  const bank = questionBank();
  assert('题库共 200 题', bank.length === 200, '实际 ' + bank.length);
  assert('题库版本 ≥ 4', bankVersion() >= 4, String(bankVersion()));
  DIMS.forEach(d => assert(d + ' 维度 50 题', bank.filter(q => q.dim === d).length === 50,
    String(bank.filter(q => q.dim === d).length)));

  /* 每维两极严格 25:25（差值分数的前提） */
  DIMS.forEach(d => {
    const qs = bank.filter(q => q.dim === d);
    const first = qs.filter(q => q.dir < 0).length;
    const second = qs.filter(q => q.dir > 0).length;
    assert(d + ' 两极严格 25:25', first === 25 && second === 25, first + ':' + second);
  });

  /* 侧面结构：每维 5 个共享侧面，每侧面 10 题且两极各 5 题（差值分数才代表同一构念的两端） */
  DIMS.forEach(d => {
    const qs = bank.filter(q => q.dim === d);
    const facets = {};
    qs.forEach(q => {
      const f = facets[q.facet] || (facets[q.facet] = { a: 0, b: 0, n: 0 });
      f.n++;
      if (q.dir < 0) f.a++; else f.b++;
    });
    const names = Object.keys(facets);
    assert(d + ' 有 5 个内容侧面', names.length === 5, names.join(','));
    const balanced = names.filter(n => facets[n].n === 10 && facets[n].a === 5 && facets[n].b === 5);
    assert(d + ' 每个侧面 10 题且两极 5:5', balanced.length === names.length,
      names.map(n => n + ':' + facets[n].a + '/' + facets[n].b).join(' '));
  });

  assert('题目 id 唯一', new Set(bank.map(q => q.id)).size === bank.length);
  assert('每题都有 facet 标注', bank.every(q => !!q.facet));
  assert('每题 dir 为 ±1', bank.every(q => q.dir === 1 || q.dir === -1));

  const badText = bank.filter(q => /而不是|比起|比.*更重要/.test(q.text));
  assert('题干无对比句式', badText.length === 0, badText.map(q => q.id).join(','));

  /* 近似重复检测：字级 bigram Jaccard ≥ 0.65 视为重复 */
  const grams = bank.map(q => {
    const s = new Set();
    for (let i = 0; i < q.text.length - 1; i++) s.add(q.text.slice(i, i + 2));
    return s;
  });
  const dups = [];
  for (let i = 0; i < bank.length; i++) {
    for (let j = i + 1; j < bank.length; j++) {
      let inter = 0;
      grams[i].forEach(g => { if (grams[j].has(g)) inter++; });
      const sim = inter / (grams[i].size + grams[j].size - inter);
      if (sim >= 0.65) dups.push(bank[i].id + '/' + bank[j].id + '=' + sim.toFixed(2));
    }
  }
  assert('题干无近似重复（Jaccard < 0.65）', dups.length === 0, dups.slice(0, 8).join(', '));

  const pairs = {};
  bank.filter(q => q.pair).forEach(q => { (pairs[q.pair] = pairs[q.pair] || []).push(q); });
  const pairKeys = Object.keys(pairs);
  assert('镜像题成组（每组 2 题·同维反向）',
    pairKeys.length >= 2 && pairKeys.every(k => pairs[k].length === 2 &&
      pairs[k][0].dim === pairs[k][1].dim && pairs[k][0].dir !== pairs[k][1].dir),
    pairKeys.length + ' 组');
  assert('20 组镜像题、每维 5 组', pairKeys.length === 20, String(pairKeys.length));
  DIMS.forEach(d => {
    const n = pairKeys.filter(k => pairs[k][0].dim === d).length;
    assert(d + ' 有 5 组镜像题', n === 5, String(n));
  });
}

// 1b. 抽题规则（每次开测按维度等比例随机抽题）
{
  const bank = questionBank();
  [['quick', 6, 24], ['deep', 16, 64]].forEach(([mode, perDim, total]) => {
    const set = buildQuestionSet(mode);
    assert(mode + ' 档共 ' + total + ' 题', set.length === total, String(set.length));
    DIMS.forEach(d => {
      const qs = set.filter(q => q.dim === d);
      const first = qs.filter(q => q.dir < 0).length;
      const second = qs.filter(q => q.dir > 0).length;
      assert(mode + ' ' + d + ' ' + perDim + ' 题且极性 1:1',
        qs.length === perDim && first === perDim / 2 && second === perDim / 2,
        qs.length + ' / ' + first + ':' + second);
      /* 侧面覆盖：深度档 5/5；快速档名额按 distrebute 均分，至少覆盖 3 个侧面 */
      const covered = new Set(qs.map(q => q.facet)).size;
      const need = mode === 'deep' ? 5 : 3;
      assert(mode + ' ' + d + ' 侧面覆盖 ≥ ' + need + '/5', covered >= need, '覆盖 ' + covered + '/5');
      /* 侧面内两极平衡（同侧面的 A/B 名额差不超过 1） */
      const byFacet = {};
      qs.forEach(q => {
        const f = byFacet[q.facet] || (byFacet[q.facet] = { a: 0, b: 0 });
        if (q.dir < 0) f.a++; else f.b++;
      });
      const skew = Object.keys(byFacet).filter(n => Math.abs(byFacet[n].a - byFacet[n].b) > 1);
      assert(mode + ' ' + d + ' 侧面内两极平衡', skew.length === 0,
        skew.map(n => n + ':' + byFacet[n].a + '/' + byFacet[n].b).join(' '));
    });
    assert(mode + ' 抽题 id 唯一', new Set(set.map(q => q.id)).size === set.length);
    assert(mode + ' 抽题覆盖全部 4 维', new Set(set.map(q => q.dim)).size === 4);
    /* 维度交织：同一维不连续出现 4 次以上 */
    let run = 1, maxRun = 1;
    for (let i = 1; i < set.length; i++) {
      run = set[i].dim === set[i - 1].dim ? run + 1 : 1;
      if (run > maxRun) maxRun = run;
    }
    assert(mode + ' 同维最长连续 ≤ 3', maxRun <= 3, '最长 ' + maxRun);
  });

  /* 随机性：两次抽题不应完全相同（200 题里抽 64 题，重叠但不等同） */
  const a = buildQuestionSet('deep').map(q => q.id).join(',');
  const b = buildQuestionSet('deep').map(q => q.id).join(',');
  assert('两次抽题结果不同（随机）', a !== b);

  /* 长期覆盖：多轮抽样应能覆盖到题库大部分题目 */
  const seen = new Set();
  for (let i = 0; i < 12; i++) buildQuestionSet('deep').forEach(q => seen.add(q.id));
  assert('12 轮深度抽题覆盖 ≥ 60% 题库', seen.size / bank.length >= 0.6,
    Math.round(seen.size / bank.length * 100) + '%');
}

// 2. 选题器（含交织出题：削弱顺序与启动效应）
{
  const quick = buildQuestionSet('quick');
  const deep = buildQuestionSet('deep');
  assert('快速档选题 = 4 维 × 6 题', quick.length === MODES.quick.perDim * DIMS.length, String(quick.length));
  assert('深度档选题 = 4 维 × 16 题', deep.length === MODES.deep.perDim * DIMS.length, String(deep.length));
  assert('抽题全部来自题库且不重复',
    quick.concat(deep).every(q => questionBank().some(b => b.id === q.id)) &&
    new Set(quick.map(q => q.id)).size === quick.length &&
    new Set(deep.map(q => q.id)).size === deep.length);

  /* 同一维度不应连续成块出现（v2 是整维连续，会形成答题定势） */
  let maxRun = 1, run = 1;
  for (let i = 1; i < deep.length; i++) {
    run = deep[i].dim === deep[i - 1].dim ? run + 1 : 1;
    maxRun = Math.max(maxRun, run);
  }
  assert('深度档同维连续 ≤3 题（交织出题）', maxRun <= 3, '最长 ' + maxRun);

  /* 同一方向（同一极）也不应长时间连续，避免"一路同意"的定势 */
  let maxDirRun = 1; run = 1;
  for (let i = 1; i < deep.length; i++) {
    run = deep[i].dir === deep[i - 1].dir ? run + 1 : 1;
    maxDirRun = Math.max(maxDirRun, run);
  }
  assert('深度档同方向连续 ≤4 题', maxDirRun <= 4, '最长 ' + maxDirRun);

  /* 每次出题顺序应不同（随机化生效） */
  const orders = new Set();
  for (let i = 0; i < 8; i++) orders.add(buildQuestionSet('deep').map(q => q.id).join(','));
  assert('出题顺序随机化（8 次至少 6 种顺序）', orders.size >= 6, String(orders.size));
  assert('快速档也随机化（8 次至少 4 种顺序）',
    new Set(Array.from({ length: 8 }, () => buildQuestionSet('quick').map(q => q.id).join(','))).size >= 4);

  assert('未知档位回退到默认档', ['quick', 'deep'].indexOf(api.modeConf('nope').key) >= 0);
  assert('MODES 定义 quick 24 / deep 64', !!MODES.quick && !!MODES.deep && MODES.quick.count === 24 && MODES.deep.count === 64);
  assert('modePerDim 给出每维抽题量（分母正确性）',
    api.modePerDim('quick') === 6 && api.modePerDim('deep') === 16,
    api.modePerDim('quick') + '/' + api.modePerDim('deep'));
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
  /* 取题库里的第一组镜像题（pair 命名已随 v4 改为 C-<DIM>-<facet>） */
  const pairKey = questionBank().filter(q => q.pair)[0].pair;
  const pairIds = questionBank().filter(q => q.pair === pairKey).map(q => q.id);
  assert('镜像题成组存在（' + pairKey + '）', pairIds.length === 2, pairIds.join(','));
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
  assert('结果带作答数与模式名', rd.answered === 64 && typeof rd.modeLabel === 'string', String(rd.answered));
}

// 7. 部分作答与空作答
{
  const set = buildQuestionSet('deep');
  const partial = {};
  set.filter(q => q.dim === 'EI').forEach(q => { partial[q.id] = (q.dir > 0 ? 3 : -3); });
  const res = computeResult(partial, 'deep');
  assert('部分作答不崩溃', !!res.dims.EI && res.dims.SN.answered === 0);
  assert('已答维度计数正确', res.dims.EI.answered === 16 && res.answered === 16, 'answered=' + res.answered);
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

// 9. 置信度模型 / 侧面一致性 / 响应定势（v3 新增）
{
  const quickSet = buildQuestionSet('quick');
  const deepSet = buildQuestionSet('deep');

  /* 9.1 分母必须是本档题量（v2 的 bug：快速档用全库 15 题当分母 → 置信度被压到 ~34%） */
  const quickFull = computeResult(answersFor(quickSet, 'second'), 'quick');
  const deepFull = computeResult(answersFor(deepSet, 'second'), 'deep');
  DIMS.forEach(d => {
    assert('快速档 ' + d + ' 总题数为 6（本档分母）', quickFull.dims[d].total === 6, String(quickFull.dims[d].total));
    assert('快速档 ' + d + ' 答满后 answered=total', quickFull.dims[d].answered === 6 && quickFull.dims[d].answered === quickFull.dims[d].total);
  });
  assert('快速档答满后总体置信度明显高于 v2（≥45）', quickFull.overallConfidence >= 45, String(quickFull.overallConfidence));
  assert('深度档答满后总体置信度 ≥70', deepFull.overallConfidence >= 70, String(deepFull.overallConfidence));
  assert('深度档置信度高于快速档', deepFull.overallConfidence > quickFull.overallConfidence,
    deepFull.overallConfidence + ' vs ' + quickFull.overallConfidence);

  /* 9.2 侧面级一致性数据 */
  DIMS.forEach(d => {
    const info = deepFull.dims[d];
    assert(d + ' 输出 5 个侧面明细', Array.isArray(info.facets) && info.facets.length === 5, String(info.facets && info.facets.length));
    assert(d + ' 侧面一致度为 0.25 的整数倍', [0.25, 0.5, 0.75, 1].indexOf(info.facetAgreement) >= 0, String(info.facetAgreement));
    assert(d + ' 倾向一致时侧面一致度为 1', info.facetAgreement === 1, String(info.facetAgreement));
  });

  /* 9.3 响应定势：全部同意 / 全部不同意 都不应产出确定类型（配平计分的作用） */
  const allBank = questionBank();
  const allAgree = {}; allBank.forEach(q => { allAgree[q.id] = 3; });
  const allDisagree = {}; allBank.forEach(q => { allDisagree[q.id] = -3; });
  const ra = computeResult(allAgree, 'deep');
  const rd = computeResult(allDisagree, 'deep');
  assert('全部同意 → 四维全部判为模糊（配平计分抵消默认同意）',
    DIMS.every(d => ra.dims[d].amb), ra.letters + ' / ' + DIMS.map(d => ra.dims[d].pctB).join(','));
  assert('全部同意 → 触发"框不住你"彩蛋', ra.easterEgg === true);
  assert('全部不同意 → 同样不产出确定类型', DIMS.every(d => rd.dims[d].amb), rd.letters);

  /* 9.3b 回归：温和但一致的作答（只用「同意/不同意」= ±1）必须给出确定类型。
     量表为 {-3,-1,1,3}，完全一致的温和作答 score 恰好 = ±1；
     旧阈值 |score| <= 1 会把这种人误判为四维全模糊 → 无论怎么选都看到彩蛋页。 */
  const moderateFirst = {};
  const moderateSecond = {};
  allBank.forEach(q => {
    moderateFirst[q.id] = q.dir < 0 ? 1 : -1;    // 一致的温和作答，指向首字母极
    moderateSecond[q.id] = q.dir < 0 ? -1 : 1;   // 一致的温和作答，指向次字母极
  });
  const rm = computeResult(moderateFirst, 'deep');
  const rm2 = computeResult(moderateSecond, 'deep');
  assert('温和一致作答（±1）→ 四维均非模糊', DIMS.every(d => rm.dims[d].amb === false),
    DIMS.map(d => d + ':' + rm.dims[d].score).join(' '));
  assert('温和一致作答 → 得分恰为 ±1（阈值必须是严格小于）',
    DIMS.every(d => Math.abs(rm.dims[d].score) === 1), DIMS.map(d => rm.dims[d].score).join(','));
  assert('温和一致作答 → 类型为 E/S/T/J 且不触发彩蛋', rm.letters === 'ESTJ' && rm.easterEgg === false, rm.letters);
  assert('温和一致作答（反向）→ 类型为 I/N/F/P', rm2.letters === 'INFP' && rm2.easterEgg === false, rm2.letters);
  assert('温和一致作答落点为 33%/67%', rm.dims.EI.pctB === 33 && rm2.dims.EI.pctB === 67,
    rm.dims.EI.pctB + '/' + rm2.dims.EI.pctB);
  assert('温和一致作答置信度低于极端作答',
    rm.overallConfidence < computeResult((function () {
      const a = {}; allBank.forEach(q => { a[q.id] = q.dir < 0 ? 3 : -3; }); return a;
    })(), 'deep').overallConfidence,
    rm.overallConfidence + '%');

  /* 9.4 无系统性偏向：随机作答者的分数应围绕 50% 对称。
     注意 pctB 恰好 = 50（平手）时按约定判给"次字母极"，
     所以"首字母极占比"会略低于 50% —— 这里同时检验分数均值与字母占比。 */
  let seed = 20240927;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const vals = [-3, -1, 1, 3];
  const firstCount = { EI: 0, SN: 0, TF: 0, JP: 0 };
  const pctSum = { EI: 0, SN: 0, TF: 0, JP: 0 };
  const N = 400;
  for (let i = 0; i < N; i++) {
    const a = {};
    allBank.forEach(q => { a[q.id] = vals[Math.floor(rnd() * 4)]; });
    const r = computeResult(a, 'deep');
    DIMS.forEach(d => {
      if (r.dims[d].letter === d[0]) firstCount[d]++;
      pctSum[d] += r.dims[d].pctB;
    });
  }
  DIMS.forEach(d => {
    const share = firstCount[d] / N;
    const meanPct = pctSum[d] / N;
    assert(d + ' 随机作答分数均值 ≈ 50%（48~52）', meanPct >= 48 && meanPct <= 52, meanPct.toFixed(1) + '%');
    assert(d + ' 随机作答首字母极占比 42%~55%（含平手归次极）',
      share >= 0.42 && share <= 0.55, (share * 100).toFixed(1) + '%');
  });

  /* 9.5 镜像题矛盾检测（取题库里的第一组镜像题） */
  const contradiction = {};
  const pairKey2 = allBank.filter(q => q.pair)[0].pair;
  const pairIds = allBank.filter(q => q.pair === pairKey2);
  pairIds.forEach(q => { contradiction[q.id] = 3; });   // 两道镜像题都强同意 = 自相矛盾
  const rc = computeResult(contradiction, 'deep');
  assert('镜像题同时强同意 → 检出不一致', rc.consistencyIssues >= 1, String(rc.consistencyIssues));
  const consistent = {};
  pairIds.forEach(q => { consistent[q.id] = q.dir < 0 ? 3 : -3; });  // 一致指向首字母极
  assert('镜像题一致作答 → 不误报', computeResult(consistent, 'deep').consistencyIssues === 0);
  /* "不确定"不参与一致性判定 */
  const neutral = {};
  pairIds.forEach(q => { neutral[q.id] = 0; });
  assert('镜像题选不确定 → 不计入矛盾', computeResult(neutral, 'deep').consistencyIssues === 0);
}

/* 10. 输入健壮性（防存储污染 / 非法值）
   这些用例对应审计发现：computeResult 对作答值零校验时，
   字符串会走 `+=` 拼接（实测 pctB = -34722147）、NaN/Infinity 会让整条链路出现 NaN。 */
{
  const set = buildQuestionSet('deep');
  const ids = set.map(q => q.id);
  const finite = v => typeof v === 'number' && isFinite(v);

  /* 10.1 非法作答值一律按"未作答"处理 */
  const hostile = {};
  set.forEach((q, i) => {
    const bad = [NaN, Infinity, -Infinity, 1e308, 100, -100, true, false, null, undefined, 'abc', {}, []][i % 13];
    hostile[q.id] = bad;
  });
  const hr = computeResult(hostile, 'deep', ids);
  assert('非法值不产生 NaN/Infinity（pctB 全为有限值）',
    DIMS.every(d => finite(hr.dims[d].pctB)), DIMS.map(d => d + ':' + hr.dims[d].pctB).join(' '));
  assert('非法值不计入已答', hr.answered === 0, 'answered=' + hr.answered);
  assert('非法值下四维落点居中 50%', DIMS.every(d => hr.dims[d].pctB === 50));
  assert('非法值不产生越界百分比（0–100）',
    DIMS.every(d => hr.dims[d].pctB >= 0 && hr.dims[d].pctB <= 100 && hr.dims[d].strength >= 0 && hr.dims[d].strength <= 100));
  assert('非法值下置信度仍为有限值', finite(hr.overallConfidence) && hr.overallConfidence >= 0 && hr.overallConfidence <= 100,
    String(hr.overallConfidence));

  /* 10.2 数值字符串（旧数据形态）被接受，但绝不发生字符串拼接 */
  const strAns = {};
  set.filter(q => q.dim === 'EI').forEach((q, i) => { strAns[q.id] = i % 2 === 0 ? '3' : '-3'; });
  const sr = computeResult(strAns, 'deep', ids);
  assert('数值字符串被解析为数值（不是拼接）',
    finite(sr.dims.EI.score) && Math.abs(sr.dims.EI.score) <= 3 && sr.dims.EI.answered === sr.dims.EI.total,
    'score=' + sr.dims.EI.score + ' answered=' + sr.dims.EI.answered);

  /* 10.3 题集去重：重复 id 不会被算多遍 */
  const dup = computeResult(answersFor(set, 'first'), 'deep', ids.concat(ids, ids));
  assert('重复题集被去重（answered 不膨胀）',
    DIMS.every(d => dup.dims[d].answered === dup.dims[d].total),
    DIMS.map(d => d + ':' + dup.dims[d].answered + '/' + dup.dims[d].total).join(' '));
  assert('计分题数不超过分母（scored ≤ total）',
    DIMS.every(d => dup.dims[d].scored <= dup.dims[d].total));

  /* 10.4 题集含未知/非字符串元素时被忽略 */
  const dirty = computeResult(answersFor(set, 'first'), 'deep',
    ids.slice(0, 40).concat(['q999', 'nope', null, undefined, 42, {}, '', 'q001']));
  assert('题集里的未知/非法元素被忽略（不崩、计数自洽）',
    DIMS.every(d => finite(dirty.dims[d].pctB) && dirty.dims[d].answered > 0 &&
      dirty.dims[d].answered <= dirty.dims[d].total &&
      dirty.dims[d].scored + dirty.dims[d].neutral === dirty.dims[d].answered),
    DIMS.map(d => d + ':' + dirty.dims[d].answered + '/' + dirty.dims[d].total).join(' '));
  assert('题集外的作答不计入（截断题集后每维只算 10 题）',
    DIMS.every(d => dirty.dims[d].answered === 10), DIMS.map(d => d + ':' + dirty.dims[d].answered).join(' '));

  /* 10.5 空作答 / 空题集 / 非法档位不崩 */
  const empty = computeResult({}, 'deep', []);
  assert('空作答不崩且四维居中', DIMS.every(d => empty.dims[d].pctB === 50) && empty.easterEgg === true,
    'letters=' + empty.letters + ' egg=' + empty.easterEgg);
  assert('非法档位回退到默认档', computeResult({}, 'bogus').mode === 'deep');
  assert('answers 为 null/数组/字符串时不崩',
    computeResult(null, 'deep').letters.length === 4 &&
    computeResult([], 'deep').letters.length === 4 &&
    computeResult('x', 'deep').letters.length === 4);

  /* 10.6 全选"不确定"：不计分但计入已答，置信度为 0 */
  const allNeutral = {};
  set.forEach(q => { allNeutral[q.id] = 0; });
  const nr = computeResult(allNeutral, 'deep', ids);
  assert('全选不确定 → 计分题数为 0、已答满、置信度 0',
    DIMS.every(d => nr.dims[d].scored === 0 && nr.dims[d].neutral === nr.dims[d].total) &&
    nr.answered === set.length && nr.overallConfidence === 0,
    'answered=' + nr.answered + ' conf=' + nr.overallConfidence);
  assert('全选不确定 → 走"框不住你"彩蛋（而不是硬给类型）', nr.easterEgg === true);

  /* 10.7 answeredCount 只认合法值 */
  assert('answeredCount 忽略非法值', api.answeredCount({ a: 3, b: 'x', c: null, d: undefined, e: 0, f: NaN }) === 2,
    String(api.answeredCount({ a: 3, b: 'x', c: null, d: undefined, e: 0, f: NaN })));

  /* 10.8 结果净化：渲染层拿到的必须是数字/白名单字符串（防存储型 DOM XSS） */
  {
    const dirty = {
      mode: 'quick', letters: 'INTJ',
      answered: '<img src=x onerror=alert(1)>',
      bankVersion: '<img src=x onerror=alert(1)>',
      overallConfidence: 9999, consistencyIssues: 0, easterEgg: false,
      type: { zh: 'x', emoji: '<svg onload=alert(1)>', tags: 'not-an-array' },
      dims: {}
    };
    DIMS.forEach((d, i) => {
      dirty.dims[d] = {
        A: '<img src=x onerror=alert(1)>', B: '<svg onload=alert(1)>', pctB: 30 + i * 10,
        letter: '<script>', strength: 40, amb: false, confidence: 70, answered: 1, scored: 1, neutral: 0, total: 6,
        facets: [], facetAgreement: 1, facetSummary: '<img src=x onerror=alert(1)>', label: '<svg onload=alert(1)>'
      };
    });
    const clean = api.sanitizeResult(dirty);
    assert('净化后数字字段被强制为数字',
      clean.answered === 0 && clean.bankVersion === 0 && clean.overallConfidence <= 100,
      clean.answered + ' / ' + clean.bankVersion + ' / ' + clean.overallConfidence);
    assert('净化后 HTML 片段被剥离（label/facetSummary/两极字母）',
      !/[<>]/.test(clean.dims.EI.label + clean.dims.EI.facetSummary) &&
      clean.dims.EI.A === 'E' && clean.dims.EI.B === 'I',
      clean.dims.EI.label + ' | ' + clean.dims.EI.facetSummary + ' | ' + clean.dims.EI.A + clean.dims.EI.B);
    assert('净化后 type 一律取自内置常量（不信任存储）',
      clean.type && clean.type.zh === '战略家' && Array.isArray(clean.type.tags),
      clean.type && clean.type.zh);
    assert('非法 letters 的 result 直接判为不可用', api.sanitizeResult({ letters: 'ABCD', dims: dirty.dims }) === null);
  }
}

console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
if (fail > 0) process.exit(1);
