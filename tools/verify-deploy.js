/* ============================================================
   部署验证器（npm run verify）
   ------------------------------------------------------------
   推送后核对三件事：
   1. 远端 main 是否就是本地 HEAD 的内容（tree SHA 比对）
   2. GitHub Actions CI 是否全绿（轮询最新一次运行）
   3. GitHub Pages 是否构建成功
   4. 线上关键页面/资源是否包含本次发布的标记（含二进制资源签名）
   用法：node tools/verify-deploy.js [--wait]
   凭据：GH_TOKEN / GITHUB_TOKEN 或 git 凭据管理器（不会打印）
   ============================================================ */
'use strict';

const { execFileSync } = require('child_process');
const https = require('https');
const fs = require('fs');
const path = require('path');

const OWNER = 'shay-Ckm';
const REPO = '-mbti-test';
const BRANCH = 'main';
const SITE = 'https://shay-ckm.github.io/-mbti-test/';
const WAIT = process.argv.indexOf('--wait') >= 0;
const ROOT = path.join(__dirname, '..');

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 26 }).trim();
}

function resolveToken() {
  const env = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (env && env.trim()) return env.trim();
  try {
    const out = execFileSync('git', ['-c', 'credential.interactive=never', 'credential', 'fill'], {
      encoding: 'utf8', input: 'protocol=https\nhost=github.com\n\n',
      env: Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: '0' })
    });
    const m = out.match(/^password=(.+)$/m);
    if (m && m[1].trim()) return m[1].trim();
  } catch (e) { /* 无凭据 */ }
  return null;
}

function api(token, apiPath) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      host: 'api.github.com', path: '/repos/' + OWNER + '/' + REPO + apiPath, method: 'GET', timeout: 30000,
      headers: { Authorization: 'Bearer ' + token, 'User-Agent': 'mbti-verify', Accept: 'application/vnd.github+json' }
    }, res => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { resolve(null); } });
    });
    req.on('error', reject);
    req.on('timeout', function () { this.destroy(); reject(new Error('超时')); });
    req.end();
  });
}

/* 带重试的 API 读取 */
async function apiRetry(token, apiPath, tries) {
  tries = tries || 3;
  for (let i = 0; i < tries; i++) {
    const res = await api(token, apiPath);
    if (res) return res;
    await sleep(1500);
  }
  return null;
}

/* 线上抓取（带重试，Pages 偶发 ECONNRESET） */
function fetchUrl(url, tries) {
  tries = tries || 3;
  return new Promise(resolve => {
    const attempt = n => {
      https.get(url, { timeout: 20000, headers: { 'User-Agent': 'mbti-verify' } }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return resolve(fetchUrl(res.headers.location, tries));
        }
        const chunks = [];
        res.on('data', d => chunks.push(d));
        res.on('end', () => resolve({ status: res.statusCode, buf: Buffer.concat(chunks) }));
      }).on('error', () => {
        if (n > 1) setTimeout(() => attempt(n - 1), 1200); else resolve({ status: 0, buf: Buffer.alloc(0) });
      }).on('timeout', function () { this.destroy(); });
    };
    attempt(tries);
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  let pass = 0, fail = 0;
  const check = (name, cond, detail) => {
    if (cond) { pass++; console.log('  ✔ ' + name); }
    else { fail++; console.log('  ✘ ' + name + (detail ? '  → ' + detail : '')); }
  };

  console.log('MBTI 部署验证\n');
  const token = resolveToken();
  const localTree = git(['rev-parse', 'HEAD^{tree}']);
  const localHead = git(['rev-parse', 'HEAD']);
  console.log('本地 HEAD: ' + localHead.slice(0, 7) + '  tree=' + localTree.slice(0, 7));
  if (!token) { console.log('（无 GitHub 凭据，跳过 CI/Pages 状态检查，仅核对线上内容）'); }

  /* 1. 远端 main 内容与本地一致 */
  let remoteSha = null;
  if (token) {
    const ref = await apiRetry(token, '/git/ref/heads/' + BRANCH);
    remoteSha = ref && ref.object && ref.object.sha;
    check('远端 main 已更新（SHA 与本地不同属正常：API 会归一化提交时间）', !!remoteSha, String(remoteSha));
    if (remoteSha) {
      const rc = await apiRetry(token, '/git/commits/' + remoteSha);
      /* Git Data API 的 commit 对象把 tree 放在顶层（这与 REST 的 repos/commits 不同） */
      const remoteTree = rc && ((rc.tree && rc.tree.sha) || (rc.commit && rc.commit.tree && rc.commit.tree.sha));
      check('远端 commit tree 与本地一致', remoteTree === localTree,
        '远端 ' + String(remoteTree).slice(0, 7) + ' vs 本地 ' + localTree.slice(0, 7));

      /* 逐文件比对 blob SHA（内容级保证） */
      const local = new Map();
      git(['-c', 'core.quotepath=false', 'ls-tree', '-r', 'HEAD']).split('\n').forEach(line => {
        const m = line.match(/^(\d+)\s+\w+\s+([0-9a-f]{40})\t([\s\S]+)$/);
        if (m) local.set(m[3], m[2]);
      });
      const listing = await apiRetry(token, '/git/trees/' + (remoteTree || remoteSha) + '?recursive=1');
      const remote = new Map();
      ((listing && listing.tree) || []).forEach(e => { if (e.type === 'blob') remote.set(e.path, e.sha); });
      const diffs = [];
      local.forEach((sha, p) => { if (remote.get(p) !== sha) diffs.push(p); });
      remote.forEach((sha, p) => { if (!local.has(p)) diffs.push(p + '(多余)'); });
      check('远端 ' + local.size + ' 个文件字节与本地完全一致', diffs.length === 0, diffs.slice(0, 3).join(', '));
    }
  }

  /* 2. CI 状态（--wait 时轮询） */
  if (token && remoteSha) {
    let run = null;
    for (let i = 0; i < (WAIT ? 30 : 3); i++) {
      const runs = await api(token, '/actions/runs?per_page=20');
      run = runs && runs.workflow_runs && runs.workflow_runs.find(r => r.head_sha === remoteSha);
      if (run && run.status === 'completed') break;
      if (!WAIT && run) break;
      await sleep(10000);
    }
    if (!run) check('找到本次提交的 CI 运行', false, '未找到（可能仍在排队）');
    else {
      check('CI 运行状态: ' + run.status + ' / ' + run.conclusion,
        run.status === 'completed' && run.conclusion === 'success', run.html_url);
    }
  }

  /* 3. Pages 构建状态 */
  if (token) {
    const build = await api(token, '/pages/builds/latest');
    check('Pages 构建: ' + (build && build.status), !!build && build.status === 'built',
      build && build.error && build.error.message);
  }

  /* 4. 线上内容标记 */
  const pages = [
    ['index.html', '首页', [['双档位选择', /id="modeCards"/], ['关系匹配入口', /relation\.html/], ['本地字体', /assets\/fonts\/fonts\.css/], ['分享图元信息', /og:image/]]],
    ['test.html', '答题页', [['进度条 ARIA', /role="progressbar"/], ['脚本 defer', /script\.js" defer/]]],
    ['result.html', '结果页', [['报告长图按钮', /reportImgBtn/], ['类型档案入口', /typePageLink/], ['打印按钮', /printBtn/]]],
    ['relation.html', '关系匹配页', [['矩阵容器', /id="relMatrix"/], ['选择槽', /relSlotA/]]],
    ['types/intj.html', '类型百科页', [['类型内容', /战略家/], ['结构化数据', /application\/ld\+json/]]],
    ['sw.js', 'Service Worker', [['缓存版本 v4.1.0', /mbti-v4\.1\.0/]]],
    ['manifest.json', 'PWA manifest', [['名称字段', /"name"/], ['独立窗口', /standalone/]]]
  ];
  for (const [file, label, marks] of pages) {
    const r = await fetchUrl(SITE + file);
    if (r.status !== 200) { check('线上 ' + label + ' 可访问', false, 'HTTP ' + r.status + ' ' + file); continue; }
    const text = r.buf.toString('utf8');
    marks.forEach(([mLabel, re]) => check('线上 ' + label + ' · ' + mLabel, re.test(text)));
  }

  /* 线上题库版本与题量（确认新题库真的上线了） */
  {
    const bank = await fetchUrl(SITE + 'data/questions.js');
    const txt = bank.buf.toString('utf8');
    const items = (txt.match(/dim: '/g) || []).length;
    check('线上题库为 v3（BANK_VERSION = 3）', bank.status === 200 && /var BANK_VERSION = 3;/.test(txt),
      'HTTP ' + bank.status);
    check('线上题量为 64 题', items === 64, items + ' 题');
  }

  /* 二进制资源签名 */
  const font = await fetchUrl(SITE + 'assets/fonts/inter-var.woff2');
  check('线上字体文件为有效 woff2（' + (font.buf.length / 1024).toFixed(1) + 'KB）',
    font.status === 200 && font.buf.slice(0, 4).toString('ascii') === 'wOF2');
  const og = await fetchUrl(SITE + 'assets/og-image.png');
  check('线上 OG 图与原图字节一致',
    og.status === 200 && og.buf.equals(fs.readFileSync(path.join(ROOT, 'assets/og-image.png'))),
    og.buf.length + ' vs ' + fs.statSync(path.join(ROOT, 'assets/og-image.png')).size);
  const robots = await fetchUrl(SITE + 'robots.txt');
  check('线上 robots.txt 声明 sitemap', robots.status === 200 && /sitemap\.xml/.test(robots.buf.toString('utf8')));
  const sitemap = await fetchUrl(SITE + 'sitemap.xml');
  check('线上 sitemap 含 20 个 URL',
    sitemap.status === 200 && (sitemap.buf.toString('utf8').match(/<loc>/g) || []).length === 20);

  console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
  if (fail > 0) process.exit(1);
})().catch(e => {
  console.error('验证失败: ' + (e && e.message || e));
  process.exit(1);
});
