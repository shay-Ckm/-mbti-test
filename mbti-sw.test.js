/* ============================================================
   Service Worker 行为测试（Node 运行：node mbti-sw.test.js）
   ------------------------------------------------------------
   用最小 stub 真实执行 sw.js 的 install / activate / fetch 三种处理器，
   验证离线策略（而不是只检查文件里有没有关键字）：
   1. install   → 预缓存清单写入缓存 + skipWaiting
   2. activate  → 删除旧版本缓存 + clients.claim
   3. fetch     → 导航请求网络优先；离线时回退缓存（最终兜底首页）
   4. fetch     → 静态资源缓存优先 + 后台更新（SWR）
   5. 跨域请求 / 非 GET → 不接管（放行）
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;

/* ---------- stub：Response / Cache / CacheStorage / self ---------- */
function makeResponse(url, status, type) {
  return {
    url: url,
    status: status === undefined ? 200 : status,
    type: type || 'basic',
    clone() { return makeResponse(url, status, type); }
  };
}

/* 统一 URL 形式：去掉 origin 与 './' 前缀，便于命中比较 */
function normalize(req) {
  let u = typeof req === 'string' ? req : (req && req.url) || '';
  u = u.replace(/^https?:\/\/[^/]+/, '');
  u = u.replace(/^\.\//, '/');
  return u === '' ? '/' : u;
}

const cacheStore = new Map();   // cacheName -> Map(normalizedUrl -> response)
const caches = {
  async open(name) {
    if (!cacheStore.has(name)) cacheStore.set(name, new Map());
    const bucket = cacheStore.get(name);
    return {
      async addAll(urls) { urls.forEach(u => bucket.set(normalize(u), makeResponse(normalize(u)))); },
      async put(req, res) { bucket.set(normalize(req), res); },
      async match(req) { return bucket.get(normalize(req)); }
    };
  },
  async keys() { return Array.from(cacheStore.keys()); },
  async delete(name) { return cacheStore.delete(name); },
  async match(req) {
    const key = normalize(req);
    for (const bucket of cacheStore.values()) {
      if (bucket.has(key)) return bucket.get(key);
    }
    return undefined;
  }
};

const listeners = {};
const flags = { skipped: false, claimed: false };
const selfStub = {
  location: { origin: 'https://example.test' },
  addEventListener(type, fn) { listeners[type] = fn; },
  skipWaiting() { flags.skipped = true; },
  clients: { claim() { flags.claimed = true; } }
};

/* fetch 可切换：默认模拟离线 */
let fetchMode = 'offline';
let networkCalls = 0;
function fetchStub(req) {
  networkCalls++;
  const url = typeof req === 'string' ? req : req.url;
  if (fetchMode === 'online') return Promise.resolve(makeResponse(url));
  return Promise.reject(new Error('offline'));
}

/* ---------- 载入 sw.js（在函数作用域内注入 stub） ---------- */
const src = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const sw = new Function('self', 'caches', 'fetch', 'URL',
  src + '\n;return { PRECACHE: PRECACHE, CACHE_VERSION: CACHE_VERSION };'
)(selfStub, caches, fetchStub, URL);

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✔ ' + name); }
  else { fail++; console.log('  ✘ ' + name + (detail ? '  → ' + detail : '')); }
}

/* 触发事件并取回 respondWith 的 promise */
function fire(type, event) {
  let captured = null;
  const fn = listeners[type];
  if (!fn) return Promise.resolve({ captured: null, event: event });
  fn(Object.assign({ respondWith(p) { captured = p; } }, event || {}));
  return Promise.resolve({ captured: captured, event: event });
}

(async () => {
  console.log('MBTI Service Worker 行为测试\n');

  check('注册了 install / activate / fetch 三个处理器',
    !!(listeners.install && listeners.activate && listeners.fetch));
  check('缓存版本号已定义', typeof sw.CACHE_VERSION === 'string' && sw.CACHE_VERSION.length > 0, String(sw.CACHE_VERSION));
  check('预缓存清单非空（' + sw.PRECACHE.length + ' 项）', sw.PRECACHE.length >= 10);

  /* 1. install：预缓存 + skipWaiting */
  {
    let waiting = null;
    listeners.install({ waitUntil(p) { waiting = p; } });
    await waiting;
    const bucket = cacheStore.get(sw.CACHE_VERSION);
    check('install 写入预缓存（' + (bucket ? bucket.size : 0) + ' 项）',
      !!bucket && bucket.size === sw.PRECACHE.length, String(bucket && bucket.size));
    check('install 调用 skipWaiting（立即接管）', flags.skipped === true);
    /* 清单里的样式/脚本带 ?v= 版本号（缓存击穿），比较时忽略查询串 */
    const bare = u => Object.keys(Object.fromEntries(bucket)).map(k => k.split('?')[0]).indexOf(u) >= 0;
    check('预缓存包含首页与核心资源',
      ['/index.html', '/test.html', '/result.html', '/style.css', '/script.js', '/manifest.json']
        .every(bare));
    check('预缓存的样式/脚本带版本号',
      Object.keys(Object.fromEntries(bucket)).some(k => /^\/style\.css\?v=[\d.]+$/.test(k)),
      Object.keys(Object.fromEntries(bucket)).filter(k => k.indexOf('style.css') >= 0).join(','));
  }

  /* 2. activate：清理旧缓存 + clients.claim */
  {
    cacheStore.set('mbti-v0.0.1-old', new Map());
    let waiting = null;
    listeners.activate({ waitUntil(p) { waiting = p; } });
    await waiting;
    check('activate 删除旧版本缓存', !cacheStore.has('mbti-v0.0.1-old'));
    check('activate 保留当前版本缓存', cacheStore.has(sw.CACHE_VERSION));
    check('activate 调用 clients.claim', flags.claimed === true);
  }

  /* 3. 导航请求：在线走网络并回写缓存 */
  {
    fetchMode = 'online';
    const req = { method: 'GET', mode: 'navigate', url: 'https://example.test/result.html' };
    const { captured } = await fire('fetch', { request: req });
    check('导航请求被接管并优先走网络', !!captured);
    const res = await captured;
    check('在线导航返回网络响应', res && res.url.indexOf('result.html') >= 0, res && res.url);
    check('在线导航结果被写入缓存', !!cacheStore.get(sw.CACHE_VERSION).get('/result.html'));
  }

  /* 4. 导航请求：离线回退缓存，未知路径兜底首页 */
  {
    fetchMode = 'offline';
    const cached = await (await fire('fetch', { request: { method: 'GET', mode: 'navigate', url: 'https://example.test/test.html' } })).captured;
    check('离线导航回退到已缓存页面', cached && cached.url === '/test.html', cached && cached.url);

    const fallback = await (await fire('fetch', { request: { method: 'GET', mode: 'navigate', url: 'https://example.test/never-visited.html' } })).captured;
    check('离线访问未缓存页面兜底首页', fallback && fallback.url === '/index.html', fallback && fallback.url);
  }

  /* 5. 样式/脚本：网络优先（改版立即生效），离线回退缓存 */
  {
    fetchMode = 'online';
    const before = networkCalls;
    const res = await (await fire('fetch', { request: { method: 'GET', mode: 'no-cors', url: 'https://example.test/style.css' } })).captured;
    check('样式/脚本走网络优先（不吃旧缓存）', res && /style\.css/.test(res.url) && networkCalls > before,
      (res && res.url) + ' calls=' + (networkCalls - before));

    fetchMode = 'offline';
    const off = await (await fire('fetch', { request: { method: 'GET', mode: 'no-cors', url: 'https://example.test/style.css' } })).captured;
    check('离线时样式回退到缓存', off && /style\.css/.test(off.url), off && off.url);
    fetchMode = 'online';
  }

  /* 5b. 其他静态资源（图片/字体）：缓存优先 + 后台更新 */
  {
    cacheStore.get(sw.CACHE_VERSION).set('/assets/icon-192.png', makeResponse('/assets/icon-192.png'));
    const before = networkCalls;
    const res = await (await fire('fetch', { request: { method: 'GET', mode: 'no-cors', url: 'https://example.test/assets/icon-192.png' } })).captured;
    check('图片资源命中缓存时先返回缓存', res && res.url === '/assets/icon-192.png', res && res.url);
    check('命中缓存仍会在后台发起更新请求（SWR）', networkCalls > before, 'networkCalls=' + networkCalls);
  }

  /* 6. 不接管：跨域请求与非 GET */
  {
    const cross = await fire('fetch', { request: { method: 'GET', mode: 'no-cors', url: 'https://cdn.example.com/x.js' } });
    check('跨域请求不被接管', cross.captured === null);
    const post = await fire('fetch', { request: { method: 'POST', mode: 'cors', url: 'https://example.test/api' } });
    check('非 GET 请求不被接管', post.captured === null);
  }

  console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
  if (fail > 0) process.exit(1);
})().catch(e => {
  console.error('  ✘ 运行时异常: ' + (e && e.stack || e));
  process.exit(1);
});
