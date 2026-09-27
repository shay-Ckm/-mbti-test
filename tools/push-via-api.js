/* ============================================================
   通过 GitHub REST API 推送（适用于本机 github.com:443 被阻断的网络环境）
   ------------------------------------------------------------
   为什么需要它：本机 `github.com:443` 连不通（HTTP git 走这个域名），
   但 `api.github.com` 可达，因此用 Git Data API 重建同一个 tree + commit 并更新 ref。

   安全设计：
   1. 逐文件校验「工作区字节 SHA」==「索引 blob SHA」，不一致直接中止（防止把未提交内容推上去）；
   2. 生成的 tree SHA 必须与 `git rev-parse HEAD^{tree}` 完全一致，否则中止（防止内容写错）；
   3. 只在以上校验通过后才创建 commit 并更新 ref（fast-forward）。

   用法：
     npm run push                 # 推送当前 HEAD 的内容
     node tools/push-via-api.js --dry-run    # 只校验与构建 tree，不写入远端
   凭据：
     优先读环境变量 GH_TOKEN / GITHUB_TOKEN；否则从 git 凭据管理器获取（不会打印凭据）
   ============================================================ */
'use strict';

const fs = require('fs');
const https = require('https');
const { execFileSync } = require('child_process');

const OWNER = 'shay-Ckm';
const REPO = '-mbti-test';
const BRANCH = 'main';
const DRY_RUN = process.argv.indexOf('--dry-run') >= 0;

/* ---------- git 辅助 ---------- */
function git(args, opts) {
  return execFileSync('git', args, Object.assign({ encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }, opts || {})).trim();
}

function trackedFiles() {
  const out = git(['-c', 'core.quotepath=false', 'ls-files', '-s']);
  return out.split('\n').filter(Boolean).map(line => {
    const m = line.match(/^(\d{6})\s+([0-9a-f]{40})\s+\d+\t([\s\S]+)$/);
    if (!m) throw new Error('无法解析 git ls-files 输出: ' + line);
    return { mode: m[1], sha: m[2], path: m[3] };
  });
}

function resolveToken() {
  const env = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (env && env.trim()) return { token: env.trim(), source: '环境变量' };
  try {
    const out = execFileSync('git', ['-c', 'credential.interactive=never', 'credential', 'fill'], {
      encoding: 'utf8',
      input: 'protocol=https\nhost=github.com\n\n',
      env: Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: '0' })
    });
    const m = out.match(/^password=(.+)$/m);
    if (m && m[1].trim()) return { token: m[1].trim(), source: 'git 凭据管理器' };
  } catch (e) { /* 无凭据 */ }
  return null;
}

/* ---------- GitHub API ---------- */
function api(token, method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      host: 'api.github.com',
      path: '/repos/' + OWNER + '/' + REPO + path,
      method: method,
      timeout: 60000,
      headers: Object.assign({
        'Authorization': 'Bearer ' + token,
        'User-Agent': 'mbti-push-tool',
        'Accept': 'application/vnd.github+json'
      }, data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {})
    }, res => {
      let buf = '';
      res.on('data', d => buf += d);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(buf); } catch (e) { /* 非 JSON */ }
        resolve({ status: res.statusCode, json: json, raw: buf.slice(0, 300) });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')); });
    if (data) req.write(data);
    req.end();
  });
}

/* ---------- 主流程 ---------- */
(async () => {
  console.log('=== 本地校验 ===');
  const files = trackedFiles();
  const headTree = git(['rev-parse', 'HEAD^{tree}']);
  const headSha = git(['rev-parse', 'HEAD']);
  const message = git(['log', '-1', '--pretty=%B']) + '\n';
  const author = {
    name: git(['log', '-1', '--pretty=%an']),
    email: git(['log', '-1', '--pretty=%ae']),
    date: git(['log', '-1', '--pretty=%aI'])
  };
  const committer = {
    name: git(['log', '-1', '--pretty=%cn']),
    email: git(['log', '-1', '--pretty=%ce']),
    date: git(['log', '-1', '--pretty=%cI'])
  };

  const bad = [];
  for (const f of files) {
    const raw = git(['hash-object', '--no-filters', '--', f.path]);
    if (raw !== f.sha) bad.push(f.path);
  }
  console.log('跟踪文件       : ' + files.length);
  console.log('本地 HEAD      : ' + headSha.slice(0, 7) + '  tree=' + headTree.slice(0, 7));
  if (bad.length) {
    console.error('✘ 以下文件的工作区内容与已提交内容不一致（行尾/未提交修改）：');
    bad.forEach(p => console.error('   - ' + p));
    console.error('  请先执行： git checkout -- .   或  git add -A && git commit');
    process.exit(1);
  }
  console.log('✓ 全部文件字节与提交一致');

  if (process.argv.indexOf('--local-only') >= 0) {
    console.log('（--local-only）本地校验完成，未访问远端任何接口');
    return;
  }

  const cred = resolveToken();
  if (!cred) {
    console.error('✘ 未找到 GitHub 凭据：请设置 GH_TOKEN 环境变量，或用 git 登录一次凭据管理器');
    process.exit(1);
  }
  console.log('凭据来源       : ' + cred.source + '（已获取，不打印）');
  const token = cred.token;

  const ref = await api(token, 'GET', '/git/ref/heads/' + BRANCH);
  if (ref.status !== 200) {
    console.error('✘ 读取远端 ref 失败 HTTP ' + ref.status + ': ' + ref.raw);
    process.exit(1);
  }
  const remoteSha = ref.json.object.sha;
  console.log('远端 main      : ' + remoteSha.slice(0, 7));

  console.log('=== 上传 blob（逐个校验 SHA） ===');
  /* 注意：Git Data 的 tree 接口会忽略 encoding=base64（把 base64 文本当内容），
     因此必须先用 Blobs API 建 blob，再在 tree 里引用其 sha。
     每个 blob 都与本地索引 sha 比对，任何不一致立即中止。 */
  const entries = [];
  for (const f of files) {
    const res = await api(token, 'POST', '/git/blobs', {
      content: fs.readFileSync(f.path).toString('base64'),
      encoding: 'base64'
    });
    if (res.status !== 201 || !res.json || !res.json.sha) {
      console.error('✘ 上传 blob 失败: ' + f.path + ' HTTP ' + res.status + ' ' + res.raw);
      process.exit(1);
    }
    if (res.json.sha !== f.sha) {
      console.error('✘ blob 内容不一致: ' + f.path);
      console.error('   远端 ' + res.json.sha + '   本地 ' + f.sha);
      process.exit(1);
    }
    entries.push({ path: f.path, mode: f.mode, type: 'blob', sha: res.json.sha });
  }
  console.log('✓ ' + entries.length + ' 个 blob 全部与本地字节一致');

  const tree = await api(token, 'POST', '/git/trees', { tree: entries });
  if (tree.status !== 201 || !tree.json || !tree.json.sha) {
    console.error('✘ 创建 tree 失败 HTTP ' + tree.status + ': ' + tree.raw);
    process.exit(1);
  }
  console.log('远端新 tree    : ' + tree.json.sha);
  if (tree.json.sha !== headTree) {
    console.error('✘ tree SHA 与本地提交不一致 → 中止（内容可能被写错）');
    process.exit(1);
  }
  console.log('✓ tree 与本地提交完全一致');

  if (DRY_RUN) {
    console.log('（--dry-run）已跳过 commit 与 ref 更新');
    return;
  }

  console.log('=== 创建 commit 并更新 ref ===');
  const commit = await api(token, 'POST', '/git/commits', {
    message: message,
    tree: tree.json.sha,
    parents: [remoteSha],
    author: author,
    committer: committer
  });
  if (commit.status !== 201 || !commit.json || !commit.json.sha) {
    console.error('✘ 创建 commit 失败 HTTP ' + commit.status + ': ' + commit.raw);
    process.exit(1);
  }
  const upd = await api(token, 'PATCH', '/git/refs/heads/' + BRANCH, { sha: commit.json.sha, force: false });
  if (upd.status !== 200) {
    console.error('✘ 更新 ref 失败 HTTP ' + upd.status + ': ' + upd.raw);
    process.exit(1);
  }
  console.log('✓ 已推送，远端 main = ' + commit.json.sha);
  console.log('提示：GitHub Actions 会自动运行 CI；Pages 也会自动重新构建。');
})().catch(e => {
  console.error('FAIL: ' + (e && e.message || e));
  process.exit(1);
});
