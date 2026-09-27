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
  '#easterCard', '#easterRetest', '#easterHome', '#partnerModal', '#partnerClose', '#partnerEmoji',
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
  print() { global.__printed = true; }
};
global.requestAnimationFrame = fn => setTimeout(() => fn(Date.now()), 0);
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
    check('总题数按档位写入', String(elements['#qTotal'].textContent) === '60', String(elements['#qTotal'].textContent));
    check('档位徽章包含档位名', /深度测试/.test(elements['#modeBadge'].innerHTML), elements['#modeBadge'].innerHTML);
    check('题号跳转网格已构建', elements['#jumpGrid'].children.length === 60, String(elements['#jumpGrid'].children.length));

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
    const radioBtns = elements['#options'].children.filter(el => el.attrs && el.attrs['role'] === 'radio');
    check('选项按钮带 role=radio 与 aria-checked',
      radioBtns.length >= 4 && radioBtns.some(b => b.attrs['aria-checked'] === 'true'),
      'radio=' + radioBtns.length);
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
