const TYPES_DATA = [
  {
    type_code: "INTJ", type_name: "建筑师", category: "分析家",
    slogan: "深谋远虑的战略家，永远在构建更好的系统。",
    profile: "他们思维严谨、独立性强，天生擅长将复杂概念转化为长期计划。外表冷静，内心却燃烧着实现愿景的强烈驱动力。",
    strengths: ["战略眼光", "系统化思维", "坚定的执行力"],
    blind_spots: ["过于追求完美，可能忽略人际细节和他人的情感需求。"],
    career_suggestions: ["战略规划", "科研", "法律", "金融分析"],
    growth_advice: "学会欣赏他人的情感表达方式，不要总是用逻辑衡量一切。适当放松对完美的追求，允许自己和他人犯错。主动与不同性格的人交流，拓宽思维视角。",
    famous_figures: ["埃隆·马斯克", "尼采", "克里斯托弗·诺兰"],
    relationship_advice: "INTJ 在关系中需要学会表达脆弱，让对方感受到信任。记住：并非所有人都需要被'优化'，有时倾听本身就是最好的支持。"
  },
  {
    type_code: "INTP", type_name: "逻辑学家", category: "分析家",
    slogan: "永不停歇的分析者，痴迷于探索万物运行的原理。",
    profile: "他们热爱理论模型，享受逻辑自洽带来的智力愉悦。外表随和，但讨论到感兴趣的话题时会变得异常专注。",
    strengths: ["逻辑推理", "创造性思维", "客观中立"],
    blind_spots: ["容易陷入过度思考，行动力可能跟不上想法的迭代。"],
    career_suggestions: ["哲学", "计算机科学", "学术研究", "数据分析"],
    growth_advice: "将想法落地的能力比追求完美更重要，尝试完成一个不完美的项目。多关注现实世界的细节，不要只沉迷于抽象理论。",
    famous_figures: ["阿尔伯特·爱因斯坦", "勒内·笛卡尔", "比尔·盖茨"],
    relationship_advice: "INTP 需要记住：人际关系不是需要解决的方程。试着分享你的情感而非只有想法，这会让身边的人感到更亲近。"
  },
  {
    type_code: "ENTJ", type_name: "指挥官", category: "分析家",
    slogan: "天生的领袖，善于将远见转化为执行力。",
    profile: "他们果断、坦率，享受制定计划和带领团队达成目标的过程。善于发现系统中的低效点并迅速优化。",
    strengths: ["领导力", "决策力", "目标导向"],
    blind_spots: ["有时过于强势，可能忽视不同意见的价值。"],
    career_suggestions: ["企业管理", "项目管理", "创业", "政治"],
    growth_advice: "在追求效率的同时，关注团队成员的情感需求。学会倾听不同意见，即使它们看起来低效。耐心是一种可以培养的力量。",
    famous_figures: ["史蒂夫·乔布斯", "玛格丽特·撒切尔", "拿破仑·波拿巴"],
    relationship_advice: "ENTJ 的强势有时会压倒身边的人。练习'先理解再被理解'，在关系中留出柔软的空间。"
  },
  {
    type_code: "ENTP", type_name: "辩手", category: "分析家",
    slogan: "思维的冒险家，乐于挑战一切既有观念。",
    profile: "他们思维敏捷，享受智力交锋的乐趣。对新事物永远保持好奇，擅长在看似无关的概念间建立连接。",
    strengths: ["创新思维", "应变能力", "口才出众"],
    blind_spots: ["容易喜新厌旧，坚持执行长期计划是挑战。"],
    career_suggestions: ["创业", "市场营销", "创意策划", "辩论"],
    growth_advice: "培养跟进到底的韧性，不要在每个新想法面前转移注意力。学会欣赏日常的重复性工作，它们也有其价值。",
    famous_figures: ["列奥纳多·达·芬奇", "托马斯·爱迪生", "马克·吐温"],
    relationship_advice: "ENTP 热爱辩论，但并非所有人都享受智力交锋。学会分辨什么时候该争论，什么时候该陪伴。"
  },
  {
    type_code: "INFJ", type_name: "提倡者", category: "外交家",
    slogan: "洞察人心的理想主义者，quietly shaping the future。",
    profile: "他们既有深刻的直觉，又有关怀他人的温情。善于理解复杂的情感暗流，并致力于帮助他人找到人生意义。",
    strengths: ["深刻的洞察力", "共情能力", "价值观驱动"],
    blind_spots: ["容易过度付出，需要独处来恢复能量。"],
    career_suggestions: ["心理咨询", "教育", "人力资源", "非营利组织"],
    growth_advice: "保护自己的能量边界，不要试图拯救所有人。将理想转化为可执行的小步骤，避免因目标太大而陷入无力感。",
    famous_figures: ["马丁·路德·金", "圣母特蕾莎", "卡尔·荣格"],
    relationship_advice: "INFJ 需要找到既能深入交流又不会耗尽自己的节奏。并非每段关系都需要拯救，有时轻松的陪伴也很珍贵。"
  },
  {
    type_code: "INFP", type_name: "调停者", category: "外交家",
    slogan: "内敛的理想主义者，守护内心的价值花园。",
    profile: "他们温和、敏感，始终在探寻\"什么才是真正重要的\"。善于用文字或艺术表达深刻的情感，希望世界变得更温暖。",
    strengths: ["创造力", "真诚", "适应力强"],
    blind_spots: ["冲突回避倾向，可能因过于理想化而感到失望。"],
    career_suggestions: ["写作", "艺术创作", "社会工作", "用户体验设计"],
    growth_advice: "学会将理想与现实和解，在保持价值观的同时接纳世界的不完美。培养完成任务的执行力，不要让完美主义阻碍行动。",
    famous_figures: ["J·R·R·托尔金", "安徒生", "梵高"],
    relationship_advice: "INFP 在关系中需要勇敢表达自己的需求，而不是一味迁就。你的感受很重要，表达不是冲突，而是真诚的开始。"
  },
  {
    type_code: "ENFJ", type_name: "主人公", category: "外交家",
    slogan: "富有感染力的教育家，善于激发他人潜能。",
    profile: "他们天生善于理解他人情绪，并乐于提供支持和引导。擅长协调团队关系，让每个人都感觉被看见、被重视。",
    strengths: ["沟通力", "激励他人", "组织协调"],
    blind_spots: ["容易把他人的问题揽为己有，忽略自我照顾。"],
    career_suggestions: ["教育", "咨询", "公共关系", "人力资源管理"],
    growth_advice: "关注自己的需求同样重要，不要把所有精力都用于帮助他人。学会拒绝，保护自己的情感能量。",
    famous_figures: ["纳尔逊·曼德拉", "奥普拉·温弗瑞", "孔子"],
    relationship_advice: "ENFJ 需要警惕过度付出带来的疲惫。真正健康的关系是双向的，允许别人照顾你，而不是永远做给予者。"
  },
  {
    type_code: "ENFP", type_name: "竞选者", category: "外交家",
    slogan: "热情的探索者，在人群中点燃灵感的火花。",
    profile: "他们充满好奇心，热爱可能性，善于发现每个人身上的闪光点。自发性与热情极具感染力，是天生的社交催化剂。",
    strengths: ["热情", "创意", "洞察他人潜力"],
    blind_spots: ["容易分心，在细节执行和日常琐事上需要支持。"],
    career_suggestions: ["创意策划", "市场营销", "媒体", "咨询"],
    growth_advice: "培养专注和坚持的习惯，选择一个方向深入下去。学会享受独处，在安静中沉淀自己的思考。",
    famous_figures: ["沃尔特·迪士尼", "罗宾·威廉姆斯", "马克·吐温"],
    relationship_advice: "ENFP 的热情极具感染力，但要注意不要因为追求新鲜感而忽略已有的深厚关系。承诺是需要坚守的。"
  },
  {
    type_code: "ISTJ", type_name: "物流师", category: "守护者",
    slogan: "务实可靠的守护者，用秩序构建稳定。",
    profile: "他们认真负责，尊重事实和既有规则。做事有条不紊，承诺过的事一定会做到，是团队中值得信赖的基石。",
    strengths: ["责任心", "条理性", "执行力强"],
    blind_spots: ["在快速变化的环境中，可能需要时间适应新方法。"],
    career_suggestions: ["财务", "行政管理", "法律", "工程技术"],
    growth_advice: "尝试接受不确定性和变化，并非所有事情都需要按计划进行。多关注他人的情感需求，规则之外还有人情。",
    famous_figures: ["乔治·华盛顿", "维多利亚女王", "沃伦·巴菲特"],
    relationship_advice: "ISTJ 的爱体现在行动和承诺中。偶尔用言语表达情感，会让身边的人更直接地感受到你的关心。"
  },
  {
    type_code: "ISFJ", type_name: "守护者", category: "守护者",
    slogan: "默默付出的守护者，用行动表达关怀。",
    profile: "他们温和细致，善于记住对他人的承诺和重要细节。乐于通过实实在在的帮助，让身边的人感到温暖。",
    strengths: ["细致周到", "奉献精神", "强大的观察力"],
    blind_spots: ["不太善于拒绝，容易忽视自己的需求。"],
    career_suggestions: ["护理", "教育", "行政支持", "图书馆学"],
    growth_advice: "学会设立个人边界，过度付出不是爱自己的方式。尝试表达自己的真实想法，你的需求同样值得被重视。",
    famous_figures: ["特蕾莎修女", "碧昂丝", "大卫·贝克汉姆"],
    relationship_advice: "ISFJ 需要记住：照顾好自己才能更好地照顾别人。学会接受别人的帮助，而不是总做付出的一方。"
  },
  {
    type_code: "ESTJ", type_name: "总经理", category: "守护者",
    slogan: "高效的执行者，让规则和秩序落地。",
    profile: "他们果断务实，相信清晰的标准和流程能带来高效。善于组织资源和人手，推动项目按计划完成。",
    strengths: ["组织能力", "决策力", "以身作则"],
    blind_spots: ["可能对不符合既有规则的新想法缺乏耐心。"],
    career_suggestions: ["企业管理", "军事", "执法", "项目管理"],
    growth_advice: "对新想法保持开放态度，不是所有传统方式都是最好的。在坚持原则的同时，学会体谅他人的感受。",
    famous_figures: ["宋太宗赵光义", "亨利·福特", "Judge Judy"],
    relationship_advice: "ESTJ 的直率有时会被误解为冷漠。在表达意见之前，先考虑对方的感受，效率不是关系的全部。"
  },
  {
    type_code: "ESFJ", type_name: "执政官", category: "守护者",
    slogan: "热心的组织者，让社群充满人情味。",
    profile: "他们友善尽责，乐于为他人服务。擅长记住每个人的喜好，是节日聚会、团队活动的天然组织者。",
    strengths: ["人际敏感度", "责任心", "乐于助人"],
    blind_spots: ["对批评比较敏感，需要被认可和肯定。"],
    career_suggestions: ["销售", "客户服务", "活动策划", "护理"],
    growth_advice: "学会独立做决定，不要过度依赖他人的认可。培养自己的判断力，不是所有人都需要满意。",
    famous_figures: ["泰勒·斯威夫特", "比尔·克林顿", "玛丽亚·凯莉"],
    relationship_advice: "ESFJ 需要平衡取悦他人和照顾自己。你的价值不取决于别人对你的评价，真正的朋友爱的是真实的你。"
  },
  {
    type_code: "ISTP", type_name: "鉴赏家", category: "探险家",
    slogan: "冷静的实操者，用双手理解世界。",
    profile: "他们善于观察，喜欢动手解决具体问题。危机时刻异常冷静，擅长使用工具，享受掌握一门手艺的乐趣。",
    strengths: ["动手能力", "冷静应变", "逻辑分析"],
    blind_spots: ["不擅长表达情感，可能显得过于疏离。"],
    career_suggestions: ["工程技术", "法医", "机械操作", "体育"],
    growth_advice: "练习长远规划，不要只活在当下。尝试用言语表达内心的感受，让他人更了解你的世界。",
    famous_figures: ["李小龙", "克林特·伊斯特伍德", "迈克尔·乔丹"],
    relationship_advice: "ISTP 在关系中需要主动分享自己的内心世界。行动胜于言语固然好，但偶尔的语言表达能让关系更深入。"
  },
  {
    type_code: "ISFP", type_name: "探险家", category: "探险家",
    slogan: "温柔的艺术家，用感官体验当下的美好。",
    profile: "他们谦逊敏感，享受通过色彩、声音、质感来表达内心。活在当下，善于发现平凡生活中的细微之美。",
    strengths: ["审美力", "共情力", "灵活适应"],
    blind_spots: ["回避冲突，可能不太愿意为自己的价值发声。"],
    career_suggestions: ["艺术创作", "设计", "园艺", "护理"],
    growth_advice: "勇敢为自己的价值发声，你的声音和别人一样重要。培养面对冲突的能力，回避不会让问题消失。",
    famous_figures: ["迈克尔·杰克逊", "大卫·鲍伊", "宫崎骏"],
    relationship_advice: "ISFP 用艺术和行动表达爱，但也要学会用语言让对方明白你的心意。适度的自我表露让关系更亲密。"
  },
  {
    type_code: "ESTP", type_name: "企业家", category: "探险家",
    slogan: "行动派的问题解决者，在实战中学习。",
    profile: "他们精力充沛，灵活应变。关注眼前的实际机会，善于谈判、说服，享受在动态环境中解决问题的快感。",
    strengths: ["应变力", "说服力", "实操能力"],
    blind_spots: ["可能忽视长期规划，追求即时的成果。"],
    career_suggestions: ["销售", "创业", "市场营销", "应急响应"],
    growth_advice: "关注长期目标，不要总是追逐眼前的刺激。学会在行动之前多思考一步，避免冲动带来的后果。",
    famous_figures: ["唐纳德·特朗普", "欧内斯特·海明威", "麦当娜"],
    relationship_advice: "ESTP 的魅力在于 spontaneity，但要记住承诺和责任感是维系长久关系的基础。"
  },
  {
    type_code: "ESFP", type_name: "表演者", category: "探险家",
    slogan: "活力的源泉，让每一刻都充满乐趣。",
    profile: "他们热情开朗，乐于分享，是气氛的调节者。喜欢用生动的方式表达自己，善于把枯燥的事情变得有趣。",
    strengths: ["感染力", "乐观精神", "人际敏锐"],
    blind_spots: ["不太喜欢理论性强的长期规划，需要即时的反馈。"],
    career_suggestions: ["演艺", "主持", "旅游", "少儿教育"],
    growth_advice: "培养对理论性事务的耐心，不是所有事情都能即时满足。学会制定计划并执行，为未来做好准备。",
    famous_figures: ["猫王", "玛丽莲·梦露", "威尔·史密斯"],
    relationship_advice: "ESFP 是气氛的创造者，但也要学会在安静中陪伴。不是每时每刻都需要精彩，平淡中的真诚也很珍贵。"
  }
];

const CATEGORY_META = {
  "分析家": { headerBg: "#0b2a3e", accent: "#6ab0d6" },
  "外交家": { headerBg: "#1a4a3e", accent: "#6bc4a8" },
  "守护者": { headerBg: "#3d3a1a", accent: "#d4b86a" },
  "探险家": { headerBg: "#3d251a", accent: "#d48a6a" }
};

const DIMENSION_NAMES = {
  E: "外向", I: "内向",
  S: "实感", N: "直觉",
  T: "思考", F: "情感",
  J: "判断", P: "感知"
};
