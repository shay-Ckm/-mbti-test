let answers = {};
let currentIndex = 0;

function initTest() {
  // Restore from localStorage
  try {
    const saved = localStorage.getItem('mbti_answers');
    if (saved) answers = JSON.parse(saved);
  } catch (e) { /* ignore */ }

  currentIndex = 0;
  renderQuestion(currentIndex);

  document.getElementById('prevBtn').addEventListener('click', goPrev);
  document.getElementById('nextBtn').addEventListener('click', goNext);
}

function renderQuestion(index) {
  const q = QUESTIONS[index];
  const total = QUESTIONS.length;

  // Dimension label
  const dimLabels = ['E/I', 'S/N', 'T/F', 'J/P'];
  const dimFull = ['外向 (E) vs 内向 (I)', '实感 (S) vs 直觉 (N)', '思考 (T) vs 情感 (F)', '判断 (J) vs 感知 (P)'];
  const dimPart = ['第一部分', '第二部分', '第三部分', '第四部分'];
  document.getElementById('dimensionBadge').textContent =
    dimPart[q.dimensionGroup] + '：' + dimFull[q.dimensionGroup];

  // Progress
  document.getElementById('progressText').textContent = '第 ' + (index + 1) + ' / ' + total + ' 题';
  document.getElementById('progressFill').style.width = ((index + 1) / total * 100) + '%';

  // Question
  document.getElementById('questionNumber').textContent = '第 ' + q.id + ' 题';
  document.getElementById('questionText').textContent = q.text;
  document.getElementById('optionAText').textContent = q.options.A;
  document.getElementById('optionBText').textContent = q.options.B;

  // Highlight selected
  document.getElementById('optionA').classList.toggle('selected', answers[q.id] === 'A');
  document.getElementById('optionB').classList.toggle('selected', answers[q.id] === 'B');

  // Prev/Next buttons
  document.getElementById('prevBtn').style.display = index === 0 ? 'none' : 'inline-flex';
  const nextBtn = document.getElementById('nextBtn');
  if (index === total - 1) {
    nextBtn.textContent = '查看结果';
  } else {
    nextBtn.textContent = '下一题 →';
  }

  // Scroll to top of question area
  document.querySelector('.question-area').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function selectOption(questionId, option) {
  answers[questionId] = option;
  try {
    localStorage.setItem('mbti_answers', JSON.stringify(answers));
  } catch (e) { /* ignore */ }
  // Update highlights
  document.getElementById('optionA').classList.toggle('selected', option === 'A');
  document.getElementById('optionB').classList.toggle('selected', option === 'B');
}

function goNext() {
  const q = QUESTIONS[currentIndex];
  if (!answers[q.id]) {
    showToast('请先选择一个选项');
    return;
  }
  if (currentIndex === QUESTIONS.length - 1) {
    showReview();
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

function showReview() {
  document.getElementById('questionArea').style.display = 'none';
  document.getElementById('testNav').style.display = 'none';
  document.getElementById('progressBar').style.display = 'none';
  document.getElementById('reviewSection').style.display = 'block';

  const grid = document.getElementById('reviewGrid');
  grid.innerHTML = '';
  let unanswered = 0;

  QUESTIONS.forEach((q) => {
    const ans = answers[q.id];
    const item = document.createElement('div');
    item.className = 'review-item' + (ans ? '' : ' unanswered');
    item.innerHTML =
      '<span class="review-q"><strong>' + q.id + '.</strong> ' + q.text.slice(0, 20) + (q.text.length > 20 ? '…' : '') + '</span>' +
      '<span class="review-a">' + (ans || '?') + '</span>';
    item.addEventListener('click', function () {
      currentIndex = q.id - 1;
      document.getElementById('reviewSection').style.display = 'none';
      document.getElementById('questionArea').style.display = 'block';
      document.getElementById('testNav').style.display = 'flex';
      document.getElementById('progressBar').style.display = 'block';
      renderQuestion(currentIndex);
    });
    grid.appendChild(item);
    if (!ans) unanswered++;
  });

  document.getElementById('reviewCount').textContent =
    '已答 ' + (QUESTIONS.length - unanswered) + ' / ' + QUESTIONS.length + ' 题' +
    (unanswered > 0 ? '（还有 ' + unanswered + ' 题未答，点击可跳转）' : '');

  const submitBtn = document.getElementById('submitBtn');
  submitBtn.disabled = unanswered > 0;
  submitBtn.textContent = unanswered > 0 ? '请完成所有题目' : '提交测试';
}

function submitTest() {
  const result = calculateType(answers);
  try {
    localStorage.setItem('mbti_result', JSON.stringify(result));
    localStorage.removeItem('mbti_answers');
  } catch (e) { /* ignore */ }
  // Pass data via URL for maximum reliability (works with file:// protocol)
  const encoded = encodeURIComponent(JSON.stringify(result));
  window.location.href = 'result.html?data=' + encoded;
}

function calculateType(answers) {
  const scores = { E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 };

  // Questions 1-5: A=E, B=I
  for (let i = 1; i <= 5; i++) {
    if (answers[i] === 'A') scores.E++;
    else if (answers[i] === 'B') scores.I++;
  }
  // Questions 6-10: A=S, B=N
  for (let i = 6; i <= 10; i++) {
    if (answers[i] === 'A') scores.S++;
    else if (answers[i] === 'B') scores.N++;
  }
  // Questions 11-15: A=T, B=F
  for (let i = 11; i <= 15; i++) {
    if (answers[i] === 'A') scores.T++;
    else if (answers[i] === 'B') scores.F++;
  }
  // Questions 16-20: A=J, B=P
  for (let i = 16; i <= 20; i++) {
    if (answers[i] === 'A') scores.J++;
    else if (answers[i] === 'B') scores.P++;
  }

  // Tie-breaking: >= picks the first
  let type = '';
  type += scores.E >= scores.I ? 'E' : 'I';
  type += scores.S >= scores.N ? 'S' : 'N';
  type += scores.T >= scores.F ? 'T' : 'F';
  type += scores.J >= scores.P ? 'J' : 'P';

  return { type, scores };
}

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(function () { el.classList.remove('show'); }, 2000);
}

document.addEventListener('DOMContentLoaded', initTest);
