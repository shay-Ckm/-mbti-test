/* 临时诊断：比对本地 HEAD 的 tree 与远端刚构建的 tree，找出差异条目 */
'use strict';
const { execFileSync } = require('child_process');
const https = require('https');

const REMOTE_TREE = process.argv[2];
const OWNER = 'shay-Ckm', REPO = '-mbti-test';

function git(a) { return execFileSync('git', a, { encoding: 'utf8', maxBuffer: 1 << 26 }).trim(); }
function token() {
  const out = execFileSync('git', ['-c', 'credential.interactive=never', 'credential', 'fill'], {
    encoding: 'utf8', input: 'protocol=https\nhost=github.com\n\n',
    env: Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: '0' })
  });
  return out.match(/^password=(.+)$/m)[1].trim();
}
function get(path, tok) {
  return new Promise((res, rej) => {
    https.get({ host: 'api.github.com', path: path, headers: { Authorization: 'Bearer ' + tok, 'User-Agent': 'diag', Accept: 'application/vnd.github+json' } }, r => {
      let b = ''; r.on('data', d => b += d); r.on('end', () => res(JSON.parse(b)));
    }).on('error', rej);
  });
}

(async () => {
  const local = new Map();
  git(['ls-tree', '-r', 'HEAD']).split('\n').forEach(line => {
    const m = line.match(/^(\d+)\s+(\w+)\s+([0-9a-f]{40})\t([\s\S]+)$/);
    if (m) local.set(m[4], { mode: m[1], sha: m[3] });
  });
  const tok = token();
  const remote = await get('/repos/' + OWNER + '/' + REPO + '/git/trees/' + REMOTE_TREE + '?recursive=1', tok);
  const rmap = new Map();
  (remote.tree || []).forEach(e => rmap.set(e.path, { mode: String(e.mode), sha: e.sha, type: e.type }));

  console.log('本地条目: ' + local.size + '   远端条目: ' + rmap.size + '   远端 truncated=' + !!remote.truncated);
  let diff = 0;
  local.forEach((v, p) => {
    const r = rmap.get(p);
    if (!r) { console.log('  仅本地: ' + p); diff++; return; }
    if (r.sha !== v.sha || r.mode !== v.mode) {
      console.log('  不一致: ' + p + '\n     本地 mode=' + v.mode + ' sha=' + v.sha + '\n     远端 mode=' + r.mode + ' sha=' + r.sha);
      diff++;
    }
  });
  rmap.forEach((v, p) => { if (!local.has(p)) { console.log('  仅远端: ' + p + ' (' + v.type + ')'); diff++; } });
  console.log(diff === 0 ? '✓ 所有条目完全一致' : '✘ 差异条目数: ' + diff);
})().catch(e => { console.error('诊断失败: ' + e.message); process.exit(1); });
