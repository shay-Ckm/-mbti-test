/* ============================================================
   Service Worker：离线可用 + 缓存策略
   ------------------------------------------------------------
   策略：
   - 安装时预缓存应用外壳（页面/样式/脚本/数据/字体/图标）
   - 导航请求：网络优先 → 失败回退缓存 → 再兜底首页（离线也能打开）
   - 静态资源：缓存优先 + 后台更新（stale-while-revalidate）
   发版时请把 CACHE_VERSION 递增（旧缓存在 activate 阶段清理）。
   注意：Service Worker 仅在 http(s) 下生效，file:// 直接打开时不注册。
   ============================================================ */
'use strict';

const CACHE_VERSION = 'mbti-v5.1.1';
const CACHE_NAME = CACHE_VERSION;

/* 预缓存清单（路径必须真实存在，静态契约测试会逐条校验） */
const PRECACHE = [
  './',
  './index.html',
  './test.html',
  './result.html',
  './relation.html',
  './404.html',
  './style.css?v=5.1.1',
  './script.js?v=5.1.1',
  './data/questions.js?v=5.1.1',
  './data/profile.js?v=5.1.1',
  './assets/fonts/fonts.css?v=5.1.1',
  './assets/fonts/inter-var.woff2',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/apple-touch-icon.png',
  './favicon.svg',
  './manifest.json'
];

/* 写入缓存（只缓存成功的同源响应） */
function putInCache(request, response) {
  if (!response || response.status !== 200 || response.type === 'opaque') return;
  caches.open(CACHE_NAME).then(function (cache) {
    cache.put(request, response).catch(function () { /* 配额或重复写入，忽略 */ });
  }).catch(function () { /* 忽略 */ });
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    /* 逐条预缓存 + 忽略单条失败：旧实现用 cache.addAll，任一条目 404 会让整批回滚，
       新 SW 永远装不上、旧缓存永久滞留（实测会静默卡在旧版本，控制台也不报错）。 */
    caches.open(CACHE_NAME)
      .then(function (cache) {
        return Promise.all(PRECACHE.map(function (u) {
          return cache.add(u).catch(function () { /* 单条失败不影响整体安装 */ });
        }));
      })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE_NAME; })
          .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try { url = new URL(request.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;   // 只接管同源请求

  /* 页面导航：网络优先，离线回退缓存，最终兜底首页 */
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(function (response) { putInCache(request, response.clone()); return response; })
        .catch(function () {
          return caches.match(request).then(function (hit) {
            return hit || caches.match('./index.html');
          });
        })
    );
    return;
  }

  /* 样式与脚本：网络优先（保证改版立即生效），离线或源站异常时回退缓存。
     必须校验 response.ok：5xx/404 属于"成功返回"，直接透传会让页面既没 JS 也没样式
     （实测源站 503 时 window.__MBTI_BUILD 为 null），而缓存里其实还躺着完好副本。 */
  if (/\.(css|js)$/.test(url.pathname)) {
    event.respondWith(
      fetch(request)
        .then(function (response) {
          if (!response || !response.ok) {
            return caches.match(request).then(function (hit) { return hit || response; });
          }
          putInCache(request, response.clone());
          return response;
        })
        .catch(function () { return caches.match(request); })
    );
    return;
  }

  /* 其他静态资源：缓存优先 + 后台更新 */
  event.respondWith(
    caches.match(request).then(function (hit) {
      const network = fetch(request)
        .then(function (response) {
          if (response && response.ok) putInCache(request, response.clone());
          return response;
        })
        .catch(function () { return hit; });
      return hit || network;
    })
  );
});
