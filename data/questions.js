/* ============================================================
   题库 v2 · 双档位共用同一题库
   ------------------------------------------------------------
   结构说明：
   - dim   ：维度，EI / SN / TF / JP（首字母为"首字母极" E/S/T/J，次字母为 I/N/F/P）
   - dir   ：作答方向。-1 = 同意本题 → 偏向首字母极；+1 = 同意本题 → 偏向次字母极
   - facet ：同一极下的不同侧面（防止同义重复，便于后续题总相关分析）
   - quick ：是否属于「快速测试」子集（每维 6 题，极性 3:3）
   - pair  ：一致性配对题标记（同一 tension 的两题，若同时强烈认同则视为作答一致性偏低）
   - text  ：题目文本（单构念、行为化、情境具体、不含"而不是/比起…更"对比句式）

   题量：
   - 快速测试：24 题（每维 6 题，约 5 分钟）
   - 深度测试：60 题（每维 15 题，约 10-12 分钟）
   极性配平：
   - 每维 8 : 7（首字母极 : 次字母极），全局 32 : 28
   - 快速子集每维 3 : 3
   ============================================================ */
'use strict';

var BANK_VERSION = 2;

var QUESTIONS = [
  /* ---------------- E/I 外向-内向 ---------------- */
  /* E 极（dir: -1） */
  { id: 'q01', dim: 'EI', dir: -1, facet: 'initiative',  quick: true,  pair: null,      text: '到了新场合，我通常会先开口和人打招呼' },
  { id: 'q02', dim: 'EI', dir: -1, facet: 'initiative',  quick: false, pair: null,      text: '聚会里我常常主动张罗话题或活动' },
  { id: 'q03', dim: 'EI', dir: -1, facet: 'energy',      quick: true,  pair: null,      text: '和一群人聊完天，我常常觉得更有精神' },
  { id: 'q04', dim: 'EI', dir: -1, facet: 'energy',      quick: false, pair: null,      text: '心情低落时，我更想找朋友聊聊' },
  { id: 'q05', dim: 'EI', dir: -1, facet: 'thinkAloud',  quick: true,  pair: null,      text: '我常常边说边把想法理清楚' },
  { id: 'q06', dim: 'EI', dir: -1, facet: 'thinkAloud',  quick: false, pair: null,      text: '有想法时我更愿意马上讲出来，边讲边改' },
  { id: 'q07', dim: 'EI', dir: -1, facet: 'stimulation', quick: false, pair: 'C-EI-1',  text: '安静的独处时间太长，我会觉得有点闷' },
  { id: 'q08', dim: 'EI', dir: -1, facet: 'stimulation', quick: false, pair: null,      text: '我喜欢把日程安排得热闹一些' },
  /* I 极（dir: +1） */
  { id: 'q09', dim: 'EI', dir: +1, facet: 'solitude',    quick: true,  pair: 'C-EI-1',  text: '社交之后我需要独处一段时间才能恢复' },
  { id: 'q10', dim: 'EI', dir: +1, facet: 'solitude',    quick: false, pair: null,      text: '连续几天应酬会让我明显疲惫' },
  { id: 'q11', dim: 'EI', dir: +1, facet: 'depth',       quick: true,  pair: null,      text: '我更喜欢和一两个人聊深入的话题' },
  { id: 'q12', dim: 'EI', dir: +1, facet: 'depth',       quick: false, pair: null,      text: '我更愿意用心维护少数几段深交的关系' },
  { id: 'q13', dim: 'EI', dir: +1, facet: 'thinkFirst',  quick: true,  pair: null,      text: '我习惯先在心里想清楚再开口' },
  { id: 'q14', dim: 'EI', dir: +1, facet: 'thinkFirst',  quick: false, pair: null,      text: '突然被点名发言会让我有点慌张' },
  { id: 'q15', dim: 'EI', dir: +1, facet: 'lowStim',     quick: false, pair: null,      text: '一个人的安静时间对我来说很珍贵' },

  /* ---------------- S/N 实感-直觉 ---------------- */
  /* S 极（dir: -1） */
  { id: 'q16', dim: 'SN', dir: -1, facet: 'detail',      quick: true,  pair: null,      text: '我很容易记住事情的具体细节和数字' },
  { id: 'q17', dim: 'SN', dir: -1, facet: 'detail',      quick: false, pair: null,      text: '讲一件事时，我会把时间、地点说清楚' },
  { id: 'q18', dim: 'SN', dir: -1, facet: 'experience',  quick: true,  pair: null,      text: '我更相信亲身经历过的事情' },
  { id: 'q19', dim: 'SN', dir: -1, facet: 'experience',  quick: false, pair: null,      text: '做事之前，我通常会参考过去行之有效的做法' },
  { id: 'q20', dim: 'SN', dir: -1, facet: 'present',     quick: true,  pair: 'C-SN-1',  text: '我很享受当下的具体体验，比如一顿好饭、一次散步' },
  { id: 'q21', dim: 'SN', dir: -1, facet: 'present',     quick: false, pair: null,      text: '我很少花时间设想很久以后的事' },
  { id: 'q22', dim: 'SN', dir: -1, facet: 'practical',   quick: false, pair: null,      text: '我更愿意接能立刻上手、看得见结果的任务' },
  { id: 'q23', dim: 'SN', dir: -1, facet: 'practical',   quick: false, pair: null,      text: '我首先关心一件事具体怎么做' },
  /* N 极（dir: +1） */
  { id: 'q24', dim: 'SN', dir: +1, facet: 'possibility', quick: true,  pair: 'C-SN-1',  text: '我经常想象未来可能发生的各种场景' },
  { id: 'q25', dim: 'SN', dir: +1, facet: 'possibility', quick: false, pair: null,      text: '我常常在想"如果换一种做法会怎样"' },
  { id: 'q26', dim: 'SN', dir: +1, facet: 'abstract',    quick: true,  pair: null,      text: '我喜欢琢磨没有标准答案的问题' },
  { id: 'q27', dim: 'SN', dir: +1, facet: 'abstract',    quick: false, pair: null,      text: '我对概念、规律、原理这类东西很感兴趣' },
  { id: 'q28', dim: 'SN', dir: +1, facet: 'associate',   quick: true,  pair: null,      text: '我的想法常常从一个话题跳到另一个话题' },
  { id: 'q29', dim: 'SN', dir: +1, facet: 'associate',   quick: false, pair: null,      text: '我经常从不相干的事情里发现有趣的相似之处' },
  { id: 'q30', dim: 'SN', dir: +1, facet: 'meaning',     quick: false, pair: null,      text: '我常常想事情背后的意义和含义' },

  /* ---------------- T/F 思考-情感 ---------------- */
  /* T 极（dir: -1） */
  { id: 'q31', dim: 'TF', dir: -1, facet: 'logic',       quick: true,  pair: null,      text: '做决定前，我会先列出利弊再比较' },
  { id: 'q32', dim: 'TF', dir: -1, facet: 'logic',       quick: false, pair: null,      text: '别人的观点即使顺耳，我也会先检查逻辑' },
  { id: 'q33', dim: 'TF', dir: -1, facet: 'objective',   quick: true,  pair: null,      text: '讨论问题时，我倾向于就事论事' },
  { id: 'q34', dim: 'TF', dir: -1, facet: 'objective',   quick: false, pair: 'C-TF-1',  text: '我能比较平静地指出别人方案里的漏洞' },
  { id: 'q35', dim: 'TF', dir: -1, facet: 'standard',    quick: true,  pair: null,      text: '评价事情时，我习惯用一致的标准衡量' },
  { id: 'q36', dim: 'TF', dir: -1, facet: 'standard',    quick: false, pair: null,      text: '我在意结论是否站得住脚' },
  { id: 'q37', dim: 'TF', dir: -1, facet: 'detached',    quick: false, pair: null,      text: '遇到情绪化的场面，我会先想怎么解决问题' },
  { id: 'q38', dim: 'TF', dir: -1, facet: 'detached',    quick: false, pair: null,      text: '别人向我倾诉时，我第一反应是帮他分析原因' },
  /* F 极（dir: +1） */
  { id: 'q39', dim: 'TF', dir: +1, facet: 'impact',      quick: true,  pair: null,      text: '做决定时，我会先考虑这件事对别人的影响' },
  { id: 'q40', dim: 'TF', dir: +1, facet: 'impact',      quick: false, pair: 'C-TF-1',  text: '我会因为顾及他人感受而调整自己的说法' },
  { id: 'q41', dim: 'TF', dir: +1, facet: 'empathize',   quick: true,  pair: null,      text: '我能很快察觉身边人的情绪变化' },
  { id: 'q42', dim: 'TF', dir: +1, facet: 'empathize',   quick: false, pair: null,      text: '别人的情绪很容易影响到我' },
  { id: 'q43', dim: 'TF', dir: +1, facet: 'harmony',     quick: true,  pair: null,      text: '我宁愿自己退一步，也不想现场气氛变僵' },
  { id: 'q44', dim: 'TF', dir: +1, facet: 'harmony',     quick: false, pair: null,      text: '冲突之后，我会主动去修补关系' },
  { id: 'q45', dim: 'TF', dir: +1, facet: 'express',     quick: false, pair: null,      text: '我很容易被真诚的表达或故事打动' },

  /* ---------------- J/P 判断-感知 ---------------- */
  /* J 极（dir: -1） */
  { id: 'q46', dim: 'JP', dir: -1, facet: 'plan',        quick: true,  pair: 'C-JP-1',  text: '出行前我通常会把行程安排好' },
  { id: 'q47', dim: 'JP', dir: -1, facet: 'plan',        quick: false, pair: null,      text: '我习惯把待办事项列出来再逐项完成' },
  { id: 'q48', dim: 'JP', dir: -1, facet: 'order',       quick: true,  pair: null,      text: '我的东西通常有固定的放置位置' },
  { id: 'q49', dim: 'JP', dir: -1, facet: 'order',       quick: false, pair: null,      text: '事情有明确的流程和截止时间，我会更安心' },
  { id: 'q50', dim: 'JP', dir: -1, facet: 'early',       quick: true,  pair: null,      text: '我通常会把任务提前做完' },
  { id: 'q51', dim: 'JP', dir: -1, facet: 'early',       quick: false, pair: null,      text: '开始一件事之前，我希望先知道完整步骤' },
  { id: 'q52', dim: 'JP', dir: -1, facet: 'certain',     quick: false, pair: null,      text: '计划突然变化会让我不太舒服' },
  { id: 'q53', dim: 'JP', dir: -1, facet: 'certain',     quick: false, pair: null,      text: '决定好的事情，我不太喜欢再改' },
  /* P 极（dir: +1） */
  { id: 'q54', dim: 'JP', dir: +1, facet: 'flexible',    quick: true,  pair: 'C-JP-1',  text: '我更愿意走一步看一步，随时调整' },
  { id: 'q55', dim: 'JP', dir: +1, facet: 'flexible',    quick: false, pair: null,      text: '临时改变计划，我通常觉得挺有意思' },
  { id: 'q56', dim: 'JP', dir: +1, facet: 'options',     quick: true,  pair: null,      text: '我喜欢同时推进好几件事' },
  { id: 'q57', dim: 'JP', dir: +1, facet: 'options',     quick: false, pair: null,      text: '我不想太早把选择定死' },
  { id: 'q58', dim: 'JP', dir: +1, facet: 'spontaneous', quick: true,  pair: null,      text: '我的日常安排比较随性' },
  { id: 'q59', dim: 'JP', dir: +1, facet: 'spontaneous', quick: false, pair: null,      text: '我常常在最后一刻才迸发出效率' },
  { id: 'q60', dim: 'JP', dir: +1, facet: 'open',        quick: false, pair: null,      text: '我喜欢边做边发现新的可能' }
];

/* 供 Node 测试使用 */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { QUESTIONS: QUESTIONS, BANK_VERSION: BANK_VERSION };
}
