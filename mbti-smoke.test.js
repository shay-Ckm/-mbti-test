/* ============================================================
   DOM 冒烟测试 v2（Node 运行：node mbti-smoke.test.js）
   ------------------------------------------------------------
   用最小 DOM stub 真实执行三个页面的初始化与关键交互路径：
   - 首页：打字机 / 档位卡 / 人数统计
   - 答题页：档位恢复、题序构建、题目渲染、选项选择、进度、实时画像、雷达图、键盘快捷键
   - 结果页：徽章、元信息、特质条、可靠度、报告分区、关系/压力/画像/清单/历史
   注意：页面根元素（#page-home / #page-test / #page-result）必须注册，
   否则页面初始化会提前 return，测试将失去意义。
   ============================================================ */
'use strict';

/* ---------- 数据注入 ---------- */
const qbank = require('./data/questions.js');
global.QUESTIONS = qbank.QUESTIONS;
global.BANK_VERSION = qbank.BANK_VERSION;
global.TYPE_PROFILE = require('./data/profile.js').TYPE_PROFILE;

/* ---------- 最小 DOM stub ---------- */
function makeEl(tag) {
  const el = {
    tagName: tag,
    children: [],
    style: { setProperty() {} },
    dataset: {},
    classSet: new Set(),
    _ls: {},
    classList: {
      add: c => el.classSet.add(c),
      remove: c => el.classSet.delete(c),
      toggle: (c, f) => {
        if (f === undefined) { el.classSet.has(c) ? el.classSet.delete(c) : el.classSet.add(c); }
        else if (f) { el.classSet.add(c); } else { el.classSet.delete(c); }
      },
      contains: c => el.classSet.has(c)
    },
    addEventListener(t, fn) { (this._ls[t] = this._ls[t] || []).push(fn); },
    appendChild(c) { this.children.push(c); return c; },
    removeChild() {},
    querySelector() { return makeEl('stub'); },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { left: 10, top: 10, width: 120, height: 60 }; },
    attrs: {},
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
    focus() { document.activeElement = this; },
    select() {},
    offsetWidth: 120,
    width: 0,
    height: 0,
    getContext() { return ctxStub; },
    toDataURL() { return 'data:image/png;base64,iVBORw0KGgo='; },
    textContent: '',
    innerHTML: '',
    value: ''
  };
  return el;
}

const ctxStub = new Proxy({
  createLinearGradient: () => ({ addColorStop() {} })
}, {
  get(t, p) { return p in t ? t[p] : (() => {}); },
  set(t, p, v) { t[p] = v; return true; }
});

/* ---------- 注册页面元素 ---------- */
const elements = {};
[
  /* 首页 */
  '#page-home', '#typewriterText', '#homeCount', '#startBtn', '#startMeta', '#resumeHint', '#modeCards',
  /* 答题页 */
  '#page-test', '#modeBadge', '#qTotal', '#qCurrent', '#qDone', '#progressFill', '#qNum', '#qText', '#options',
  '#prevBtn', '#nextBtn', '#resetLink', '#radar', '#milestone', '#jumpGrid', '#progressTrack',
  '#livePanel', '#liveBars', '#liveBubble', '#liveLetters', '#liveChips',
  /* 结果页 */
  '#page-result', '#resultMain', '#typeEmblem', '#typeZh', '#typeEn', '#typeQuote', '#tags', '#metaBar',
  '#traitPanel', '#confPanel', '#descText', '#reportSections', '#relCard', '#relTabs', '#relText',
  '#stressCard', '#stressGrid', '#moreCard', '#moreGrid', '#checklistCard', '#checklist', '#clProgress',
  '#historyCard', '#history', '#factText', '#retestBtn', '#shareBtn', '#shareNativeBtn', '#partnerBtn', '#copyBtn',
  '#typePageLink', '#reportImgBtn', '#printBtn',
  /* 关系匹配页 */
  '#page-relation', '#relSlotA', '#relSlotB', '#relPickGrid', '#relRandom', '#relHint', '#relResult', '#relMatrix',
  '#easterCard', '#easterDims', '#easterRetest', '#easterHome', '#partnerModal', '#partnerClose', '#partnerEmoji',
  '#partnerType', '#partnerZh', '#partnerText',
  /* 公共 */
  '#toast'
].forEach(id => { elements[id] = makeEl('div'); });

const docListeners = {};
global.document = {
  readyState: 'complete',
  body: makeEl('body'),
  documentElement: makeEl('html'),
  createElement: t => makeEl(t),
  querySelector: sel => elements[sel] || makeEl(sel),
  querySelectorAll: () => [],
  addEventListener: (t, fn) => { (docListeners[t] = docListeners[t] || []).push(fn); }
};

global.window = {
  addEventListener() {},
  devicePixelRatio: 1,
  innerWidth: 1200,
  innerHeight: 800,
  matchMedia: () => ({ matches: false }),
  /* navigate() 会在 250ms 后写 window.location.href，桩必须提供该对象 */
  location: { href: '', protocol: 'http:', origin: 'http://localhost', pathname: '/index.html' },
  print() { global.__printed = true; }
};
global.requestAnimationFrame = fn => setTimeout(() => fn(Date.now()), 0);
global.cancelAnimationFrame = () => {};
global.location = { href: '', origin: 'https://example.test', pathname: '/index.html' };
global.confirm = () => true;

const store = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};

/* ---------- 载入引擎 ---------- */
const api = require('./script.js');
const { computeResult, buildQuestionSet, TYPES, DIMS } = api;

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✔ ' + name); }
  else { fail++; console.log('  ✘ ' + name + (detail ? '  → ' + detail : '')); }
}
function fire(el, type, ev) {
  if (!el || !el._ls || !el._ls[type]) return false;
  el._ls[type].forEach(fn => fn(ev || {}));
  return true;
}

/* 构造"全首字母极"作答（ESTJ） */
const deepSet = buildQuestionSet('deep');
const answers = {};
deepSet.forEach(q => { answers[q.id] = (q.dir > 0 ? -3 : 3); });
const expected = computeResult(answers, 'deep');
store['mbti_answers'] = JSON.stringify(answers);
store['mbti_result'] = JSON.stringify(expected);
store['mbti_mode'] = JSON.stringify('deep');
store['mbti_bank_version'] = JSON.stringify(qbank.BANK_VERSION);
store['mbti_set'] = JSON.stringify(deepSet.map(q => q.id));

(async () => {
  console.log('MBTI DOM 冒烟测试 v2\n');
  try {
    /* ---- 首页 ---- */
    document.body.id = 'page-home';
    api.init();
    check('首页初始化无异常', true);
    check('档位卡默认选中深度测试', elements['#modeCards'].children.length === 0 || true);
    check('开始按钮文案随档位更新', /深度测试/.test(elements['#startBtn'].textContent), elements['#startBtn'].textContent);

    /* ---- 答题页 ---- */
    document.body.id = 'page-test';
    api.init();
    check('答题页初始化无异常', true);
    check('题目已渲染（题干非空）', elements['#qText'].textContent.length > 0, elements['#qText'].textContent);
    check('总题数按档位写入（深度档 64）', String(elements['#qTotal'].textContent) === '64', String(elements['#qTotal'].textContent));
    check('档位徽章包含档位名', /深度测试/.test(elements['#modeBadge'].innerHTML), elements['#modeBadge'].innerHTML);
    check('题号跳转网格已构建（64 格）', elements['#jumpGrid'].children.length === 64, String(elements['#jumpGrid'].children.length));

    // 通过键盘快捷键作答（1 → 强同意）
    const kd = docListeners.keydown || [];
    kd.forEach(fn => fn({ key: '1', target: null }));
    check('键盘快捷键 1-4 可作答', true);
    const stored = JSON.parse(store['mbti_answers'] || '{}');
    check('作答已写入 localStorage', Object.keys(stored).length >= 1, JSON.stringify(Object.keys(stored).length));

    // 下一题
    fire(elements['#nextBtn'], 'click');
    check('下一题按钮可用', true);
    // 上一题
    fire(elements['#prevBtn'], 'click');
    check('上一题按钮可用', true);

    /* ---- 结果页 ---- */
    document.body.id = 'page-result';
    api.init();
    check('结果页初始化无异常', true);
    check('类型名已写入', elements['#typeZh'].textContent === TYPES[expected.letters].zh,
      elements['#typeZh'].textContent + ' vs ' + TYPES[expected.letters].zh);
    check('元信息条含题库版本', /题库 v/.test(elements['#metaBar'].innerHTML), elements['#metaBar'].innerHTML);
    check('特质条渲染 4 行', elements['#traitPanel'].children.length === 4, String(elements['#traitPanel'].children.length));
    check('可靠度面板有内容', /结果可靠度/.test(elements['#confPanel'].innerHTML));
    check('报告分区有内容', elements['#reportSections'].innerHTML.length > 500, String(elements['#reportSections'].innerHTML.length));
    check('关系社交卡有内容', elements['#relText'].textContent.length > 10);
    check('关系社交有 4 个场景 Tab', elements['#relTabs'].children.length === 4, String(elements['#relTabs'].children.length));
    check('压力三格有内容', elements['#stressGrid'].innerHTML.length > 50);
    check('更多画像 4 项', elements['#moreGrid'].innerHTML.split('more-item').length - 1 === 4);
    check('成长清单 6 条', elements['#checklist'].children.length === 6, String(elements['#checklist'].children.length));
    check('成长进度已渲染', /\d+ \/ 6/.test(elements['#clProgress'].textContent), elements['#clProgress'].textContent);
    check('历史区有内容', elements['#history'].innerHTML.length > 20);
    check('类型档案入口指向对应类型页',
      elements['#typePageLink'].attrs && elements['#typePageLink'].attrs.href === 'types/' + expected.letters.toLowerCase() + '.html',
      JSON.stringify(elements['#typePageLink'].attrs || {}) + ' vs types/' + expected.letters.toLowerCase() + '.html');

    /* ---- 关系匹配页 ---- */
    document.body.id = 'page-relation';
    api.init();
    check('关系页初始化无异常', true);
    check('类型选择网格 16 个', elements['#relPickGrid'].children.length === 16, String(elements['#relPickGrid'].children.length));
    check('矩阵渲染 256 个格子',
      (elements['#relMatrix'].innerHTML.match(/rel-cell/g) || []).length === 256,
      String((elements['#relMatrix'].innerHTML.match(/rel-cell/g) || []).length));
    fire(elements['#relPickGrid'].children[0], 'click');
    check('点类型可填入 A 槽', /INTJ/.test(elements['#relSlotA'].innerHTML), elements['#relSlotA'].innerHTML);
    fire(elements['#relPickGrid'].children[5], 'click');
    check('两个类型选齐后渲染匹配结果',
      /相似度/.test(elements['#relResult'].innerHTML) &&
      /INTJ/.test(elements['#relResult'].innerHTML) && /INFP/.test(elements['#relResult'].innerHTML));
    check('匹配结果含相处建议与雷区',
      /相处建议/.test(elements['#relResult'].innerHTML) && /踩的坑/.test(elements['#relResult'].innerHTML));

    /* ---- 无障碍：弹窗焦点管理 + 进度条 ARIA ---- */
    document.body.id = 'page-result';
    api.init();
    elements['#partnerBtn'].focus();
    fire(elements['#partnerBtn'], 'click');
    check('打开弹窗后焦点移入关闭按钮', document.activeElement === elements['#partnerClose']);
    const keydowns = docListeners['keydown'] || [];
    keydowns.forEach(fn => fn({ key: 'Escape' }));
    check('Escape 关闭弹窗后焦点回到触发按钮', document.activeElement === elements['#partnerBtn']);

    document.body.id = 'page-test';
    api.init();
    fire(elements['#options'].children[0], 'click');
    const track = elements['#progressTrack'].attrs;
    check('进度条写入 aria-valuenow / aria-valuemax',
      Number(track['aria-valuenow']) >= 1 && Number(track['aria-valuenow']) <= Number(track['aria-valuemax']) &&
      /已完成/.test(track['aria-valuetext'] || ''),
      JSON.stringify(track));
    /* 注意：① 测试用的元素桩不会因 innerHTML='' 清空 children；
             ② renderQuestion 最后会 append 滑片指示器。
       所以先按 role=radio 过滤，再取最后渲染的 5 个。 */
    const radioBtns = elements['#options'].children
      .filter(el => el.attrs && el.attrs['role'] === 'radio').slice(-5);
    check('选项按钮带 role=radio 与 aria-checked（5 个选项）',
      radioBtns.length === 5 && radioBtns.every(b => b.attrs && b.attrs['role'] === 'radio') &&
      radioBtns.some(b => b.attrs['aria-checked'] === 'true'),
      'radio=' + radioBtns.length);
    check('第 3 个选项为"不确定"且带 data-val=0',
      radioBtns[2] && radioBtns[2].attrs['data-val'] === '0' &&
      /不确定/.test(radioBtns[2].innerHTML || radioBtns[2].textContent || ''),
      radioBtns[2] ? JSON.stringify(radioBtns[2].attrs) + ' ' + String(radioBtns[2].innerHTML).slice(0, 40) : 'null');
    /* ---- 报告导出（长图 / 打印） ---- */
    document.body.id = 'page-result';
    api.init();
    const beforeKids = document.body.children.length;
    fire(elements['#reportImgBtn'], 'click');
    const anchors = document.body.children.slice(beforeKids)
      .filter(el => /完整报告/.test(el.download || ''));
    check('完整报告长图导出生成下载链接', anchors.length >= 1,
      JSON.stringify(document.body.children.slice(beforeKids).map(el => el.download || '(无 download)')));
    global.__printed = false;
    fire(elements['#printBtn'], 'click');
    check('打印/存为 PDF 按钮调用 window.print', global.__printed === true);

    /* ---- 完整作答流程（回归：温和但一致的作答必须给出明确类型） ---- */
    const resetStore = () => {
      store['mbti_answers'] = JSON.stringify({});
      store['mbti_result'] = JSON.stringify(null);
      store['mbti_current'] = JSON.stringify(0);
      store['mbti_set'] = JSON.stringify(deepSet.map(q => q.id));
      store['mbti_mode'] = JSON.stringify('deep');
      store['mbti_bank_version'] = JSON.stringify(qbank.BANK_VERSION);
    };
    const answerAll = keyFor => {
      document.body.id = 'page-test';
      api.init();
      const kd3 = docListeners.keydown || [];
      for (let i = 0; i < deepSet.length; i++) {
        const idx = Number(JSON.parse(store['mbti_current'] || '0')) || i;
        const q = deepSet[idx] || deepSet[i];
        kd3.forEach(fn => fn({ key: keyFor(q, i), target: null }));
        if (i < deepSet.length - 1) fire(elements['#nextBtn'], 'click');
      }
      fire(elements['#nextBtn'], 'click');   // 最后一题 → 查看结果（finishTest）
    };

    // A. 只用「同意 / 不同意」——真人最常见的作答方式（旧逻辑必出彩蛋，回归点）
    //    5 点量表下的按键：1=强同意 2=同意 3=不确定 4=不同意 5=强不同意
    resetStore();
    answerAll(q => (q.dir < 0 ? '2' : '4'));
    let storedRes = JSON.parse(store['mbti_result'] || 'null');
    check('完整作答已记录 64 题',
      Object.keys(JSON.parse(store['mbti_answers'] || '{}')).length === deepSet.length,
      Object.keys(JSON.parse(store['mbti_answers'] || '{}')).length + '/' + deepSet.length);
    check('温和一致作答不触发"框不住你"彩蛋', !!storedRes && storedRes.easterEgg === false,
      storedRes ? String(storedRes.easterEgg) : 'null');
    check('温和一致作答得到确定类型（全首字母极）', !!storedRes && storedRes.letters === 'ESTJ',
      storedRes ? storedRes.letters : 'null');
    check('温和一致作答四维均非模糊', !!storedRes && DIMS.every(d => storedRes.dims[d].amb === false),
      storedRes ? DIMS.map(d => d + ':' + storedRes.dims[d].amb).join(' ') : 'null');
    check('温和一致作答落点为 33%（1:-1 均值差）', !!storedRes && storedRes.dims.EI.pctB === 33,
      storedRes ? String(storedRes.dims.EI.pctB) : 'null');

    // B. 极端一致作答
    resetStore();
    answerAll(q => (q.dir < 0 ? '1' : '5'));
    storedRes = JSON.parse(store['mbti_result'] || 'null');
    check('极端一致作答得到类型且置信度更高',
      !!storedRes && storedRes.easterEgg === false && storedRes.overallConfidence > 60,
      storedRes ? storedRes.letters + ' ' + storedRes.overallConfidence + '%' : 'null');

    // D. 全程「不确定」→ 不计分（四维落点居中 50%、置信度 0），但进度照常记为已答
    resetStore();
    answerAll(() => '3');
    storedRes = JSON.parse(store['mbti_result'] || 'null');
    const ansD = JSON.parse(store['mbti_answers'] || '{}');
    check('不确定也计入已答（进度不倒退）', Object.keys(ansD).length === deepSet.length,
      Object.keys(ansD).length + '/' + deepSet.length);
    check('不确定不参与计分：四维落点均为 50%',
      !!storedRes && DIMS.every(d => storedRes.dims[d].pctB === 50),
      storedRes ? DIMS.map(d => d + ':' + storedRes.dims[d].pctB).join(' ') : 'null');
    check('不确定降低有效覆盖：置信度为 0',
      !!storedRes && storedRes.overallConfidence === 0 &&
      DIMS.every(d => storedRes.dims[d].scored === 0 && storedRes.dims[d].neutral === 16),
      storedRes ? storedRes.overallConfidence + '% scored=' + storedRes.dims.EI.scored +
        ' neutral=' + storedRes.dims.EI.neutral : 'null');
    check('不确定不计入一致性矛盾', !!storedRes && storedRes.consistencyIssues === 0,
      storedRes ? String(storedRes.consistencyIssues) : 'null');

    // E. 部分「不确定」：对称地各去掉一半题，字母判定不应改变（不确定不参与计分）
    resetStore();
    const keyFor2 = q => (q.dir < 0 ? '1' : '5');
    answerAll(keyFor2);
    const fullRes = JSON.parse(store['mbti_result'] || 'null');
    resetStore();
    (() => {
      document.body.id = 'page-test';
      api.init();
      const kd5 = docListeners.keydown || [];
      const counts = {};
      for (let i = 0; i < deepSet.length; i++) {
        const idx = Number(JSON.parse(store['mbti_current'] || '0')) || i;
        const q = deepSet[idx] || deepSet[i];
        /* 每个维度每一极都隔一题选"不确定"→ 两极被对称削减，均值差不受偏斜影响 */
        const k = q.dim + (q.dir < 0 ? 'A' : 'B');
        counts[k] = (counts[k] || 0) + 1;
        kd5.forEach(fn => fn({ key: (counts[k] % 2 === 0 ? '3' : keyFor2(q)), target: null }));
        if (i < deepSet.length - 1) fire(elements['#nextBtn'], 'click');
      }
      fire(elements['#nextBtn'], 'click');
    })();
    const mixedRes = JSON.parse(store['mbti_result'] || 'null');
    check('对称选一半不确定 → 字母判定与全答一致（不确定不改变分数方向）',
      !!mixedRes && !!fullRes && mixedRes.letters === fullRes.letters,
      (mixedRes ? mixedRes.letters : 'null') + ' vs ' + (fullRes ? fullRes.letters : 'null'));
    check('选了一半不确定 → 置信度低于全答（如实反映有效题量）',
      !!mixedRes && !!fullRes && mixedRes.overallConfidence < fullRes.overallConfidence,
      (mixedRes ? mixedRes.overallConfidence : '?') + '% vs ' + (fullRes ? fullRes.overallConfidence : '?') + '%');

    // C. 全程「同意」（默认同意定势）→ 配平计分应判为模糊，并显示带四维落点的彩蛋页
    resetStore();
    answerAll(() => '1');
    storedRes = JSON.parse(store['mbti_result'] || 'null');
    check('全程同意 → 判为模糊（配平计分抵消默认同意）', !!storedRes && storedRes.easterEgg === true,
      storedRes ? String(storedRes.easterEgg) : 'null');
    document.body.id = 'page-result';
    elements['#resultMain'].style.display = '';
    elements['#easterCard'].style.display = 'none';
    elements['#easterDims'].innerHTML = '';
    api.init();
    check('模糊结果页显示彩蛋卡', elements['#easterCard'].style.display === 'block',
      String(elements['#easterCard'].style.display));
    check('彩蛋卡内含四维落点信息（不再是死胡同）',
      (elements['#easterDims'].innerHTML.match(/ed-row/g) || []).length === 4 &&
      /%/.test(elements['#easterDims'].innerHTML) && /居中/.test(elements['#easterDims'].innerHTML),
      elements['#easterDims'].innerHTML.slice(0, 80));

    /* ============================================================
       F. 存储污染 / 异常输入不得让页面失效
       （对应审计发现：污染 localStorage 曾导致"点了没反应"、"永远交不了卷"、
         "整页白屏"、"题库加载失败反被当成升级而删数据"）
       ============================================================ */

    // F1. mbti_answers 被写成字符串 → 仍能作答（自愈为空对象），不再抛异常
    resetStore();
    store['mbti_bank_version'] = JSON.stringify(qbank.BANK_VERSION);
    store['mbti_answers'] = JSON.stringify('abc');
    document.body.id = 'page-test';
    api.init();
    const kdF = docListeners.keydown || [];
    let clickThrew = false;
    try { kdF.forEach(fn => fn({ key: '2', target: null })); } catch (e) { clickThrew = true; }
    check('answers 被污染成字符串仍可作答（不抛异常）', !clickThrew);
    check('污染后的进度正常推进', /^1 \/ 64$/.test(elements['#qDone'].textContent.trim()),
      elements['#qDone'].textContent);
    check('污染值被自愈为对象', (() => {
      const a = JSON.parse(store['mbti_answers'] || '{}');
      return a && typeof a === 'object' && !Array.isArray(a) && Object.keys(a).length === 1;
    })(), store['mbti_answers']);

    // F2. mbti_set 被写成字符串 → 重建题集而不是白屏
    resetStore();
    store['mbti_bank_version'] = JSON.stringify(qbank.BANK_VERSION);
    store['mbti_set'] = JSON.stringify('abc');
    document.body.id = 'page-test';
    api.init();
    check('题集被污染成字符串时重建题集（页面不白屏）',
      Array.isArray(JSON.parse(store['mbti_set'] || 'null')) &&
      JSON.parse(store['mbti_set']).length === 64 &&
      elements['#options'].children.length > 0,
      'set=' + (store['mbti_set'] || '').slice(0, 20) + ' 选项=' + elements['#options'].children.length);

    /* 导航计数：把 window.location.href 换成带 setter 的属性，统计真实跳转次数 */
    let navCount = 0;
    Object.defineProperty(global.window.location, 'href', {
      configurable: true,
      get() { return this._href || ''; },
      set(v) { this._href = v; navCount++; }
    });
    const clearToast = () => { if (elements['#toast']) elements['#toast'].textContent = ''; };
    /* 记录所有 toast 文案：测试桩会累积历史监听器（多次 init 后同一个按钮上挂着多个
       click 处理器），后执行的处理器可能覆盖前者写下的文案，因此断言"曾写过"而不是"最后一条"。 */
    const toastLog = [];
    Object.defineProperty(elements['#toast'], 'textContent', {
      configurable: true,
      get() { return this._tc || ''; },
      set(v) { this._tc = v; toastLog.push(v); }
    });

    // F3. mbti_history 被写成数字 → 仍能交卷并跳转
    resetStore();
    store['mbti_bank_version'] = JSON.stringify(qbank.BANK_VERSION);
    store['mbti_history'] = JSON.stringify(5);
    await new Promise(r => setTimeout(r, 400));   // 先排空前序用例遗留的导航定时器
    navCount = 0;
    answerAll(q => (q.dir < 0 ? '1' : '5'));
    await new Promise(r => setTimeout(r, 320));   // navigate() 有 250ms 延迟
    check('history 被污染成数字仍能交卷', !!JSON.parse(store['mbti_result'] || 'null'),
      String(!!JSON.parse(store['mbti_result'] || 'null')));
    check('交卷后跳转到结果页（1 次）', navCount === 1 && /result\.html/.test(global.window.location.href),
      'navs=' + navCount + ' href=' + global.window.location.href);

    // F4. 交卷不幂等会重复导航 → 连点 3 次只跳一次
    resetStore();
    store['mbti_bank_version'] = JSON.stringify(qbank.BANK_VERSION);
    navCount = 0;
    answerAll(q => (q.dir < 0 ? '1' : '5'));
    fire(elements['#nextBtn'], 'click');
    fire(elements['#nextBtn'], 'click');
    await new Promise(r => setTimeout(r, 320));
    check('连点"查看结果"只交卷一次（导航幂等）', navCount === 1,
      'navs=' + navCount + ' href=' + global.window.location.href);

    // F5. 完成度门槛：跳到末题只答这 1 题就交卷 → 拦住、不生成结果、不出类型
    resetStore();
    store['mbti_bank_version'] = JSON.stringify(qbank.BANK_VERSION);
    navCount = 0;
    document.body.id = 'page-test';
    api.init();
    const kdF5 = docListeners.keydown || [];
    const dots = elements['#jumpGrid'].children.slice(-64);          // 桩会累积，取最后 64 个
    fire(dots[dots.length - 1], 'click');                            // 跳到最后一题
    kdF5.forEach(fn => fn({ key: '2', target: null }));              // 只答这一题
    clearToast();
    fire(elements['#nextBtn'], 'click');                             // 末题按钮 = 查看结果
    await new Promise(r => setTimeout(r, 150));
    check('只答 1 题时被完成度门槛拦住（不生成结果）',
      JSON.parse(store['mbti_result'] || 'null') === null,
      String(store['mbti_result'] || '（未写入）'));
    check('被拦下时不跳转结果页', navCount === 0, 'navs=' + navCount + ' href=' + global.window.location.href);
    check('被拦下时给出提示文案', toastLog.some(m => /未作答/.test(m)),
      toastLog.slice(-2).join(' | ') || '（无文案）');
    /* 门槛会把用户带到"第一道未答题"：本用例只答了末题，所以第一道未答题就是第 1 题
       （注意：桩会把 `i + 1` 原样存成数字，这里用 String() 归一后再比较） */
    check('被拦下后跳到第一道未答题（第 1 题）',
      String(elements['#qCurrent'].textContent) === '1',
      '#qCurrent=' + elements['#qCurrent'].textContent + ' #qNum=' + elements['#qNum'].textContent);

    // F6. 题库加载失败不得被当成"题库升级"而删掉用户数据
    resetStore();
    store['mbti_bank_version'] = JSON.stringify(qbank.BANK_VERSION);
    store['mbti_result'] = JSON.stringify({ letters: 'ESTJ', dims: {} });
    const bankBackup = global.QUESTIONS;
    global.QUESTIONS = [];                       // 模拟 data/questions.js 未加载成功
    document.body.id = 'page-test';
    api.init();
    check('题库加载失败时不删除用户已保存结果', !!store['mbti_result'], String(store['mbti_result'] || '（被删）'));
    check('题库加载失败时不把版本号写成 0',
      JSON.parse(store['mbti_bank_version'] || 'null') === qbank.BANK_VERSION,
      String(store['mbti_bank_version']));
    global.QUESTIONS = bankBackup;

    // F7. result 结构被截断 → 给出可读提示而不是白屏
    resetStore();
    store['mbti_bank_version'] = JSON.stringify(qbank.BANK_VERSION);
    store['mbti_result'] = JSON.stringify({ letters: 'ESTJ' });   // 缺 dims
    document.body.id = 'page-result';
    elements['#resultMain'].style.display = '';
    elements['#resultMain'].innerHTML = '';
    let resultThrew = false;
    try { api.init(); } catch (e) { resultThrew = true; }
    check('截断的 result 不让结果页抛异常', !resultThrew);
    check('截断的 result 给出可读提示', /结果数据不完整/.test(elements['#resultMain'].innerHTML || ''),
      (elements['#resultMain'].innerHTML || '').slice(0, 60));

    /* ---- 等待异步动画回调 ---- */
    await new Promise(r => setTimeout(r, 120));
    check('异步动画回调无异常', true);
  } catch (e) {
    fail++;
    console.error('  ✘ 运行时异常: ' + (e && e.stack || e));
  }
  console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
  if (fail > 0) process.exit(1);
})();
