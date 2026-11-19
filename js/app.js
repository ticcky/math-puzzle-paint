'use strict';

/* ================= Constants ================= */
const COLS = 4;
const ROWS = 5;
const TOTAL = COLS * ROWS; // 20 pieces
const STORAGE_KEY = 'math-puzzle-paint.v1';

const PICTURES = [
  { id: 'cat',       emoji: '🐱', name: 'Kitty',     bg1: '#fff3b0', bg2: '#ffd1dc' },
  { id: 'butterfly', emoji: '🦋', name: 'Butterfly', bg1: '#d4f1ff', bg2: '#e5d4ff' },
  { id: 'rocket',    emoji: '🚀', name: 'Rocket',    bg1: '#cfe8ff', bg2: '#ffd9d9' },
  { id: 'fish',      emoji: '🐠', name: 'Fish',      bg1: '#bfefff', bg2: '#fff6b8' },
  { id: 'unicorn',   emoji: '🦄', name: 'Unicorn',   bg1: '#ffe3f1', bg2: '#e3d9ff' },
  { id: 'icecream',  emoji: '🍦', name: 'Ice cream', bg1: '#fff0d9', bg2: '#ffd9ec' },
  { id: 'rainbow',   emoji: '🌈', name: 'Rainbow',   bg1: '#e6f7ff', bg2: '#fff9d6' },
  { id: 'bee',       emoji: '🐝', name: 'Bee',       bg1: '#fff9c9', bg2: '#ffe9b8' },
  { id: 'balloon',   emoji: '🎈', name: 'Balloon',   bg1: '#ffd6d6', bg2: '#d9e8ff' },
  { id: 'flower',    emoji: '🌻', name: 'Sunflower', bg1: '#eaffd6', bg2: '#fff3c2' },
];

const MODES = [
  { id: 'add', label: '➕ Add' },
  { id: 'sub', label: '➖ Subtract' },
  { id: 'mul', label: '✖️ Multiply' },
  { id: 'div', label: '➗ Divide' },
  { id: 'mix', label: '🎲 Mix' },
];

const PRAISE = [
  'Yay! 🎉', 'Awesome! ⭐', 'Great job! 🌟', 'Super! 🚀',
  'Wow! 💖', 'You are a math star! ✨', 'Hooray! 🥳', 'Brilliant! 💫',
];

/* ================= State ================= */
function defaultState() {
  return {
    current: PICTURES[0].id,
    mode: 'mix',
    pieces: Object.fromEntries(PICTURES.map((p) => [p.id, Array(TOTAL).fill(false)])),
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const s = JSON.parse(raw);
    if (!s || !PICTURES.every((p) => Array.isArray(s.pieces?.[p.id]) && s.pieces[p.id].length === TOTAL)) {
      return defaultState();
    }
    if (!PICTURES.some((p) => p.id === s.current)) s.current = PICTURES[0].id;
    if (!MODES.some((m) => m.id === s.mode)) s.mode = 'mix';
    return s;
  } catch {
    return defaultState();
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* private browsing etc. — not a big deal */
  }
}

let state = loadState();
let current = null; // { q, answer, wrongs }
let lastProblem = '';
let pictureSrc = {}; // cached data URLs
let audio = null;
let finishedJustNow = false;

/* ================= DOM ================= */
const $ = (id) => document.getElementById(id);
const bankEl = $('bank');
const puzzleEl = $('puzzle');
const puzzleTitleEl = $('puzzle-title');
const progressFillEl = $('progress-fill');
const progressLabelEl = $('progress-label');
const modesEl = $('modes');
const questionEl = $('question');
const answerEl = $('answer');
const feedbackEl = $('feedback');
const formEl = $('question-form');
const totalStarsEl = $('total-stars');
const overlayEl = $('overlay');
const confettiLayerEl = $('confetti-layer');

function currentPic() {
  return PICTURES.find((p) => p.id === state.current);
}

/* ================= Problem generation ================= */
function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function makeProblem(kind) {
  switch (kind) {
    case 'add': {
      const a = rand(1, 19);
      const b = rand(1, 20 - a);
      return { q: `${a} + ${b}`, answer: a + b };
    }
    case 'sub': {
      const a = rand(2, 20);
      const b = rand(1, a - 1);
      return { q: `${a} − ${b}`, answer: a - b };
    }
    case 'mul': {
      const a = rand(2, 10);
      const b = rand(2, 10);
      return { q: `${a} × ${b}`, answer: a * b };
    }
    case 'div': {
      const b = rand(2, 10);
      const c = rand(2, 10);
      const a = b * c;
      return { q: `${a} ÷ ${b}`, answer: c };
    }
  }
}

function newProblem() {
  const kind = state.mode === 'mix' ? ['add', 'sub', 'mul', 'div'][rand(0, 3)] : state.mode;
  let p = makeProblem(kind);
  for (let i = 0; i < 20 && p.q === lastProblem; i++) p = makeProblem(kind);
  lastProblem = p.q;
  current = { ...p, wrongs: 0 };
  questionEl.textContent = `${p.q} = ?`;
  feedbackEl.textContent = '';
  feedbackEl.className = 'feedback';
  answerEl.value = '';
  answerEl.focus();
}

/* ================= Picture pieces ================= */
function getPictureSource(pic) {
  if (!pictureSrc[pic.id]) {
    const cell = 120;
    const cv = document.createElement('canvas');
    cv.width = COLS * cell;
    cv.height = ROWS * cell;
    const ctx = cv.getContext('2d');

    const g = ctx.createLinearGradient(0, 0, cv.width, cv.height);
    g.addColorStop(0, pic.bg1);
    g.addColorStop(1, pic.bg2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cv.width, cv.height);

    // soft white halo behind the emoji so it pops on any background
    ctx.beginPath();
    ctx.arc(cv.width / 2, cv.height / 2, cell * 1.9, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fill();

    ctx.font = '330px "Apple Color Emoji", "Noto Color Emoji", "Segoe UI Emoji", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pic.emoji, cv.width / 2, cv.height / 2 + 14);

    pictureSrc[pic.id] = cv.toDataURL('image/png');
  }
  return pictureSrc[pic.id];
}

function renderPuzzle() {
  const pic = currentPic();
  const src = getPictureSource(pic);
  const pieces = state.pieces[pic.id];
  puzzleTitleEl.textContent = `${pic.emoji} ${pic.name}`;

  puzzleEl.innerHTML = '';
  pieces.forEach((earned, i) => {
    const c = i % COLS;
    const r = Math.floor(i / COLS);
    const cellEl = document.createElement('div');
    if (earned) {
      cellEl.className = 'cell earned';
      cellEl.style.backgroundImage = `url("${src}")`;
      cellEl.style.backgroundSize = `${COLS * 100}% ${ROWS * 100}%`;
      cellEl.style.backgroundPosition = `${(c * 100) / (COLS - 1)}% ${(r * 100) / (ROWS - 1)}%`;
    } else {
      cellEl.className = 'cell';
      cellEl.textContent = '?';
    }
    puzzleEl.appendChild(cellEl);
  });

  const got = pieces.filter(Boolean).length;
  progressFillEl.style.width = `${(got / TOTAL) * 100}%`;
  progressLabelEl.textContent = `${got} / ${TOTAL}`;
}

function renderBank() {
  bankEl.innerHTML = '';
  for (const pic of PICTURES) {
    const pieces = state.pieces[pic.id];
    const got = pieces.filter(Boolean).length;
    const complete = got === TOTAL;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bank-item' +
      (pic.id === state.current ? ' active' : '') +
      (complete ? ' complete' : '');
    btn.setAttribute('aria-pressed', String(pic.id === state.current));

    const emoji = document.createElement('span');
    emoji.className = 'bank-emoji';
    emoji.textContent = pic.emoji;

    const name = document.createElement('span');
    name.className = 'bank-name';
    name.textContent = complete ? `⭐ ${pic.name}` : pic.name;

    const bar = document.createElement('div');
    bar.className = 'mini-progress';
    const fill = document.createElement('i');
    fill.style.width = `${(got / TOTAL) * 100}%`;
    bar.appendChild(fill);

    btn.append(emoji, name, bar);
    btn.addEventListener('click', () => {
      if (state.current !== pic.id) {
        state.current = pic.id;
        saveState();
        finishedJustNow = false;
        renderBank();
        renderPuzzle();
        newProblem();
      }
    });
    bankEl.appendChild(btn);
  }
}

function renderModes() {
  modesEl.innerHTML = '';
  for (const m of MODES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mode-btn' + (m.id === state.mode ? ' active' : '');
    btn.textContent = m.label;
    btn.setAttribute('aria-pressed', String(m.id === state.mode));
    btn.addEventListener('click', () => {
      state.mode = m.id;
      saveState();
      renderModes();
      newProblem();
    });
    modesEl.appendChild(btn);
  }
}

function renderTotalStars() {
  const total = Object.values(state.pieces).reduce(
    (sum, pieces) => sum + pieces.filter(Boolean).length, 0
  );
  totalStarsEl.textContent = String(total);
}

function renderAll() {
  renderBank();
  renderModes();
  renderPuzzle();
  renderTotalStars();
}

/* ================= Answer checking ================= */
function setFeedback(text, kind) {
  feedbackEl.textContent = text;
  feedbackEl.className = 'feedback' + (kind ? ` ${kind}` : '');
}

function earnPiece() {
  const pic = currentPic();
  const pieces = state.pieces[pic.id];
  const hidden = pieces.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  if (hidden.length === 0) return false;
  pieces[hidden[rand(0, hidden.length - 1)]] = true;
  return true;
}

function handleCorrect() {
  playCorrect();
  setFeedback(`${PRAISE[rand(0, PRAISE.length - 1)]} One more piece!`, 'good');
  const earned = earnPiece();
  saveState();
  renderPuzzle();
  renderBank();
  renderTotalStars();
  confetti(earned ? 26 : 10);

  const pic = currentPic();
  if (state.pieces[pic.id].every(Boolean)) {
    finishedJustNow = true;
    setTimeout(showCelebration, 700);
  } else {
    setTimeout(newProblem, 750);
  }
}

function handleWrong() {
  playWrong();
  current.wrongs++;
  const qCard = formEl;
  qCard.classList.remove('shake');
  void qCard.offsetWidth; // restart animation
  qCard.classList.add('shake');

  if (current.wrongs >= 2) {
    setFeedback(`The answer was ${current.answer}. Here is a new one! 💪`, 'bad');
    setTimeout(newProblem, 1600);
  } else {
    setFeedback('Not quite — try again! 🤔', 'bad');
    answerEl.focus();
    answerEl.select();
  }
}

formEl.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!current) return;
  const raw = answerEl.value.trim();
  if (raw === '') {
    setFeedback('Type your answer first! ✏️');
    answerEl.focus();
    return;
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    setFeedback('Try a whole number! 🔢');
    answerEl.focus();
    return;
  }
  if (n === current.answer) handleCorrect();
  else handleWrong();
});

answerEl.addEventListener('input', () => {
  // keep only digits
  const clean = answerEl.value.replace(/\D/g, '');
  if (clean !== answerEl.value) answerEl.value = clean;
});

/* ================= Celebration ================= */
function showCelebration() {
  const pic = currentPic();
  $('overlay-emoji').textContent = pic.emoji;
  $('overlay-title').textContent = 'You did it! 🎊';
  $('overlay-text').innerHTML =
    `You unlocked all <b>${TOTAL}</b> pieces of <b>${pic.name}</b>! ` +
    `Time to pick a new picture!`;
  overlayEl.classList.remove('hidden');
  overlayEl.setAttribute('aria-hidden', 'false');
  playWin();
  confetti(90);
}

function hideCelebration() {
  overlayEl.classList.add('hidden');
  overlayEl.setAttribute('aria-hidden', 'true');
}

$('overlay-keep').addEventListener('click', hideCelebration);

$('overlay-next').addEventListener('click', () => {
  hideCelebration();
  const bankCard = bankEl.closest('.card');
  bankCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

/* ================= Confetti ================= */
function confetti(count) {
  const colors = ['#ff6b6b', '#ffd93d', '#51cf66', '#4dabf7', '#b197fc', '#ff9f45'];
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti';
    const size = 8 + Math.random() * 9;
    piece.style.width = `${size}px`;
    piece.style.height = `${size * (Math.random() < 0.5 ? 1 : 0.6)}px`;
    piece.style.left = `${Math.random() * 100}vw`;
    piece.style.background = colors[i % colors.length];
    piece.style.borderRadius = Math.random() < 0.5 ? '50%' : '2px';
    piece.style.animationDuration = `${1.4 + Math.random() * 1.6}s`;
    piece.style.animationDelay = `${Math.random() * 0.35}s`;
    piece.addEventListener('animationend', () => piece.remove());
    confettiLayerEl.appendChild(piece);
  }
}

/* ================= Sound (WebAudio, no files needed) ================= */
function getAudio() {
  if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
  if (audio.state === 'suspended') audio.resume();
  return audio;
}

function tone(freq, when, dur, type = 'sine', gain = 0.14) {
  const ctx = getAudio();
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(gain, when);
  g.gain.exponentialRampToValueAtTime(0.001, when + dur);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(when);
  osc.stop(when + dur);
}

function playCorrect() {
  try {
    const t = getAudio().currentTime;
    tone(523.25, t, 0.12);
    tone(659.25, t + 0.1, 0.12);
    tone(783.99, t + 0.2, 0.2);
  } catch { /* sound unavailable */ }
}

function playWrong() {
  try {
    tone(185, getAudio().currentTime, 0.22, 'square', 0.06);
  } catch { /* sound unavailable */ }
}

function playWin() {
  try {
    const t = getAudio().currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, t + i * 0.13, 0.22));
  } catch { /* sound unavailable */ }
}

/* ================= Reset ================= */
$('reset').addEventListener('click', () => {
  if (!confirm('Reset ALL progress and start over?')) return;
  state = defaultState();
  saveState();
  finishedJustNow = false;
  lastProblem = '';
  renderAll();
  newProblem();
});

/* ================= Go! ================= */
renderAll();
newProblem();
