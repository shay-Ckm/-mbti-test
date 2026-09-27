/* ============================================================
   题库 v3 · 双档位共用同一题库
   ------------------------------------------------------------
   v3 相对 v2 的改动（针对"结果不够准"的系统性修正）：
   1. 题量 60 → 64：每维 16 题（v2 为 15 题，8:7 不对称）
   2. 极性严格配平：每维 8 : 8，全局 32 : 32（v2 为 32 : 28）
   3. facet 重构为"两极共享的内容侧面"：每个侧面各有 2 题测首字母极 +
      2 题测次字母极。v2 的两极各用一套不同侧面名，导致差值里混入
      "内容不同"的偏差，也无法做侧面级一致性判断。
   4. 剔除/改写低区分度与混淆题：v2 中"享受一顿好饭""相信亲身经历"
      "在意结论是否站得住脚"等近乎人人同意的题（天花板效应），以及
      混入社交焦虑（被点名慌张）、神经质（情绪容易被影响）、尽责性
      （提前做完）等非目标构念的题。
   5. 一致性配对从 4 组扩到 8 组（每个二分法 2 组镜像题）。

   字段：
   - dim   ：维度 EI / SN / TF / JP（首字母为"首字母极" E/S/T/J）
   - dir   ：-1 = 同意本题 → 偏向首字母极；+1 = 同意本题 → 偏向次字母极
   - facet ：两极共享的内容侧面（4 个/维，每侧面两侧各 2 题）
   - quick ：是否属于「快速测试」子集（每维 6 题，极性 3:3，覆盖全部 4 个侧面）
   - pair  ：一致性镜像题标记（同组两题语义互为镜像、方向相反）
   - text  ：单构念、行为化、情境具体、不含"而不是/比起…更"等对比句式

   题量：
   - 快速测试：24 题（每维 6 题，约 5 分钟）
   - 深度测试：64 题（每维 16 题，约 12-14 分钟）
   ============================================================ */
'use strict';

var BANK_VERSION = 3;

var QUESTIONS = [
  /* ================= E/I 外向-内向 =================
     侧面（两极共享）：social 社交启动 / energy 能量恢复 / express 表达顺序 / stim 刺激需求 */
  /* E 极（dir: -1） */
  { id: 'q01', dim: 'EI', dir: -1, facet: 'social',  quick: true,  pair: null,     text: '到了新场合，我通常会先开口和人打招呼' },
  { id: 'q02', dim: 'EI', dir: -1, facet: 'social',  quick: false, pair: null,     text: '需要认识新朋友的场合，我会主动去搭话' },
  { id: 'q03', dim: 'EI', dir: -1, facet: 'energy',  quick: true,  pair: 'C-EI-2', text: '和一群人待过之后，我通常还很有精神' },
  { id: 'q04', dim: 'EI', dir: -1, facet: 'energy',  quick: false, pair: null,     text: '一个人待久了，我会想找人聊聊天' },
  { id: 'q05', dim: 'EI', dir: -1, facet: 'express', quick: true,  pair: null,     text: '我通常是边说边把想法理清楚' },
  { id: 'q06', dim: 'EI', dir: -1, facet: 'express', quick: false, pair: null,     text: '有想法时，我先讲出来再慢慢完善' },
  { id: 'q07', dim: 'EI', dir: -1, facet: 'stim',    quick: false, pair: 'C-EI-1', text: '周围安静太久，我会觉得有点闷' },
  { id: 'q08', dim: 'EI', dir: -1, facet: 'stim',    quick: false, pair: null,     text: '空闲时间我会安排和朋友见面' },
  /* I 极（dir: +1） */
  { id: 'q09', dim: 'EI', dir: +1, facet: 'social',  quick: false, pair: null,     text: '在陌生的聚会里，我通常等别人先开口' },
  { id: 'q10', dim: 'EI', dir: +1, facet: 'social',  quick: false, pair: null,     text: '要和陌生人打交道时，我会先观察一会儿' },
  { id: 'q11', dim: 'EI', dir: +1, facet: 'energy',  quick: true,  pair: 'C-EI-2', text: '社交结束后，我需要独处一段时间才缓过来' },
  { id: 'q12', dim: 'EI', dir: +1, facet: 'energy',  quick: false, pair: null,     text: '连续几天和人应酬，我会明显觉得累' },
  { id: 'q13', dim: 'EI', dir: +1, facet: 'express', quick: true,  pair: null,     text: '我习惯先在心里想清楚再开口' },
  { id: 'q14', dim: 'EI', dir: +1, facet: 'express', quick: false, pair: null,     text: '讨论时，我通常等别人说完再组织自己的想法' },
  { id: 'q15', dim: 'EI', dir: +1, facet: 'stim',    quick: true,  pair: 'C-EI-1', text: '一个人的安静时间对我来说很重要' },
  { id: 'q16', dim: 'EI', dir: +1, facet: 'stim',    quick: false, pair: null,     text: '长时间待在热闹的环境里，我会想找个角落待着' },

  /* ================= S/N 实感-直觉 =================
     侧面：focus 关注焦点 / source 判断依据 / style 思考方式 / time 时间取向 */
  /* S 极（dir: -1） */
  { id: 'q17', dim: 'SN', dir: -1, facet: 'focus',  quick: true,  pair: null,     text: '听人讲事情时，我会留意具体的时间地点' },
  { id: 'q18', dim: 'SN', dir: -1, facet: 'focus',  quick: false, pair: null,     text: '我比较容易记住具体的数字和细节' },
  { id: 'q19', dim: 'SN', dir: -1, facet: 'source', quick: false, pair: null,     text: '判断一件事是否可信，我主要看实际验证的结果' },
  { id: 'q20', dim: 'SN', dir: -1, facet: 'source', quick: true,  pair: null,     text: '做事之前，我通常参照过去管用的做法' },
  { id: 'q21', dim: 'SN', dir: -1, facet: 'style',  quick: true,  pair: 'C-SN-2', text: '接到任务时，我先问清楚具体怎么做' },
  { id: 'q22', dim: 'SN', dir: -1, facet: 'style',  quick: false, pair: null,     text: '我倾向接能马上上手、看得见成果的事' },
  { id: 'q23', dim: 'SN', dir: -1, facet: 'time',   quick: false, pair: 'C-SN-1', text: '我很少花时间设想很久以后的事' },
  { id: 'q24', dim: 'SN', dir: -1, facet: 'time',   quick: false, pair: null,     text: '聊事情时，我说的是眼下正在发生的情况' },
  /* N 极（dir: +1） */
  { id: 'q25', dim: 'SN', dir: +1, facet: 'focus',  quick: true,  pair: null,     text: '听人讲事情时，我关心的是背后的意图和走向' },
  { id: 'q26', dim: 'SN', dir: +1, facet: 'focus',  quick: false, pair: null,     text: '我常从一件小事想到更大的图景' },
  { id: 'q27', dim: 'SN', dir: +1, facet: 'source', quick: true,  pair: null,     text: '没有标准答案的问题很吸引我' },
  { id: 'q28', dim: 'SN', dir: +1, facet: 'source', quick: false, pair: null,     text: '我经常从不相干的事里发现相似的规律' },
  { id: 'q29', dim: 'SN', dir: +1, facet: 'style',  quick: false, pair: 'C-SN-2', text: '我会去弄清一件事背后的原理' },
  { id: 'q30', dim: 'SN', dir: +1, facet: 'style',  quick: false, pair: null,     text: '我常想一件事背后的含义' },
  { id: 'q31', dim: 'SN', dir: +1, facet: 'time',   quick: true,  pair: 'C-SN-1', text: '我经常设想未来可能出现的场景' },
  { id: 'q32', dim: 'SN', dir: +1, facet: 'time',   quick: false, pair: null,     text: '我常在想"如果换一种做法会怎样"' },

  /* ================= T/F 思考-情感 =================
     侧面：decision 决策依据 / conflict 冲突处理 / empathy 回应他人 / standard 评价标准 */
  /* T 极（dir: -1） */
  { id: 'q33', dim: 'TF', dir: -1, facet: 'decision', quick: true,  pair: null,     text: '做决定时，我主要看理由是否站得住脚' },
  { id: 'q34', dim: 'TF', dir: -1, facet: 'decision', quick: false, pair: null,     text: '同样的情况，我倾向于给出同样的判断' },
  { id: 'q35', dim: 'TF', dir: -1, facet: 'conflict', quick: false, pair: 'C-TF-1', text: '发现问题时，我会直接指出来' },
  { id: 'q36', dim: 'TF', dir: -1, facet: 'conflict', quick: false, pair: null,     text: '讨论分歧时，我习惯于对事不对人' },
  { id: 'q37', dim: 'TF', dir: -1, facet: 'empathy',  quick: true,  pair: 'C-TF-2', text: '别人诉苦时，我第一反应是帮他分析原因' },
  { id: 'q38', dim: 'TF', dir: -1, facet: 'empathy',  quick: false, pair: null,     text: '有人情绪激动时，我会先想把事情理清楚' },
  { id: 'q39', dim: 'TF', dir: -1, facet: 'standard', quick: true,  pair: null,     text: '评价一件事，我更在意结论是否成立' },
  { id: 'q40', dim: 'TF', dir: -1, facet: 'standard', quick: false, pair: null,     text: '我习惯用同一套标准衡量不同的人和事' },
  /* F 极（dir: +1） */
  { id: 'q41', dim: 'TF', dir: +1, facet: 'decision', quick: true,  pair: null,     text: '做决定时，我主要考虑这件事对相关的人好不好' },
  { id: 'q42', dim: 'TF', dir: +1, facet: 'decision', quick: false, pair: null,     text: '我会为了照顾别人的处境而调整原本的安排' },
  { id: 'q43', dim: 'TF', dir: +1, facet: 'conflict', quick: true,  pair: 'C-TF-1', text: '指出问题前，我会先想怎么说才不伤人' },
  { id: 'q44', dim: 'TF', dir: +1, facet: 'conflict', quick: false, pair: null,     text: '现场气氛变僵时，我会想办法缓和' },
  { id: 'q45', dim: 'TF', dir: +1, facet: 'empathy',  quick: true,  pair: 'C-TF-2', text: '别人诉苦时，我第一反应是让他知道我理解他的感受' },
  { id: 'q46', dim: 'TF', dir: +1, facet: 'empathy',  quick: false, pair: null,     text: '我能察觉到身边人情绪的细微变化' },
  { id: 'q47', dim: 'TF', dir: +1, facet: 'standard', quick: false, pair: null,     text: '我会考虑每个人的具体情况，再给判断' },
  { id: 'q48', dim: 'TF', dir: +1, facet: 'standard', quick: false, pair: null,     text: '我更在意一件事处理得是否让人舒服' },

  /* ================= J/P 判断-感知 =================
     侧面：planning 计划性 / structure 结构需求 / decisive 决断方式 / timing 时间管理 */
  /* J 极（dir: -1） */
  { id: 'q49', dim: 'JP', dir: -1, facet: 'planning',  quick: true,  pair: 'C-JP-1', text: '出行前，我通常把行程先安排好' },
  { id: 'q50', dim: 'JP', dir: -1, facet: 'planning',  quick: false, pair: null,     text: '做事之前，我会先把步骤列出来' },
  { id: 'q51', dim: 'JP', dir: -1, facet: 'structure', quick: true,  pair: null,     text: '我的东西一般都有固定的位置' },
  { id: 'q52', dim: 'JP', dir: -1, facet: 'structure', quick: false, pair: null,     text: '我希望事情有清楚的分工和流程' },
  { id: 'q53', dim: 'JP', dir: -1, facet: 'decisive',  quick: false, pair: null,     text: '需要选择时，我倾向于尽快定下来' },
  { id: 'q54', dim: 'JP', dir: -1, facet: 'decisive',  quick: false, pair: null,     text: '定下来的事，我一般不想再改' },
  { id: 'q55', dim: 'JP', dir: -1, facet: 'timing',    quick: true,  pair: 'C-JP-2', text: '我通常会把任务提前完成' },
  { id: 'q56', dim: 'JP', dir: -1, facet: 'timing',    quick: false, pair: null,     text: '我习惯在截止日期前就把事情交出去' },
  /* P 极（dir: +1） */
  { id: 'q57', dim: 'JP', dir: +1, facet: 'planning',  quick: true,  pair: 'C-JP-1', text: '我习惯走一步看一步，随时调整' },
  { id: 'q58', dim: 'JP', dir: +1, facet: 'planning',  quick: false, pair: null,     text: '临时改变安排，我通常觉得挺有意思' },
  { id: 'q59', dim: 'JP', dir: +1, facet: 'structure', quick: false, pair: null,     text: '我的东西放在哪儿比较随性' },
  { id: 'q60', dim: 'JP', dir: +1, facet: 'structure', quick: false, pair: null,     text: '流程不固定，我也能做得下去' },
  { id: 'q61', dim: 'JP', dir: +1, facet: 'decisive',  quick: true,  pair: null,     text: '我不想太早把选择定死' },
  { id: 'q62', dim: 'JP', dir: +1, facet: 'decisive',  quick: false, pair: null,     text: '多留几个选项会让我更安心' },
  { id: 'q63', dim: 'JP', dir: +1, facet: 'timing',    quick: true,  pair: 'C-JP-2', text: '我常常在临近截止时才进入状态' },
  { id: 'q64', dim: 'JP', dir: +1, facet: 'timing',    quick: false, pair: null,     text: '我习惯等到有压力了才开始动手' }
];

/* 供 Node 测试使用 */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { QUESTIONS: QUESTIONS, BANK_VERSION: BANK_VERSION };
}
