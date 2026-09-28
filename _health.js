/* 线上健康检查：脚本是否执行、有无未捕获异常（临时用） */
'use strict';
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const PORT = 9455;
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PROFILE = require('path').join(process.env.TEMP, 'health-' + Date.now());
const sleep = ms => new Promise(r => setTimeout(r, ms));
const get = p => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: PORT, path: p }, r => { let b = ''; r.on('data', d => b += d); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { res(b); } }); }).on('error', rej);
});

(async () => {
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE, '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
  let v = null;
  for (let i = 0; i < 40 && !v; i++) { await sleep(250); try { v = await get('/json/version'); } catch (e) {} }
  const list = await get('/json/list');
  const page = list.filter(t => t.type === 'page')[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pend = new Map(); const errs = []; const logs = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
    else if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text);
    else if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) logs.push(m.params.type + ': ' + (m.params.args || []).map(a => a.value || a.description).join(' '));
  };
  const send = (method, params) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params: params || {} })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('timeout ' + method)); } }, 20000); });
  const ev = async expr => (await send('Runtime.evaluate', { expression: '(function(){' + expr + '})()', returnByValue: true, awaitPromise: true })).result.value;

  await send('Page.enable'); await send('Runtime.enable');
  for (const url of ['https://shay-ckm.github.io/-mbti-test/', 'https://shay-ckm.github.io/-mbti-test/test.html']) {
    errs.length = 0; logs.length = 0;
    await send('Page.navigate', { url: url + '?health=' + Date.now() });
    await sleep(4000);
    const info = await ev('return {build: window.__MBTI_BUILD||null, ready: document.readyState, opts: document.querySelectorAll(".opt").length, modeCards: document.querySelectorAll(".mode-card").length, stamp: (document.querySelector(".build-stamp")||{}).textContent||"", title: document.title}');
    console.log('\n' + url);
    console.log('  ' + JSON.stringify(info));
    console.log('  未捕获异常: ' + (errs.length ? errs.slice(0, 2).join(' | ') : '无'));
    console.log('  console 错误/警告: ' + (logs.length ? logs.slice(0, 2).join(' | ') : '无'));
  }
  ws.close(); chrome.kill(); await sleep(300);
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
})().catch(e => { console.error('检查失败: ' + e.message); process.exit(1); });
