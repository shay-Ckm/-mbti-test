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

const CACHE_VERSION = 'mbti-v4.3.0';
const CACHE_NAME = CACHE_VERSION;

/* 预缓存清单（路径必须真实存在，静态契约测试会逐条校验） */
const PRECACHE = [
  './',
  './index.html',
  './test.html',
  './result.html',
  './relation.html',
  './404.html',
  './style.css',
  './script.js',
  './data/questions.js',
  './data/profile.js',
  './assets/fonts/fonts.css',
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
    caches.open(CACHE_NAME)
      .then(function (cache) { return cache.addAll(PRECACHE); })
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

  /* 静态资源：缓存优先 + 后台更新 */
  event.respondWith(
    caches.match(request).then(function (hit) {
      const network = fetch(request)
        .then(function (response) { putInCache(request, response.clone()); return response; })
        .catch(function () { return hit; });
      return hit || network;
    })
  );
});
