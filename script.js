/* ============================================================
   MBTI 人格测试 · 共享逻辑（index / test / result 三页共用）
   ------------------------------------------------------------
   说明：
   - 顶层只定义"数据 + 纯函数"，不直接触碰 DOM / localStorage，
     便于用 Node 对计分逻辑做自动化测试（见 mbti-logic.test.js）。
   - 页面初始化在 DOMContentLoaded 后按 <body id> 分发执行。
   - 计分采用"双侧均值差分法"：每维度分别取两极端题目的作答均值，
     再做差归一化，消除题量不平衡偏差（详见 开发文档.md 第 5 节）。
   ============================================================ */
'use strict';

/* ================= 常量 ================= */

var STORAGE_KEYS = {
  answers: 'mbti_answers',        // { qid: 分值 }
  current: 'mbti_current',        // 当前题目下标（在当前题序中的位置）
  set: 'mbti_set',                // 本次题序（qid 数组，深度模式会随机化）
  mode: 'mbti_mode',              // quick | deep
  result: 'mbti_result',
  completions: 'mbti_completions',
  version: 'mbti_bank_version',   // 题库版本，用于迁移
  history: 'mbti_history',        // 历史结果（最近 10 次）
  checklist: 'mbti_checklist',    // 成长清单勾选状态
  seen: 'mbti_seen'               // 最近出现过的题 id（下次抽题优先换一批）
};

/* 档位配置：两档共用同一题库（200 题），每次开测按维度等比例随机抽题
   perDim = 每个维度抽多少题（必须为偶数，保证该维两极 1:1 平衡） */
var MODES = {
  quick: { key: 'quick', label: '快速测试', count: 24, perDim: 6,  time: '约 5 分钟',     desc: '24 题 · 每维随机 6 题（极性 3:3）· 快速得到结果，适合分享' },
  deep:  { key: 'deep',  label: '深度测试', count: 64, perDim: 16, time: '约 12-14 分钟', desc: '64 题 · 每维随机 16 题（极性 8:8）· 覆盖更全，含侧面一致性与镜像题校验' }
};
var DEFAULT_MODE = 'deep';

/* 构建版本（由 tools/bump-version.js 统一更新）
   用途：页脚/顶部展示，便于确认线上跑的是哪一版，排查缓存问题 */
var BUILD = '5.1.0';

/* 把版本号写到页面的 .build-stamp 上，并挂到 window 便于排查 */
function stampBuild() {
  $$('.build-stamp').forEach(function (el) { el.textContent = 'v' + BUILD; });
  if (typeof window !== 'undefined') window.__MBTI_BUILD = BUILD;
}

/* 题库访问：题目数据在 data/questions.js（Node 测试通过 global 注入） */
function questionBank() {
  return (typeof QUESTIONS !== 'undefined' && QUESTIONS && QUESTIONS.length) ? QUESTIONS : [];
}
function bankVersion() {
  return (typeof BANK_VERSION === 'number') ? BANK_VERSION : 0;
}
function modeConf(key) { return MODES[key] || MODES[DEFAULT_MODE]; }

/* 作答量表：5 点（中间为"不确定"）
   注意：不确定（val = 0）**不参与计分**——它不计入任一极的均值，
   只降低该维度的有效覆盖度（即拉低置信度），因此不会把结果往中间拽。 */
var SCALE = [
  { label: '强同意', tag: '完全符合', val: 3 },
  { label: '同意',   tag: '基本符合', val: 1 },
  { label: '不确定', tag: '看情况', val: 0 },
  { label: '不同意', tag: '不太符合', val: -1 },
  { label: '强不同意', tag: '完全不符', val: -3 }
];

/* 作答值白名单：只有量表内的 {3,1,0,-1,-3} 才算有效作答。
   为什么必须校验：localStorage 可能被外部写入或被截断，
   `sum += "3"` 会变成字符串拼接（曾实测出 pctB = -34722147%），
   写入 Infinity/NaN 则会让整条链路出现 NaN 并渲染成 "null%"。
   非法值一律按"未作答"处理——不计分、不计入已答、进度也不推进。 */
var VALID_ANSWERS = [3, 1, 0, -1, -3];
function normAnswer(v) {
  if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) v = Number(v);
  return (typeof v === 'number' && isFinite(v) && VALID_ANSWERS.indexOf(v) >= 0) ? v : undefined;
}
/* 该题是否已有合法作答（进度、跳题网格、交卷门槛统一用它判断） */
function isAnswered(v) { return normAnswer(v) !== undefined; }

/* 维度定义：first = 首字母极，second = 次字母极 */
var DIMS = ['EI', 'SN', 'TF', 'JP'];
var DIM_LABELS = { EI: 'E·I', SN: 'S·N', TF: 'T·F', JP: 'J·P' };
var DIM_FULL = { EI: ['外向', '内向'], SN: ['实感', '直觉'], TF: ['思考', '情感'], JP: ['判断', '感知'] };

/* ================= 题库（外部数据文件 data/questions.js） =================
   双档位共用同一题库（v3）：
   - 快速测试 quick：每维随机 6 题（极性 3:3，按侧面轮流分配 → 覆盖 5 个侧面中的至少 3 个），共 24 题
   - 深度测试 deep ：每维 16 题（极性 8:8，每侧面两侧各 2 题），共 64 题
   每题字段：dim 维度 / dir 作答方向 / facet 内容侧面 / quick 是否快速档 / pair 镜像题
   浏览器按 <script> 顺序加载 data/questions.js；Node 测试在 require 本文件前注入 global.QUESTIONS。 */

/* ================= 16 型人格资料 ================= */
var TYPES = {
  INTJ: {
    zh: '战略家', emoji: '🧠',
    tags: ['理性', '独立', '远见', '系统思维'],
    trait: '深度与远见', blurb: 'TA 话不多，但脑子里装着一座未来城市的设计图。',
    careers: ['战略咨询', '科研', '产品架构', '数据分析'],
    fact: 'INTJ 仅占人口约 2%，是 16 型里接近“稀有物种”的存在。',
    desc: '你是脑子里装着一座未来城市图纸的人。别人看到现状，你看到的是系统、规律和十年后的可能性。你话不多，不是没想法，而是懒得解释不重要的细节。你的独立让你扛得住孤独，也让你成为最可靠的长期主义者。别把自己逼太紧，偶尔允许计划被打乱，世界不会塌——而且，你身边那些“不够理性”的人，往往正是来帮你补上温度的人。',
    partner: 'ENFP'
  },
  INTP: {
    zh: '逻辑学家', emoji: '🧩',
    tags: ['好奇', '思辨', '脑洞', '追根究底'],
    trait: '拆解一切的理性', blurb: 'TA 的大脑像一间 24 小时营业的好奇心实验室。',
    careers: ['程序员', '研究员', '数学/哲学', '架构设计'],
    fact: '爱因斯坦、牛顿常被归类为 INTP——他们同样擅长在脑子里做实验。',
    desc: '你的大脑像一间 24 小时营业的好奇心实验室。“为什么”是你的口头禅，逻辑漏洞在你面前无处遁形。你不一定在乎结论，更享受推理的过程本身。执行力偶尔跟不上脑速，ddl 前的你堪称效率之神。记住：把奇思妙想落到纸上，你会比谁都可怕。',
    partner: 'ENTJ'
  },
  ENTJ: {
    zh: '指挥官', emoji: '👑',
    tags: ['果断', '领导力', '目标感', '高效'],
    trait: '把混乱变成队形的魄力', blurb: 'TA 是天生“把事情搞定”的选手。',
    careers: ['企业管理', '创业', '项目管理', '律师'],
    fact: 'ENTJ 常被同事称为“最快让会议室安静下来的人”。',
    desc: '你是天生的“把事情搞定”型选手。混乱在你面前会本能地排列成队形，你说话自带方案，行动自带节奏。你讨厌低效，欣赏有能力的人，也对自己毫不留情。记得偶尔把“效率”调低一档，听听别人的感受——这不会削弱你的领导力，反而会让你从“指挥官”升级成“令人追随的领袖”。',
    partner: 'INTP'
  },
  ENTP: {
    zh: '辩论家', emoji: '🎯',
    tags: ['机智', '脑洞', '挑战常规', '点子王'],
    trait: '把规则当假设的胆量', blurb: 'TA 的反应快得像装了声控灯。',
    careers: ['创意策划', '产品经理', '公关', '创业'],
    fact: '很多脱口秀演员都被认为是 ENTP——把抬杠变成了艺术。',
    desc: '你的大脑是“挑战模式”常开的辩论场，规则和惯例对你来说都是待测试的假设。你反应快、点子多，三句话能把一个话题盘活。你享受观点的碰撞，偶尔为了好玩而抬杠。把精力聚焦到一两件真正在乎的事上，你的创造力能把世界重新拼一遍。',
    partner: 'INFJ'
  },
  INFJ: {
    zh: '提倡者', emoji: '🌱',
    tags: ['洞察', '理想主义', '温柔', '共情'],
    trait: '照见人心的温柔', blurb: 'TA 像一座安静的灯塔，能看见别人自己都没发现的情绪。',
    careers: ['心理咨询', '教育', '内容创作', '公益'],
    fact: 'INFJ 是最稀有的类型之一，被戏称为“人间安慰剂”。',
    desc: '你像一座安静的灯塔，能照见别人自己都没发现的情绪。你表面平静，内心却装着改变世界的宏大理想。你倾听、你理解、你默默付出，却也容易因为过度共情而累。学会把“照顾别人”的清单里加上自己，你的温柔才不会被消耗成委屈。',
    partner: 'ENTP'
  },
  INFP: {
    zh: '调停者', emoji: '🌙',
    tags: ['理想', '真诚', '诗意', '内心丰富'],
    trait: '不肯妥协的真诚', blurb: 'TA 的内心住着一个充满诗意的宇宙。',
    careers: ['作家', '设计师', '心理学', '教育'],
    fact: '莎士比亚笔下的许多角色都被认为带有 INFP 色彩。',
    desc: '你的内心住着一个充满诗意的宇宙，真诚和理想是你最珍视的东西。你敏感，所以能察觉细微的美好；你柔软，却比谁都坚持原则。现实偶尔让你失望，但你从未放弃让世界变得温柔一点的念头。把理想拆成每天能走的一小步，你就是温柔而强大的存在。',
    partner: 'ENFJ'
  },
  ENFJ: {
    zh: '主人公', emoji: '🌟',
    tags: ['感染力', '利他', '组织力', '热情'],
    trait: '让团队发光的魔法', blurb: 'TA 天生自带“让身边人都变好”的磁场。',
    careers: ['教师', '人力资源', '公益组织', '公关'],
    fact: 'ENFJ 常被称为“天生的老师”，连批评都让人感到被关心。',
    desc: '你天生自带“让团队发光”的魔法。你能敏锐捕捉每个人的潜能，并真心为他们喝彩。你擅长鼓舞、协调、把散落的人聚成一股力量。但请记得：你不必为所有人的情绪负责。留一点能量给自己，你才能持续地照亮别人。',
    partner: 'INFP'
  },
  ENFP: {
    zh: '竞选者', emoji: '🎈',
    tags: ['热情', '好奇', '感染力', '脑洞'],
    trait: '点燃气氛的阳光', blurb: 'TA 是行走的彩虹糖，走到哪儿都能点亮气氛。',
    careers: ['传媒', '市场营销', '主持人', '创意策划'],
    fact: 'ENFP 的聊天记录长度通常与快乐程度成正比。',
    desc: '你是行走的彩虹糖，走到哪儿都能点亮气氛。你对世界抱有近乎无限的好奇，话题从宇宙聊到奶茶毫无压力。你讨厌被框架束缚，灵感像弹幕一样停不下来。找到那件让你愿意长期投入的事，你的热情会从“三分钟热度”变成“十年热爱”。',
    partner: 'INTJ'
  },
  ISTJ: {
    zh: '物流师', emoji: '🏛️',
    tags: ['可靠', '严谨', '责任感', '秩序'],
    trait: '说到做到的可靠', blurb: 'TA 是朋友眼中“说到做到”的代名词。',
    careers: ['财务', '审计', '行政管理', '工程师'],
    fact: '许多顶级审计师和档案管理员都是 ISTJ——混乱在他们面前自动退散。',
    desc: '你是朋友眼中“说到做到”的代名词。你重视承诺、尊重规则，把每件事都做得井井有条。别人眼中的枯燥，在你这里是安全感。你不爱浮夸，但你稳稳托住了很多人的生活。偶尔给自己放个假，允许生活出现一点“不完美”的惊喜。',
    partner: 'ESFP'
  },
  ISFJ: {
    zh: '守卫者', emoji: '🛡️',
    tags: ['细心', '温暖', '忠诚', '默默付出'],
    trait: '记得每个细节的用心', blurb: 'TA 记得每个人的喜好，把细节做到让人心暖。',
    careers: ['护理', '行政', '教师', '客户服务'],
    fact: 'ISFJ 是人口占比最高的类型之一，堪称“人间后勤部”。',
    desc: '你记得每个人的喜好，默默把细节做到让人心暖。你不爱抢风头，但关键时刻总是最可靠的后盾。你的付出常常被当作理所当然，所以更要学会开口表达自己的需要。你守护别人的样子很酷，也请允许别人守护你。',
    partner: 'ESTP'
  },
  ESTJ: {
    zh: '总经理', emoji: '🏢',
    tags: ['务实', '效率', '组织', '担当'],
    trait: '把靠谱写进基因', blurb: 'TA 是秩序与执行力运转得像精密仪器的人。',
    careers: ['管理层', '运营', '公务员', '供应链'],
    fact: 'ESTJ 常被同事称为“行走的日程表”。',
    desc: '你是把“靠谱”写在基因里的人。规则、秩序、执行力，在你手里运转得像精密仪器。你说话直接，做事利落，最看不得拖泥带水。你习惯了扛责任，但也别把所有事都揽在自己肩上——学会放手，你会发现团队比想象中更能干。',
    partner: 'ISFP'
  },
  ESFJ: {
    zh: '执政官', emoji: '🤝',
    tags: ['热心', '周到', '受欢迎', '责任感'],
    trait: '照顾所有人的周到', blurb: 'TA 是人群里的“气氛担当 + 后勤总管”。',
    careers: ['医疗护理', '教育培训', '活动策划', '客户关系'],
    fact: 'ESFJ 往往拥有“全班都认识”的社交超能力。',
    desc: '你是人群里的“气氛担当 + 后勤总管”。你记得每个人的生日，操心每一顿聚餐，把“照顾人”当成天赋。你渴望被需要，也容易因为他人的情绪而内耗。记住：你的价值不需要通过讨好来证明，真正的朋友爱的是本来的你。',
    partner: 'ISTP'
  },
  ISTP: {
    zh: '鉴赏家', emoji: '🔧',
    tags: ['冷静', '动手能力', '独立', '务实'],
    trait: '冷静拆解一切的手', blurb: 'TA 话不多，但手很巧，眼很准。',
    careers: ['工程师', '外科医生', '飞行员', '技术维修'],
    fact: 'ISTP 常被称为“最冷静的急救者”，越乱越清醒。',
    desc: '你话不多，但手很巧，眼很准。你擅长拆解问题——无论是机器还是难题，到你手里都能被拆明白。你享受独处，讨厌被过度安排。你不是冷漠，只是用行动而非言语表达关心。找到能让你“上手”的领域，你就是沉默的高手。',
    partner: 'ESFJ'
  },
  ISFP: {
    zh: '探险家', emoji: '🎨',
    tags: ['审美', '随性', '真诚', '感官敏锐'],
    trait: '感知美好的细腻', blurb: 'TA 用感官体验世界，接收得比别人细腻。',
    careers: ['设计师', '摄影', '音乐', '手工艺'],
    fact: '许多顶尖摄影师和美食家是 ISFP——他们“尝”得出世界的层次。',
    desc: '你用感官体验世界：颜色、气味、触感、一首歌的情绪，你都接收得比别人细腻。你不爱高谈阔论，更喜欢用行动和作品表达自己。你随性，但内心有自己的坚持。别怕慢，你的节奏里藏着别人学不来的美感。',
    partner: 'ESTJ'
  },
  ESTP: {
    zh: '企业家', emoji: '⚡',
    tags: ['行动派', '应变', '胆大', '魅力'],
    trait: '先做了再说的果断', blurb: 'TA 是“机会面前停留不超过三秒”的行动派。',
    careers: ['销售', '创业', '体育', '谈判'],
    fact: 'ESTP 常被形容为“危机现场自带 BGM 的人”。',
    desc: '你是“先做了再说”的代言人。机会在你面前不会停留超过三秒，你天生擅长临场发挥、随机应变。你魅力四射，走到哪都带着现场感。你讨厌冗长的计划，但请偶尔让“三分钟热度”多停留一会儿——专注的力量能让你从“厉害”变成“传奇”。',
    partner: 'ISFJ'
  },
  ESFP: {
    zh: '表演者', emoji: '🎭',
    tags: ['活力', '感染力', '及时行乐', '社交达人'],
    trait: '自带聚光灯的快乐', blurb: 'TA 走到哪儿都像在开派对。',
    careers: ['演艺', '旅游', '主持', '销售'],
    fact: 'ESFP 聚会时的笑声通常能传遍整层楼。',
    desc: '你是自带聚光灯的人，走到哪儿都像在开派对。你热爱生活本身：美食、音乐、朋友、当下的快乐，你一样都不愿错过。你的乐观能治愈很多人，但深夜的你也需要被治愈。记得给情绪留一个出口，快乐和难过都是你的一部分。',
    partner: 'ISTJ'
  }
};

/* ================= 16 型扩展内容（人设/超能力/成长建议/英文名/主题色） =================
   主题色对应 16P 四大气质群组：
   分析家(紫 #6C63FF) / 外交家(绿 #00B894) / 守护者(蓝 #2E86DE) / 探险家(橙 #F0932B)   */
var TYPE_EXTRA = {
  INTJ: { en: 'Strategist', color: '#6C63FF', ink: '#4B43C7', soft: '#E7E4FF', group: '分析家', tagline: '计划是我的铠甲，孤独是我的燃料', superpower: '在别人看见混乱的地方，你一眼看见系统与终局。', growth: '别让完美主义拖住行动，也别把"不够理性"的人挡在门外。' },
  INTP: { en: 'Logician', color: '#6C63FF', ink: '#4B43C7', soft: '#E7E4FF', group: '分析家', tagline: '我的大脑是一台永不停机的推理机', superpower: '再复杂的难题到你手里，都会被拆成可推导的零件。', growth: '把"想清楚"和"做出来"连起来——行动力是你唯一的短板。' },
  ENTJ: { en: 'Commander', color: '#6C63FF', ink: '#4B43C7', soft: '#E7E4FF', group: '分析家', tagline: '效率即正义，行动即答案', superpower: '你能在十秒内把一团乱麻理成作战地图。', growth: '胜负之外还有人心的温度，慢一点有时反而更快。' },
  ENTP: { en: 'Debater', color: '#6C63FF', ink: '#4B43C7', soft: '#E7E4FF', group: '分析家', tagline: '规则？那只是待测试的假设', superpower: '一句话就能把沉闷的讨论盘活成头脑风暴。', growth: '把发散的好奇收束成一件愿意长期坚持的事。' },
  INFJ: { en: 'Advocate', color: '#00B894', ink: '#04795F', soft: '#D6F5EC', group: '外交家', tagline: '我听见了那些没说出口的话', superpower: '你能在别人开口之前，就感知到他们的需要。', growth: '共情别人之前，先记得照顾自己的电量。' },
  INFP: { en: 'Mediator', color: '#00B894', ink: '#04795F', soft: '#D6F5EC', group: '外交家', tagline: '温柔是我对抗世界的方式', superpower: '在最普通的日子里，你也能看见诗与微光。', growth: '把理想拆成今天能走的一小步，别让它只停在梦里。' },
  ENFJ: { en: 'Protagonist', color: '#00B894', ink: '#04795F', soft: '#D6F5EC', group: '外交家', tagline: '让每个人都发光，是我的天赋', superpower: '你能把散落的人聚成一股有方向的力量。', growth: '你不必为所有人的情绪负责——留点能量给自己。' },
  ENFP: { en: 'Campaigner', color: '#00B894', ink: '#04795F', soft: '#D6F5EC', group: '外交家', tagline: '世界那么大，快乐那么多，一样都别错过', superpower: '再冷清的场合，你三句话就能点亮气氛。', growth: '找到那件值得你十年热爱的事，让热情真正扎根。' },
  ISTJ: { en: 'Logistician', color: '#2E86DE', ink: '#1B5FA8', soft: '#DCEBFA', group: '守护者', tagline: '说到做到，是我给自己的承诺', superpower: '你经手的每件事，都会变得井井有条。', growth: '允许生活出现一点"计划外"的惊喜，也挺好。' },
  ISFJ: { en: 'Defender', color: '#2E86DE', ink: '#1B5FA8', soft: '#DCEBFA', group: '守护者', tagline: '我记住了你所有的小习惯', superpower: '你的细心，能悄悄暖到每个人的心坎里。', growth: '学会开口说出自己的需要，付出不该是单向的。' },
  ESTJ: { en: 'Executive', color: '#2E86DE', ink: '#1B5FA8', soft: '#DCEBFA', group: '守护者', tagline: '秩序与担当，是我的生存美学', superpower: '混乱的场面到你手里，会自动排成队列。', growth: '试着放手让团队自己飞，你会收获更多。' },
  ESFJ: { en: 'Consul', color: '#2E86DE', ink: '#1B5FA8', soft: '#DCEBFA', group: '守护者', tagline: '照顾好每个人，是我天生的使命', superpower: '你记得所有人的生日，也接得住所有人的情绪。', growth: '你的价值不需要靠讨好来证明，做自己就很好。' },
  ISTP: { en: 'Virtuoso', color: '#F0932B', ink: '#A65D00', soft: '#FDEBD9', group: '探险家', tagline: '我不多说，但我总能搞定', superpower: '无论机器还是难题，到你手上都能被拆明白。', growth: '用行动表达关心很棒，偶尔也试试把话说出口。' },
  ISFP: { en: 'Adventurer', color: '#F0932B', ink: '#A65D00', soft: '#FDEBD9', group: '探险家', tagline: '我用感官，收藏这个世界', superpower: '颜色、气味、旋律……你接收到的细节比谁都多。', growth: '别怕慢，你的节奏里藏着别人学不来的美感。' },
  ESTP: { en: 'Entrepreneur', color: '#F0932B', ink: '#A65D00', soft: '#FDEBD9', group: '探险家', tagline: '先做了再说，机会不等人', superpower: '现场突发状况？你天生就是救场高手。', growth: '让"三分钟热度"多停留一会儿，专注能成就传奇。' },
  ESFP: { en: 'Entertainer', color: '#F0932B', ink: '#A65D00', soft: '#FDEBD9', group: '探险家', tagline: '生活就是一场永不散场的派对', superpower: '你的笑声，能治愈一整天的疲惫。', growth: '快乐和难过都是你的一部分，记得给情绪留个出口。' }
};

/* ================= 16 型成长中心数据（解读 / 职业 / 人生） ================= */
var TYPE_GROWTH = {
  INTJ: {
    strengths: ['十年后的图景一眼看穿', '深度思考成瘾', '说到做到的高标准', '危机中异常冷静'],
    weaknesses: ['完美主义让人内耗', '情感表达像说明书', '对低效零容忍易得罪人'],
    drive: '你被"掌控与精通"驱动：把复杂系统拆解、重构、优化，是你最大的心流。',
    workStyle: '单打独斗型专家：适合独立负责长期项目，讨厌事事汇报；给你目标与信任，你还你超出预期的方案。',
    roles: ['战略咨询顾问', '技术架构师', '科研项目负责人', '量化分析师'],
    careerTips: ['选能独立决策、看重结果的岗位', '定期把想法讲出来，别让它烂在脑子里', '把"不够聪明"的同事也当成资源'],
    lifeTips: ['完成 > 完美：先交付再打磨', '偶尔允许计划被打乱，世界不会塌', '用一句话表达"我在乎你"，比做十件事更有效'],
    relationTip: '别用"为你好"替别人做决定；先问需求再给方案，你的建议会更好被接受。'
  },
  INTP: {
    strengths: ['逻辑漏洞无处遁形', '知识吸收像海绵', '创意与严谨兼备'],
    weaknesses: ['想太多做太少', '行动力随灵感波动', '社交电量见底快'],
    drive: '你被"理解事物本质"驱动：一个想不通的问题，能让你兴奋到凌晨三点。',
    workStyle: '思考型体质：适合研究、架构、写作等需要深度沉浸的岗位，讨厌无意义的会议。',
    roles: ['软件工程师', '科研学者', '数据分析师', '产品策略'],
    careerTips: ['把"想清楚"和"做出来"设成两个阶段', '用写作外化思考，防止脑内死循环', '选择允许弹性时间的工作环境'],
    lifeTips: ['先做"最小可行版本"，胜过想出一百个方案', '定期出门晒太阳，灵感需要氧气', '关系里少讲道理、多讲感受，会省很多事'],
    relationTip: '你纠正别人出于好意，但听起来像抬杠；先肯定一句，再提出不同看法。'
  },
  ENTJ: {
    strengths: ['天生领导者气场', '执行力拉满', '危机时刻拍板决断', '目标感极强'],
    weaknesses: ['对慢节奏没耐心', '容易忽略他人感受', '把休息当浪费时间'],
    drive: '你被"赢与掌控"驱动：定下目标的那一刻，你已经开始规划胜利的路径。',
    workStyle: '天生的管理者：适合带团队、定战略，讨厌含糊其辞；你的直球风格能快速推进事情。',
    roles: ['企业高管', '创业者', '项目经理', '投行/咨询'],
    careerTips: ['多听"不赞成"的声音，防止决策盲区', '把功劳分出去，团队才愿意跟你走', '给下属失败的空间，成长比效率更重要'],
    lifeTips: ['赢不是唯一目标，过程里的关系同样珍贵', '每周留半天"什么都不做"', '承认"我需要帮助"不会削弱你的权威'],
    relationTip: '你的关心容易变成"命令"；把"你应该"换成"要不要一起试试"，关系会松弛很多。'
  },
  ENTP: {
    strengths: ['脑洞永动机', '三秒看穿话术漏洞', '临场反应极快', '挑战常规的勇气'],
    weaknesses: ['兴趣切换比翻书快', '为抬杠而抬杠', '讨厌流程和细节'],
    drive: '你被"可能性与挑战"驱动：越是"不可能"，你越兴奋。',
    workStyle: '点子型选手：适合创意、谈判、产品等需要快速反应的岗位；细节执行请交给靠谱的队友。',
    roles: ['产品经理', '创意总监', '创业者', '律师/谈判专家'],
    careerTips: ['把最兴奋的点子写成最小方案试跑', '给无聊的细节设番茄钟，别让它拖垮你', '找一个执行型搭档，脑洞才能落地'],
    lifeTips: ['好奇心是天赋，但深度才能造护城河', '偶尔让"最后一个观点"留在心里', '承认自己也会错，辩论才会变成交流'],
    relationTip: '对方不需要你赢，需要被理解；把"但是"换成"有意思，再说说"。'
  },
  INFJ: {
    strengths: ['洞察人心的雷达', '温柔而坚定的原则', '为理想长期主义', '深度共情力'],
    weaknesses: ['过度共情容易内耗', '理想受挫时容易摆烂', '不擅长拒绝'],
    drive: '你被"意义感"驱动：做一件事之前，你需要先说服自己"它值得"。',
    workStyle: '使命驱动型：适合教育、心理、内容等能影响他人的领域；讨厌纯商业化的内卷。',
    roles: ['心理咨询师', '教育工作者', '内容创作者', '公益项目负责人'],
    careerTips: ['把"改变世界"拆成"每周改变一个人"', '学会对不合理需求说不', '找到同类，别一个人扛理想'],
    lifeTips: ['照顾别人之前，先给自己的电量充满', '完美主义退一步：先完成，再完善', '你的直觉很准，但请用现实验证它'],
    relationTip: '你总在"读空气"；偶尔直说"我需要……"，别人才能真的懂你。'
  },
  INFP: {
    strengths: ['丰富的内心宇宙', '真诚到发光的表达', '对美好事物的敏锐', '坚定的价值观'],
    weaknesses: ['情绪敏感易受伤', '计划常败给心情', '害怕冲突爱逃避'],
    drive: '你被"真实与美"驱动：一句真诚的话、一个动人的故事，能让你记很久。',
    workStyle: '创作者体质：适合写作、设计、艺术等能表达自我的领域；需要安静和不被打断的时间。',
    roles: ['作家/编辑', '插画师/设计师', '心理咨询', '教育/公益'],
    careerTips: ['用作品说话，别用性格说服老板', '给创作设截止日，灵感才会准时上班', '找一个欣赏你而非改造你的团队'],
    lifeTips: ['理想拆成小步，今天就走一步', '允许自己偶尔摆烂，那是充电不是失败', '冲突不可怕，表达出来关系才会更深'],
    relationTip: '你总在照顾别人的情绪，却很少说出自己的委屈；每周给信任的人讲一次真心话。'
  },
  ENFJ: {
    strengths: ['鼓舞人心的感染力', '把团队拧成一股绳', '敏锐捕捉他人潜能', '热心且行动力强'],
    weaknesses: ['为所有人操心到累', '难拒绝他人期待', '把批评当否定'],
    drive: '你被"看见他人成长"驱动：当你说"你可以的"并且他真的做到了，是你最快乐的时刻。',
    workStyle: '团队催化剂：适合教育、管理、公关等需要凝聚人心的岗位；你的热情是团队最好的燃料。',
    roles: ['教师/培训师', '人力资源/团队管理', '公关/活动策划', '公益组织'],
    careerTips: ['别把团队的锅都自己背', '学会把"操心"授权出去', '选择价值观一致的平台'],
    lifeTips: ['你不必让所有人都满意', '被否定不等于你不够好，那是信息不是判决', '留时间给自己充电，蜡烛不能两头烧'],
    relationTip: '你擅长鼓励别人，却很少接受鼓励；允许自己被照顾，也是一种成长。'
  },
  ENFP: {
    strengths: ['热情感染全场', '灵感源源不断', '与人连接的天赋', '乐观抗挫'],
    weaknesses: ['三分钟热度', '细节与坚持是短板', '情绪来得快去得也快'],
    drive: '你被"新奇与连接"驱动：一个新朋友、一个新点子，都能让你瞬间满血。',
    workStyle: '创意火花型：适合传媒、营销、主持等需要热情输出的岗位；需要一个帮你收尾的搭档。',
    roles: ['市场营销', '媒体/主持人', '创意策划', '社群运营'],
    careerTips: ['选"人+创意"结合的工作', '把灵感当天记录，别等它蒸发', '主动寻求反馈，别靠自我感觉'],
    lifeTips: ['热爱需要长期主义：先坚持 90 天再说', '独处不是无聊，是给自己充电', '承诺了的事，把它写进日历'],
    relationTip: '你的热情很珍贵，但记得给对话留一半时间给对方；倾听比表达更让人喜欢你。'
  },
  ISTJ: {
    strengths: ['说到做到的信誉', '极强的责任感', '细节零失误', '稳定可靠的执行'],
    weaknesses: ['抗拒变化', '不擅长表达情感', '对自己和他人过于严格'],
    drive: '你被"秩序与承诺"驱动：一切井井有条、说到做到，是你最大的安心感。',
    workStyle: '中流砥柱型：适合财务、审计、工程等需要精确与稳定的岗位；你是团队最靠谱的那块基石。',
    roles: ['会计师/审计师', '系统工程师', '行政管理', '质量管理'],
    careerTips: ['用数据说话，你的严谨就是竞争力', '主动拥抱一次流程优化，别固守旧习惯', '在稳定中留出学习新技能的时间'],
    lifeTips: ['计划之外的小惊喜，也可以很美好', '把"关心"说出来，别只做不说', '对自己宽容一点：偶尔的失误不是失职'],
    relationTip: '你的爱是行动不是语言；但请偶尔加一句"我担心你""我想你"，对方才能收到信号。'
  },
  ISFJ: {
    strengths: ['无微不至的细心', '忠诚可靠', '默默付出的耐心', '极强的同理心'],
    weaknesses: ['付出型委屈自己', '不敢提需求', '害怕改变与冲突'],
    drive: '你被"让身边的人安心"驱动：看到你在乎的人因为你的照顾而轻松，你就满足了。',
    workStyle: '后勤担当型：适合护理、行政、教育、客服等需要耐心与细心的岗位；你让一切运转丝滑。',
    roles: ['护士/护理', '行政/人事', '教师', '客户服务'],
    careerTips: ['你的付出值得被看见：学会汇报成果', '把"不"字练熟，保护自己的精力', '选择尊重付出的环境，远离消耗型团队'],
    lifeTips: ['照顾别人之前，先照顾好自己', '你的需求同样重要，说出来不丢人', '改变不可怕，你已经比想象中强大'],
    relationTip: '你记得所有人的生日，却没人知道你累了；主动开口，爱你的人会接住你。'
  },
  ESTJ: {
    strengths: ['组织力天生强悍', '执行力与担当', '规则面前一视同仁', '务实高效'],
    weaknesses: ['对"感受"缺乏耐心', '习惯性掌控一切', '难接受非主流做法'],
    drive: '你被"效率与秩序"驱动：看到混乱被理顺、团队高效运转，你最有成就感。',
    workStyle: '运营掌舵型：适合管理、运营、供应链等需要统筹的岗位；你的日程表就是团队的作战图。',
    roles: ['运营总监', '供应链管理', '公务员/管理者', '项目管理'],
    careerTips: ['多问"为什么"，别只执行流程', '学会授权：你不做，团队永远不会', '向下属表达认可，比罚款更有效'],
    lifeTips: ['效率之外，留点时间给"没有意义"的快乐', '放下控制，别人也能把事做好', '你的严厉背后是负责，但请把温柔说出口'],
    relationTip: '你习惯安排一切；但亲密关系需要商量，而不是通知。'
  },
  ESFJ: {
    strengths: ['照顾周到的人情味', '强大的社交凝聚力', '责任感爆棚', '行动派热心肠'],
    weaknesses: ['过度在意他人评价', '讨好型付出', '难以接受"不被需要"'],
    drive: '你被"被需要与被认可"驱动：大家因为你而聚在一起，你就值得。',
    workStyle: '氛围担当型：适合教育、医疗、活动、客户关系等与人打交道的岗位；你是团队的情绪中枢。',
    roles: ['活动策划', '客户关系', '教师/培训', '医疗护理'],
    careerTips: ['把"被需要"和"自我价值"分开', '在聚会组织者之外，学会接住自己的情绪', '选择反馈及时、人情味浓的环境'],
    lifeTips: ['你的价值不需要靠讨好来证明', '偶尔做"不重要"的自己，也很可爱', '别人的评价是参考，不是判决书'],
    relationTip: '你总在问"你还好吗"，也请偶尔回答别人问你的"你还好吗"。'
  },
  ISTP: {
    strengths: ['动手解决一切', '危机中的冷静', '极强的观察力', '实用主义天才'],
    weaknesses: ['讨厌被安排', '情感表达稀缺', '对长期承诺不耐烦'],
    drive: '你被"拆解与搞定"驱动：一件坏掉的东西在你手里重新运转，是你最爽的时刻。',
    workStyle: '问题解决型：适合工程、技术、医疗、驾驶等需要实操的岗位；你讨厌开会，爱上手干活。',
    roles: ['机械/软件工程师', '外科医生', '飞行员/技师', '极限运动教练'],
    careerTips: ['选"结果导向"的岗位，少开会多干活', '把经验写成文档，别人能学你更强', '每两年学一项新技能，保持手感'],
    lifeTips: ['体验式学习最适合你：想一万遍不如上手一次', '对在乎的人，试试把"嗯"换成一句完整的话', '给未来留点规划，别全凭当下心情'],
    relationTip: '你话少不是冷漠；但请偶尔主动发一条消息，别让在乎你的人猜。'
  },
  ISFP: {
    strengths: ['与生俱来的审美', '真诚不装', '感官世界的收藏家', '随性而松弛'],
    weaknesses: ['计划总被情绪打断', '不擅长争取利益', '容易自我怀疑'],
    drive: '你被"美与真实"驱动：一首歌的情绪、一道光的颜色，都能让你确认"活着真好"。',
    workStyle: '创作型：适合设计、摄影、音乐、手工艺等能用手艺表达美的岗位；需要自由与留白。',
    roles: ['视觉设计师', '摄影师/剪辑', '音乐人', '手工艺人'],
    careerTips: ['把作品集当成你的简历', '定价时别心虚：你的审美有市场', '找一个"看得懂你"的团队，比高薪重要'],
    lifeTips: ['你的节奏很慢，但那是风格不是缺点', '偶尔逼自己一把，成果会让你惊喜', '把感受说出来，别让沉默吞掉委屈'],
    relationTip: '你习惯用陪伴表达爱；偶尔也用语言确认关系，别让误会积成隔阂。'
  },
  ESTP: {
    strengths: ['行动力闪电级', '临场应变的天才', '天生的谈判魅力', '精力旺盛'],
    weaknesses: ['耐心余额不足', '忽视长期规划', '为刺激而冒险'],
    drive: '你被"当下与行动"驱动：机会来了三秒内出手，是你的人生哲学。',
    workStyle: '实战派选手：适合销售、创业、体育、谈判等高压快节奏的岗位；静止对你等于消耗。',
    roles: ['销售总监', '创业者', '体育/健身', '危机公关'],
    careerTips: ['给每个冲动设一个"最小试错成本"', '找一个规划型搭档补你的长线', '赢了之后复盘，运气才能变成能力'],
    lifeTips: ['三分钟热度可以，但要有一个领域坚持十年', '停下来不是认输，是补充弹药', '把"我赢"换成"我们赢"，路更宽'],
    relationTip: '你的魅力四射，但请记住对方要的是"被记得"，而不是"被征服"。'
  },
  ESFP: {
    strengths: ['自带聚光灯的感染力', '活在当下的快乐', '让气氛升温的天赋', '真诚的慷慨'],
    weaknesses: ['回避负面情绪', '计划感薄弱', '需要被关注'],
    drive: '你被"快乐与体验"驱动：一场尽兴的聚会、一次说走就走的旅行，就是你的人生充电桩。',
    workStyle: '气氛制造机：适合演艺、旅游、主持、零售等热闹有反馈的岗位；独处的办公室会闷坏你。',
    roles: ['演员/主播', '旅游/活动策划', '主持人', '零售/餐饮管理'],
    careerTips: ['选"有观众"的工作，反馈就是你的动力', '把快乐做成产品，你的天赋就有市场', '财务上找个"扫兴但正确"的人帮你把关'],
    lifeTips: ['快乐和难过都是你的一部分，别只留下快乐', '给计划留 10% 的提前量，生活更从容', '独处时也对自己温柔，你不需要一直热闹'],
    relationTip: '你把快乐带给所有人，也请允许自己在信任的人面前哭。'
  }
};

/* ================= 存储工具（带容错） ================= */
function getStore(key) {
  try {
    var raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
/* 写入存储：返回是否成功。
   为什么要返回值：隐私模式 / 配额满 / 被禁用时 localStorage 会抛异常，
   旧实现静默吞掉异常 → 界面照常推进、刷新后进度归零（实测 24 次写入全部丢失却毫无提示）。 */
var storageFailed = false;
function setStore(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    storageFailed = true;
    return false;
  }
}
/* 首次写入失败时给用户一次明确提示（只提示一次，避免刷屏） */
function warnStorageOnce() {
  if (!storageFailed || warnStorageOnce._done) return;
  warnStorageOnce._done = true;
  if (typeof toast === 'function') {
    toast('浏览器存储不可用，进度无法保存，请不要刷新页面 ⚠️');
  }
}
/* 带类型校验的读取：localStorage 可能被外部写入或被截断，
   只防 JSON 语法错误不够——`mbti_answers='"abc"'` 会让点选项抛异常、
   `mbti_history=5` 会让交卷永久失效。这里按期望类型校验，不符则返回 fallback。 */
function getStoreAs(key, kind, fallback) {
  var v = getStore(key);
  var ok = kind === 'array' ? Array.isArray(v)
    : kind === 'object' ? (!!v && typeof v === 'object' && !Array.isArray(v))
    : kind === 'string' ? (typeof v === 'string')
    : kind === 'number' ? (typeof v === 'number' && isFinite(v))
    : true;
  return ok ? v : (fallback === undefined ? null : fallback);
}
function clearTestData() {
  try {
    localStorage.removeItem(STORAGE_KEYS.answers);
    localStorage.removeItem(STORAGE_KEYS.current);
    localStorage.removeItem(STORAGE_KEYS.set);
    localStorage.removeItem(STORAGE_KEYS.mode);
    localStorage.removeItem(STORAGE_KEYS.result);
  } catch (e) { /* ignore */ }
}

/* 题库版本迁移：版本不一致时清空旧答案与旧结果，避免误读
   返回 true = 无需提示；false = 确有旧数据被清空（调用方提示"题库已升级"） */
function ensureBankVersion() {
  /* 题库没加载成功（QUESTIONS 缺失 / 被截断的响应）时**绝不能动用户数据**：
     否则会删掉上一次结果与进行中的作答，还会把版本写成 0，
     等题库恢复后又被判定成"又一次升级"，提示也变成误导。 */
  if (!questionBank().length || !bankVersion()) return true;
  var saved = getStore(STORAGE_KEYS.version);
  if (saved === bankVersion()) return true;

  var hadData = false;
  try {
    hadData = !!(localStorage.getItem(STORAGE_KEYS.answers) || localStorage.getItem(STORAGE_KEYS.result));
  } catch (e) { /* ignore */ }

  try {
    localStorage.removeItem(STORAGE_KEYS.answers);
    localStorage.removeItem(STORAGE_KEYS.current);
    localStorage.removeItem(STORAGE_KEYS.set);
    localStorage.removeItem(STORAGE_KEYS.result);
    /* 一并清掉"最近出现过"的题号：题库换了，旧 id 的语义可能已变，
       留着会让"优先抽没见过的题"反过来变成"优先抽见过的题" */
    localStorage.removeItem(STORAGE_KEYS.seen);
  } catch (e) { /* ignore */ }
  setStore(STORAGE_KEYS.version, bankVersion());
  return hadData ? false : true;
}

/* ================= 选题：双档位 =================
   两档共用同一题库，且**两档都随机化并交织出题**（v3 改动）：
   - 按维度轮转，避免同维度连续成块；
   - 优先选与上一题不同侧面、不同方向的题，削弱顺序与启动效应；
   - 快速档不再固定顺序（旧设计为了"复测可对比"，但代价是稳定的作答定势）。 */
function shuffle(arr) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

/* ================= 选题：每次开测按维度等比例随机抽题 =================
   - 每维抽 perDim 题（偶数），两极各一半 → 该维极性严格平衡；
   - 名额按内容侧面(facet)尽量均分 → 覆盖面不会塌缩到某几个侧面；
   - 优先抽"最近没出现过的题"，避免连着两次测到同一批；
   - 抽好的题序会存进 mbti_set，刷新/续答时沿用同一套题。 */

/* 把 total 个名额尽量平均分给 buckets 个桶（余数给前几个桶） */
function distribute(total, buckets) {
  var base = Math.floor(total / buckets), rest = total % buckets, out = [];
  for (var i = 0; i < buckets; i++) out.push(base + (i < rest ? 1 : 0));
  return out;
}

/* 最近两轮出现过的题 id（用于"换一批题"） */
function seenIds() {
  return getStoreAs(STORAGE_KEYS.seen, 'array', []);
}
function markSeen(ids) {
  setStore(STORAGE_KEYS.seen, seenIds().concat(ids || []).slice(-120));
}

/* 某一维随机抽 n 题（n 为偶数）：facet 均分 + 两极 1:1 */
function sampleDimItems(dim, n) {
  var bank = questionBank();
  var seen = seenIds();
  var facets = [];
  bank.forEach(function (q) {
    if (q.dim === dim && facets.indexOf(q.facet) < 0) facets.push(q.facet);
  });
  shuffle(facets);

  /* 未出现过的题排在前面 */
  function prep(list) {
    var fresh = [], used = [];
    shuffle(list).forEach(function (q) { (seen.indexOf(q.id) >= 0 ? used : fresh).push(q); });
    return fresh.concat(used);
  }
  var halfA = Math.ceil(n / 2), halfB = n - halfA;
  var quotaA = distribute(halfA, facets.length);
  var quotaB = distribute(halfB, facets.length);
  var picks = [];
  facets.forEach(function (f, i) {
    var poolA = prep(bank.filter(function (q) { return q.dim === dim && q.facet === f && q.dir < 0; }));
    var poolB = prep(bank.filter(function (q) { return q.dim === dim && q.facet === f && q.dir > 0; }));
    picks = picks.concat(poolA.slice(0, quotaA[i]), poolB.slice(0, quotaB[i]));
  });
  return picks;
}

function buildQuestionSet(modeKey) {
  var conf = modeConf(modeKey);
  var queues = DIMS.map(function (dim) {
    return shuffle(sampleDimItems(dim, conf.perDim));
  });
  /* 轮转交织出题：避免"整维连续 + 同极连续"带来的顺序与启动效应 */
  var out = [];
  var lastDimIdx = -1, lastFacet = null, lastDir = 0;
  var totalCount = queues.reduce(function (s, q) { return s + q.length; }, 0);
  while (out.length < totalCount) {
    var picked = false;
    for (var offset = 1; offset <= queues.length && !picked; offset++) {
      var qi = (lastDimIdx + offset) % queues.length;
      if (lastDimIdx < 0) qi = offset - 1;
      var q = queues[qi];
      if (!q.length) continue;
      /* 优先选与上一题"不同侧面且不同方向"的题，进一步削弱定势 */
      var idx = 0;
      for (var k = 0; k < q.length; k++) {
        if (q[k].facet !== lastFacet && q[k].dir !== lastDir) { idx = k; break; }
      }
      var item = q.splice(idx, 1)[0];
      out.push(item);
      lastDimIdx = qi;
      lastFacet = item.facet;
      lastDir = item.dir;
      picked = true;
    }
    if (!picked) break;
  }
  return out;
}

/* 某一档每维抽题量（两档共用 200 题题库，靠 perDim 区分长度） */
function modePerDim(modeKey) { return modeConf(modeKey).perDim; }

/* ================= 计分核心（纯函数，可测试） =================
   输入：answers —— { qid: -3|-1|0|1|3 }（0 = 不确定，不计分；未答缺省或 null）
        mode    —— 'quick' | 'deep'
        setIds  —— 本档实际抽到的题 id 数组（用于确定分母；缺省则用已作答的题）
   输出：{
     mode, modeLabel, bankVersion, letters,
     dims: { EI: {A,B,score,pctB,letter,strength,amb,confidence,answered,scored,neutral,total,label}, ... },
     answered, consistencyIssues, overallConfidence,
     easterEgg（四维全部倾向模糊）, type
   }                                                          */
function computeResult(answers, mode, setIds) {
  var conf = modeConf(mode);
  answers = answers || {};
  var bank = questionBank();
  var byId = {};
  bank.forEach(function (q) { byId[q.id] = q; });
  /* 题集：优先用本档实际抽到的题（页面会把 mbti_set 传进来）；
     缺省时退回"已作答的题"，保证旧数据也能计分。
     这里做去重 + 白名单过滤：被污染的存储可能塞入重复 id / 未知 id / 非字符串，
     若不去重，同一题会被算多遍（实测 answered 192 > total 16）。 */
  var rawIds = (Array.isArray(setIds) && setIds.length) ? setIds : Object.keys(answers || {});
  var ids = [];
  rawIds.forEach(function (id) {
    if (typeof id === 'string' && byId[id] && ids.indexOf(id) < 0) ids.push(id);
  });
  var res = {
    mode: conf.key, modeLabel: conf.label, bankVersion: bankVersion(),
    letters: '', dims: {}, easterEgg: false, type: null,
    answered: 0, consistencyIssues: 0, overallConfidence: 0
  };
  var allAmb = true;
  var confSum = 0;

  DIMS.forEach(function (dim) {
    var A = dim[0];          // 首字母极（E/S/T/J）
    var B = dim[1];          // 次字母极（I/N/F/P）
    var items = [];
    ids.forEach(function (id) {
      var q = byId[id];
      if (q && q.dim === dim) items.push(q);
    });
    var total = Math.max(conf.perDim, items.length);   // 分母：本档抽题量（异常题集下取较大者，保证 scored ≤ total）
    var sumA = 0, cntA = 0, sumB = 0, cntB = 0, answered = 0, neutral = 0;
    var facetMap = {};

    items.forEach(function (q) {
      var r = normAnswer(answers[q.id]);
      if (r === undefined) return;          // 未作答或非法值：一律跳过（不计分、不计已答）
      answered++;
      /* "不确定"（0）：只记录，不计入任何一极的均值 → 不影响得分，
         但会降低有效覆盖度（scored/total），从而如实拉低置信度。 */
      if (r === 0) { neutral++; return; }
      if (q.dir > 0) { sumB += r; cntB++; } else { sumA += r; cntA++; }
      var f = facetMap[q.facet] || (facetMap[q.facet] = { sumA: 0, nA: 0, sumB: 0, nB: 0 });
      if (q.dir > 0) { f.sumB += r; f.nB++; } else { f.sumA += r; f.nA++; }
    });

    var avgA = cntA ? sumA / cntA : 0;
    var avgB = cntB ? sumB / cntB : 0;
    var score = (avgB - avgA) / 2;                 // ∈ [-3, 3]
    if (!isFinite(score)) score = 0;
    /* 双保险：即使上游出现异常，也绝不输出越界百分比 */
    var pctB = Math.max(0, Math.min(100, Math.round(50 + (score / 3) * 50)));
    var letter = pctB >= 50 ? B : A;
    var strength = Math.max(0, Math.min(100, Math.round(Math.abs(pctB - 50) * 2)));
    /* 倾向模糊判定：必须严格小于 1。
       量表是 {-3,-1,1,3}，如果只用"同意/不同意"（+1/-1）作答，
       完全一致的作答也会得到 |score| = 1 —— 旧逻辑用 <= 1 会把这类
       "温和但明确"的结果误判为四维全模糊（从而总是显示彩蛋页）。 */
    var amb = Math.abs(score) < 1;

    /* 侧面级一致性：各内容侧面（每维 5 个）的倾向是否指向同一端 */
    var facets = Object.keys(facetMap).map(function (name) {
      var f = facetMap[name];
      var a = f.nA ? f.sumA / f.nA : 0;
      var b = f.nB ? f.sumB / f.nB : 0;
      var lean = (b - a) / 2;
      return { name: name, lean: lean, letter: Math.abs(lean) <= 0.5 ? '' : (lean > 0 ? B : A) };
    });
    var agreeA = facets.filter(function (f) { return f.lean < -0.5; }).length;
    var agreeB = facets.filter(function (f) { return f.lean > 0.5; }).length;
    var facetAgreement = facets.length ? Math.max(agreeA, agreeB) / facets.length : 0;

    /* 置信度（可解释的四因子模型）：
       有效覆盖率 × 题量饱和因子 × 侧面一致度 × 倾向强度
       - 有效覆盖率 = 实际计分题数 / 本档抽题量（选"不确定"会拉低它）
       - 题量饱和：1-exp(-n/8) —— 6 题≈0.53、16 题≈0.87（题越多越稳）
       - 侧面一致度：各侧面里指向同端的比例（分歧大 = 结果不稳） */
    var scored = cntA + cntB;
    var coverage = total ? Math.min(1, scored / total) : 0;
    var sat = 1 - Math.exp(-total / 8);
    var strengthRate = Math.min(1, strength / 70);
    var confidence = Math.round(100 * coverage * sat * (0.45 + 0.55 * strengthRate) *
      (0.55 + 0.45 * facetAgreement));
    if (!isFinite(confidence)) confidence = 0;
    confidence = Math.max(0, Math.min(100, confidence));

    if (!amb) allAmb = false;
    res.dims[dim] = {
      A: A, B: B, score: score, pctB: pctB, letter: letter, strength: strength,
      amb: amb, confidence: confidence, answered: answered, scored: scored, neutral: neutral, total: total,
      facets: facets, facetAgreement: facetAgreement,
      facetSummary: (agreeB >= agreeA ? agreeB : agreeA) + '/' + facets.length,
      label: amb ? (A + '/' + B) : letter
    };
    res.letters += letter;
    res.answered += answered;
    res.neutral = (res.neutral || 0) + neutral;
    confSum += confidence;
  });

  // 一致性检查：配对题（语义互为镜像的两题）若被同时强烈认同/同时强烈否认，
  // 说明作答在该构念上自相矛盾（poles 一正一负即矛盾）
  var pairs = {};
  var allItems = [];
  ids.forEach(function (id) { if (byId[id]) allItems.push(byId[id]); });
  allItems.forEach(function (q) {
    if (!q.pair) return;
    var r = answers[q.id];
    if (r === null || r === undefined || r === 0) return;   // "不确定"不参与一致性判定
    (pairs[q.pair] = pairs[q.pair] || []).push({ dir: q.dir, r: r });
  });
  Object.keys(pairs).forEach(function (k) {
    var list = pairs[k];
    if (list.length < 2) return;
    var poles = list.map(function (x) { return -x.dir * x.r; }); // 正=指向首字母极，负=指向次字母极
    var strongFirst = poles.filter(function (v) { return v >= 1; }).length;
    var strongSecond = poles.filter(function (v) { return v <= -1; }).length;
    if (strongFirst > 0 && strongSecond > 0) res.consistencyIssues++;
  });

  var overall = Math.round(confSum / DIMS.length) - res.consistencyIssues * 12;
  if (!isFinite(overall)) overall = 0;
  res.overallConfidence = Math.max(0, Math.min(100, overall));
  res.easterEgg = allAmb;
  res.type = TYPES[res.letters] || null;
  return res;
}

/* 已答计数：只认合法作答值（与进度条、交卷门槛口径一致） */
function answeredCount(answers) {
  if (!answers || typeof answers !== 'object') return 0;
  var n = 0;
  Object.keys(answers).forEach(function (k) {
    if (isAnswered(answers[k])) n++;
  });
  return n;
}

/* ================= 小工具 ================= */
function $(sel) { return document.querySelector(sel); }
function $$(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

function toast(msg) {
  var t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(function () { t.classList.remove('show'); }, 2200);
}

/* 数字滚动动画（easeOutCubic）；尊重"减少动效"偏好时直接落到终值 */
function countUp(el, target, dur, fmt) {
  if (!el) return;
  fmt = fmt || function (v) { return v.toLocaleString('zh-CN'); };
  if (prefersReduced()) { el.textContent = fmt(target); return; }
  var t0 = null;
  function step(ts) {
    if (t0 === null) t0 = ts;
    var k = Math.min(1, (ts - t0) / dur);
    var eased = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(Math.round(target * eased));
    if (k < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* 是否偏好减少动效 */
function prefersReduced() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

/* 带页面转场跳转 */
function navigate(url) {
  document.body.classList.add('leaving');
  setTimeout(function () { window.location.href = url; }, 250);
}

/* 页面淡入淡出转场：拦截站内 <a href="*.html"> 点击 */
function initTransitions() {
  document.body.classList.add('entering');
  requestAnimationFrame(function () {
    requestAnimationFrame(function () { document.body.classList.remove('entering'); });
  });
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target === '_blank') return;
    var href = a.getAttribute('href');
    if (!href || href.indexOf('.html') === -1) return;
    e.preventDefault();
    navigate(href);
  });
}

/* 光标辉光（仅桌面精细指针设备，且用户未要求减少动效） */
function initCursorGlow() {
  if (prefersReduced()) return;
  if (!window.matchMedia || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  var el = document.createElement('div');
  el.className = 'cursor-glow';
  document.body.appendChild(el);
  var x = window.innerWidth / 2, y = window.innerHeight / 2, tx = x, ty = y, raf = null;
  document.addEventListener('mousemove', function (e) {
    tx = e.clientX; ty = e.clientY;
    if (!raf) loop();
  });
  function loop() {
    raf = requestAnimationFrame(function () {
      x += (tx - x) * 0.12;
      y += (ty - y) * 0.12;
      el.style.transform = 'translate(' + (x - 210) + 'px,' + (y - 210) + 'px)';
      if (Math.abs(tx - x) > 0.5 || Math.abs(ty - y) > 0.5) loop();
      else raf = null;
    });
  }
}

/* ============================================================
   首页：打字机 + 人数统计
   ============================================================ */
function initHome() {
  var text = '发现你的人格密码';
  var box = $('#typewriterText');
  if (!box) return;

  var i = 0;
  var timer = setInterval(function () {
    box.textContent = text.slice(0, ++i);
    if (i >= text.length) clearInterval(timer);
  }, 85);

  var base = 128473 + Math.floor(Math.random() * 50000);
  var done = getStoreAs(STORAGE_KEYS.completions, 'number', 0) || 0;
  countUp($('#homeCount'), base + done, 1500, function (v) {
    return '已有 ' + v.toLocaleString('zh-CN') + ' 人完成测试 ✨';
  });

  bindModeCards();
}

/* 档位选择卡（快速 / 深度） */
function bindModeCards() {
  var wrap = $('#modeCards');
  if (!wrap) return;

  var saved = getStoreAs(STORAGE_KEYS.mode, 'string');
  var mode = MODES[saved] ? saved : DEFAULT_MODE;
  syncModeCards(mode);

  $$('#modeCards .mode-card').forEach(function (card) {
    card.addEventListener('click', function () {
      var m = card.getAttribute('data-mode');
      if (!MODES[m]) return;
      var prev = getStoreAs(STORAGE_KEYS.mode, 'string');
      setStore(STORAGE_KEYS.mode, m);
      syncModeCards(m);
      // 切换档位意味着题序变化，清掉旧进度避免错位
      if (prev !== m) {
        try {
          localStorage.removeItem(STORAGE_KEYS.answers);
          localStorage.removeItem(STORAGE_KEYS.current);
          localStorage.removeItem(STORAGE_KEYS.set);
        } catch (e) { /* ignore */ }
      }
    });
  });

  // 未完成进度提示
  var savedSet = getStoreAs(STORAGE_KEYS.set, 'array');
  var answers = getStoreAs(STORAGE_KEYS.answers, 'object', {});
  var done = answeredCount(answers);
  var hint = $('#resumeHint');
  if (hint) {
    if (savedSet && savedSet.length && done > 0 && done < savedSet.length) {
      hint.textContent = '↩️ 检测到未完成的' + modeConf(mode).label + '（已答 ' + done + ' / ' + savedSet.length + ' 题），点击开始即可继续';
      hint.classList.add('show');
    } else {
      hint.classList.remove('show');
    }
  }
}

function syncModeCards(mode) {
  $$('#modeCards .mode-card').forEach(function (card) {
    card.classList.toggle('active', card.getAttribute('data-mode') === mode);
  });
  var btn = $('#startBtn');
  if (btn) btn.textContent = '开始' + modeConf(mode).label + ' →';
  var meta = $('#startMeta');
  if (meta) {
    var conf = modeConf(mode);
    meta.textContent = conf.count + ' 题 · ' + conf.time + ' · ' + conf.desc;
  }
}

/* ============================================================
   答题页：进度、题目、选项、雷达图
   ============================================================ */
var testState = { answers: {}, set: [], index: 0, mode: DEFAULT_MODE, indicator: null };
var radarState = { cur: [50, 50, 50, 50], raf: null };

/* 题库查找与当前题 */
function findQuestion(id) {
  var bank = questionBank();
  for (var i = 0; i < bank.length; i++) { if (bank[i].id === id) return bank[i]; }
  return null;
}
function currentQuestion() { return findQuestion(testState.set[testState.index]) || null; }

function initTest() {
  var root = $('#page-test');
  if (!root) return;
  var migrated = ensureBankVersion();

  // 档位（只认字符串键名，防止被污染的存储把档位写成对象/数字）
  var savedMode = getStoreAs(STORAGE_KEYS.mode, 'string');
  testState.mode = MODES[savedMode] ? savedMode : DEFAULT_MODE;
  setStore(STORAGE_KEYS.mode, testState.mode);

  // 题序：优先恢复上次未完成的题序（必须是数组、id 仍存在、且题量与本档一致）
  var conf0 = modeConf(testState.mode);
  var needTotal = conf0.perDim * DIMS.length;
  var savedSet = getStoreAs(STORAGE_KEYS.set, 'array');
  var validSet = Array.isArray(savedSet) && savedSet.length === needTotal &&
    savedSet.every(function (id) { return findQuestion(id); }) &&
    new Set(savedSet).size === savedSet.length;
  if (!validSet) {
    testState.set = buildQuestionSet(testState.mode).map(function (q) { return q.id; });
    testState.answers = {};
    setStore(STORAGE_KEYS.set, testState.set);
    setStore(STORAGE_KEYS.answers, {});
  } else {
    testState.set = savedSet;
    /* 已答集合必须是普通对象：若被写成字符串/数字，点选项会在赋值处抛异常，
       页面表现为"点了没反应"，且永远不会自愈 */
    testState.answers = getStoreAs(STORAGE_KEYS.answers, 'object', {});
  }

  testState.finishing = false;      // 每次进入答题页重置交卷守卫（否则第二次测试永远交不了卷）
  var savedIdx = getStoreAs(STORAGE_KEYS.current, 'number');
  testState.index = (typeof savedIdx === 'number' && savedIdx >= 0 && savedIdx < testState.set.length) ? savedIdx : 0;

  // 档位徽章 + 总题数
  var badge = $('#modeBadge');
  if (badge) {
    badge.innerHTML = '<b>' + conf0.label + '</b> · ' + testState.set.length + ' 题 · ' + conf0.time;
  }
  var qTotalEl = $('#qTotal');
  if (qTotalEl) qTotalEl.textContent = testState.set.length;

  // 滑片指示器：随选中项滑动的高级感选项条
  var ind = document.createElement('span');
  ind.className = 'opt-indicator';
  $('#options').appendChild(ind);
  testState.indicator = ind;
  window.addEventListener('resize', positionIndicator);

  bindTestEvents();
  buildJumpGrid();
  renderQuestion(testState.index);
  updateProgress();
  updateLivePreview();

  // 雷达图初始绘制（用当前已答数据）
  var pcts = pctFromAnswers(testState.answers);
  radarState.cur = pcts.slice();
  drawRadar(pcts, false);

  if (migrated === false) toast('题库已升级到 v' + bankVersion() + '，已为你重新开始 ⚡');
}

/* 跳转到指定题目 */
function goTo(i) {
  if (i < 0 || i >= testState.set.length) return;
  testState.index = i;
  setStore(STORAGE_KEYS.current, i);
  renderQuestion(i);
  updateProgress();
}

/* 题号跳转网格 */
function buildJumpGrid() {
  var grid = $('#jumpGrid');
  if (!grid) return;
  grid.innerHTML = '';
  testState.set.forEach(function (id, i) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'jump-dot';
    b.textContent = i + 1;
    if (isAnswered(testState.answers[id])) b.classList.add('done');
    b.addEventListener('click', function () { goTo(i); });
    grid.appendChild(b);
  });
  highlightJump(testState.index);
}

function highlightJump(i) {
  $$('#jumpGrid .jump-dot').forEach(function (b, idx) {
    b.classList.toggle('current', idx === i);
  });
}

/* 深度测试里程碑提示（每 15 题一次） */
function showMilestone(done) {
  var el = $('#milestone');
  if (!el) return;
  var step = Math.floor(done / 15);
  var labels = ['E/I 外向-内向', 'S/N 实感-直觉', 'T/F 思考-情感', 'J/P 判断-感知'];
  if (!labels[step - 1]) return;
  el.textContent = '✦ 已完成 ' + done + ' 题 · ' + labels[step - 1] + ' 部分结束，继续就好 ✨';
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(function () { el.classList.remove('show'); }, 3200);
}

function bindTestEvents() {
  $('#prevBtn').addEventListener('click', function () { goTo(testState.index - 1); });
  $('#nextBtn').addEventListener('click', function () {
    var q = currentQuestion();
    if (q && (testState.answers[q.id] === undefined || testState.answers[q.id] === null)) {
      toast('先选一个答案再继续哦 😉');
      return;
    }
    if (testState.index === testState.set.length - 1) { finishTest(); return; }
    goTo(testState.index + 1);
  });
  $('#resetLink').addEventListener('click', function (e) {
    e.preventDefault();
    if (!confirm('确定要清空进度、重新开始吗？')) return;
    clearTestData();
    testState.answers = {};
    testState.set = buildQuestionSet(testState.mode).map(function (q) { return q.id; });
    setStore(STORAGE_KEYS.set, testState.set);
    setStore(STORAGE_KEYS.mode, testState.mode);
    setStore(STORAGE_KEYS.answers, {});
    buildJumpGrid();
    goTo(0);
    toast('已重新开始');
  });

  // 键盘快捷键：1-5 选择选项（5 = 不确定），← / → 切题
  document.addEventListener('keydown', function (e) {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (e.key >= '1' && e.key <= String(SCALE.length)) {
      var s = SCALE[Number(e.key) - 1];
      if (s) selectOption(s.val);
    } else if (e.key === 'ArrowLeft') {
      goTo(testState.index - 1);
    } else if (e.key === 'ArrowRight') {
      var btn = $('#nextBtn');
      if (btn) btn.click();
    }
  });
}

function renderQuestion(i) {
  var q = currentQuestion();
  if (!q) return;
  $('#qNum').textContent = '第 ' + (i + 1) + ' 题 · ' + DIM_LABELS[q.dim];
  $('#qText').textContent = q.text;
  $('#qCurrent').textContent = i + 1;

  // 重放卡片弹出动画
  var card = $('.q-card');
  card.style.animation = 'none';
  void card.offsetWidth; // 强制 reflow 以重启动画
  card.style.animation = '';

  var opts = $('#options');
  opts.innerHTML = '';
  var cur = testState.answers[q.id];
  SCALE.forEach(function (s, idx) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'opt';
    btn.setAttribute('data-val', s.val);
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', cur === s.val ? 'true' : 'false');
    btn.innerHTML = '<span class="opt-key">' + (idx + 1) + '</span>' +
      s.label + '<span class="opt-tag">' + s.tag + '</span>';
    if (cur === s.val) btn.classList.add('selected');
    btn.addEventListener('click', function () { selectOption(s.val); });
    opts.appendChild(btn);
  });
  // 重新挂载滑片指示器（innerHTML 重建会把它清掉）
  if (testState.indicator) opts.appendChild(testState.indicator);

  // 上一题按钮：第一题隐藏
  $('#prevBtn').style.visibility = i === 0 ? 'hidden' : 'visible';
  // 下一题按钮：最后一题变“查看结果”
  $('#nextBtn').textContent = i === testState.set.length - 1 ? '查看结果 ✨' : '下一题 →';

  highlightJump(i);
  positionIndicator();
}

function selectOption(val) {
  var q = currentQuestion();
  if (!q) return;
  /* 双保险：即使 answers 被外部写坏成非对象，这里也自愈而不是抛异常 */
  if (!testState.answers || typeof testState.answers !== 'object' || Array.isArray(testState.answers)) {
    testState.answers = {};
  }
  testState.answers[q.id] = val;
  if (!setStore(STORAGE_KEYS.answers, testState.answers)) warnStorageOnce();
  setStore(STORAGE_KEYS.current, testState.index);
  $$('.opt').forEach(function (b) {
    var on = Number(b.getAttribute('data-val')) === val;
    b.classList.toggle('selected', on);
    if (b.setAttribute) b.setAttribute('aria-checked', on ? 'true' : 'false');
  });
  positionIndicator();
  var dot = $$('#jumpGrid .jump-dot')[testState.index];
  if (dot) dot.classList.add('done');
  updateProgress();
  animateRadarTo(pctFromAnswers(testState.answers));
  if (testState.mode === 'deep' && (testState.index + 1) % 15 === 0) showMilestone(testState.index + 1);
}

/* 把滑片指示器定位到当前选中项 */
function positionIndicator() {
  var opts = $('#options');
  var ind = testState.indicator;
  if (!opts || !ind) return;
  var sel = opts.querySelector('.opt.selected');
  /* 选了"不确定"时不显示滑片：它不是一次表态，不该有类型色高亮 */
  if (!sel || sel.getAttribute('data-val') === '0') { ind.style.opacity = '0'; return; }
  var c = opts.getBoundingClientRect();
  var b = sel.getBoundingClientRect();
  ind.style.opacity = '1';
  ind.style.left = (b.left - c.left) + 'px';
  ind.style.top = (b.top - c.top) + 'px';
  ind.style.width = b.width + 'px';
  ind.style.height = b.height + 'px';
}

function updateProgress() {
  var total = testState.set.length || 1;
  var done = testState.set.filter(function (id) {
    return isAnswered(testState.answers[id]);
  }).length;
  $('#progressFill').style.width = (done / total * 100) + '%';
  /* #qDone 只写数字：外层 HTML 已有「已完成 … 题」文案，
     旧写法会把整句塞进 <b> 里，渲染成「已完成 已完成 17 / 64 题 题」 */
  $('#qDone').textContent = done + ' / ' + total;
  /* 无障碍：把进度暴露给读屏软件 */
  var track = $('#progressTrack');
  if (track && track.setAttribute) {
    track.setAttribute('aria-valuenow', String(done));
    track.setAttribute('aria-valuemax', String(total));
    track.setAttribute('aria-valuetext', '已完成 ' + done + ' / ' + total + ' 题');
  }
  updateLivePreview();
}

/* ---------- 实时画像预览（答题页底部内容区） ---------- */
function dimAnswered(answers, dim) {
  var n = 0;
  questionBank().forEach(function (q) {
    var v = answers[q.id];
    if (q.dim === dim && isAnswered(v)) n++;
  });
  return n;
}

function buildLiveBars() {
  var wrap = $('#liveBars');
  if (!wrap || wrap.children.length) return;
  DIMS.forEach(function (dim) {
    var row = document.createElement('div');
    row.className = 'live-bar';
    row.innerHTML =
      '<span class="lb-label">' + DIM_LABELS[dim] + '</span>' +
      '<div class="lb-track"><i class="lb-mid"></i><i class="lb-fill"></i></div>' +
      '<span class="lb-val">50%</span>';
    wrap.appendChild(row);
  });
}

function updateLivePreview() {
  var panel = $('#livePanel');
  if (!panel) return;
  buildLiveBars();

  var total = testState.set.length || 1;
  var res = computeResult(testState.answers, testState.mode);
  var done = res.answered;

  // 迷你四维条：宽度 = 次字母极占比（50% 为中立）
  $$('#liveBars .live-bar').forEach(function (row, i) {
    var d = res.dims[DIMS[i]];
    row.querySelector('.lb-fill').style.width = d.pctB + '%';
    row.querySelector('.lb-val').textContent = d.pctB + '%';
    row.classList.toggle('thin', d.answered < 3);
  });

  // 实时倾向字母（未答维度显示 ?，模糊维度显示双字母）
  var letters = DIMS.map(function (dim) {
    var d = res.dims[dim];
    if (dimAnswered(testState.answers, dim) === 0) return '?';
    return d.amb ? d.label : d.letter;
  });

  // 关键词云 + 助手气泡
  var chips = $('#liveChips');
  chips.innerHTML = '';
  var msg = bubbleMsg(done, total);
  var allAnswered = DIMS.every(function (dim) { return dimAnswered(testState.answers, dim) > 0; });

  if (allAnswered && res.type) {
    $('#liveLetters').textContent = res.letters.split('').join(' · ');
    res.type.tags.slice(0, 4).forEach(function (tag) {
      var s = document.createElement('span');
      s.className = 'live-chip';
      s.textContent = tag;
      chips.appendChild(s);
    });
    msg += ' 目前最像「' + res.type.zh + '」';
    if (done >= total * 0.5) msg += ' · 置信度 ' + res.overallConfidence + '%';
  } else {
    $('#liveLetters').textContent = letters.join(' · ');
    var ghost = document.createElement('span');
    ghost.className = 'live-chip ghost';
    ghost.textContent = done === 0 ? '答几题后，这里会浮现你的人格关键词' : '继续作答，画像越来越清晰…';
    chips.appendChild(ghost);
  }

  $('#liveBubble').textContent = msg;
}

function bubbleMsg(done, total) {
  if (!done) return '嘘——没有标准答案，凭第一直觉选 ✨';
  var p = done / (total || 1);
  if (p < 0.25) return '不错，你已经有一点点倾向了～';
  if (p < 0.5) return '雷达图正在悄悄变形状……';
  if (p < 0.75) return '过半啦！你的画像越来越清晰了 👀';
  if (p < 1) return '最后一公里，稳住！';
  return '收集完毕，准备揭晓！';
}

function finishTest() {
  if (testState.finishing) return;      // 幂等：连点"查看结果"只交卷一次
  var probe = computeResult(testState.answers, testState.mode, testState.set);
  /* 完成度门槛：某些维度一道都没计分、而另一些维度有数据时，那些空维度的字母
     只会是"默认次字母极"（score 0 → pctB 50 → letter = B），那是凭空得出的结论。
     拦住并跳到第一道未答题，避免"只答几题也能生成完整人格报告"。
     注意：四维**全部**没有计分数据（例如全选"不确定"）不算"部分作答"，
     此时应交由引擎如实走"框不住你"彩蛋页，而不是把人挡在门外。 */
  var scoredDims = DIMS.filter(function (d) { return probe.dims[d].scored > 0; });
  var emptyDims = DIMS.filter(function (d) { return probe.dims[d].scored === 0; });
  if (emptyDims.length && scoredDims.length) {
    var left = testState.set.filter(function (id) { return !isAnswered(testState.answers[id]); }).length;
    toast('还有 ' + left + ' 题未作答；请至少在每个维度作答一次');
    var next = -1;
    for (var i = 0; i < testState.set.length; i++) {
      if (!isAnswered(testState.answers[testState.set[i]])) { next = i; break; }
    }
    if (next >= 0) goTo(next);
    return;
  }
  testState.finishing = true;
  var res = probe;
  setStore(STORAGE_KEYS.result, res);
  markSeen(testState.set);          // 记录本次用过的题，下次开测优先换一批
  pushHistory(res);
  navigate('result.html');
}

/* ---------- 雷达图（Canvas） ---------- */
/* 实时百分比必须按"当前档位"计算（v3 修正：此前漏传档位，快速档会按深度档分母算） */
function pctFromAnswers(answers) {
  var temp = computeResult(answers,
    (typeof testState !== 'undefined' && testState.mode) || DEFAULT_MODE,
    (typeof testState !== 'undefined' && testState.set) || null);
  return DIMS.map(function (d) { return temp.dims[d].pctB; });
}

function drawRadar(pcts, withDots) {
  var canvas = $('#radar');
  if (!canvas) return;
  var dpr = window.devicePixelRatio || 1;
  var size = 230;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  var ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  var cx = size / 2, cy = size / 2, R = size / 2 - 30;
  var angles = [(-90), 0, 90, 180].map(function (deg) { return deg * Math.PI / 180; });

  ctx.clearRect(0, 0, size, size);

  // 网格环
  [25, 50, 75, 100].forEach(function (ring) {
    ctx.beginPath();
    for (var a = 0; a <= angles.length; a++) {
      var ang = angles[a % angles.length];
      var x = cx + Math.cos(ang) * (ring / 100) * R;
      var y = cy + Math.sin(ang) * (ring / 100) * R;
      a === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = 'rgba(108, 99, 255, 0.14)';
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  // 轴线
  angles.forEach(function (ang, i) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R);
    ctx.strokeStyle = 'rgba(108, 99, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 轴标签
    var lx = cx + Math.cos(ang) * (R + 18);
    var ly = cy + Math.sin(ang) * (R + 18);
    ctx.font = '700 12px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#6C63FF';
    ctx.fillText(DIM_LABELS[DIMS[i]], lx, ly);
  });

  // 数据多边形（带辉光）
  var grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, 'rgba(108, 99, 255, 0.55)');
  grad.addColorStop(1, 'rgba(0, 210, 211, 0.45)');

  ctx.beginPath();
  pcts.forEach(function (p, i) {
    var x = cx + Math.cos(angles[i]) * (p / 100) * R;
    var y = cy + Math.sin(angles[i]) * (p / 100) * R;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#6C63FF';
  ctx.lineWidth = 2.5;
  ctx.shadowColor = 'rgba(108, 99, 255, 0.65)';
  ctx.shadowBlur = 14;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // 数据点
  if (withDots !== false) {
    pcts.forEach(function (p, i) {
      var x = cx + Math.cos(angles[i]) * (p / 100) * R;
      var y = cy + Math.sin(angles[i]) * (p / 100) * R;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.shadowColor = 'rgba(108, 99, 255, 0.8)';
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#6C63FF';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  }
}

/* 雷达图补间动画：350ms 从当前值平滑过渡到目标值（减少动效时直接跳变） */
function animateRadarTo(target) {
  if (prefersReduced()) {
    radarState.cur = target.slice();
    drawRadar(target, true);
    return;
  }
  var from = radarState.cur.slice();
  var t0 = null;
  var duration = 350;

  function step(ts) {
    if (t0 === null) t0 = ts;
    var k = Math.min(1, (ts - t0) / duration);
    var eased = 1 - Math.pow(1 - k, 3); // easeOutCubic
    var now = from.map(function (v, i) { return v + (target[i] - v) * eased; });
    radarState.cur = now;
    drawRadar(now, true);
    if (k < 1) radarState.raf = requestAnimationFrame(step);
    else radarState.raf = null;
  }
  if (radarState.raf) cancelAnimationFrame(radarState.raf);
  radarState.raf = requestAnimationFrame(step);
}

/* ============================================================
   结果页：类型、仪表盘、描述、分享、搭档、彩蛋
   ============================================================ */
function initResult() {
  var root = $('#page-result');
  if (!root) return;

  var res = getStoreAs(STORAGE_KEYS.result, 'object');
  var answers = getStoreAs(STORAGE_KEYS.answers, 'object');
  /* 结构校验：被截断的 result（缺 dims、dims=null、letters 缺失）会让渲染层
     直接 TypeError 白屏。可用则用，不可用就用 answers 现算，仍不可用则给可读提示。 */
  var usableResult = function (r) {
    return !!r && typeof r.letters === 'string' && /^[EI][SN][TF][JP]$/.test(r.letters) &&
      !!r.dims && DIMS.every(function (d) {
        return r.dims[d] && typeof r.dims[d].pctB === 'number' && isFinite(r.dims[d].pctB);
      });
  };
  if (!usableResult(res) && answers && answeredCount(answers)) {
    res = computeResult(answers, getStoreAs(STORAGE_KEYS.mode, 'string') || DEFAULT_MODE,
      getStoreAs(STORAGE_KEYS.set, 'array'));
  }
  if (!usableResult(res) || answeredCount(answers || {}) === 0) {
    var mainBox = $('#resultMain');
    if (mainBox) {
      mainBox.innerHTML = '<div class="desc-card"><h2>结果数据不完整</h2>' +
        '<p class="desc-text">本地保存的结果读不出来（可能被浏览器清理或被其它程序改动）。' +
        '重新测一次只要几分钟 ✨</p>' +
        '<p><a class="btn btn-primary" href="index.html">返回首页重新测试</a></p></div>';
    }
    var eggBox = $('#easterCard');
    if (eggBox) eggBox.style.display = 'none';
    return;
  }

  // 本地完成人数 +1
  setStore(STORAGE_KEYS.completions, getStoreAs(STORAGE_KEYS.completions, 'number', 0) + 1);

  if (res.easterEgg) {
    $('#resultMain').style.display = 'none';
    $('#easterCard').style.display = 'block';
    renderEasterDims(res);
    bindEasterButtons();
    return;
  }

  renderResult(res);
}

/* 彩蛋页也给出信息：四个维度的实际落点（都贴中线才叫"框不住"） */
function renderEasterDims(res) {
  var box = $('#easterDims');
  if (!box) return;
  box.innerHTML = DIMS.map(function (dim) {
    var d = res.dims[dim];
    var lean = d.pctB >= 50 ? d.B : d.A;
    var dev = Math.abs(d.pctB - 50);
    return '<div class="ed-row">' +
      '<span class="ed-label">' + DIM_LABELS[dim] + '</span>' +
      '<div class="ed-track"><i style="left:' + Math.min(100, Math.max(0, d.pctB)) + '%"></i></div>' +
      '<span class="ed-val">' + d.pctB + '% <b>' + d.A + '</b>·<b>' + d.B + '</b></span>' +
      '<span class="ed-note">' + (dev <= 8 ? '几乎居中' : '略偏 ' + DIM_FULL[dim][d.pctB >= 50 ? 1 : 0]) + '</span>' +
      '</div>';
  }).join('');
}

function renderResult(res) {
  var t = res.type;
  if (!t) return;

  var extra = TYPE_EXTRA[res.letters] || {};

  // 类型主题色（对应 16P 四大气质群组配色）
  var rm = $('#resultMain');
  if (rm) {
    rm.style.setProperty('--tcolor', extra.color || '#6C63FF');
    rm.style.setProperty('--tcolor-ink', extra.ink || extra.color || '#4B43C7');
    rm.style.setProperty('--tcolor-soft', extra.soft || '#E7E4FF');
  }

  // 六边形类型徽章（内嵌四字母 + 角落 emoji）
  var emb = $('#typeEmblem');
  if (emb) {
    emb.innerHTML = emblemSVG(res.letters, extra.color) +
      '<span class="emblem-emoji">' + t.emoji + '</span>';
  }

  $('#typeZh').textContent = t.zh;
  $('#typeEn').textContent = extra.en || '';
  $('#typeQuote').textContent = extra.tagline ? '「' + extra.tagline + '」' : '';

  var tags = $('#tags');
  tags.innerHTML = '';
  t.tags.forEach(function (tag) {
    var s = document.createElement('span');
    s.className = 'tag';
    s.textContent = tag;
    tags.appendChild(s);
  });

  $('#descText').textContent = t.desc;
  $('#factText').textContent = t.fact;

  renderMetaBar(res);
  renderTraitBars(res);
  renderConfidence(res);
  renderReportSections(res);
  renderProfileSections(res);

  // 类型百科页入口（静态生成的 types/<code>.html）
  var tpl = $('#typePageLink');
  if (tpl) {
    tpl.setAttribute('href', 'types/' + res.letters.toLowerCase() + '.html');
    tpl.textContent = '📖 ' + res.letters + ' 完整档案';
  }

  /* 按钮只绑定一次，且始终作用于"最新一次渲染的结果"
     （避免重复 init 时监听器叠加、一次点击触发多次） */
  currentResult = res;
  bindResultActions();
}

var currentResult = null;
var resultActionsBound = false;

function bindResultActions() {
  if (resultActionsBound) return;
  resultActionsBound = true;
  $('#retestBtn').addEventListener('click', function () {
    clearTestData();
    navigate('index.html');
  });
  $('#shareBtn').addEventListener('click', function () { if (currentResult) buildShareCard(currentResult); });
  $('#shareNativeBtn').addEventListener('click', function () { if (currentResult) shareNative(currentResult); });
  $('#partnerBtn').addEventListener('click', function () { if (currentResult) openPartner(currentResult); });
  $('#copyBtn').addEventListener('click', function () { if (currentResult) copyShareText(currentResult); });
  $('#reportImgBtn').addEventListener('click', function () { if (currentResult) buildReportImage(currentResult); });
  $('#printBtn').addEventListener('click', function () { if (typeof window !== 'undefined') window.print(); });
}
/* ---------- 结果元信息条（档位 / 题量 / 题库版本 / 一致性） ---------- */
function renderMetaBar(res) {
  var el = $('#metaBar');
  if (!el) return;
  var conf = modeConf(res.mode);
  var parts = ['✦ ' + conf.label, res.answered + ' 题作答', '题库 v' + res.bankVersion];
  if (res.consistencyIssues > 0) parts.push('⚠️ ' + res.consistencyIssues + ' 组作答不一致');
  el.innerHTML = parts.map(function (s) {
    return '<span class="meta-chip">' + s + '</span>';
  }).join('');
}

/* ---------- 结果可靠度（逐维置信度） ---------- */
function renderConfidence(res) {
  var wrap = $('#confPanel');
  if (!wrap) return;

  var rows = DIMS.map(function (dim) {
    var d = res.dims[dim];
    var cls = d.confidence >= 70 ? 'high' : (d.confidence >= 45 ? 'mid' : 'low');
    /* 侧面一致性：各内容侧面（每维 5 个）是否指向同一端（分歧大 = 结果不稳） */
    var facetTxt = d.facetSummary + ' 侧面同向';
    var facetCls = d.facetAgreement >= 1 ? 'ok' : (d.facetAgreement >= 0.75 ? 'soso' : 'split');
    return '<div class="conf-row">' +
      '<span class="conf-label">' + DIM_LABELS[dim] + '</span>' +
      '<div class="conf-track"><i class="conf-fill ' + cls + '" data-w="' + d.confidence + '"></i></div>' +
      '<span class="conf-val">' + d.confidence + '%</span>' +
      '<span class="conf-letter">' + d.label + '</span>' +
      '</div>' +
      '<div class="conf-facets ' + facetCls + '"><span class="cf-tag">' + d.answered + '/' + d.total + ' 题</span>' +
      '<span class="cf-txt">' + facetTxt + '</span>' +
      (d.facetAgreement <= 0.5 ? '<span class="cf-warn">⚠️ 侧面分歧较大</span>' : '') +
      '</div>';
  }).join('');

  var note = res.overallConfidence >= 70
    ? '整体置信度 ' + res.overallConfidence + '%，这次结果的可参考度较高。'
    : (res.overallConfidence >= 45
      ? '整体置信度 ' + res.overallConfidence + '%，部分维度偏中间，建议 2 周后复测对照。'
      : '整体置信度 ' + res.overallConfidence + '%，这次作答偏中间或存在不一致，先当作一次参考。');
  if (res.consistencyIssues > 0) {
    note += ' 检测到 ' + res.consistencyIssues + ' 组语义相反的题目答案互相矛盾，可能说明你在这些维度上确实比较居中。';
  }

  wrap.innerHTML = '<h2>🎯 结果可靠度</h2>' + rows +
    '<p class="gc-text conf-note">' + note + '</p>';

  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      Array.prototype.forEach.call(wrap.querySelectorAll('.conf-fill'), function (f) {
        f.style.width = f.getAttribute('data-w') + '%';
      });
    });
  });
}

/* ---------- 六边形类型徽章（16P 风格） ---------- */
function emblemSVG(letters, color) {
  return '<svg viewBox="0 0 120 120" class="emblem-svg" aria-hidden="true">' +
    '<defs><linearGradient id="embGrad" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="' + color + '"/>' +
    '<stop offset="1" stop-color="#00D2D3"/>' +
    '</linearGradient></defs>' +
    '<polygon points="60,6 108,33 108,87 60,114 12,87 12,33" fill="url(#embGrad)" stroke="rgba(255,255,255,0.55)" stroke-width="2"/>' +
    '<polygon points="60,16 100,38 100,82 60,104 20,82 20,38" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1"/>' +
    '<text x="60" y="68" text-anchor="middle" font-family="Inter, sans-serif" font-size="24" font-weight="800" ' +
    'fill="#FFFFFF" letter-spacing="2">' + letters + '</text>' +
    '</svg>';
}

/* ---------- 特质总览（16P 风格双向条） ---------- */
function renderTraitBars(res) {
  var panel = $('#traitPanel');
  if (!panel) return;
  panel.innerHTML = '';

  DIMS.forEach(function (dim) {
    var d = res.dims[dim];
    var dominant = d.pctB >= 50 ? d.B : d.A;
    var domPct = d.pctB >= 50 ? d.pctB : 100 - d.pctB;

    var row = document.createElement('div');
    row.className = 'trait-row';
    row.innerHTML =
      '<span class="trait-label">' + DIM_FULL[dim][0] + ' <b>' + d.A + '</b></span>' +
      '<div class="trait-mid">' +
        '<div class="trait-track"><i class="trait-fill"></i><i class="trait-knob"></i></div>' +
        '<div class="trait-pct"><b>' + dominant + '</b> ' + domPct + '%' +
          (d.amb ? ' <i class="trait-amb">倾向模糊</i>' : '') +
        '</div>' +
      '</div>' +
      '<span class="trait-label right">' + DIM_FULL[dim][1] + ' <b>' + d.B + '</b></span>';
    panel.appendChild(row);

    // 填充与游标动画
    var fill = row.querySelector('.trait-fill');
    var knob = row.querySelector('.trait-knob');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        fill.style.width = d.pctB + '%';
        knob.style.left = d.pctB + '%';
      });
    });
  });
}

/* ---------- 报告分区（优势/劣势/职业/人生，16P 风格卡片流） ---------- */
function duoCard(a, b) {
  return '<div class="result-duo">' + a + b + '</div>';
}

function renderReportSections(res) {
  var wrap = $('#reportSections');
  if (!wrap) return;
  var g = TYPE_GROWTH[res.letters] || {};
  var extra = TYPE_EXTRA[res.letters] || {};
  var html = '';

  // 1. 优势 / 劣势
  html += duoCard(
    gcCard('⚡ 优势清单', gcBarRows(g.strengths, 'up', [90, 82, 74, 68])),
    gcCard('⚠️ 注意点', gcBarRows(g.weaknesses, 'down', [72, 64, 56]))
  );

  // 2. 内在驱动力
  html += gcCard('🧬 内在驱动力', '<p class="gc-text">' + (g.drive || '') + '</p>');

  // 3. 隐藏超能力 / 进阶修炼
  html += duoCard(
    gcCard('🦸 隐藏超能力', '<p class="gc-text">' + (extra.superpower || '') + '</p>'),
    gcCard('🧗 进阶修炼', '<p class="gc-text">' + (extra.growth || '') + '</p>')
  );

  // 4. 职业规划
  html += gcCard('💼 职业规划',
    '<p class="gc-text">' + (g.workStyle || '') + '</p>' +
    '<h3 class="gc-sub">🎯 推荐岗位</h3>' + gcChips(g.roles) +
    '<h3 class="gc-sub">📈 职业建议</h3>' + gcNumList(g.careerTips));

  // 5. 人生指导
  html += gcCard('🧭 人生指导',
    '<h3 class="gc-sub">🌱 成长方向</h3>' + gcNumList(g.lifeTips) +
    '<h3 class="gc-sub">🤝 人际相处</h3><p class="gc-text">' + (g.relationTip || '') + '</p>' +
    '<p class="gc-quote">「' + (extra.tagline || '') + '」</p>');

  wrap.innerHTML = html;

  // 进度条生长动画
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      var fills = wrap.querySelectorAll('.gc-fill');
      Array.prototype.forEach.call(fills, function (f) {
        f.style.width = f.getAttribute('data-lv') + '%';
      });
    });
  });
}

/* ============================================================
   结果页：关系与社交 / 压力下的你 / 更多画像 / 成长清单 / 历史对比
   （内容来自 data/profile.js 的 TYPE_PROFILE）
   ============================================================ */
function profileOf(letters) {
  return (typeof TYPE_PROFILE !== 'undefined' && TYPE_PROFILE[letters]) ? TYPE_PROFILE[letters] : null;
}

/* 历史记录：最近 10 次（用于复测对比） */
function pushHistory(res) {
  /* history 被外部写成数字/字符串时，`list.unshift` 会抛异常导致"永远无法交卷" */
  var list = getStoreAs(STORAGE_KEYS.history, 'array', []);
  if (!res || !res.letters || !res.dims || !DIMS.every(function (d) { return res.dims[d]; })) return;
  var entry = {
    t: Date.now(),
    mode: res.mode,
    letters: res.letters,
    dims: DIMS.map(function (d) { return res.dims[d].pctB; }),
    conf: res.overallConfidence
  };
  var last = list[0];
  if (last && last.mode === entry.mode && last.letters === entry.letters &&
      Math.abs((last.t || 0) - entry.t) < 3000) return; // 防重复
  list.unshift(entry);
  setStore(STORAGE_KEYS.history, list.slice(0, 10));
}

function fmtDate(ts) {
  var d = new Date(ts);
  function p(n) { return (n < 10 ? '0' : '') + n; }
  return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function renderProfileSections(res) {
  var p = profileOf(res.letters);
  renderRelations(p);
  renderStress(p);
  renderMore(p);
  renderChecklist(res, p);
  renderHistory(res);
}

/* ---------- 关系与社交（4 个场景切换） ---------- */
function renderRelations(p) {
  var card = $('#relCard');
  var tabs = $('#relTabs');
  var text = $('#relText');
  if (!card || !tabs || !text) return;
  var rel = (p && p.relations) || {};
  var labels = { love: '💗 恋爱', friend: '🤝 友谊', family: '🏠 家庭', work: '💼 职场' };
  var keys = Object.keys(labels).filter(function (k) { return rel[k]; });
  if (!keys.length) { card.style.display = 'none'; return; }
  tabs.innerHTML = '';
  function show(k) {
    text.textContent = rel[k] || '';
    $$('#relTabs .rel-tab').forEach(function (b) {
      var on = b.getAttribute('data-rel') === k;
      b.classList.toggle('active', on);
      if (b.setAttribute) b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }
  keys.forEach(function (k) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'rel-tab';
    b.setAttribute('data-rel', k);
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', 'false');
    b.textContent = labels[k];
    b.addEventListener('click', function () { show(k); });
    tabs.appendChild(b);
  });
  show(keys[0]);
}

/* ---------- 压力下的你 ---------- */
function renderStress(p) {
  var wrap = $('#stressGrid');
  var card = $('#stressCard');
  if (!wrap || !card) return;
  var s = (p && p.stress) || {};
  var rows = [
    ['🚨', '压力信号', s.signal],
    ['🌀', '典型反应', s.react],
    ['🌤️', '修复动作', s.recover]
  ].filter(function (r) { return r[2]; });
  if (!rows.length) { card.style.display = 'none'; return; }
  wrap.innerHTML = rows.map(function (r) {
    return '<div class="stress-item"><span class="si-ico">' + r[0] + '</span>' +
      '<div class="si-body"><b class="si-title">' + r[1] + '</b>' +
      '<p class="gc-text">' + r[2] + '</p></div></div>';
  }).join('');
}

/* ---------- 更多画像（沟通 / 团队 / 学习 / 金钱） ---------- */
function renderMore(p) {
  var wrap = $('#moreGrid');
  var card = $('#moreCard');
  if (!wrap || !card) return;
  var rows = [
    ['💬', '沟通风格', p && p.comm],
    ['🧩', '团队角色', p && p.team],
    ['📚', '学习风格', p && p.learn],
    ['💰', '金钱与决策', p && p.money]
  ].filter(function (r) { return r[2]; });
  if (!rows.length) { card.style.display = 'none'; return; }
  wrap.innerHTML = rows.map(function (r) {
    return '<div class="more-item"><b class="mi-title">' + r[0] + ' ' + r[1] + '</b>' +
      '<p class="gc-text">' + r[2] + '</p></div>';
  }).join('');
}

/* ---------- 成长清单（可勾选 + 本地进度） ---------- */
function renderChecklist(res, p) {
  var wrap = $('#checklist');
  if (!wrap) return;
  var items = (p && p.checklist) || [];
  if (!items.length) {
    var card = $('#checklistCard');
    if (card) card.style.display = 'none';
    return;
  }
  var key = res.letters;
  var all = getStoreAs(STORAGE_KEYS.checklist, 'object', {}) || {};
  var checked = all[key] || [];
  wrap.innerHTML = '';

  items.forEach(function (text, i) {
    var isDone = checked.indexOf(i) >= 0;
    var row = document.createElement('label');
    row.className = 'cl-item' + (isDone ? ' done' : '');
    row.innerHTML = '<input type="checkbox"' + (isDone ? ' checked' : '') + '>' +
      '<span class="cl-box" aria-hidden="true"></span>' +
      '<span class="cl-text">' + text + '</span>';
    row.querySelector('input').addEventListener('change', function (e) {
      var store = getStore(STORAGE_KEYS.checklist) || {};
      var arr = store[key] || [];
      var idx = arr.indexOf(i);
      if (e.target.checked && idx < 0) arr.push(i);
      if (!e.target.checked && idx >= 0) arr.splice(idx, 1);
      store[key] = arr;
      setStore(STORAGE_KEYS.checklist, store);
      row.classList.toggle('done', e.target.checked);
      updateChecklistProgress(key, items.length);
      if (arr.length === items.length) toast('六条全部打卡完成，厉害！🎉');
    });
    wrap.appendChild(row);
  });

  updateChecklistProgress(key, items.length);
}

function updateChecklistProgress(key, total) {
  var el = $('#clProgress');
  if (!el) return;
  var all = getStoreAs(STORAGE_KEYS.checklist, 'object', {}) || {};
  var arr = all[key] || [];
  var pct = total ? Math.round(arr.length / total * 100) : 0;
  el.textContent = arr.length + ' / ' + total + ' · ' + pct + '%';
}

/* ---------- 历史与复测对比 ---------- */
function renderHistory(res) {
  var wrap = $('#history');
  if (!wrap) return;
  var list = getStore(STORAGE_KEYS.history) || [];
  if (!list.length) {
    list = [{ t: Date.now(), mode: res.mode, letters: res.letters, dims: DIMS.map(function (d) { return res.dims[d].pctB; }), conf: res.overallConfidence }];
  }
  var cur = list[0];
  var prev = list[1];
  var html = '';

  if (prev) {
    html += '<div class="hist-delta">' + DIMS.map(function (dim, i) {
      var delta = (cur.dims[i] || 50) - (prev.dims[i] || 50);
      var arrow = delta > 0 ? '▲' : (delta < 0 ? '▼' : '—');
      var cls = delta > 0 ? 'up' : (delta < 0 ? 'down' : 'flat');
      return '<div class="hist-item"><span class="hi-dim">' + DIM_LABELS[dim] + '</span>' +
        '<span class="hi-val ' + cls + '">' + arrow + ' ' + Math.abs(delta) + '%</span></div>';
    }).join('') + '</div>';
    html += '<p class="gc-text">与上次（' + fmtDate(prev.t) + ' · ' + prev.letters + '）相比的维度变化。</p>';
  } else {
    html += '<p class="gc-text">这是你的第一条记录。隔 2-4 周再测一次，这里会显示维度变化趋势。</p>';
  }

  html += '<ol class="gc-list hist-list">' + list.slice(0, 5).map(function (h) {
    var conf = MODES[h.mode] ? MODES[h.mode].label : h.mode;
    return '<li><span class="hist-type">' + h.letters + '</span>' +
      '<span class="gc-li-text">' + fmtDate(h.t) + ' · ' + conf + ' · 置信度 ' + (h.conf || 0) + '%</span></li>';
  }).join('') + '</ol>';

  wrap.innerHTML = html;
}

/* ---------- 复制到剪贴板（统一入口） ---------- */
function copyToClipboard(text, okMsg) {
  function done(ok) { toast(ok ? (okMsg || '已复制 📋') : '复制失败，请手动复制'); }
  function legacy() {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    done(ok);
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () { done(true); }, legacy);
  } else {
    legacy();
  }
}

/* ---------- 原生分享（移动端） / 降级为复制 ---------- */
function shareNative(res) {
  var t = res.type;
  var extra = TYPE_EXTRA[res.letters] || {};
  var text = '我的 MBTI 是 ' + res.letters + '（' + t.zh + '）' +
    (extra.tagline ? '：' + extra.tagline : '') + ' 你也来测测看～';
  var url = location.origin + location.pathname.replace(/result\.html$/, 'index.html');
  if (navigator.share) {
    navigator.share({ title: 'MBTI 人格测试', text: text, url: url }).catch(function () { /* 用户取消 */ });
    return;
  }
  copyToClipboard(text + ' ' + url, '分享内容已复制 📋');
}

/* ---------- 分享人格卡片（原生 Canvas 绘制 PNG） ---------- */
function buildShareCard(res) {
  var t = res.type;
  if (!t) { toast('先测出结果才能保存哦'); return; }

  var W = 1080, H = 1440;
  var cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  var ctx = cv.getContext('2d');
  var font = '"PingFang SC","Microsoft YaHei",sans-serif';

  // 背景渐变
  var bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#6C63FF');
  bg.addColorStop(0.55, '#8B83FF');
  bg.addColorStop(1, '#4FC3F7');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // 装饰圆
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath(); ctx.arc(940, 180, 200, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(120, 1250, 260, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 0.1;
  ctx.beginPath(); ctx.arc(560, 720, 430, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;

  // 顶栏
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = '600 34px ' + font;
  ctx.fillText('✦ MBTI 人格实验室 ✦', W / 2, 130);

  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '400 30px ' + font;
  ctx.fillText('我的 MBTI 人格', W / 2, 185);

  // 类型字母（渐变字）
  ctx.font = '800 210px Inter,' + font;
  var lg = ctx.createLinearGradient(0, 340, W, 560);
  lg.addColorStop(0, '#FFFFFF');
  lg.addColorStop(1, '#C8EFFF');
  ctx.fillStyle = lg;
  ctx.fillText(res.letters, W / 2, 520);

  // emoji + 称号
  ctx.font = '90px serif';
  ctx.fillText(t.emoji, W / 2, 650);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 84px "KaiTi","STKaiti",cursive,' + font;
  ctx.fillText('「' + t.zh + '」', W / 2, 760);

  // 关键词 chips
  var chipY = 850;
  t.tags.forEach(function (tag, i) {
    ctx.font = '600 30px ' + font;
    var tw = ctx.measureText(tag).width + 56;
    var x = W / 2 + (i - (t.tags.length - 1) / 2) * (tw + 24);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    roundRect(ctx, x - tw / 2, chipY - 22, tw, 44, 22);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(tag, x, chipY + 4);
  });

  // 四维占比条
  var barY = 960, barW = 640, barH = 26, barX = (W - barW) / 2;
  DIMS.forEach(function (dim, i) {
    var d = res.dims[dim];
    var y = barY + i * 92;
    ctx.textAlign = 'left';
    ctx.font = '600 32px ' + font;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(d.A + ' / ' + d.B, barX, y);

    // 底条
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    roundRect(ctx, barX, y + 12, barW, barH, 13);
    ctx.fill();
    // 填充（以 pctB 为 B 极占比）
    var fw = Math.max(6, barW * d.pctB / 100);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    roundRect(ctx, barX, y + 12, fw, barH, 13);
    ctx.fill();
    // 百分比
    ctx.textAlign = 'right';
    ctx.font = '600 30px ' + font;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fillText(d.A + ' ' + (100 - d.pctB) + '%  ·  ' + d.B + ' ' + d.pctB + '%', W - barX, y);
  });

  // 底部（与四维占比条拉开间距，底部留白均衡）
  var conf = modeConf(res.mode);
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '500 32px ' + font;
  ctx.fillText(conf.label + ' · ' + conf.count + ' 题 · 发现你的人格密码', W / 2, H - 116);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '400 26px ' + font;
  ctx.fillText('MBTI 仅供参考，人格是流动的，别让标签定义你 😉', W / 2, H - 62);

  // 下载
  try {
    var url = cv.toDataURL('image/png');
    var a = document.createElement('a');
    a.href = url;
    a.download = '我的MBTI人格卡-' + res.letters + '.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast('人格卡片已保存 🎉');
  } catch (e) {
    toast('保存失败，请换个浏览器试试');
  }
}

/* ---------- 通用：下载画布 ---------- */
function downloadCanvas(cv, filename, okMsg) {
  var url = cv.toDataURL('image/png');
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  toast(okMsg || '已保存 🎉');
}

/* ============================================================
   完整报告长图（Canvas 两遍排版：先测量高度，再一次性绘制）
   白底 + 顶部渐变头图，适合保存/打印分享
   ============================================================ */
function buildReportImage(res) {
  try {
    var t = res.type;
    if (!t) { toast('先测出结果才能导出哦'); return; }
    var extra = TYPE_EXTRA[res.letters] || {};
    var g = TYPE_GROWTH[res.letters] || {};
    var p = profileOf(res.letters) || {};
    var conf = modeConf(res.mode);
    var COLOR = extra.color || '#6C63FF';
    var DARK = '#2D3436', SOFT = '#4A5361', MUTE = '#8A94A6';

    var W = 1080, PAD = 72, INNER = W - PAD * 2, GAP = 26, HEAD = 400;
    var FONT = '"PingFang SC","Microsoft YaHei",sans-serif';
    var scratch = document.createElement('canvas').getContext('2d');

    function measure(s, size, weight) {
      scratch.font = (weight || 500) + ' ' + size + 'px ' + FONT;
      var m = scratch.measureText ? scratch.measureText(s) : null;
      return (m && m.width) ? m.width : String(s).length * size * 0.58; // 无 measureText 时估算
    }
    function wrap(s, size, maxW, weight) {
      var out = [], line = '';
      String(s == null ? '' : s).split('').forEach(function (ch) {
        if (measure(line + ch, size, weight) > maxW && line) { out.push(line); line = ch; }
        else line += ch;
      });
      if (line) out.push(line);
      return out;
    }

    /* ---- 排板块：每块自带高度与绘制函数 ---- */
    var blocks = [];
    function push(h, draw) { blocks.push({ h: h, draw: draw }); }

    function pushTitle(title) {
      push(58, function (ctx, y) {
        ctx.textAlign = 'left';
        ctx.fillStyle = COLOR;
        ctx.font = '700 30px ' + FONT;
        ctx.fillText(title, PAD, y + 32);
        ctx.fillStyle = 'rgba(108,99,255,0.18)';
        ctx.fillRect(PAD, y + 46, INNER, 2);
      });
    }
    function pushText(text, opts) {
      opts = opts || {};
      var size = opts.size || 27;
      var lh = size * 1.75;
      var lines = wrap(text, size, INNER - (opts.indent || 0), 400);
      push(lines.length * lh, function (ctx, y) {
        ctx.textAlign = 'left';
        ctx.fillStyle = opts.mute ? MUTE : SOFT;
        ctx.font = '400 ' + size + 'px ' + FONT;
        lines.forEach(function (l, i) { ctx.fillText(l, PAD + (opts.indent || 0), y + lh * (i + 0.8)); });
      });
    }
    function pushList(items) {
      var size = 26, lh = size * 1.8, rows = [];
      (items || []).forEach(function (s) {
        wrap(s, size, INNER - 46, 500).forEach(function (l, i) { rows.push({ text: l, first: i === 0 }); });
      });
      push(rows.length * lh, function (ctx, y) {
        ctx.textAlign = 'left';
        rows.forEach(function (r, i) {
          var yy = y + lh * (i + 0.8);
          if (r.first) {
            ctx.fillStyle = COLOR;
            ctx.beginPath();
            ctx.arc(PAD + 8, yy - 9, 5, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = SOFT;
          ctx.font = '400 ' + size + 'px ' + FONT;
          ctx.fillText(r.text, PAD + 30, yy);
        });
      });
    }
    function pushTwoCol(leftTitle, leftItems, rightTitle, rightItems) {
      var size = 25, lh = size * 1.8, colW = (INNER - 40) / 2, rows = [];
      function pack(items) {
        var out = [];
        (items || []).forEach(function (s) {
          wrap(s, size, colW - 26, 500).forEach(function (l, i) { out.push({ text: l, first: i === 0 }); });
        });
        return out;
      }
      var L = pack(leftItems), R = pack(rightItems);
      var n = Math.max(L.length, R.length, 1);
      push(44 + n * lh, function (ctx, y) {
        ctx.textAlign = 'left';
        ctx.font = '700 26px ' + FONT;
        ctx.fillStyle = COLOR;
        ctx.fillText(leftTitle, PAD, y + 30);
        ctx.fillText(rightTitle, PAD + colW + 40, y + 30);
        [[L, PAD], [R, PAD + colW + 40]].forEach(function (pair) {
          pair[0].forEach(function (r, i) {
            var yy = y + 44 + lh * (i + 0.8);
            if (r.first) {
              ctx.fillStyle = 'rgba(108,99,255,0.55)';
              ctx.beginPath();
              ctx.arc(pair[1] + 8, yy - 9, 4, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.fillStyle = SOFT;
            ctx.font = '400 ' + size + 'px ' + FONT;
            ctx.fillText(r.text, pair[1] + 26, yy);
          });
        });
      });
    }
    function pushChips(items) {
      var size = 25, padX = 22, h = 54, rows = [[]], x = 0;
      (items || []).forEach(function (s) {
        var w = measure(s, size, 600) + padX * 2;
        if (x + w > INNER) { rows.push([]); x = 0; }
        rows[rows.length - 1].push({ text: s, w: w });
        x += w + 14;
      });
      push(rows.length * (h + 12), function (ctx, y) {
        ctx.textAlign = 'center';
        ctx.font = '600 ' + size + 'px ' + FONT;
        rows.forEach(function (row, ri) {
          var cx = PAD;
          row.forEach(function (c) {
            var yy = y + ri * (h + 12);
            ctx.fillStyle = 'rgba(108,99,255,0.10)';
            roundRect(ctx, cx, yy, c.w, h, 27);
            ctx.fill();
            ctx.fillStyle = COLOR;
            ctx.fillText(c.text, cx + c.w / 2, yy + 36);
            cx += c.w + 14;
          });
        });
      });
    }

    /* ---- 内容 ---- */
    pushTitle('特质总览');
    DIMS.forEach(function (dim) {
      var d = res.dims[dim];
      push(74, function (ctx, y) {
        ctx.textAlign = 'left';
        ctx.font = '600 25px ' + FONT;
        ctx.fillStyle = DARK;
        ctx.fillText(DIM_FULL[dim][0] + ' ' + d.A, PAD, y + 26);
        ctx.textAlign = 'right';
        ctx.fillText(DIM_FULL[dim][1] + ' ' + d.B, PAD + INNER, y + 26);
        var trackY = y + 42, trackH = 14;
        ctx.fillStyle = 'rgba(108,99,255,0.14)';
        roundRect(ctx, PAD, trackY, INNER, trackH, 7);
        ctx.fill();
        ctx.fillStyle = COLOR;
        roundRect(ctx, PAD, trackY, Math.max(8, INNER * d.pctB / 100), trackH, 7);
        ctx.fill();
        ctx.textAlign = 'center';
        ctx.font = '700 22px ' + FONT;
        ctx.fillStyle = MUTE;
        ctx.fillText(d.label + ' · ' + (d.pctB >= 50 ? d.pctB : 100 - d.pctB) + '%' + (d.amb ? '（倾向模糊）' : ''), PAD + INNER / 2, y + 72);
      });
    });

    pushTitle('结果可靠度');
    DIMS.forEach(function (dim) {
      var d = res.dims[dim];
      push(52, function (ctx, y) {
        ctx.textAlign = 'left';
        ctx.font = '600 25px ' + FONT;
        ctx.fillStyle = DARK;
        ctx.fillText(DIM_LABELS[dim], PAD, y + 30);
        var x0 = PAD + 110, w = INNER - 240;
        ctx.fillStyle = 'rgba(108,99,255,0.14)';
        roundRect(ctx, x0, y + 16, w, 12, 6);
        ctx.fill();
        ctx.fillStyle = d.confidence >= 70 ? '#00B894' : (d.confidence >= 45 ? COLOR : '#F5A623');
        roundRect(ctx, x0, y + 16, Math.max(6, w * d.confidence / 100), 12, 6);
        ctx.fill();
        ctx.textAlign = 'right';
        ctx.font = '700 24px ' + FONT;
        ctx.fillStyle = SOFT;
        ctx.fillText(d.confidence + '% · ' + d.label, PAD + INNER, y + 30);
      });
    });
    pushText('整体置信度 ' + res.overallConfidence + '%' + (res.consistencyIssues ? '（检出 ' + res.consistencyIssues + ' 组作答不一致）' : '') +
      ' · ' + conf.label + ' ' + res.answered + ' 题 · 题库 v' + res.bankVersion, { size: 24, mute: true });

    pushTitle('关于你'); pushText(t.desc);
    pushTitle('优势 · 注意点'); pushTwoCol('⚡ 优势', g.strengths, '⚠️ 注意', g.weaknesses);
    pushTitle('内在驱动力'); pushText(g.drive);
    pushTitle('隐藏超能力 · 进阶修炼'); pushTwoCol('🦸 超能力', [extra.superpower], '🧗 进阶', [extra.growth]);
    pushTitle('职业规划'); pushText(g.workStyle);
    pushText('推荐岗位', { size: 24, mute: true }); pushChips(g.roles);
    pushText('职业建议', { size: 24, mute: true }); pushList(g.careerTips);
    pushTitle('人生指导'); pushList(g.lifeTips);
    pushText('人际相处：' + (g.relationTip || ''));
    pushTitle('关系与社交');
    [['💗 恋爱', p.relations && p.relations.love], ['🤝 友谊', p.relations && p.relations.friend],
      ['🏠 家庭', p.relations && p.relations.family], ['💼 职场', p.relations && p.relations.work]]
      .forEach(function (row) { if (row[1]) pushText(row[0] + '：' + row[1]); });
    pushTitle('压力下的你');
    pushText('🚨 压力信号：' + ((p.stress && p.stress.signal) || ''));
    pushText('🌀 典型反应：' + ((p.stress && p.stress.react) || ''));
    pushText('🌤️ 修复动作：' + ((p.stress && p.stress.recover) || ''));
    pushTitle('更多画像');
    pushText('💬 沟通风格：' + (p.comm || ''));
    pushText('🧩 团队角色：' + (p.team || ''));
    pushText('📚 学习风格：' + (p.learn || ''));
    pushText('💰 金钱与决策：' + (p.money || ''));
    pushTitle('成长清单'); pushList(p.checklist);
    pushTitle('冷知识'); pushText(t.fact);

    /* ---- 计算总高并绘制 ---- */
    var bodyH = blocks.reduce(function (s, b) { return s + b.h + GAP; }, 0);
    var H = HEAD + PAD + bodyH + 150;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d');

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);
    var bg = ctx.createLinearGradient(0, 0, W, HEAD);
    bg.addColorStop(0, COLOR);
    bg.addColorStop(1, '#00D2D3');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, HEAD);

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '600 30px ' + FONT;
    ctx.fillText('✦ MBTI 人格实验室 · 完整报告 ✦', W / 2, 78);
    ctx.font = '800 120px Inter, ' + FONT;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(res.letters, W / 2, 208);
    ctx.font = '700 34px ' + FONT;
    ctx.fillText(t.zh + ' · ' + (extra.en || '') + ' · ' + (extra.group || ''), W / 2, 268);
    ctx.font = '400 26px ' + FONT;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText('「' + (extra.tagline || '') + '」', W / 2, 316);
    ctx.font = '500 24px ' + FONT;
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.fillText((t.tags || []).join(' · '), W / 2, 358);

    var y = HEAD + PAD;
    blocks.forEach(function (b) { b.draw(ctx, y); y += b.h + GAP; });

    ctx.textAlign = 'center';
    ctx.fillStyle = MUTE;
    ctx.font = '400 24px ' + FONT;
    ctx.fillText('MBTI 是偏好参考，不是科学判刑；人格是流动的，别让标签定义你', W / 2, H - 84);
    ctx.fillStyle = 'rgba(108,99,255,0.7)';
    ctx.font = '500 22px ' + FONT;
    ctx.fillText('shay-ckm.github.io/-mbti-test · 24 题快速档 / 64 题深度档', W / 2, H - 44);

    downloadCanvas(cv, '我的MBTI完整报告-' + res.letters + '.png', '完整报告长图已保存 🎉');
  } catch (e) {
    if (typeof console !== 'undefined' && console.error) console.error('导出完整报告长图失败:', e);
    toast('导出失败，请换个浏览器试试');
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ---------- 复制分享文案 ---------- */
function copyShareText(res) {
  var t = res.type;
  var extra = TYPE_EXTRA[res.letters] || {};
  var conf = modeConf(res.mode);
  var text = '我的 MBTI 是 ' + res.letters + '（' + t.zh + '）！' +
    (extra.tagline ? extra.tagline + ' ' : '') +
    '你也来测测看，' + conf.label + ' ' + conf.count + ' 题就能知道～';
  copyToClipboard(text, '分享文案已复制 📋');
}

/* ============================================================
   报告分区构建工具（图标卡片 / chips / 编号清单 / 进度条）
   ============================================================ */
function gcCard(title, inner) {
  return '<div class="gc-card"><h2>' + title + '</h2>' + inner + '</div>';
}
function gcChips(items) {
  return '<div class="gc-chips">' + (items || []).map(function (s) {
    return '<span class="gc-chip">' + s + '</span>';
  }).join('') + '</div>';
}
function gcNumList(items) {
  return '<ol class="gc-list">' + (items || []).map(function (s, i) {
    return '<li><span class="gc-num">' + (i + 1) + '</span><span class="gc-li-text">' + s + '</span></li>';
  }).join('') + '</ol>';
}
function gcBarRows(items, kind, levels) {
  var ico = kind === 'down' ? '⚠️' : '⚡';
  return '<ul class="gc-list">' + (items || []).map(function (s, i) {
    var lv = levels[i] || 70;
    return '<li class="gc-bar-row">' +
      '<span class="gc-ico">' + ico + '</span>' +
      '<div class="gc-bar-box"><span class="gc-bar-text">' + s + '</span>' +
      '<div class="gc-bar"><i class="gc-fill ' + kind + '" data-lv="' + lv + '"></i></div></div>' +
      '<b class="gc-bar-val">' + lv + '</b></li>';
  }).join('') + '</ul>';
}

/* ---------- 最佳搭档弹窗 ---------- */
var modalState = { lastFocus: null };

function openPartner(res) {
  var t = res.type;
  if (!t) return;
  var p = TYPES[t.partner];
  if (!p) return;

  $('#partnerEmoji').textContent = p.emoji;
  $('#partnerType').textContent = t.partner;
  $('#partnerZh').textContent = p.zh;
  $('#partnerText').innerHTML =
    '你们在最关键的维度上互补：<b>' + t.zh + '</b> 的' + t.trait + '，' +
    '恰好是 <b>' + p.zh + '</b> 最需要的另一块拼图。<br><br>' +
    p.blurb + '<br><br>TA 会点亮你忽略的那一面，你也会让 TA 看见世界的另一面。';

  /* 无障碍：记住触发元素、打开后把焦点移入弹窗 */
  modalState.lastFocus = document.activeElement;
  $('#partnerModal').classList.add('show');
  document.body.style.overflow = 'hidden';
  var closeBtn = $('#partnerClose');
  if (closeBtn && closeBtn.focus) closeBtn.focus();
}

function closePartner() {
  var modal = $('#partnerModal');
  if (!modal || !modal.classList.contains('show')) return;
  modal.classList.remove('show');
  document.body.style.overflow = '';
  /* 无障碍：把焦点还给打开弹窗的按钮 */
  if (modalState.lastFocus && modalState.lastFocus.focus) modalState.lastFocus.focus();
  modalState.lastFocus = null;
}

/* 无障碍：Tab 在弹窗内循环，不跑到背景内容里 */
function trapModalTab(e) {
  if (e.key !== 'Tab') return;
  var modal = $('#partnerModal');
  if (!modal || !modal.classList || !modal.classList.contains('show')) return;
  var nodes = modal.querySelectorAll
    ? Array.prototype.slice.call(modal.querySelectorAll('button, [href], input, select, textarea'))
    : [];
  nodes = nodes.filter(function (n) { return !n.disabled; });
  if (!nodes.length) return;
  var first = nodes[0], last = nodes[nodes.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

var modalBound = false;
function bindModalEvents() {
  if (modalBound) return;
  var closeBtn = $('#partnerClose');
  var modal = $('#partnerModal');
  if (!closeBtn || !modal) return; // 弹窗仅存在于结果页
  modalBound = true;
  closeBtn.addEventListener('click', closePartner);
  modal.addEventListener('click', function (e) {
    if (e.target === this) closePartner();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closePartner();
    else trapModalTab(e);
  });
}

/* ---------- 彩蛋页 ---------- */
var easterBound = false;
function bindEasterButtons() {
  if (easterBound) return;
  easterBound = true;
  $('#easterRetest').addEventListener('click', function () {
    clearTestData();
    navigate('test.html');
  });
  $('#easterHome').addEventListener('click', function () {
    clearTestData();
    navigate('index.html');
  });
}

/* ============================================================
   关系匹配矩阵（16×16）
   ------------------------------------------------------------
   不硬编码 256 组文案，而是按"维度级规则"组合：
   - 同极 → 共同点 + 该极特有的小提醒
   - 异极 → 互补点 + 具体相处方法（这正是摩擦发生的地方）
   再叠加相似度（同极数/4）、互补维度数、经典互补搭档判定。
   ============================================================ */
var RELATION_RULES = {
  EI: {
    label: 'E/I 外向-内向',
    same: {
      E: '你们都在人群里充电：热闹是共同燃料。要留意别把日程排得太满，谁都不肯先喊停。',
      I: '你们都靠独处回血：相处安静舒服。但两个人都不主动时，关系容易慢慢降温，需要有人定期发起。'
    },
    diff: '一个从人群充电、一个从独处回血。约定"电量规则"：外向方照常社交，但给内向方留出提前离场与独处的时间，而不是要求全程陪同。'
  },
  SN: {
    label: 'S/N 实感-直觉',
    same: {
      S: '你们都关注具体事实：沟通高效、落地能力强。小心一起只看眼前，漏掉长期变化。',
      N: '你们都爱聊可能性：想法碰撞很过瘾。容易一起飘在空中，需要有个人负责把它变成第一步。'
    },
    diff: '一个看细节、一个看可能性。先对齐"我们在解决哪个问题"：实感方先给事实与数据，直觉方先给方向与愿景，别互贴"你想太多""你太死板"。'
  },
  TF: {
    label: 'T/F 思考-情感',
    same: {
      T: '你们都先讲逻辑：讨论问题干脆利落。要留意情绪需求常没被说出口——讲道理不等于被理解。',
      F: '你们都先顾及感受：相处温柔体贴。也容易因为都不想伤害对方而回避真问题，甚至互相传染情绪。'
    },
    diff: '一个先讲逻辑、一个先讲感受。表达公式：逻辑方先认可情绪（"我理解你难受"）再谈对错；情感方直接说出需求（"我现在要安慰，不要方案"）。'
  },
  JP: {
    label: 'J/P 判断-感知',
    same: {
      J: '你们都爱计划：确定性强、执行力好。小心两个人都固执于原方案，缺少临场调整的余地。',
      P: '你们都随性：相处轻松自在。但截止日期、账单、行程这类必须有人管的事，容易被一起拖着走。'
    },
    diff: '一个要计划、一个要弹性。把安排分成"硬约束"（必须遵守）和"软安排"（随时可改），出发前说好可改动范围，减少"你太死板""你太随意"的摩擦。'
  }
};

function computeRelation(a, b) {
  var res = {
    a: a, b: b, shared: [], differ: [],
    sameCount: 0, score: 0, complementary: 0, golden: false,
    common: [], complement: [], cautions: [], tips: []
  };
  DIMS.forEach(function (dim, i) {
    var poleA = a[i], poleB = b[i];
    if (poleA === poleB) {
      res.shared.push({ dim: dim, pole: poleA });
      res.common.push('【' + RELATION_RULES[dim].label + ' · 同向 ' + poleA + '】' + RELATION_RULES[dim].same[poleA]);
      res.cautions.push(RELATION_RULES[dim].same[poleA]);
    } else {
      res.differ.push({ dim: dim, a: poleA, b: poleB });
      res.complement.push('【' + RELATION_RULES[dim].label + ' · ' + poleA + ' × ' + poleB + '】' + RELATION_RULES[dim].diff);
    }
  });
  res.sameCount = res.shared.length;
  res.complementary = res.differ.length;
  res.score = Math.round(res.sameCount / DIMS.length * 100);
  /* 经典互补搭档：partner 字段在 TYPES 上（TYPE_EXTRA 只存展示类信息） */
  var ta = TYPES[a] || {}, tb = TYPES[b] || {};
  res.golden = (ta.partner === b) || (tb.partner === a);

  /* 四维全异时没有任何"同向"提醒，补一条通用雷区，避免结果卡片空白
     （common/complement 保持纯维度语义，由 UI 在为空时给兜底文案） */
  if (!res.cautions.length) {
    res.cautions.push('四个维度全部相反：你们几乎没有"默认共识"，摩擦通常来自节奏差异，而不是谁对谁错。');
  }

  /* 三条可执行建议：优先针对差异维度，再按相似度给一条总的 */
  res.differ.slice(0, 2).forEach(function (d) {
    res.tips.push('先处理 ' + d.dim + ' 这个差异：' + RELATION_RULES[d.dim].diff.split('。')[1] + '。');
  });
  if (res.sameCount >= 3) {
    res.tips.push('你们很像（相似度 ' + res.score + '%）：默契是优势，但要留意形成"回音室"——定期引入外部视角或第三方意见。');
  } else if (res.sameCount <= 1) {
    res.tips.push('你们差异较大（相似度 ' + res.score + '%）：互补潜力高、摩擦也会多，把"节奏协商"摆到明面上，比忍着更省事。');
  } else {
    res.tips.push('你们在"像"与"不像"之间比较平衡：把差异当分工用（谁擅长什么就负责什么），比要求对方改变更有效。');
  }
  return res;
}

var relationState = { a: null, b: null, active: 'a' };

function initRelationPage() {
  var root = $('#page-relation');
  if (!root) return;

  var grid = $('#relPickGrid');
  if (grid) {
    grid.innerHTML = '';
    DIMS_ORDER_TYPES.forEach(function (code) {
      var t = TYPES[code], e = TYPE_EXTRA[code] || {};
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'type-nav-item';
      b.setAttribute('data-code', code);
      b.setAttribute('aria-label', code + ' ' + t.zh + ' 人格类型');
      b.setAttribute('aria-pressed', 'false');
      b.style.setProperty('--tcolor', e.color || '#6C63FF');
      b.style.setProperty('--tcolor-ink', e.ink || e.color || '#4B43C7');
      b.innerHTML = '<b>' + code + '</b><span>' + t.zh + '</span>';
      b.addEventListener('click', function () { pickType(code); });
      grid.appendChild(b);
    });
  }

  ['#relSlotA', '#relSlotB'].forEach(function (sel, idx) {
    var el = $(sel);
    if (el) el.addEventListener('click', function () {
      relationState.active = idx === 0 ? 'a' : 'b';
      updateRelationSlots();
    });
  });

  var rnd = $('#relRandom');
  if (rnd) rnd.addEventListener('click', function () {
    var x = DIMS_ORDER_TYPES[Math.floor(Math.random() * 16)];
    var y = DIMS_ORDER_TYPES[Math.floor(Math.random() * 16)];
    while (y === x) y = DIMS_ORDER_TYPES[Math.floor(Math.random() * 16)];
    relationState.a = x; relationState.b = y;
    updateRelationSlots();
    renderRelationResult();
  });

  buildRelationMatrix();
  updateRelationSlots();
}

function pickType(code) {
  relationState[relationState.active] = code;
  if (relationState.active === 'a' && !relationState.b) relationState.active = 'b';
  else if (relationState.active === 'b' && !relationState.a) relationState.active = 'a';
  updateRelationSlots();
  if (relationState.a && relationState.b) renderRelationResult();
}

function updateRelationSlots() {
  var a = relationState.a, b = relationState.b;
  var slotA = $('#relSlotA'), slotB = $('#relSlotB');
  if (slotA) {
    slotA.classList.toggle('active', relationState.active === 'a');
    slotA.innerHTML = '<span class="slot-label">A</span><b class="slot-type">' + (a ? a + ' · ' + TYPES[a].zh : '未选择') + '</b>';
  }
  if (slotB) {
    slotB.classList.toggle('active', relationState.active === 'b');
    slotB.innerHTML = '<span class="slot-label">B</span><b class="slot-type">' + (b ? b + ' · ' + TYPES[b].zh : '未选择') + '</b>';
  }
  var hint = $('#relHint');
  if (hint) {
    hint.textContent = (a && b) ? '' :
      '正在选择 ' + (relationState.active === 'a' ? 'A' : 'B') + ' 类型：点下面的类型，或点矩阵里的格子';
  }
  $$('#relPickGrid .type-nav-item').forEach(function (el) {
    var code = el.getAttribute('data-code');
    var chosen = (code === a || code === b);
    el.classList.toggle('active', chosen);
    if (el.setAttribute) el.setAttribute('aria-pressed', chosen ? 'true' : 'false');
  });
}

function renderRelationResult() {
  var wrap = $('#relResult');
  if (!wrap || !relationState.a || !relationState.b) return;
  var res = computeRelation(relationState.a, relationState.b);
  var ta = TYPES[res.a], tb = TYPES[res.b];
  var ea = TYPE_EXTRA[res.a] || {}, eb = TYPE_EXTRA[res.b] || {};
  var list = items => '<ul class="gc-list">' + items.map(s =>
    '<li><span class="gc-ico">✦</span><span class="gc-li-text">' + s + '</span></li>').join('') + '</ul>';

  wrap.innerHTML =
    '<div class="gc-card">' +
      '<div class="rel-duo-head">' +
        '<a class="rel-side" href="types/' + res.a.toLowerCase() + '.html" style="--tcolor:' + (ea.color || '#6C63FF') + ';--tcolor-ink:' + (ea.ink || ea.color || '#4B43C7') + '">' +
          '<b>' + res.a + '</b><span>' + ta.zh + '</span></a>' +
        '<span class="rel-vs">×</span>' +
        '<a class="rel-side" href="types/' + res.b.toLowerCase() + '.html" style="--tcolor:' + (eb.color || '#6C63FF') + ';--tcolor-ink:' + (eb.ink || eb.color || '#4B43C7') + '">' +
          '<b>' + res.b + '</b><span>' + tb.zh + '</span></a>' +
      '</div>' +
      '<div class="rel-stats">' +
        '<div class="rel-stat"><span>相似度</span><b>' + res.score + '%</b>' +
          '<div class="rel-bar"><i style="width:' + res.score + '%"></i></div></div>' +
        '<div class="rel-stat"><span>互补维度</span><b>' + res.complementary + ' / 4</b></div>' +
        (res.golden ? '<div class="rel-stat golden"><span>经典互补搭档</span><b>💞</b></div>' : '') +
      '</div>' +
      (res.golden ? '<p class="gc-text">按常见配对观点，你们属于互补型组合：一个补上对方忽略的一面。</p>' : '') +
    '</div>' +
    '<div class="gc-card"><h2>🤝 共同点</h2>' +
      (res.common.length ? list(res.common) : '<p class="gc-text">四个维度全部相反——你们几乎没有"默认共识"，默契需要刻意建立。</p>') +
    '</div>' +
    '<div class="gc-card"><h2>🔀 差异与互补</h2>' +
      (res.complement.length ? list(res.complement) : '<p class="gc-text">四个维度完全一致，沟通成本很低，但要注意别互相强化盲区。</p>') +
    '</div>' +
    '<div class="gc-card"><h2>⚠️ 容易踩的坑</h2>' + list(res.cautions) + '</div>' +
    '<div class="gc-card"><h2>✅ 三条相处建议</h2>' + list(res.tips) + '</div>';
}

function buildRelationMatrix() {
  var box = $('#relMatrix');
  if (!box) return;
  var html = '<table class="rel-table"><thead><tr><th class="corner">A \\ B</th>';
  DIMS_ORDER_TYPES.forEach(function (c) { html += '<th>' + c + '</th>'; });
  html += '</tr></thead><tbody>';
  DIMS_ORDER_TYPES.forEach(function (ra) {
    html += '<tr><th class="row-head">' + ra + '</th>';
    DIMS_ORDER_TYPES.forEach(function (cb) {
      var same = 0;
      for (var i = 0; i < 4; i++) { if (ra[i] === cb[i]) same++; }
      html += '<td><button type="button" class="rel-cell s' + same + '" data-a="' + ra + '" data-b="' + cb + '" ' +
        'aria-label="' + ra + ' × ' + cb + '：四个维度中 ' + same + ' 个同向，查看这一对的相处指南" ' +
        'title="' + ra + ' × ' + cb + '：相似 ' + same + '/4">' + same + '</button></td>';
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  box.innerHTML = html;
  $$('#relMatrix .rel-cell').forEach(function (btn) {
    btn.addEventListener('click', function () {
      relationState.a = btn.getAttribute('data-a');
      relationState.b = btn.getAttribute('data-b');
      relationState.active = 'a';
      updateRelationSlots();
      renderRelationResult();
      var out = $('#relResult');
      if (out && out.scrollIntoView) out.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

/* 16 型固定展示顺序（与类型页生成器保持一致） */
var DIMS_ORDER_TYPES = ['INTJ', 'INTP', 'ENTJ', 'ENTP', 'INFJ', 'INFP', 'ENFJ', 'ENFP',
  'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ', 'ISTP', 'ISFP', 'ESTP', 'ESFP'];

/* 注册 Service Worker（离线可用）
   仅在 http(s) 下生效：file:// 直接双击打开时静默跳过，不影响任何功能 */
function initServiceWorker() {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return;
  if (typeof location === 'undefined' || !location.protocol) return;
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
  navigator.serviceWorker.register('sw.js').catch(function () { /* 静默失败 */ });
}

/* ============================================================
   页面分发
   ============================================================ */
function init() {
  if (typeof document === 'undefined') return;
  initTransitions();
  initCursorGlow();
  initServiceWorker();
  stampBuild();
  var id = document.body && document.body.id;
  if (id === 'page-home') initHome();
  else if (id === 'page-test') initTest();
  else if (id === 'page-result') initResult();
  else if (id === 'page-relation') initRelationPage();
  bindModalEvents();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}

/* 供 Node 自动化测试导出 */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    /* 数据（题库来自 data/questions.js，画像来自 data/profile.js） */
    TYPES: TYPES, TYPE_EXTRA: TYPE_EXTRA, TYPE_GROWTH: TYPE_GROWTH,
    TYPE_PROFILE: (typeof TYPE_PROFILE !== 'undefined') ? TYPE_PROFILE : null,
    SCALE: SCALE, DIMS: DIMS, DIM_LABELS: DIM_LABELS, DIM_FULL: DIM_FULL,
    MODES: MODES, DEFAULT_MODE: DEFAULT_MODE,
    /* 引擎 */
    questionBank: questionBank,
    bankVersion: bankVersion,
    modeConf: modeConf,
    buildQuestionSet: buildQuestionSet,
    modeItems: function () { return questionBank(); },
    modePerDim: modePerDim,
    sampleDimItems: sampleDimItems,
    distribute: distribute,
    computeResult: computeResult,
    answeredCount: answeredCount,
    computeRelation: computeRelation,
    RELATION_RULES: RELATION_RULES,
    TYPE_CODES: DIMS_ORDER_TYPES,
    /* 页面入口（供 DOM 冒烟测试） */
    init: init
  };
}
