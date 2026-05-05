let resultData = null;
let typeData = null;

function initResult() {
  // Try URL parameter first (most reliable for file:// protocol)
  try {
    var params = new URLSearchParams(window.location.search);
    var dataParam = params.get('data');
    if (dataParam) {
      resultData = JSON.parse(decodeURIComponent(dataParam));
    }
  } catch (e) { /* ignore */ }

  // Fallback to localStorage
  if (!resultData) {
    try {
      var raw = localStorage.getItem('mbti_result');
      if (raw) resultData = JSON.parse(raw);
    } catch (e) { /* ignore */ }
  }

  if (!resultData || !resultData.type) {
    document.getElementById('resultContent').style.display = 'none';
    document.getElementById('errorState').style.display = 'block';
    return;
  }

  typeData = TYPES_DATA.find(function (t) { return t.type_code === resultData.type; });
  if (!typeData) {
    document.getElementById('resultContent').style.display = 'none';
    document.getElementById('errorState').style.display = 'block';
    return;
  }

  renderResult(resultData, typeData);
}

function renderResult(result, type) {
  var meta = CATEGORY_META[type.category] || CATEGORY_META['分析家'];

  // Header
  var header = document.getElementById('typeHeader');
  header.style.background = meta.headerBg;
  header.querySelector('.type-badge').textContent = type.category;
  document.getElementById('typeCode').textContent = type.type_code;
  document.getElementById('typeName').textContent = type.type_name + ' · ' + type.category;
  document.getElementById('slogan').textContent = '“' + type.slogan + '”';

  // Profile
  document.getElementById('profileText').textContent = type.profile;

  // Strengths
  var sl = document.getElementById('strengthList');
  sl.innerHTML = '';
  type.strengths.forEach(function (s) {
    var li = document.createElement('li');
    li.textContent = s;
    sl.appendChild(li);
  });

  // Blind spots
  var bl = document.getElementById('blindList');
  bl.innerHTML = '';
  type.blind_spots.forEach(function (b) {
    var li = document.createElement('li');
    li.textContent = b;
    bl.appendChild(li);
  });

  // Career suggestions
  var cp = document.getElementById('careerPills');
  cp.innerHTML = '';
  type.career_suggestions.forEach(function (c) {
    var span = document.createElement('span');
    span.className = 'career-pill';
    span.textContent = c;
    cp.appendChild(span);
  });

  // Dimension scores
  renderDimensionScores(result.scores, result.type, meta);

  // Meta info
  document.getElementById('metaTypeCode').textContent = result.type;
  document.getElementById('metaCategory').textContent = type.category;

  // Page title
  document.title = result.type + ' ' + type.type_name + ' · 人格解读';
}

function renderDimensionScores(scores, type, meta) {
  var pairs = [
    { left: 'E', right: 'I', label: 'E/I' },
    { left: 'S', right: 'N', label: 'S/N' },
    { left: 'T', right: 'F', label: 'T/F' },
    { left: 'J', right: 'P', label: 'J/P' }
  ];

  var container = document.getElementById('scoreBars');
  container.innerHTML = '';

  pairs.forEach(function (pair) {
    var leftScore = scores[pair.left] || 0;
    var rightScore = scores[pair.right] || 0;
    var total = leftScore + rightScore || 1;
    var dominant = type.indexOf(pair.left) !== -1 ? pair.left : pair.right;

    var bar = document.createElement('div');
    bar.className = 'score-bar';

    // Left label
    var leftLabel = document.createElement('span');
    leftLabel.className = 'score-bar__label' + (dominant === pair.left ? ' score-bar__label--dominant' : '');
    leftLabel.textContent = DIMENSION_NAMES[pair.left] + ' ' + leftScore;

    // Track
    var track = document.createElement('div');
    track.className = 'score-bar__track';
    var fill = document.createElement('div');
    fill.className = 'score-bar__fill score-bar__fill--left';
    var pct = (leftScore / total * 100);
    // If left is dominant, fill from left; otherwise fill from right
    if (dominant === pair.left) {
      fill.style.width = pct + '%';
      fill.style.background = meta.accent;
    } else {
      fill.style.width = (100 - pct) + '%';
      fill.style.background = meta.accent;
      fill.style.float = 'right';
    }
    track.appendChild(fill);

    // Right label
    var rightLabel = document.createElement('span');
    rightLabel.className = 'score-bar__label score-bar__label--right' + (dominant === pair.right ? ' score-bar__label--dominant' : '');
    rightLabel.textContent = DIMENSION_NAMES[pair.right] + ' ' + rightScore;

    bar.appendChild(leftLabel);
    bar.appendChild(track);
    bar.appendChild(rightLabel);
    container.appendChild(bar);
  });
}

function copyResultText() {
  if (!resultData || !typeData) return;
  var s = resultData.scores;
  var lines = [
    '我的 MBTI 人格类型：' + resultData.type + ' · ' + typeData.type_name,
    '类别：' + typeData.category,
    '',
    '维度得分：',
    '  E/I：' + (s.E || 0) + ' / ' + (s.I || 0) + '（' + DIMENSION_NAMES[(s.E || 0) >= (s.I || 0) ? 'E' : 'I'] + '）',
    '  S/N：' + (s.S || 0) + ' / ' + (s.N || 0) + '（' + DIMENSION_NAMES[(s.S || 0) >= (s.N || 0) ? 'S' : 'N'] + '）',
    '  T/F：' + (s.T || 0) + ' / ' + (s.F || 0) + '（' + DIMENSION_NAMES[(s.T || 0) >= (s.F || 0) ? 'T' : 'F'] + '）',
    '  J/P：' + (s.J || 0) + ' / ' + (s.P || 0) + '（' + DIMENSION_NAMES[(s.J || 0) >= (s.P || 0) ? 'J' : 'P'] + '）',
    '',
    '“' + typeData.slogan + '”',
    '',
    '来测测你的 MBTI 人格类型吧！'
  ];
  var text = lines.join('\n');

  // Try Clipboard API first
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () {
      showToast('结果已复制到剪贴板！');
    }).catch(function () {
      fallbackCopy(text);
    });
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    showToast('结果已复制到剪贴板！');
  } catch (e) {
    showToast('复制失败，请手动复制');
  }
  document.body.removeChild(ta);
}

function shareResult() {
  if (!resultData || !typeData) return;
  var text = '我的 MBTI 人格类型：' + resultData.type + ' · ' + typeData.type_name + ' — ' + typeData.slogan + ' 来测测你的吧！';
  if (navigator.share) {
    navigator.share({ title: 'MBTI 人格测试结果', text: text, url: window.location.href }).catch(function () {});
  } else {
    copyResultText();
  }
}

function resetTest() {
  try {
    localStorage.removeItem('mbti_result');
  } catch (e) { /* ignore */ }
  window.location.href = 'test.html';
}

function showToast(msg) {
  var el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(function () { el.classList.remove('show'); }, 2000);
}

document.addEventListener('DOMContentLoaded', initResult);
