'use strict';
let tokens = 0, bet = 50, autoCashout = null;
let gameState = 'idle'; // 'idle' | 'playing' | 'ended'
let gameStartTime = null;   // performance.now() reference
let serverStartTime = null; // Date.now() value from server
let currentMult = 1.00;
let animFrame = null;
let cashoutBtn = null;

const canvas = document.getElementById('crashCanvas');
const ctx    = canvas.getContext('2d');

// ── WebSocket ──────────────────────────────────────────────────────
const worker = new SharedWorker('/js/ws-worker.js');
worker.port.start();
worker.port.postMessage({ type: 'init', token: sessionStorage.getItem('sessionToken') });
let wsReady = false, sessionReady = false;

worker.port.addEventListener('message', ({ data: msg }) => {
  if (msg.type === 'ws-open')   { wsReady = true;  return; }
  if (msg.type === 'ws-closed') { wsReady = false; return; }

  if (msg.type === 'joined') {
    wsReady = true;
    sessionStorage.setItem('sessionToken', msg.sessionToken);
    tokens = msg.tokens;
    document.getElementById('playerNameDisplay').textContent = msg.name;
    if (!sessionReady) {
      sessionReady = true;
      document.getElementById('loadingScreen').classList.add('hidden');
      document.getElementById('gameUI').classList.remove('hidden');
      resizeCanvas();
      renderIdle();
    }
    updateTokenDisplay();
    return;
  }
  if (msg.type === 'authError') {
    sessionStorage.removeItem('sessionToken');
    window.location.href = '/';
    return;
  }
  if (msg.type === 'tokens') {
    tokens = msg.value; bumpTokens(); updateTokenDisplay(); return;
  }
  if (msg.type === 'crash:started') {
    tokens = msg.tokens;
    serverStartTime = msg.startTime;
    autoCashout     = msg.autoCashout || null;
    startAnimation();
    return;
  }
  if (msg.type === 'crash:resumed') {
    tokens          = msg.tokens;
    serverStartTime = msg.startTime;
    autoCashout     = msg.autoCashout || null;
    startAnimation();
    return;
  }
  if (msg.type === 'crash:cashed_out') {
    tokens = msg.tokens;
    stopAnimation();
    const elapsed = Date.now() - serverStartTime;
    drawCurve(elapsed, false, msg.multiplier);
    setMultDisplay(msg.multiplier.toFixed(2) + '×', 'safe', 'CASHED OUT');
    bumpTokens(); updateTokenDisplay();
    const sign = msg.net >= 0 ? '+' : '';
    showResult('CASHED OUT  ' + msg.multiplier.toFixed(2) + '×  ' + sign + msg.net, 'result-win');
    renderPlayAgainBtn();
    return;
  }
  if (msg.type === 'crash:crashed') {
    tokens = msg.tokens;
    stopAnimation();
    const elapsed = Date.now() - serverStartTime;
    drawCurve(elapsed, true, msg.crashPoint);
    setMultDisplay(msg.crashPoint.toFixed(2) + '×', 'crashed', 'CRASHED');
    bumpTokens(); updateTokenDisplay();
    showResult('CRASHED  ' + msg.crashPoint.toFixed(2) + '×  ' + msg.net, 'result-lose');
    renderPlayAgainBtn();
    return;
  }
  if (msg.type === 'error') {
    stopAnimation();
    renderIdle();
    setMultDisplay('—', 'idle', msg.message);
    return;
  }
});

function sendWS(obj) { if (wsReady) worker.port.postMessage({ type: 'ws-send', data: obj }); }

// ── Animation loop ─────────────────────────────────────────────────
function getMultiplier(elapsedMs) {
  return Math.floor(Math.pow(Math.E, elapsedMs / 8000) * 100) / 100;
}

function startAnimation() {
  gameState     = 'playing';
  gameStartTime = performance.now() - (Date.now() - serverStartTime); // sync with server
  document.getElementById('controlsBar').classList.add('hidden');
  document.getElementById('autoCashoutBar').classList.add('hidden');
  setMultDisplay('1.00×', 'safe', autoCashout ? 'AUTO: ' + autoCashout.toFixed(2) + '×' : '');
  renderCashoutBtn(bet);
  animFrame = requestAnimationFrame(tick);
}

function tick(ts) {
  const elapsed = ts - gameStartTime;
  currentMult   = getMultiplier(elapsed);
  setMultDisplay(currentMult.toFixed(2) + '×', multClass(currentMult), autoCashout ? 'AUTO: ' + autoCashout.toFixed(2) + '×' : '');
  drawCurve(elapsed, false, null);
  if (cashoutBtn) {
    const val = Math.floor(bet * currentMult);
    cashoutBtn.textContent = 'CASH OUT · ' + val;
  }
  animFrame = requestAnimationFrame(tick);
}

function stopAnimation() {
  gameState = 'ended';
  if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
}

function multClass(m) {
  return m >= 5 ? 'danger' : m >= 2 ? 'warning' : 'safe';
}

// ── Canvas ─────────────────────────────────────────────────────────
function resizeCanvas() {
  canvas.width  = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
}
window.addEventListener('resize', () => { resizeCanvas(); });

function drawCurve(elapsedMs, crashed, endMult) {
  const W = canvas.width  || canvas.offsetWidth;
  const H = canvas.height || canvas.offsetHeight;
  if (!W || !H) return;

  const mult    = crashed ? endMult : (endMult !== null ? endMult : currentMult);
  const maxTime = Math.max(elapsedMs * 1.15, 4000);
  const maxMult = Math.max(mult * 1.25, 3.0);

  const tx = t => (t / maxTime) * W * 0.92 + W * 0.02;
  const ty = m => H - 18 - Math.max(0, ((m - 1) / (maxMult - 1)) * (H - 36));

  ctx.clearRect(0, 0, W, H);

  // Grid lines
  ctx.lineWidth = 1;
  ctx.font = '9px Space Mono, monospace';
  for (const gm of [2, 3, 5, 10, 20, 50, 100]) {
    if (gm > maxMult * 1.05) break;
    const y = ty(gm);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillText(gm + '×', 4, y - 3);
  }

  if (elapsedMs <= 0) return;

  const color = crashed ? '#FF4500' : mult >= 5 ? '#FF4500' : mult >= 2 ? '#FF9500' : '#00D4FF';

  // Curve
  const pts = Math.min(Math.round(elapsedMs / 30), 500);
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth   = 2.5;
  ctx.shadowColor = color;
  ctx.shadowBlur  = 10;
  ctx.moveTo(tx(0), ty(1.00));
  for (let i = 1; i <= pts; i++) {
    const t = (i / pts) * elapsedMs;
    ctx.lineTo(tx(t), ty(getMultiplier(t)));
  }
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Tip dot
  const tipX = tx(elapsedMs);
  const tipY = ty(mult);
  ctx.beginPath();
  ctx.fillStyle   = color;
  ctx.shadowColor = color;
  ctx.shadowBlur  = 18;
  ctx.arc(tipX, tipY, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

// ── UI helpers ─────────────────────────────────────────────────────
function setMultDisplay(value, cls, sub) {
  const el  = document.getElementById('multValue');
  const sub_el = document.getElementById('multSub');
  el.textContent  = value;
  el.className    = 'mult-value ' + (cls || 'idle');
  sub_el.textContent = sub || '';
}

function showResult(text, cls) {
  const el = document.getElementById('crashDisplay');
  const existing = el.querySelector('.crash-result');
  if (existing) existing.remove();
  const div = document.createElement('div');
  div.className   = 'crash-result ' + cls;
  div.textContent = text;
  el.appendChild(div);
}

function clearResult() {
  const el = document.getElementById('crashDisplay').querySelector('.crash-result');
  if (el) el.remove();
}

function renderIdle() {
  gameState = 'idle';
  cashoutBtn = null;
  document.getElementById('controlsBar').classList.remove('hidden');
  document.getElementById('autoCashoutBar').classList.remove('hidden');
  setMultDisplay('—', 'idle', '');
  drawCurve(0, false, null);

  const bar      = document.getElementById('actionBar');
  const noTokens = document.getElementById('noTokensMsg');
  if (tokens <= 0) { bar.innerHTML = ''; noTokens.classList.remove('hidden'); return; }
  noTokens.classList.add('hidden');
  bar.innerHTML = '';
  const canAfford = tokens >= bet;
  const btn = document.createElement('button');
  btn.className   = 'btn-launch';
  btn.disabled    = !canAfford;
  btn.textContent = canAfford ? `BET & LAUNCH · ${bet}` : `Need ${bet} tokens`;
  btn.addEventListener('click', () => {
    if (gameState !== 'idle' || tokens < bet) return;
    clearResult();
    const acVal = parseFloat(document.getElementById('autoCashoutInput').value);
    const ac    = (!isNaN(acVal) && acVal > 1.00) ? acVal : null;
    sendWS({ type: 'crash:start', bet, autoCashout: ac });
  });
  bar.appendChild(btn);
}

function renderCashoutBtn(currentVal) {
  const bar = document.getElementById('actionBar');
  bar.innerHTML = '';
  const btn = document.createElement('button');
  btn.className   = 'btn-cashout';
  btn.textContent = 'CASH OUT · ' + currentVal;
  btn.addEventListener('click', () => {
    if (gameState !== 'playing') return;
    sendWS({ type: 'crash:cashout' });
  });
  bar.appendChild(btn);
  cashoutBtn = btn;
}

function renderPlayAgainBtn() {
  cashoutBtn = null;
  const bar = document.getElementById('actionBar');
  bar.innerHTML = '';
  const btn = document.createElement('button');
  btn.className   = 'btn-launch';
  btn.textContent = 'PLAY AGAIN';
  btn.addEventListener('click', () => renderIdle());
  bar.appendChild(btn);
}

function updateTokenDisplay() {
  document.getElementById('tokenCount').textContent = tokens;
  document.getElementById('betDisplay').textContent  = bet;
}
function bumpTokens() {
  const el = document.getElementById('tokenCount');
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
}

// ── Bet controls ───────────────────────────────────────────────────
function setBet(amount, btnEl) {
  if (gameState !== 'idle') return;
  bet = amount;
  document.querySelectorAll('.bet-btn').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  document.getElementById('betCustom').value = '';
  document.getElementById('betDisplay').textContent = bet;
  renderIdle();
}

document.querySelectorAll('.bet-btn[data-val]').forEach(btn => {
  btn.addEventListener('click', () => setBet(parseInt(btn.dataset.val), btn));
});
document.getElementById('betCustom').addEventListener('input', function () {
  if (gameState !== 'idle') return;
  const val = parseInt(this.value);
  if (val && val >= 10) {
    bet = val;
    document.querySelectorAll('.bet-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('betDisplay').textContent = bet;
    renderIdle();
  }
});
