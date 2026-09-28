/* 一次性：在指定宽度下测量答题页（用后即删） */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const qbank = require(path.join(ROOT, 'data', 'questions.js'));
global.QUESTIONS = qbank.QUESTIONS;
global.BANK_VERSION = qbank.BANK_VERSION;
global.TYPE_PROFILE = require(path.join(ROOT, 'data', 'profile.js')).TYPE_PROFILE;
const api = require(path.join(ROOT, 'script.js'));

const DEBUG = `<script>
window.addEventListener('load', function () {
  setTimeout(function () {
    var lines = ['viewport=' + window.innerWidth + 'x' + window.innerHeight];
    var wrap = document.querySelector('.test-wrap');
    var kids = Array.prototype.slice.call(wrap.children).filter(function (el) {
      return el.getBoundingClientRect().height > 0 && getComputedStyle(el).position !== 'fixed';
    });
    for (var i = 1; i < kids.length; i++) {
      var g = Math.round(kids[i].getBoundingClientRect().top - kids[i - 1].getBoundingClientRect().bottom);
      lines.push((kids[i - 1].className || '?').split(' ')[0].padEnd(16) + '→ ' +
        (kids[i].className || '?').split(' ')[0].padEnd(16) + '= ' + g + 'px');
    }
    var r = document.querySelector('.radar-wrap').getBoundingClientRect();
    var q = document.querySelector('.q-card').getBoundingClientRect();
    lines.push('radar h=' + Math.round(r.height) + '  q-card h=' + Math.round(q.height) +
      '  高度差=' + Math.round(q.height - r.height) + 'px');
    lines.push('水平间距=' + Math.round(q.left - r.right) + 'px');
    var d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:0;top:0;right:0;z-index:99999;background:#000;color:#0f0;font:12px/1.6 monospace;padding:8px;white-space:pre';
    d.textContent = lines.join('\\n');
    document.body.appendChild(d);
  }, 300);
});
<\/script>`;

const src = fs.readFileSync(path.join(ROOT, 'test.html'), 'utf8');
fs.writeFileSync(path.join(ROOT, '_dbg3_test.html'), src.replace('</body>', DEBUG + '\n</body>'), 'utf8');

const set = api.buildQuestionSet('quick').map(q => q.id);
const answers = {};
set.forEach((id, i) => {
  const q = qbank.QUESTIONS.filter(x => x.id === id)[0];
  answers[id] = (i % 2 === 0) ? 3 : (q.dir > 0 ? -1 : 1);
});
fs.writeFileSync(path.join(ROOT, '_seed3.html'), `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>s</title></head><body><script>
localStorage.setItem('mbti_bank_version', ${JSON.stringify(JSON.stringify(qbank.BANK_VERSION))});
localStorage.setItem('mbti_mode', ${JSON.stringify(JSON.stringify('quick'))});
localStorage.setItem('mbti_set', ${JSON.stringify(JSON.stringify(set))});
localStorage.setItem('mbti_answers', ${JSON.stringify(JSON.stringify(answers))});
localStorage.setItem('mbti_current', ${JSON.stringify(JSON.stringify(set.length - 1))});
localStorage.removeItem('mbti_result');
location.replace('_dbg3_test.html');<\/script></body></html>`);
console.log('ready');
