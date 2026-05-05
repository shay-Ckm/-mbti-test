// ===== Page Switching =====
function showPage(id) {
  document.querySelectorAll('.page').forEach(function (p) {
    p.classList.remove('active');
  });
  document.getElementById(id).classList.add('active');
}

// ===== Toast =====
function showToast(msg) {
  var el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(function () { el.classList.remove('show'); }, 2000);
}

// ===== Particle System =====
function initParticles() {
  var container = document.getElementById('particlesContainer');
  if (!container) return;
  var isMobile = window.innerWidth < 640;
  var count = isMobile ? 20 : 35;
  var colors = ['#6ab0d6', '#6bc4a8', '#d4b86a', '#d48a6a', '#a78bfa'];
  for (var i = 0; i < count; i++) {
    var dot = document.createElement('div');
    dot.className = 'particle-dot';
    var size = 2 + Math.random() * 8;
    var color = colors[i % colors.length];
    var left = Math.random() * 100;
    var top = Math.random() * 100;
    var opacity = 0.1 + Math.random() * 0.25;
    var duration = 12 + Math.random() * 18;
    var delay = Math.random() * 6;
    dot.style.cssText =
      'width:' + size + 'px;height:' + size + 'px;' +
      'left:' + left + '%;top:' + top + '%;' +
      'background:' + color + ';' +
      'opacity:' + opacity + ';' +
      'animation:float ' + duration + 's ease-in-out ' + delay + 's infinite;';
    container.appendChild(dot);
  }
}

// ============================================================
//  TEST LOGIC
// ============================================================

var answers = {};
var currentIndex = 0;

function startTest() {
  answers = {};
  currentIndex = 0;
  renderQuestion(0);
  showPage('page-test');
}

function renderQuestion(index) {
  var q = QUESTIONS[index];
  var total = QUESTIONS.length;

  var dimFull = ['外向 (E) vs 内向 (I)', '实感 (S) vs 直觉 (N)', '思考 (T) vs 情感 (F)', '判断 (J) vs 感知 (P)'];
  var dimPart = ['第一部分', '第二部分', '第三部分', '第四部分'];
  document.getElementById('dimensionBadge').textContent = dimPart[q.dimensionGroup] + '：' + dimFull[q.dimensionGroup];

  document.getElementById('progressText').textContent = '第 ' + (index + 1) + ' / ' + total + ' 题';
  document.getElementById('progressFill').style.width = ((index + 1) / total * 100) + '%';

  document.getElementById('questionNumber').textContent = '第 ' + q.id + ' 题';
  document.getElementById('questionText').textContent = q.text;
  document.getElementById('questionIcon').textContent = q.icon || '📝';
  document.getElementById('optionAText').textContent = q.options.A;
  document.getElementById('optionBText').textContent = q.options.B;

  document.getElementById('optionA').classList.toggle('selected', answers[q.id] === 'A');
  document.getElementById('optionB').classList.toggle('selected', answers[q.id] === 'B');

  document.getElementById('prevBtn').style.display = index === 0 ? 'none' : 'inline-flex';
  var nextBtn = document.getElementById('nextBtn');
  nextBtn.textContent = (index === total - 1) ? '查看结果' : '下一题 →';

  document.querySelector('.question-area').scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Trigger question entrance animation
  var qa = document.querySelector('.question-area');
  qa.style.animation = 'none';
  void qa.offsetHeight;
  qa.style.animation = '';
}

function selectOption(questionId, option) {
  answers[questionId] = option;
  document.getElementById('optionA').classList.toggle('selected', option === 'A');
  document.getElementById('optionB').classList.toggle('selected', option === 'B');
}

function goNext() {
  var q = QUESTIONS[currentIndex];
  if (!answers[q.id]) {
    showToast('请先选择一个选项');
    return;
  }
  if (currentIndex === QUESTIONS.length - 1) {
    buildReview();
  } else {
    currentIndex++;
    renderQuestion(currentIndex);
  }
}

function goPrev() {
  if (currentIndex > 0) {
    currentIndex--;
    renderQuestion(currentIndex);
  }
}

// ============================================================
//  REVIEW LOGIC
// ============================================================

function buildReview() {
  var grid = document.getElementById('reviewGrid');
  grid.innerHTML = '';
  var unanswered = 0;

  QUESTIONS.forEach(function (q, index) {
    var ans = answers[q.id];
    var item = document.createElement('div');
    item.className = 'review-item' + (ans ? '' : ' unanswered');
    item.style.animation = 'reviewItemIn 0.3s ease forwards';
    item.style.animationDelay = (index * 0.04) + 's';
    item.innerHTML =
      '<span class="review-q"><strong>' + q.id + '.</strong> ' + q.text.slice(0, 20) + (q.text.length > 20 ? '…' : '') + '</span>' +
      '<span class="review-a">' + (ans || '?') + '</span>';
    item.addEventListener('click', function () {
      currentIndex = q.id - 1;
      renderQuestion(currentIndex);
      showPage('page-test');
    });
    grid.appendChild(item);
    if (!ans) unanswered++;
  });

  document.getElementById('reviewCount').textContent =
    '已答 ' + (QUESTIONS.length - unanswered) + ' / ' + QUESTIONS.length + ' 题' +
    (unanswered > 0 ? '（还有 ' + unanswered + ' 题未答，点击可跳转）' : '');

  var submitBtn = document.getElementById('submitBtn');
  submitBtn.disabled = unanswered > 0;
  submitBtn.textContent = unanswered > 0 ? '请完成所有题目' : '提交测试';

  showPage('page-review');
}

function submitTest() {
  if (document.getElementById('submitBtn').disabled) return;
  calculateAndShowResult();
}

function calculateAndShowResult() {
  var scores = { E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 };

  for (var i = 1; i <= 5; i++) {
    if (answers[i] === 'A') scores.E++;
    else if (answers[i] === 'B') scores.I++;
  }
  for (var i = 6; i <= 10; i++) {
    if (answers[i] === 'A') scores.S++;
    else if (answers[i] === 'B') scores.N++;
  }
  for (var i = 11; i <= 15; i++) {
    if (answers[i] === 'A') scores.T++;
    else if (answers[i] === 'B') scores.F++;
  }
  for (var i = 16; i <= 20; i++) {
    if (answers[i] === 'A') scores.J++;
    else if (answers[i] === 'B') scores.P++;
  }

  var type = '';
  type += scores.E >= scores.I ? 'E' : 'I';
  type += scores.S >= scores.N ? 'S' : 'N';
  type += scores.T >= scores.F ? 'T' : 'F';
  type += scores.J >= scores.P ? 'J' : 'P';

  renderResult({ type: type, scores: scores });
}

// ============================================================
//  RESULT LOGIC
// ============================================================

var lastResult = null;

function renderResult(result) {
  lastResult = result;
  var typeData = TYPES_DATA.find(function (t) { return t.type_code === result.type; });
  if (!typeData) {
    showPage('page-error');
    return;
  }

  var meta = CATEGORY_META[typeData.category] || CATEGORY_META['分析家'];

  // Header
  var header = document.getElementById('typeHeader');
  header.style.background = meta.headerBg;
  document.getElementById('typeBadge').textContent = typeData.category;
  document.getElementById('typeCode').textContent = result.type;
  document.getElementById('typeName').textContent = typeData.type_name + ' · ' + typeData.category;
  document.getElementById('slogan').textContent = '“' + typeData.slogan + '”';
  document.getElementById('slogan').style.borderLeftColor = meta.accent;

  // Profile
  document.getElementById('profileText').textContent = typeData.profile;

  // Strengths
  var sl = document.getElementById('strengthList');
  sl.innerHTML = '';
  typeData.strengths.forEach(function (s) {
    var li = document.createElement('li');
    li.textContent = s;
    sl.appendChild(li);
  });

  // Blind spots
  var bl = document.getElementById('blindList');
  bl.innerHTML = '';
  typeData.blind_spots.forEach(function (b) {
    var li = document.createElement('li');
    li.textContent = b;
    bl.appendChild(li);
  });

  // Growth advice
  var ga = document.getElementById('growthAdvice');
  ga.textContent = typeData.growth_advice;

  // Famous figures
  var ff = document.getElementById('famousFigures');
  ff.innerHTML = '';
  typeData.famous_figures.forEach(function (name) {
    var span = document.createElement('span');
    span.className = 'figure-pill';
    span.textContent = name;
    ff.appendChild(span);
  });

  // Relationship advice
  var ra = document.getElementById('relationshipAdvice');
  ra.textContent = typeData.relationship_advice;

  // Career suggestions
  var cp = document.getElementById('careerPills');
  cp.innerHTML = '';
  typeData.career_suggestions.forEach(function (c) {
    var span = document.createElement('span');
    span.className = 'career-pill';
    span.textContent = c;
    cp.appendChild(span);
  });

  // Dimension scores
  renderDimensionScores(result.scores, result.type, meta);

  // Meta info
  document.getElementById('metaTypeCode').textContent = result.type;
  document.getElementById('metaCategory').textContent = typeData.category;

  document.title = result.type + ' ' + typeData.type_name + ' · 人格解读';

  // Don't show result until score bars have rendered
  showPage('page-result');
}

function renderDimensionScores(scores, type, meta) {
  var pairs = [
    { left: 'E', right: 'I' },
    { left: 'S', right: 'N' },
    { left: 'T', right: 'F' },
    { left: 'J', right: 'P' }
  ];

  var container = document.getElementById('scoreBars');
  container.innerHTML = '';

  pairs.forEach(function (pair, index) {
    var leftScore = scores[pair.left] || 0;
    var rightScore = scores[pair.right] || 0;
    var total = leftScore + rightScore || 1;
    var dominant = type.indexOf(pair.left) !== -1 ? pair.left : pair.right;
    var pct = (dominant === pair.left ? leftScore : rightScore) / total * 100;

    var bar = document.createElement('div');
    bar.className = 'score-bar';

    var leftLabel = document.createElement('span');
    leftLabel.className = 'score-bar__label' + (dominant === pair.left ? ' score-bar__label--dominant' : '');
    leftLabel.textContent = DIMENSION_NAMES[pair.left] + ' ' + leftScore;

    var track = document.createElement('div');
    track.className = 'score-bar__track';

    var fill = document.createElement('div');
    fill.className = 'score-bar__fill';
    fill.style.width = '0%';
    fill.style.background = meta.accent;
    fill.style.height = '10px';
    fill.style.borderRadius = '5px';
    fill.style.transition = 'width 1s cubic-bezier(0.34, 1.56, 0.64, 1)';
    fill.style.transitionDelay = (index * 150) + 'ms';
    (function(f, p) {
      requestAnimationFrame(function() {
        requestAnimationFrame(function() {
          f.style.width = p + '%';
        });
      });
    })(fill, pct);
    if (dominant === pair.right) {
      fill.style.float = 'right';
    }
    track.appendChild(fill);

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
  if (!lastResult) return;
  var s = lastResult.scores;
  var typeData = TYPES_DATA.find(function (t) { return t.type_code === lastResult.type; });
  if (!typeData) return;

  var lines = [
    '我的 MBTI 人格类型：' + lastResult.type + ' · ' + typeData.type_name,
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

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () {
      showToast('结果已复制到剪贴板！');
    }).catch(function () { fallbackCopy(text); });
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
  if (!lastResult) return;
  var typeData = TYPES_DATA.find(function (t) { return t.type_code === lastResult.type; });
  if (!typeData) return;
  var text = '我的 MBTI 人格类型：' + lastResult.type + ' · ' + typeData.type_name + ' — ' + typeData.slogan + ' 来测测你的吧！';
  if (navigator.share) {
    navigator.share({ title: 'MBTI 人格测试结果', text: text }).catch(function () {});
  } else {
    copyResultText();
  }
}

function resetTest() {
  startTest();
}

// ===== Event Binding =====
document.addEventListener('DOMContentLoaded', function () {
  document.getElementById('optionA').addEventListener('click', function () {
    if (QUESTIONS[currentIndex]) {
      selectOption(QUESTIONS[currentIndex].id, 'A');
    }
  });
  document.getElementById('optionB').addEventListener('click', function () {
    if (QUESTIONS[currentIndex]) {
      selectOption(QUESTIONS[currentIndex].id, 'B');
    }
  });

  document.getElementById('prevBtn').addEventListener('click', goPrev);
  document.getElementById('nextBtn').addEventListener('click', goNext);
  document.getElementById('submitBtn').addEventListener('click', submitTest);
  initParticles();
});
