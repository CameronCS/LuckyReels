'use strict';
let tokens = 0, bet = 1, mineCount = 3;
let gameState = 'idle'; // 'idle' | 'playing' | 'ended'
let revealedSafe = new Set();
let cellEls = [];

const wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
const ws = new WebSocket(`${wsProto}://${location.host}`);

ws.addEventListener('open', () => {
  const token = sessionStorage.getItem('sessionToken');
  if (!token) { window.location.href = '/'; return; }
  ws.send(JSON.stringify({ type: 'reconnect', token }));
});

ws.addEventListener('message', (e) => {
  const msg = JSON.parse(e.data);

  if (msg.type === 'joined') {
    sessionStorage.setItem('sessionToken', msg.sessionToken);
    tokens = msg.tokens;
    document.getElementById('playerNameDisplay').textContent = msg.name;
    document.getElementById('loadingScreen').classList.add('hidden');
    document.getElementById('gameUI').style.display = '';
    buildGrid();
    updateTokenDisplay();
    renderIdle();
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
  if (msg.type === 'mines:started') {
    tokens = msg.tokens;
    startPlaying(msg.mineCount, msg.bet);
    return;
  }
  if (msg.type === 'mines:safe') {
    revealSafeCell(msg.cellIndex);
    updateStatus(msg.multiplier, msg.cashoutValue);
    renderCashoutBtn(msg.cashoutValue);
    return;
  }
  if (msg.type === 'mines:exploded') {
    tokens = msg.tokens;
    handleExplosion(msg.cellIndex, msg.minePositions, msg.net);
    return;
  }
  if (msg.type === 'mines:cashout') {
    tokens = msg.tokens;
    handleCashout(msg.minePositions, msg.multiplier, msg.net);
    return;
  }
  if (msg.type === 'mines:resumed') {
    startPlaying(msg.mineCount, msg.bet);
    msg.revealed.forEach(idx => revealSafeCell(idx));
    if (msg.revealed.length > 0) {
      updateStatus(msg.multiplier, msg.cashoutValue);
      renderCashoutBtn(msg.cashoutValue);
    }
    return;
  }
  if (msg.type === 'error') {
    gameState = 'idle';
    renderIdle();
    showBanner(msg.message, 'banner-lose');
    setTimeout(() => hideBanner(), 2500);
    return;
  }
});

function sendWS(obj) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); }

// ── Grid ───────────────────────────────────────────────────────────
function buildGrid() {
  const grid = document.getElementById('minesGrid');
  grid.innerHTML = '';
  cellEls = [];
  for (let i = 0; i < 25; i++) {
    const cell = document.createElement('div');
    cell.className = 'mine-cell';
    cell.addEventListener('click', () => handleCellClick(i));
    grid.appendChild(cell);
    cellEls.push(cell);
  }
}

function handleCellClick(idx) {
  if (gameState !== 'playing') return;
  if (revealedSafe.has(idx)) return;
  sendWS({ type: 'mines:reveal', cellIndex: idx });
}

function revealSafeCell(idx) {
  const cell = cellEls[idx];
  cell.className = 'mine-cell safe';
  cell.textContent = '💎';
  revealedSafe.add(idx);
}

function revealMineCell(idx, isClicked) {
  const cell = cellEls[idx];
  cell.className = 'mine-cell mine' + (isClicked ? ' clicked' : '');
  cell.textContent = '💣';
}

function resetGrid() {
  revealedSafe.clear();
  cellEls.forEach(c => { c.className = 'mine-cell'; c.textContent = ''; });
}

// ── State transitions ──────────────────────────────────────────────
function startPlaying(mc, b) {
  gameState = 'playing';
  mineCount = mc;
  bet = b;
  revealedSafe.clear();
  resetGrid();
  document.getElementById('minesCountBar').classList.add('hidden');
  document.getElementById('controlsBar').classList.add('hidden');
  document.getElementById('minesGrid').classList.add('playing');
  document.getElementById('gameStatus').classList.remove('hidden');
  document.getElementById('resultBanner').className = 'result-banner';
  document.getElementById('resultBanner').textContent = '';
  document.getElementById('minesCountDisplay').textContent = mc + ' 💣';
  document.getElementById('multiplierDisplay').textContent = '1.00×';
  document.getElementById('cashoutDisplay').textContent = bet + ' 🪙';
  updateTokenDisplay();
  renderCashoutBtn(bet);
}

function handleExplosion(clickedIdx, minePositions, net) {
  gameState = 'ended';
  revealMineCell(clickedIdx, true);
  minePositions.forEach(idx => { if (idx !== clickedIdx) revealMineCell(idx, false); });
  document.getElementById('minesGrid').classList.remove('playing');
  document.getElementById('gameStatus').classList.add('hidden');
  bumpTokens(); updateTokenDisplay();
  showBanner('💥 BOOM!  ' + net, 'banner-lose');
  renderPlayAgainBtn();
}

function handleCashout(minePositions, multiplier, net) {
  gameState = 'ended';
  minePositions.forEach(idx => revealMineCell(idx, false));
  document.getElementById('minesGrid').classList.remove('playing');
  document.getElementById('gameStatus').classList.add('hidden');
  bumpTokens(); updateTokenDisplay();
  const sign = net >= 0 ? '+' : '';
  showBanner('💎 ' + multiplier + '×  ' + sign + net, 'banner-win');
  renderPlayAgainBtn();
}

function renderIdle() {
  gameState = 'idle';
  document.getElementById('minesCountBar').classList.remove('hidden');
  document.getElementById('controlsBar').classList.remove('hidden');
  document.getElementById('minesGrid').classList.remove('playing');
  document.getElementById('gameStatus').classList.add('hidden');

  const bar      = document.getElementById('actionBar');
  const noTokens = document.getElementById('noTokensMsg');
  if (tokens <= 0) {
    bar.innerHTML = '';
    noTokens.style.display = 'block';
    return;
  }
  noTokens.style.display = 'none';
  bar.innerHTML = '';
  const canAfford = tokens >= bet;
  const btn = document.createElement('button');
  btn.className   = 'btn-start';
  btn.disabled    = !canAfford;
  btn.textContent = canAfford ? `START GAME · ${bet}` : `Need ${bet} tokens`;
  btn.addEventListener('click', () => {
    if (gameState !== 'idle' || tokens < bet) return;
    sendWS({ type: 'mines:start', bet, mineCount });
  });
  bar.appendChild(btn);
}

function renderCashoutBtn(cashoutValue) {
  const bar = document.getElementById('actionBar');
  bar.innerHTML = '';
  const canCashout = revealedSafe.size > 0;
  const btn = document.createElement('button');
  btn.className   = 'btn-cashout';
  btn.disabled    = !canCashout;
  btn.textContent = canCashout ? `CASH OUT · ${cashoutValue}` : 'Reveal a cell first';
  btn.addEventListener('click', () => {
    if (gameState !== 'playing' || revealedSafe.size === 0) return;
    sendWS({ type: 'mines:cashout' });
  });
  bar.appendChild(btn);
}

function renderPlayAgainBtn() {
  const bar = document.getElementById('actionBar');
  bar.innerHTML = '';
  const btn = document.createElement('button');
  btn.className   = 'btn-start';
  btn.textContent = 'PLAY AGAIN';
  btn.addEventListener('click', () => {
    hideBanner();
    resetGrid();
    renderIdle();
  });
  bar.appendChild(btn);
}

// ── UI helpers ─────────────────────────────────────────────────────
function updateStatus(mult, cashout) {
  document.getElementById('multiplierDisplay').textContent = mult + '×';
  document.getElementById('cashoutDisplay').textContent = cashout + ' 🪙';
}

function showBanner(text, cls) {
  const el = document.getElementById('resultBanner');
  el.textContent = text;
  el.className = 'result-banner ' + cls;
}

function hideBanner() {
  const el = document.getElementById('resultBanner');
  el.className = 'result-banner';
  el.textContent = '';
}

function updateTokenDisplay() {
  document.getElementById('tokenCount').textContent = tokens;
  document.getElementById('betDisplay').textContent = bet;
}

function bumpTokens() {
  const el = document.getElementById('tokenCount');
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
}

// ── Mine count selector ────────────────────────────────────────────
document.querySelectorAll('.mc-btn[data-val]').forEach(btn => {
  btn.addEventListener('click', () => {
    if (gameState !== 'idle') return;
    mineCount = parseInt(btn.dataset.val);
    document.querySelectorAll('.mc-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

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
  if (val && val > 0) {
    bet = val;
    document.querySelectorAll('.bet-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('betDisplay').textContent = bet;
    renderIdle();
  }
});
