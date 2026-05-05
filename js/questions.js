const QUESTIONS = [
  // 第一部分：外向 (E) vs 内向 (I) —— 注意力方向与精力来源
  {
    id: 1, dimensionLabel: 'E/I', dimensionGroup: 0,
    text: '经过一周忙碌的工作，你更倾向于如何恢复精力？',
    icon: '🌀',
    options: { A: '约朋友聚餐或参加热闹的活动', B: '独自在家看书、看电影或发呆' }
  },
  {
    id: 2, dimensionLabel: 'E/I', dimensionGroup: 0,
    text: '在社交场合中，你通常是：',
    icon: '👥',
    options: { A: '说话者，主动与人攀谈，享受成为焦点', B: '倾听者，更愿意一对一深入交流，人多了容易累' }
  },
  {
    id: 3, dimensionLabel: 'E/I', dimensionGroup: 0,
    text: '当你思考一个问题时，你更喜欢：',
    icon: '🤝',
    options: { A: '边想边说，通过谈话把思路理清', B: '先在脑子里想清楚，想好了再说' }
  },
  {
    id: 4, dimensionLabel: 'E/I', dimensionGroup: 0,
    text: '你的朋友圈形态更接近：',
    icon: '💭',
    options: { A: '广泛交友，很多不同圈子的熟人', B: '知心深交，只有少数几个密友' }
  },
  {
    id: 5, dimensionLabel: 'E/I', dimensionGroup: 0,
    text: '在团队项目中，你通常：',
    icon: '🌐',
    options: { A: '喜欢头脑风暴，和大家一起讨论激荡灵感', B: '喜欢先自己研究，有成熟想法后再和大家讨论' }
  },
  // 第二部分：实感 (S) vs 直觉 (N) —— 信息获取方式
  {
    id: 6, dimensionLabel: 'S/N', dimensionGroup: 1,
    text: '看说明书或学习新技能时，你更看重：',
    icon: '📚',
    options: { A: '具体的、一步步的操作步骤和实例', B: '先理解背后的原理和未来可能的应用' }
  },
  {
    id: 7, dimensionLabel: 'S/N', dimensionGroup: 1,
    text: '你更容易被哪种人所吸引？',
    icon: '🎯',
    options: { A: '脚踏实地、务实靠谱、细节周到的人', B: '充满想象力、点子多、喜欢谈论未来的人' }
  },
  {
    id: 8, dimensionLabel: 'S/N', dimensionGroup: 1,
    text: '在阅读小说或看电影时，你更关注：',
    icon: '🔍',
    options: { A: '情节是否连贯、细节是否真实、结局是否合理', B: '隐喻象征是什么、带给我什么新奇的感受和灵感' }
  },
  {
    id: 9, dimensionLabel: 'S/N', dimensionGroup: 1,
    text: '领导交给你一项任务，但没有明确方法，你通常会：',
    icon: '📖',
    options: { A: '参照之前成功的案例和经验去做', B: '尝试用一种全新的、没人用过的方法去做' }
  },
  {
    id: 10, dimensionLabel: 'S/N', dimensionGroup: 1,
    text: '你觉得自己更偏向于：',
    icon: '🗺',
    options: { A: '实践家，动手能力很强，活在当下', B: '梦想家，经常憧憬未来，有很多灵感闪现' }
  },
  // 第三部分：思考 (T) vs 情感 (F) —— 决策判断方式
  {
    id: 11, dimensionLabel: 'T/F', dimensionGroup: 2,
    text: '当朋友向你倾诉烦恼时，你第一反应通常是：',
    icon: '⚖️',
    options: { A: '帮他分析问题的原因，找解决办法', B: '先共情他的情绪，安慰他"我理解你的感受"' }
  },
  {
    id: 12, dimensionLabel: 'T/F', dimensionGroup: 2,
    text: '做重大决定时，你更依赖：',
    icon: '📊',
    options: { A: '逻辑分析，权衡利弊，追求公平公正', B: '内心价值观，考虑人际感受，追求和谐' }
  },
  {
    id: 13, dimensionLabel: 'T/F', dimensionGroup: 2,
    text: '你更容易被哪种评价所触动？',
    icon: '🗣️',
    options: { A: '你真的很能干，逻辑清晰，思维敏锐', B: '你真的很好，很贴心，和你相处很舒服' }
  },
  {
    id: 14, dimensionLabel: 'T/F', dimensionGroup: 2,
    text: '当你看到社会新闻里冲突双方的故事时，你更容易：',
    icon: '🏆',
    options: { A: '先看谁对谁错，规则和逻辑上谁站得住脚', B: '感觉两边都有苦衷，难以做出绝对判断' }
  },
  {
    id: 15, dimensionLabel: 'T/F', dimensionGroup: 2,
    text: '在团队合作中，你最无法忍受的是：',
    icon: '👑',
    options: { A: '逻辑混乱，效率低下，反复做无用功', B: '氛围冷漠，勾心斗角，人情味淡薄' }
  },
  // 第四部分：判断 (J) vs 感知 (P) —— 生活态度与外部世界组织方式
  {
    id: 16, dimensionLabel: 'J/P', dimensionGroup: 3,
    text: '关于旅行计划，你更倾向于：',
    icon: '📋',
    options: { A: '提前几个月定好机票酒店，排好每天的行程', B: '大概定个方向，到了再说，喜欢随遇而安的惊喜' }
  },
  {
    id: 17, dimensionLabel: 'J/P', dimensionGroup: 3,
    text: '你的工作或学习环境通常是：',
    icon: '📅',
    options: { A: '整洁有序，物归原位，做事有清单', B: '看似混乱但自己知道东西在哪，deadline前效率最高' }
  },
  {
    id: 18, dimensionLabel: 'J/P', dimensionGroup: 3,
    text: '当你有很多任务需要处理时，你更喜欢：',
    icon: '⏰',
    options: { A: '列好计划，按部就班，做完一件是一件', B: '随性而为，看哪件有兴趣或紧急就先做哪件' }
  },
  {
    id: 19, dimensionLabel: 'J/P', dimensionGroup: 3,
    text: '你更倾向于哪种生活方式？',
    icon: '🎯',
    options: { A: '有规律，有规划，喜欢确定性和掌控感', B: '自由灵活，喜欢开放和尝试各种可能性' }
  },
  {
    id: 20, dimensionLabel: 'J/P', dimensionGroup: 3,
    text: '在 deadline 临近时，你通常是：',
    icon: '📜',
    options: { A: '早早完成，留出时间检查，从容不迫', B: '最后一刻冲刺，压力下效率最高，虽迟但到' }
  }
];
