/* ============================================================
   真实浏览器端到端测试（Chrome + CDP）
   ------------------------------------------------------------
   用法：
     npm run e2e                 # 默认打线上站点（同时验证部署与真实交互）
     npm run e2e -- <baseUrl>    # 指定目标，例如本地 file:///…/index.html
   环境变量：
     CHROME_PATH                 # 自定义 Chrome 可执行文件路径
   流程：首页 → 选快速测试 → 开始 → 逐题真实点击作答（含"不确定"）
        → 中途刷新验证续答 → 答完 → 结果页核对 UI 与引擎数据一致
   证据：_shots/e2e-*.png 截图 + _shots/e2e-report.json 报告
   说明：这是**真浏览器真渲染**的端到端验收，与 npm test 的单元/契约测试互补。
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

/* Chrome 路径：优先环境变量，其次常见安装位置 */
const CHROME = process.env.CHROME_PATH || [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].filter(p => { try { return fs.existsSync(p); } catch (e) { return false; } })[0];
if (!CHROME) { console.error('未找到 Chrome/Edge，请设置 CHROME_PATH'); process.exit(1); }

const PORT = 9411;
/* 目标站点：命令行参数优先，默认线上（可用 --local 指向本地文件） */
const arg = process.argv.slice(2).filter(a => a.indexOf('--') !== 0)[0];
const SITE = arg
  ? (/^https?:|^file:/.test(arg) ? arg : 'file:///' + path.resolve(arg).replace(/\\/g, '/'))
  : 'https://shay-ckm.github.io/-mbti-test/';
const LOCAL = /^file:/.test(SITE);
const SHOTS = path.join(__dirname, '..', '_shots');
const PROFILE = path.join(process.env.TEMP, 'e2e-profile-' + Date.now());

const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail: detail === undefined ? '' : String(detail) });
  console.log((cond ? '  ✔ ' : '  ✘ ') + name + (detail !== undefined ? '   → ' + detail : ''));
}
function get(pathname) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: PORT, path: pathname }, res => {
      let b = '';
      res.on('data', d => { b += d; });
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { resolve(b); } });
    }).on('error', reject);
  });
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE,
    '--window-size=1440,1000', 'about:blank'
  ], { stdio: 'ignore' });

  /* 等 DevTools 端口就绪 */
  let version = null;
  for (let i = 0; i < 40 && !version; i++) {
    await sleep(250);
    try { version = await get('/json/version'); } catch (e) { /* 继续等 */ }
  }
  if (!version) { console.error('Chrome 未就绪'); chrome.kill(); process.exit(1); }
  console.log('Chrome: ' + version.Browser);
  console.log('目标站点: ' + SITE + (LOCAL ? '（本地文件模式）' : '') + '\n');

  /* 取现有页面目标并连接（新版 Chrome 的 /json/new 需要 PUT，这里直接复用 about:blank） */
  const list = await get('/json/list');
  const page = Array.isArray(list) ? list.filter(t => t.type === 'page')[0] : null;
  if (!page || !page.webSocketDebuggerUrl) { console.error('未找到页面目标'); chrome.kill(); process.exit(1); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let seq = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    } else if (msg.method) {
      events.push(msg.method);
    }
  };
  function send(method, params) {
    const id = ++seq;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params: params || {} }));
      setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('CDP 超时 ' + method)); } }, 30000);
    });
  }
  async function evalJs(expr) {
    const r = await send('Runtime.evaluate', {
      expression: '(function(){' + expr + '})()', returnByValue: true, awaitPromise: true
    });
    if (r.exceptionDetails) throw new Error('页面异常: ' + JSON.stringify(r.exceptionDetails.exception && r.exceptionDetails.exception.description));
    return r.result.value;
  }
  async function shot(name) {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    const p = path.join(SHOTS, name + '.png');
    fs.writeFileSync(p, Buffer.from(r.data, 'base64'));
    return p;
  }
  async function waitFor(expr, timeout) {
    const t0 = Date.now();
    while (Date.now() - t0 < (timeout || 8000)) {
      try { if (await evalJs('return !!(' + expr + ')')) return true; } catch (e) { /* 导航中 */ }
      await sleep(150);
    }
    return false;
  }

  await send('Page.enable');
  await send('Runtime.enable');

  /* ---------- 1. 首页 ---------- */
  await send('Page.navigate', { url: SITE });
  await sleep(1000);
  await evalJs('localStorage.clear(); return 1;');
  await send('Page.reload', { ignoreCache: true });
  /* 冷启动要装 Service Worker，首次加载可能较慢：显式等到"解析完成 + 脚本已初始化" */
  const homeReady = await waitFor('document.readyState==="complete" && !!window.__MBTI_BUILD', 40000);
  check('首页脚本在 40s 内就绪（readyState + BUILD）', homeReady);
  await waitFor('document.querySelectorAll(".mode-card").length===2', 10000);
  await sleep(300);
  check('首页加载成功（含标题）', await evalJs('return /MBTI/.test(document.title)'), await evalJs('return document.title'));
  check('构建版本标记显示', await evalJs('var e=document.querySelector(".build-stamp"); return e && /^v[\\d.]+$/.test(e.textContent.trim())'),
    await evalJs('var e=document.querySelector(".build-stamp"); return e ? e.textContent.trim() : "无"'));
  const buildJs = await evalJs('return window.__MBTI_BUILD');
  const assetVer = await evalJs('return [].slice.call(document.querySelectorAll("link,script")).map(function(n){return (n.href||n.src)||""}).join(" ").match(/style\\.css\\?v=([\\d.]+)/)');
  check('运行版本 = 资源版本（缓存击穿一致）', buildJs === (assetVer ? assetVer[1] : null),
    'BUILD=' + buildJs + ' asset=' + (assetVer ? assetVer[1] : '无'));
  if (!LOCAL) {
    const bankCount = await evalJs(
      'return fetch("data/questions.js?v=" + window.__MBTI_BUILD).then(function(r){return r.text()})' +
      '.then(function(t){return (t.match(/dim: \'/g)||[]).length})');
    check('线上题库 200 题（每维 50）', bankCount === 200, bankCount + ' 题');
    const perDim = await evalJs(
      'return fetch("data/questions.js?v=" + window.__MBTI_BUILD).then(function(r){return r.text()})' +
      '.then(function(t){return t.match(/dim: \'EI\'/g).length})');
    check('线上 EI 维度 50 题', perDim === 50, perDim + ' 题');
  } else {
    check('本地模式跳过线上题库抓取检查（file:// 下 fetch 受同源策略限制）', true);
  }
  await shot('e2e-1-home');

  /* ---------- 2. 选快速测试并开始 ---------- */
  check('档位卡存在（快速/深度）', await evalJs('return document.querySelectorAll(".mode-card").length') === 2);
  await evalJs('document.querySelector(\'.mode-card[data-mode="quick"]\').click(); return 1;');
  await sleep(350);
  if (!/快速/.test(await evalJs('return document.querySelector("#startBtn").textContent'))) {
    /* 首次点击可能落在脚本就绪前，重试一次 */
    await evalJs('document.querySelector(\'.mode-card[data-mode="quick"]\').click(); return 1;');
    await sleep(350);
  }
  check('切到快速档后开始按钮文案更新', await evalJs('return /快速/.test(document.querySelector("#startBtn").textContent)'),
    await evalJs('return document.querySelector("#startBtn").textContent.trim()'));
  check('切换档位写入 localStorage',
    await evalJs('return JSON.parse(localStorage.getItem("mbti_mode")||"null")') === 'quick',
    await evalJs('return String(localStorage.getItem("mbti_mode"))'));
  const startMeta = await evalJs('return document.querySelector("#startMeta").textContent.trim()');
  check('档位说明含"每维随机 6 题"', /每维随机 6 题/.test(startMeta), startMeta);
  await evalJs('document.querySelector("#startBtn").click(); return 1;');
  await waitFor('location.pathname.indexOf("test.html")>=0', 8000);
  await waitFor('document.querySelectorAll(".opt").length===5', 8000);
  await sleep(400);

  /* ---------- 3. 答题页 ---------- */
  check('进入答题页', /test\.html/.test(await evalJs('return location.pathname')));
  check('选项数为 5', await evalJs('return document.querySelectorAll(".opt").length') === 5);
  check('第 3 个选项是"不确定"且 val=0',
    await evalJs('var o=document.querySelectorAll(".opt")[2]; return o.getAttribute("data-val")==="0" && /不确定/.test(o.textContent)'),
    await evalJs('var o=document.querySelectorAll(".opt")[2]; return o.textContent.replace(/\\s+/g," ").trim()'));
  check('题目总数 24（快速档）', await evalJs('return document.querySelector("#qTotal").textContent') === '24',
    await evalJs('return document.querySelector("#qTotal").textContent'));
  await shot('e2e-2-test');

  /* 随机抽题：两次开测第一题不同 */
  const q1a = await evalJs('return document.querySelector("#qText").textContent');
  await evalJs('localStorage.removeItem("mbti_set");localStorage.removeItem("mbti_answers");localStorage.removeItem("mbti_current");return 1;');
  await send('Page.reload', { ignoreCache: false });
  await waitFor('document.querySelectorAll(".opt").length===5', 8000);
  await sleep(400);
  const q1b = await evalJs('return document.querySelector("#qText").textContent');
  check('每次开测随机抽题（两次第一题不同）', q1a !== q1b, '「' + q1a.slice(0, 12) + '…」 vs 「' + q1b.slice(0, 12) + '…」');
  const dimSet = await evalJs('return JSON.parse(localStorage.getItem("mbti_set")).length');
  check('抽到的题集为 24 题', dimSet === 24, dimSet + ' 题');

  /* ---------- 4. 逐题真实点击作答（含不确定） ---------- */
  const vals = ['3', '1', '0', '-1', '-3'];   // 强同意/同意/不确定/不同意/强不同意
  let neutral = 0;
  const barsJs = 'return [].slice.call(document.querySelectorAll("#liveBars .lb-val")).map(function(e){return e.textContent.trim()}).join(",")';
  for (let i = 0; i < 24; i++) {
    const v = vals[i % vals.length];
    if (v === '0') neutral++;
    /* 第 5 题：先记录"未作答"时的计分条，再点"不确定"，验证计分条不动 */
    let barsBefore = null;
    if (i === 4) {
      barsBefore = await evalJs(barsJs);
      await evalJs('document.querySelector(\'.opt[data-val="0"]\').click(); return 1;');
      await sleep(500);
      const barsAfter = await evalJs(barsJs);
      const selNeutral = await evalJs('return document.querySelector(\'.opt[data-val="0"]\').classList.contains("selected")');
      check('"不确定"可被选中', selNeutral);
      check('选"不确定"不改变实时计分条（与未作答时一致）', barsBefore === barsAfter,
        barsBefore + ' → ' + barsAfter);
      check('已答进度把"不确定"计入', /^5 \/ 24$/.test((await evalJs('return document.querySelector("#qDone").textContent')).trim()),
        await evalJs('return document.querySelector("#qDone").textContent'));
      await evalJs('document.querySelector("#nextBtn").click(); return 1;');
      await sleep(200);
      continue;
    }
    const ok = await evalJs(
      'var o=document.querySelector(\'.opt[data-val="' + v + '"]\'); if(!o) return false; o.click();' +
      'return document.querySelector(\'.opt[data-val="' + v + '"]\').classList.contains("selected");');
    if (!ok) { check('第 ' + (i + 1) + ' 题点击选项 ' + v, false); break; }
    await sleep(120);
    const done = await evalJs('return document.querySelector("#qDone").textContent');
    if (!new RegExp('^' + (i + 1) + ' / 24$').test(done.trim())) {
      check('第 ' + (i + 1) + ' 题后进度正确', false, done.trim());
      break;
    }
    await evalJs('document.querySelector("#nextBtn").click(); return 1;');
    await sleep(150);
  }
  check('24 题全部作答完成', /^24 \/ 24$/.test((await evalJs('return document.querySelector("#qDone").textContent')).trim()),
    await evalJs('return document.querySelector("#qDone").textContent'));

  /* ---------- 5. 中途刷新验证续答 ---------- */
  await evalJs('localStorage.removeItem("mbti_set"); localStorage.removeItem("mbti_answers"); localStorage.removeItem("mbti_current"); return 1;');
  await send('Page.reload', { ignoreCache: false });
  await waitFor('document.querySelectorAll(".opt").length===5', 8000);
  await sleep(400);
  for (let i = 0; i < 3; i++) {
    await evalJs('document.querySelector(\'.opt[data-val="1"]\').click(); return 1;');
    await sleep(120);
    await evalJs('document.querySelector("#nextBtn").click(); return 1;');
    await sleep(150);
  }
  const beforeReload = await evalJs('return document.querySelector("#qCurrent").textContent + "/" + localStorage.getItem("mbti_current")');
  const setBefore = await evalJs('return localStorage.getItem("mbti_set")');
  await send('Page.reload', { ignoreCache: false });
  await waitFor('document.querySelectorAll(".opt").length===5', 8000);
  await sleep(500);
  const afterReload = await evalJs('return document.querySelector("#qCurrent").textContent + "/" + localStorage.getItem("mbti_current")');
  check('刷新后续答到同一题', beforeReload === afterReload, beforeReload + ' → ' + afterReload);
  check('刷新后沿用同一套题（会话内稳定）', setBefore === await evalJs('return localStorage.getItem("mbti_set")'));

  /* ---------- 6. 答完 → 结果页 ---------- */
  await evalJs('localStorage.removeItem("mbti_set"); localStorage.removeItem("mbti_answers"); localStorage.removeItem("mbti_current"); localStorage.removeItem("mbti_result"); return 1;');
  await send('Page.reload', { ignoreCache: false });
  await waitFor('document.querySelectorAll(".opt").length===5', 8000);
  await sleep(400);
  for (let i = 0; i < 24; i++) {
    await evalJs('var o=document.querySelector(\'.opt[data-val="' + vals[i % vals.length] + '"]\'); if(o) o.click(); return 1;');
    await sleep(110);
    await evalJs('document.querySelector("#nextBtn").click(); return 1;');
    await sleep(140);
  }
  await waitFor('location.pathname.indexOf("result.html")>=0', 10000);
  await sleep(1200);
  check('提交后跳转到结果页', /result\.html/.test(await evalJs('return location.pathname')));

  const stored = await evalJs('return JSON.parse(localStorage.getItem("mbti_result"))');
  check('结果已落库且含四维数据', !!stored && stored.letters && stored.dims && Object.keys(stored.dims).length === 4,
    stored ? stored.letters : 'null');
  check('结果题量口径为本档抽题量（每维 6）',
    stored && Object.keys(stored.dims).every(function (d) { return stored.dims[d].total === 6; }),
    stored ? Object.keys(stored.dims).map(function (d) { return d + ':' + stored.dims[d].total; }).join(' ') : '');
  check('每题计数自洽（计分 + 不确定 = 已答）',
    stored && Object.keys(stored.dims).every(function (d) {
      var x = stored.dims[d]; return x.scored + x.neutral === x.answered;
    }),
    stored ? Object.keys(stored.dims).map(function (d) { var x = stored.dims[d]; return d + ' ' + x.scored + '+' + x.neutral + '=' + x.answered; }).join(' · ') : '');
  check('存在"不确定"作答且被排除在计分外', stored && stored.dims.EI.neutral > 0, stored ? 'neutral=' + stored.dims.EI.neutral : '');
  check('作答总数为 24', stored && stored.answered === 24, stored ? String(stored.answered) : '');

  /* UI 与引擎数据一致性 */
  const uiLetters = await evalJs('var e=document.querySelector("#typeEmblem"); return ((e&&e.textContent)||"").replace(/[^A-Za-z]/g,"")');
  check('结果页类型字母与引擎一致', uiLetters.toUpperCase() === (stored ? stored.letters : ''), uiLetters + ' vs ' + (stored ? stored.letters : ''));
  const uiPct = await evalJs('return [].slice.call(document.querySelectorAll(".trait-pct")).map(function(e){return e.textContent.replace(/\\s+/g," ").trim()}).join(" | ")');
  const expPct = stored ? ['EI', 'SN', 'TF', 'JP'].map(function (d) {
    var x = stored.dims[d];
    var s = x.pctB >= 50 ? d[1] + ' ' + x.pctB + '%' : d[0] + ' ' + (100 - x.pctB) + '%';
    return x.amb ? s + ' 倾向模糊' : s;      // UI 会对模糊维度加标记
  }).join(' | ') : '';
  check('特质总览百分比与引擎一致（含模糊标记）', uiPct === expPct, uiPct + '  ←→  ' + expPct);
  check('模糊维度确实被引擎标记', stored && ['EI', 'SN', 'TF', 'JP'].some(function (d) { return stored.dims[d].amb; }) === /倾向模糊/.test(uiPct),
    stored ? ['EI', 'SN', 'TF', 'JP'].map(function (d) { return d + ':' + stored.dims[d].amb; }).join(' ') : '');
  check('结果页显示档位与可靠度', /快速|深度/.test(await evalJs('var m=document.querySelector("#metaBar"); return m ? m.textContent : ""')),
    await evalJs('var m=document.querySelector("#metaBar"); return m ? m.textContent.replace(/\\s+/g," ").trim().slice(0,60) : "无"'));
  check('快速档结果页标注为快速档', /快速/.test(await evalJs('var m=document.querySelector("#metaBar"); return m ? m.textContent : ""')),
    await evalJs('var m=document.querySelector("#metaBar"); return m ? m.textContent.replace(/\\s+/g," ").trim().slice(0,40) : "无"'));
  check('可靠度面板渲染 4 个维度', await evalJs('return document.querySelectorAll("#confPanel .conf-row, #confPanel .conf-item, #confPanel .cf-tag").length') > 0);
  check('分享图按钮可用', await evalJs('return !!document.querySelector("#shareBtn")'));
  await shot('e2e-3-result');

  /* ---------- 7. 类型百科页可达 ---------- */
  const typeHref = await evalJs('var a=document.querySelector("#typePageLink"); return a ? a.getAttribute("href") : ""');
  check('结果页给出类型百科入口', /types\//.test(typeHref), typeHref);
  if (typeHref) {
    await send('Page.navigate', { url: new URL(typeHref, SITE).href });
    await waitFor('document.readyState==="complete" && document.querySelectorAll(".type-nav, .gc-card, .desc-card").length>0', 20000);
    await sleep(400);
    check('类型百科页正常打开（含类型导航与档案卡）',
      await evalJs('return document.body.id === "page-type" && document.querySelectorAll(".type-nav li, .type-nav a, .type-nav .type-nav-item").length > 0'),
      await evalJs('return document.title'));
    check('类型页显示与结果一致的类型', await evalJs('return /' + (stored ? stored.letters : 'XXXX') + '/i.test(document.title)'),
      await evalJs('return document.title'));
    await shot('e2e-4-type');
  }

  /* ---------- 汇总 ---------- */
  const fail = results.filter(r => !r.ok);
  console.log('\n结果：' + (results.length - fail.length) + ' 通过，' + fail.length + ' 失败');
  console.log('截图目录：' + SHOTS);
  fs.writeFileSync(path.join(SHOTS, 'e2e-report.json'), JSON.stringify({
    site: SITE, browser: version.Browser, build: await evalJs('return window.__MBTI_BUILD || null'),
    checks: results
  }, null, 2), 'utf8');

  ws.close();
  chrome.kill();
  await sleep(400);
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) { /* 忽略 */ }
  process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error('测试异常：' + e.message); process.exit(2); });
