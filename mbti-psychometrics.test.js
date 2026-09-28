/* ============================================================
   计分管线准确率仿真（node mbti-psychometrics.test.js）
   ------------------------------------------------------------
   说明（务必如实理解结论边界）：
   这是**模型内仿真**，不是真实被试的效度研究。它检验的是"给定一套
   明确的作答生成机制，现有计分管线能否还原出真实偏好"，因此能发现：
     · 题库极性/方向标注错误（会导致系统性偏移）
     · 侧面结构缺陷、题量与噪声不匹配
     · 响应定势（默认同意）是否被配平计分抵消
     · 弱偏好是否被诚实标为"模糊"，而不是硬猜一个类型
   它**不能**替代真实样本的信效度检验（那需要几百名真实被试）。

   模型：潜变量 θ（每维 ∈[-3,3]，正=次字母极），题目区分度 k，
   默认同意倾向 acq；按 θ 生成 4 点迫选作答后交给真实的 computeResult。
   ============================================================ */
'use strict';

const qbank = require('./data/questions.js');
global.QUESTIONS = qbank.QUESTIONS;
global.BANK_VERSION = qbank.BANK_VERSION;
global.TYPE_PROFILE = require('./data/profile.js').TYPE_PROFILE;

const api = require('./script.js');
const { computeResult, questionBank, buildQuestionSet } = api;
const DIMS = api.DIMS;

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✔ ' + name); }
  else { fail++; console.log('  ✘ ' + name + (detail ? '  → ' + detail : '')); }
}

/* 确定性随机数（结果可复现） */
function makeRnd(seed) {
  let s = seed;
  return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
}
const sigmoid = x => 1 / (1 + Math.exp(-x));

/* 生成作答：theta = {EI,SN,TF,JP}；k 区分度；acq 默认同意倾向(0~1)
   set = 本次实际抽到的题（不给则答全库，兼容旧用法） */
function respond(theta, rnd, k, acq, set) {
  const a = {};
  (set || questionBank()).forEach(q => {
    const towardSecond = q.dir > 0 ? 1 : -1;
    const v = (theta[q.dim] || 0) * towardSecond;          // ∈[-3,3]，正=倾向次字母极
    const pAgree = (1 - acq) * sigmoid(k * v / 1.6) + acq;
    const agree = rnd() < pAgree;
    const strongP = 0.45 + 0.4 * Math.min(1, Math.abs(v) / 3);
    const strong = rnd() < strongP;
    a[q.id] = agree ? (strong ? 3 : 1) : (strong ? -3 : -1);
  });
  return a;
}

/* 第 2~4 位极（次字母极）判定正确 = 与 theta 符号一致 */
function dimsCorrect(res, theta) {
  return DIMS.filter(d => {
    const wantSecond = (theta[d] || 0) > 0;
    return res.dims[d].letter === (wantSecond ? d[1] : d[0]);
  }).length;
}

console.log('MBTI 计分管线准确率仿真\n');
console.log('（模型内仿真：θ=潜在偏好强度，k=2.6 区分度，无默认同意倾向）\n');

const K = 2.6;
const LEVELS = [0, 0.5, 1, 1.5, 2, 2.5, 3];
const N_PER_LEVEL = 300;

/* ---------- 1. 逐维恢复准确率 & 四字母全对率 ---------- */
const table = {};
['deep', 'quick'].forEach(mode => {
  table[mode] = LEVELS.map(level => {
    const rnd = makeRnd(1000 + Math.round(level * 10) + (mode === 'deep' ? 0 : 7));
    let dimHits = 0, exact = 0, ambCount = 0, dimTotal = 0;
    for (let i = 0; i < N_PER_LEVEL; i++) {
      const theta = {};
      DIMS.forEach(d => {
        /* 该维强度 = level，方向随机（一半偏首字母极、一半偏次字母极） */
        const sign = rnd() < 0.5 ? -1 : 1;
        theta[d] = sign * level;
      });
      /* 每位被试随机抽一套题（与真实流程一致：每维等比例随机抽题） */
      const set = buildQuestionSet(mode);
      const res = computeResult(respond(theta, rnd, K, 0, set), mode, set.map(q => q.id));
      const hit = dimsCorrect(res, theta);
      dimHits += hit; dimTotal += 4;
      if (hit === 4) exact++;
      DIMS.forEach(d => { if (res.dims[d].amb) ambCount++; });
    }
    return {
      level,
      dimAcc: dimHits / dimTotal,
      exactAcc: exact / N_PER_LEVEL,
      ambRate: ambCount / dimTotal
    };
  });
});

console.log('深度档（64 题）');
console.log('  |θ|      逐维准确率   四字母全对率   判为模糊比例');
table.deep.forEach(r => {
  console.log('  ' + r.level.toFixed(1).padEnd(7) + (r.dimAcc * 100).toFixed(1).padStart(6) + '%' +
    (r.exactAcc * 100).toFixed(1).padStart(12) + '%' + (r.ambRate * 100).toFixed(1).padStart(12) + '%');
});
console.log('快速档（24 题）');
table.quick.forEach(r => {
  console.log('  ' + r.level.toFixed(1).padEnd(7) + (r.dimAcc * 100).toFixed(1).padStart(6) + '%' +
    (r.exactAcc * 100).toFixed(1).padStart(12) + '%' + (r.ambRate * 100).toFixed(1).padStart(12) + '%');
});
console.log('');

const at = (mode, level) => table[mode].find(r => r.level === level);
check('深度档 强偏好（|θ|=3）逐维准确率 ≥95%', at('deep', 3).dimAcc >= 0.95, (at('deep', 3).dimAcc * 100).toFixed(1) + '%');
check('深度档 强偏好（|θ|=3）四字母全对率 ≥90%', at('deep', 3).exactAcc >= 0.9, (at('deep', 3).exactAcc * 100).toFixed(1) + '%');
check('深度档 中等偏好（|θ|=2）逐维准确率 ≥88%', at('deep', 2).dimAcc >= 0.88, (at('deep', 2).dimAcc * 100).toFixed(1) + '%');
check('深度档 强偏好（|θ|=2.5）四字母全对率 ≥80%', at('deep', 2.5).exactAcc >= 0.8, (at('deep', 2.5).exactAcc * 100).toFixed(1) + '%');
check('快速档 强偏好（|θ|=3）逐维准确率 ≥88%', at('quick', 3).dimAcc >= 0.88, (at('quick', 3).dimAcc * 100).toFixed(1) + '%');
check('快速档 中等偏好（|θ|=1）逐维准确率 ≥90%', at('quick', 1).dimAcc >= 0.9, (at('quick', 1).dimAcc * 100).toFixed(1) + '%');
check('深度档准确率高于快速档（|θ|=1）', at('deep', 1).dimAcc > at('quick', 1).dimAcc,
  (at('deep', 1).dimAcc * 100).toFixed(1) + '% vs ' + (at('quick', 1).dimAcc * 100).toFixed(1) + '%');
check('深度档四字母全对率高于快速档（|θ|=1）', at('deep', 1).exactAcc > at('quick', 1).exactAcc,
  (at('deep', 1).exactAcc * 100).toFixed(1) + '% vs ' + (at('quick', 1).exactAcc * 100).toFixed(1) + '%');
check('深度档模糊判定更保守（|θ|=0.5 时深度档模糊率更高）',
  at('deep', 0.5).ambRate > at('quick', 0.5).ambRate,
  (at('deep', 0.5).ambRate * 100).toFixed(1) + '% vs ' + (at('quick', 0.5).ambRate * 100).toFixed(1) + '%');
check('弱偏好（|θ|≤0.5）多数被诚实标为模糊（≥60%）', at('deep', 0).ambRate >= 0.6 && at('deep', 0.5).ambRate >= 0.5,
  at('deep', 0).ambRate.toFixed(2) + ' / ' + at('deep', 0.5).ambRate.toFixed(2));
check('无偏好（|θ|=0）时模糊比例 > 强偏好时（区分度体现）',
  at('deep', 0).ambRate > at('deep', 3).ambRate);

/* ---------- 2. 模型内内部一致性 Cronbach's α ---------- */
function alpha(mode, rnd, n) {
  const set = buildQuestionSet(mode);      // 该档实际抽到的题（固定一套，跨被试可比）
  const rows = [];
  for (let i = 0; i < n; i++) {
    const theta = {};
    DIMS.forEach(d => { theta[d] = (rnd() * 6 - 3); });     // θ ~ U(-3,3)
    const a = respond(theta, rnd, K, 0, set);
    /* 关键方向化：所有题目转为"越大越偏次字母极"，使同一维题目测同一方向 */
    rows.push(set.map(q => a[q.id] * (q.dir > 0 ? 1 : -1)));
  }
  const out = {};
  DIMS.forEach((d, di) => {
    const idx = set.map((q, i) => [q, i]).filter(x => x[0].dim === d).map(x => x[1]);
    const cols = idx.map(i => rows.map(r => r[i]));
    const variance = arr => {
      const m = arr.reduce((s, v) => s + v, 0) / arr.length;
      return arr.reduce((s, v) => s + (v - m) * (v - m), 0) / (arr.length - 1);
    };
    const itemVar = cols.reduce((s, c) => s + variance(c), 0);
    const totals = rows.map(r => idx.reduce((s, i) => s + r[i], 0));
    const k = idx.length;
    out[d] = (k / (k - 1)) * (1 - itemVar / variance(totals));
  });
  return out;
}

const rndA = makeRnd(20260101);
const alphaDeep = alpha('deep', rndA, 500);
const rndB = makeRnd(20260102);
const alphaQuick = alpha('quick', rndB, 500);
console.log('内部一致性（模型内 Cronbach\'s α，θ~U(-3,3)，500 名虚拟被试）');
console.log('  深度档: ' + DIMS.map(d => d + '=' + alphaDeep[d].toFixed(3)).join('  '));
console.log('  快速档: ' + DIMS.map(d => d + '=' + alphaQuick[d].toFixed(3)).join('  '));
console.log('');
DIMS.forEach(d => {
  check('深度档 ' + d + ' α ≥0.85', alphaDeep[d] >= 0.85, alphaDeep[d].toFixed(3));
  check('快速档 ' + d + ' α ≥0.70', alphaQuick[d] >= 0.70, alphaQuick[d].toFixed(3));
  check(d + ' 深度档 α 高于快速档', alphaDeep[d] > alphaQuick[d],
    alphaDeep[d].toFixed(3) + ' vs ' + alphaQuick[d].toFixed(3));
});

/* ---------- 3. 重测稳定性（两次独立作答） ---------- */
{
  const rnd = makeRnd(777);
  let agreeStrong = 0, nStrong = 0, agreeWeak = 0, nWeak = 0;
  for (let i = 0; i < 300; i++) {
    const theta = {};
    DIMS.forEach(d => { theta[d] = (rnd() < 0.5 ? -1 : 1) * 2.5; });
    const t1 = computeResult(respond(theta, rnd, K, 0), 'deep').letters;
    const t2 = computeResult(respond(theta, rnd, K, 0), 'deep').letters;
    nStrong++; if (t1 === t2) agreeStrong++;

    const thetaW = {};
    DIMS.forEach(d => { thetaW[d] = (rnd() < 0.5 ? -1 : 1) * 0.6; });
    const w1 = computeResult(respond(thetaW, rnd, K, 0), 'deep').letters;
    const w2 = computeResult(respond(thetaW, rnd, K, 0), 'deep').letters;
    nWeak++; if (w1 === w2) agreeWeak++;
  }
  const sRate = agreeStrong / nStrong, wRate = agreeWeak / nWeak;
  console.log('重测稳定性（同一位虚拟被试作答两次，四字母一致率）');
  console.log('  强偏好 |θ|=2.5: ' + (sRate * 100).toFixed(1) + '%    弱偏好 |θ|=0.6: ' + (wRate * 100).toFixed(1) + '%');
  console.log('');
  check('强偏好重测一致率 ≥85%', sRate >= 0.85, (sRate * 100).toFixed(1) + '%');
  check('弱偏好重测一致率明显低于强偏好（诚实反映不确定性）', wRate < sRate, (wRate * 100).toFixed(1) + '%');
}

/* ---------- 4. 响应定势稳健性（默认同意倾向） ---------- */
{
  const rnd = makeRnd(4242);
  const acqLevels = [0, 0.2, 0.35];
  const lines = [];
  acqLevels.forEach(acq => {
    let dimHits = 0, total = 0, firstCount = { EI: 0, SN: 0, TF: 0, JP: 0 }, n = 300;
    for (let i = 0; i < n; i++) {
      const theta = {};
      DIMS.forEach(d => { theta[d] = (rnd() < 0.5 ? -1 : 1) * 2; });
      const res = computeResult(respond(theta, rnd, K, acq), 'deep');
      dimHits += dimsCorrect(res, theta); total += 4;
      DIMS.forEach(d => { if (res.dims[d].letter === d[0]) firstCount[d]++; });
    }
    const bias = DIMS.map(d => (firstCount[d] / n - 0.5) * 100);
    const maxBias = Math.max.apply(null, bias.map(Math.abs));
    lines.push({ acq, acc: dimHits / total, maxBias });
  });
  console.log('响应定势稳健性（acq = 默认同意倾向）');
  lines.forEach(l => console.log('  acq=' + l.acq.toFixed(2) + '  逐维准确率 ' + (l.acc * 100).toFixed(1) + '%' +
    '   最大单极偏移 ' + l.maxBias.toFixed(1) + ' 个百分点'));
  console.log('');
  lines.forEach(l => {
    check('acq=' + l.acq.toFixed(2) + ' 时逐维准确率仍 ≥85%', l.acc >= 0.85, (l.acc * 100).toFixed(1) + '%');
    check('acq=' + l.acq.toFixed(2) + ' 时无系统性单极偏移（≤6 个百分点）', l.maxBias <= 6, l.maxBias.toFixed(1) + ' 个百分点');
  });
}

console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
if (fail > 0) process.exit(1);
