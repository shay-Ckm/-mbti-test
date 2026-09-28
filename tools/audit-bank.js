/* ============================================================
   题库心理测量审计（node tools/audit-bank.js）
   ------------------------------------------------------------
   不依赖任何外部数据，用可复核的规则检查题库质量：
   1. 结构：题量、每维/每极/facet 计数、极性配平、快速档覆盖
   2. facet 对称性：同一维度两极是否测量同一批内容侧面（差值分数前提）
   3. 方向一致性：题面中的"极别标志词"是否与该题 dir 标注矛盾（抓 dir 标错）
   4. 题干质量：对比句式（双管题）、否定堆叠、过长过短、社会赞许词、低区分度套话
   5. 近似重复：字级 bigram Jaccard 相似度
   6. 一致性配对：每对是否恰好 2 题、同维、方向相反
   ============================================================ */
'use strict';

const path = require('path');
const bank = require(path.join(__dirname, '..', 'data', 'questions.js'));
const QUESTIONS = bank.QUESTIONS;
const DIMS = ['EI', 'SN', 'TF', 'JP'];

/* 极别标志词：用于自动发现"题面说的是这一极、dir 却标成另一极" */
const POLE_MARKERS = {
  A: { /* E / S / T / J */
    EI: ['主动', '打招呼', '热闹', '一群人', '聚会', '聊', '说', '开口', '社交', '结识'],
    SN: ['细节', '具体', '经验', '实际', '步骤', '数字', '眼前', '现实', '惯例', '照着做'],
    TF: ['逻辑', '利', '标准', '客观', '对错', '问题', '效率', '道理', '站得住', '原则'],
    JP: ['计划', '安排', '清单', '提前', '确定', '流程', '截止', '整理', '定下', '按部就班']
  },
  B: { /* I / N / F / P */
    EI: ['独处', '安静', '一个人', '深聊', '少数', '先想', '想清楚', '疲惫', '恢复', '沉默'],
    SN: ['想象', '可能', '如果', '概念', '原理', '意义', '象征', '灵感', '联想', '未来'],
    TF: ['感受', '情绪', '感受', '氛围', '关系', '体谅', '共情', '温暖', '照顾', '磨合'],
    JP: ['随性', '灵活', '临时', '变化', '弹性', '再看看', '不一定', '变通', '走一步看一步', '开放']
  }
};

/* 对比句式 / 双管题 */
const COMPARATIVE = [/而不是/, /比起.{0,6}更/, /但是/, /却/, /虽然/, /不过/, /反而/, /与其/, /宁愿.{0,8}也/, /更愿意/, /而不是像/];
/* 社会赞许 / 低区分度套话 */
const DESIRABLE = ['负责', '努力', '认真', '优秀', '成功', '高效', '成熟', '靠谱', '受欢迎', '领导', '靠谱', '成长'];
const UNIVERSAL = ['一顿好饭', '散步', '真诚', '享受', '愿意', '喜欢'];
/* 构念污染词：这些词指向焦虑/神经质/尽责性等"非目标构念"，混进题目会带来无关变异 */
const NUSANCE = ['慌张', '紧张', '焦虑', '担心', '害怕', '羞', '尴尬', '拖延', '懒', '自律', '效率', '时间管理', '强迫'];

/* 具体场景线索：题目落到"什么场合、对谁、什么时候、多少"更利于稳定作答（v5 起要求） */
const SCENE = /(开会|晨会|会议|聚会|饭局|排队|出差|旅行|加班|周末|下班|上班|通勤|地铁|公交|电梯|办公室|同事|朋友|家人|邻居|同学|客户|店员|陌生|微信|群聊|电话|邮件|课上|课堂|路上|睡前|晚上|早上|中午|假期|第一|每次|经常|常常|大多|多数|二十|几个|一半|两三个|大巴|长途|桌游|团建|邻座|课|班|部门|小组|饭桌|餐桌|逛街|超市|商场|健身房|球场|宿舍|租房|装修|点餐|外卖|网购|快递|客服|面试|汇报|评审|投票|报名|签到|作业|考试|复习|论文|方案|需求|排期|交接|值班|轮岗|前台|走廊|电梯口|停车场|机场|车站|医院|银行|理发|体检|家长会|婚礼|生日|过年|节日|假期|放假|台风|下雨|停电|搬家|换工作|跳槽|创业|理财|记账|存钱|买菜|做饭|洗碗|打扫|收纳|闹钟|日程|待办|备忘|清单)/;
const ANCHOR_MISSING = list => list.filter(q => !SCENE.test(q.text));

let issues = 0;
const flag = (msg) => { issues++; console.log('  ⚠ ' + msg); };
const head = (t) => console.log('\n== ' + t + ' ==');

/* ---------- 1. 结构 ---------- */
head('结构统计');
console.log('  总题数 ' + QUESTIONS.length + '   版本 ' + bank.BANK_VERSION);
/* v4 起没有 quick 标记：两档共用题库，开测时按维度等比例随机抽题。
   这里校验"配额可满足性"——每档每侧面每极要抽的题数不能超过库存。 */
const PER_DIM = { quick: 6, deep: 16 };
const byDim = {};
DIMS.forEach(d => {
  const items = QUESTIONS.filter(q => q.dim === d);
  const a = items.filter(q => q.dir < 0).length;
  const b = items.filter(q => q.dir > 0).length;
  const facets = {};
  items.forEach(q => { facets[q.facet] = (facets[q.facet] || 0) + 1; });
  byDim[d] = { items, a, b, facets };
  console.log('  ' + d + ': ' + items.length + ' 题 (' + d[0] + ' ' + a + ' : ' + d[1] + ' ' + b + ')' +
    '   侧面 ' + Object.keys(facets).length + ' 个');
  if (a !== b) flag(d + ' 极性不配平: ' + a + ' vs ' + b);
  if (a < PER_DIM.deep / 2 || b < PER_DIM.deep / 2) {
    flag(d + ' 两极题量不足以支撑深度档 1:1 抽题（每极需 ≥ ' + PER_DIM.deep / 2 + '）');
  }
  /* 每个侧面每极的可抽题数：深度档按 5 侧面均分，最紧的侧面需要 ≥ 2 题/极 */
  const facetNames = Object.keys(facets);
  facetNames.forEach(f => {
    const fa = items.filter(q => q.facet === f && q.dir < 0).length;
    const fb = items.filter(q => q.facet === f && q.dir > 0).length;
    const need = Math.ceil((PER_DIM.deep / 2) / facetNames.length);   // 8/5 → 2
    if (fa < need || fb < need) {
      flag(d + '/' + f + ' 侧面每极仅 ' + fa + '/' + fb + ' 题，深度档抽题可能填不满配额（需 ≥ ' + need + '）');
    }
  });
  const missing = ANCHOR_MISSING(items);
  if (missing.length) {
    /* 场景具体化是"质量改进方向"，不是构建门槛：只做信息提示 */
    console.log('    · 场景线索提示：' + missing.length + '/' + items.length + ' 题未命中场景词表（人工复核即可）');
  }
});
console.log('  抽题配额：快速 ' + PER_DIM.quick + '/维 · 深度 ' + PER_DIM.deep + '/维（按侧面均分，两极 1:1）');
const globalA = QUESTIONS.filter(q => q.dir < 0).length;
console.log('  全局极性: 首字母极 ' + globalA + ' : 次字母极 ' + (QUESTIONS.length - globalA));

/* ---------- 2. facet 对称性 ---------- */
head('facet 对称性（两极是否测同一批内容侧面）');
DIMS.forEach(d => {
  const aFacets = new Set(QUESTIONS.filter(q => q.dim === d && q.dir < 0).map(q => q.facet));
  const bFacets = new Set(QUESTIONS.filter(q => q.dim === d && q.dir > 0).map(q => q.facet));
  const shared = [...aFacets].filter(f => bFacets.has(f));
  console.log('  ' + d + ': ' + d[0] + ' 极侧面 [' + [...aFacets].join(', ') + '] ／ ' +
    d[1] + ' 极侧面 [' + [...bFacets].join(', ') + ']');
  if (shared.length === 0) {
    flag(d + ' 两极 facet 完全不重叠 → 差值分数混入内容差异（测的不是同一构念两端）');
  } else {
    shared.forEach(f => {
      const na = QUESTIONS.filter(q => q.dim === d && q.facet === f && q.dir < 0).length;
      const nb = QUESTIONS.filter(q => q.dim === d && q.facet === f && q.dir > 0).length;
      if (Math.abs(na - nb) > 1) flag(d + '/' + f + ' 两侧题数不对称: ' + na + ' vs ' + nb);
    });
  }
});

/* ---------- 3. 方向一致性（抓 dir 标错） ---------- */
head('方向标志词复核（启发式，存在误报，仅供人工复核）');
const dirSuspects = [];
QUESTIONS.forEach(q => {
  const pole = q.dir < 0 ? 'A' : 'B';
  const other = pole === 'A' ? 'B' : 'A';
  const hitOwn = (POLE_MARKERS[pole][q.dim] || []).filter(w => q.text.indexOf(w) >= 0);
  const hitOther = (POLE_MARKERS[other][q.dim] || []).filter(w => q.text.indexOf(w) >= 0);
  if (hitOther.length && !hitOwn.length) {
    dirSuspects.push(q);
    /* 注意：反向措辞的题目天然会提到对侧情境（例如"周围安静太久会觉得闷"是 E 题），
       因此这里只输出复核清单，不计入问题数 */
    console.log('  · ' + q.id + ' 标注 ' + (pole === 'A' ? q.dim[0] : q.dim[1]) + ' 极，题面含对侧词 [' +
      hitOther.join(', ') + ']：' + q.text);
  }
});
console.log('  复核项 ' + dirSuspects.length + ' 条（不计入问题数）');

/* ---------- 4. 题干质量 ---------- */
head('题干质量');
QUESTIONS.forEach(q => {
  const len = q.text.length;
  if (COMPARATIVE.some(re => re.test(q.text))) flag(q.id + ' 含对比/双管句式：' + q.text);
  if (len < 8) flag(q.id + ' 过短（' + len + ' 字），情境不足：' + q.text);
  if (len > 26) flag(q.id + ' 过长（' + len + ' 字），理解成本高：' + q.text);
  const neg = (q.text.match(/[不没别]/g) || []).length;
  if (neg >= 2) flag(q.id + ' 否定堆叠（' + neg + ' 处），易误读：' + q.text);
  const des = DESIRABLE.filter(w => q.text.indexOf(w) >= 0);
  if (des.length) flag(q.id + ' 含社会赞许词 [' + des.join(', ') + ']，易被普遍同意：' + q.text);
  const uni = UNIVERSAL.filter(w => q.text.indexOf(w) >= 0);
  if (uni.length) console.log('  · ' + q.id + ' 含普遍性措辞 [' + uni.join(', ') + ']（复核，常见于低区分度题）：' + q.text);
  const nus = NUSANCE.filter(w => q.text.indexOf(w) >= 0);
  if (nus.length) flag(q.id + ' 含非目标构念词 [' + nus.join(', ') + ']，会引入焦虑/尽责性等无关变异：' + q.text);
});

/* ---------- 5. 近似重复 ---------- */
head('近似重复检测');
function bigrams(s) {
  const set = new Set();
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  return set;
}
function jaccard(a, b) {
  let inter = 0;
  a.forEach(x => { if (b.has(x)) inter++; });
  return inter / (a.size + b.size - inter);
}
const grams = QUESTIONS.map(q => bigrams(q.text));
let dup = 0;
for (let i = 0; i < QUESTIONS.length; i++) {
  for (let j = i + 1; j < QUESTIONS.length; j++) {
    const sim = jaccard(grams[i], grams[j]);
    if (sim >= 0.5) {
      dup++;
      flag('近似重复（' + sim.toFixed(2) + '）：' + QUESTIONS[i].id + ' / ' + QUESTIONS[j].id + ' — ' + QUESTIONS[i].text + ' ｜ ' + QUESTIONS[j].text);
    }
  }
}
if (!dup) console.log('  ✓ 未发现近似重复');

/* ---------- 6. 一致性配对 ---------- */
head('一致性配对检查');
const pairs = {};
QUESTIONS.forEach(q => { if (q.pair) (pairs[q.pair] = pairs[q.pair] || []).push(q); });
Object.keys(pairs).forEach(k => {
  const list = pairs[k];
  const dims = new Set(list.map(q => q.dim));
  const dirs = new Set(list.map(q => q.dir));
  console.log('  ' + k + ': ' + list.map(q => q.id + '(' + (q.dir < 0 ? q.dim[0] : q.dim[1]) + ')').join(' + '));
  if (list.length !== 2) flag(k + ' 应恰好 2 题，实际 ' + list.length);
  if (dims.size !== 1) flag(k + ' 跨维度配对');
  if (dirs.size !== 2) flag(k + ' 两题方向相同，无法构成镜像校验');
});
console.log('  配对组数: ' + Object.keys(pairs).length);

/* ---------- 汇总 ---------- */
console.log('\n审计结果：' + issues + ' 项待处理');
process.exit(0);
