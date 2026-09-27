/* 临时诊断2：检查远端 blob 实际内容（判断 encoding:base64 是否被采纳） */
'use strict';
const { execFileSync } = require('child_process');
const https = require('https');
const fs = require('fs');

const OWNER = 'shay-Ckm', REPO = '-mbti-test';
const TREE = process.argv[2];
const FILES = ['manifest.json', 'assets/icon-192.png'];

function token() {
  const out = execFileSync('git', ['-c', 'credential.interactive=never', 'credential', 'fill'], {
    encoding: 'utf8', input: 'protocol=https\nhost=github.com\n\n',
    env: Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: '0' })
  });
  return out.match(/^password=(.+)$/m)[1].trim();
}
function get(path, tok) {
  return new Promise((res, rej) => {
    https.get({ host: 'api.github.com', path, headers: { Authorization: 'Bearer ' + tok, 'User-Agent': 'diag', Accept: 'application/vnd.github+json' } }, r => {
      let b = ''; r.on('data', d => b += d); r.on('end', () => res(JSON.parse(b)));
    }).on('error', rej);
  });
}
(async () => {
  const tok = token();
  const tree = await get('/repos/' + OWNER + '/' + REPO + '/git/trees/' + TREE + '?recursive=1', tok);
  for (const f of FILES) {
    const entry = (tree.tree || []).find(e => e.path === f);
    if (!entry) { console.log(f + ': 不在树中'); continue; }
    const blob = await get('/repos/' + OWNER + '/' + REPO + '/git/blobs/' + entry.sha, tok);
    const remoteBuf = Buffer.from(blob.content || '', 'base64');
    const localBuf = fs.readFileSync(f);
    const head = remoteBuf.slice(0, 40).toString('utf8').replace(/\n/g, '\\n');
    console.log(f + ':');
    console.log('   远端大小=' + remoteBuf.length + '  本地大小=' + localBuf.length + '  内容相同=' + remoteBuf.equals(localBuf));
    console.log('   远端开头: ' + head);
  }
})().catch(e => { console.error('诊断失败: ' + e.message); process.exit(1); });
