'use strict';

const ROWS  = 8;
const SLOTS = 9;

const MULTIPLIERS = {
  low:    [5.6, 2.1, 1.1, 1.0, 0.5, 1.0, 1.1, 2.1, 5.6],
  medium: [13,  3,   1.3, 0.7, 0.4, 0.7, 1.3, 3,   13 ],
  high:   [29,  4,   1.5, 0.3, 0.2, 0.3, 1.5, 4,   29 ],
};

let tokens = 0, bet = 10, risk = 'medium';
let dropping = false;

const canvas = document.getElementById('plinkoCanvas');
const ctx    = canvas.getContext('2d');

// ── WebSocket ──────────────────────────────────────────────────────
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
    initCanvas();
    drawIdleBoard();
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
  if (msg.type === 'plinko:result') {
    tokens = msg.tokens;
    animate(msg.path, msg.slot, msg.mult, msg.net);
    return;
  }
  if (msg.type === 'error') {
    dropping = false;
    renderIdle();
    showResult(msg.message, false);
    return;
  }
});

function sendWS(obj) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); }

// ── Canvas metrics ─────────────────────────────────────────────────
function initCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const w   = canvas.offsetWidth;
  const h   = canvas.offsetHeight;
  canvas.width  = w * dpr;
  canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

window.addEventListener('resize', () => {
  initCanvas();
  if (!dropping) drawIdleBoard();
});

function metrics() {
  const W        = canvas.offsetWidth;
  const H        = canvas.offsetHeight;
  const padX     = 14;
  const s        = (W - 2 * padX) / SLOTS;
  const topPad   = 36;
  const slotH    = Math.min(44, H * 0.12);
  const rowH     = (H - topPad - slotH - 10) / (ROWS + 0.5);
  const boardTop = topPad + rowH * 0.5;
  const slotsY   = boardTop + ROWS * rowH;
  return { W, H, s, padX, topPad, rowH, boardTop, slotsY, slotH };
}

// pixel x for a position in "slot-unit" space (0–8 from center)
function px(pos, m) { return m.padX + (pos + 0.5) * m.s; }

// ── Drawing ────────────────────────────────────────────────────────
function slotColor(mult) {
  if (mult >= 10)  return '#FF3B3B';
  if (mult >= 3)   return '#FF9500';
  if (mult >= 1.5) return '#FFD700';
  if (mult >= 1)   return '#00D4FF';
  if (mult >= 0.5) return '#666';
  return '#444';
}

function drawBoard(m, ballX, ballY, hitPeg, landedSlot) {
  const { W, H, s, padX, rowH, boardTop, slotsY, slotH } = m;
  ctx.clearRect(0, 0, W, H);

  // ── Slots ────────────────────────────────────────────────────────
  const mults = MULTIPLIERS[risk];
  for (let k = 0; k < SLOTS; k++) {
    const x    = padX + k * s;
    const col  = slotColor(mults[k]);
    const isLanded = landedSlot === k;
    ctx.fillStyle = isLanded ? col : col + '55';
    roundRect(ctx, x + 2, slotsY + 4, s - 4, slotH, 6);
    ctx.fill();
    if (isLanded) {
      ctx.shadowColor = col; ctx.shadowBlur = 18;
      roundRect(ctx, x + 2, slotsY + 4, s - 4, slotH, 6);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.fillStyle = isLanded ? '#fff' : 'rgba(255,255,255,0.6)';
    ctx.font = `bold ${Math.max(9, Math.floor(s * 0.22))}px Space Mono, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(mults[k] + '×', x + s / 2, slotsY + 4 + slotH / 2);
  }

  // ── Pegs ─────────────────────────────────────────────────────────
  const pegR = Math.max(3, Math.floor(s * 0.09));
  for (let r = 0; r < ROWS; r++) {
    const y = boardTop + r * rowH;
    for (let i = 0; i <= r; i++) {
      const xPos = (SLOTS / 2) - r / 2 + i;
      const x    = padX + xPos * s;
      const isHit = hitPeg && hitPeg.row === r && hitPeg.idx === i;
      ctx.beginPath();
      ctx.arc(x, y, pegR, 0, Math.PI * 2);
      if (isHit) {
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 12;
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.shadowBlur = 0;
      }
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  // ── Ball ─────────────────────────────────────────────────────────
  if (ballX !== null && ballY !== null) {
    const ballR = Math.max(6, Math.floor(s * 0.16));
    ctx.beginPath();
    ctx.arc(ballX, ballY, ballR, 0, Math.PI * 2);
    ctx.fillStyle = '#FFD700';
    ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 20;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function drawIdleBoard() {
  const m = metrics();
  drawBoard(m, null, null, null, -1);
}

// ── Animation ──────────────────────────────────────────────────────
function animate(path, slot, mult, net) {
  const m = metrics();
  const { s, padX, rowH, boardTop, slotsY } = m;

  // Ball x positions (in pixels) at each step
  const xPos = [];
  let bx = padX + 4.5 * s; // start center
  xPos.push(bx);
  for (let r = 0; r < ROWS; r++) {
    bx += path[r] === 1 ? s / 2 : -s / 2;
    xPos.push(bx);
  }

  // Ball y positions at each step
  const yPos = [boardTop - rowH * 0.6]; // start above first peg
  for (let r = 0; r < ROWS; r++) yPos.push(boardTop + r * rowH);
  yPos.push(slotsY + 20); // land in slot

  // Which specific peg index (within its row) the ball hits at each row
  // equals the number of right turns taken before reaching that row
  const hitPegIndices = [];
  let rights = 0;
  for (let r = 0; r < ROWS; r++) {
    hitPegIndices.push(rights);
    if (path[r] === 1) rights++;
  }

  const STEP_MS = 190;
  const TOTAL   = (ROWS + 1) * STEP_MS;
  let startTs   = null;

  function frame(ts) {
    if (!startTs) startTs = ts;
    const elapsed = ts - startTs;
    const stepF   = elapsed / STEP_MS;
    const step    = Math.min(Math.floor(stepF), ROWS);
    const prog    = Math.min(stepF - step, 1);
    const t       = easeInOut(prog);

    const fromX = step === 0 ? padX + 4.5 * s : xPos[step];
    const toX   = xPos[step + 1] ?? xPos[step];
    const fromY = yPos[step];
    const toY   = yPos[step + 1] ?? yPos[step];

    const ballX = fromX + (toX - fromX) * t;
    const ballY = fromY + (toY - fromY) * t;

    // flash only the specific peg the ball just left
    const hitPeg = step > 0 && prog < 0.35
      ? { row: step - 1, idx: hitPegIndices[step - 1] }
      : null;

    drawBoard(m, ballX, ballY, hitPeg, elapsed >= TOTAL ? slot : -1);

    if (elapsed < TOTAL + STEP_MS * 0.5) {
      requestAnimationFrame(frame);
    } else {
      // Animation done
      drawBoard(m, null, null, null, slot);
      dropping = false;
      bumpTokens();
      updateTokenDisplay();
      const sign = net >= 0 ? '+' : '';
      showResult(mult + '×  ' + sign + net, net >= 0);
      renderIdle();
    }
  }

  requestAnimationFrame(frame);
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// ── Result overlay ─────────────────────────────────────────────────
function showResult(text, isWin) {
  const el = document.getElementById('resultOverlay');
  el.textContent = text;
  el.className   = 'result-overlay ' + (isWin ? 'win' : 'lose');
  setTimeout(() => { el.className = 'result-overlay hidden'; }, 2800);
}

// ── UI state ───────────────────────────────────────────────────────
function renderIdle() {
  const bar      = document.getElementById('actionBar');
  const noTokens = document.getElementById('noTokensMsg');
  if (tokens <= 0) { bar.innerHTML = ''; noTokens.style.display = 'block'; return; }
  noTokens.style.display = 'none';
  bar.innerHTML = '';
  const canAfford = tokens >= bet;
  const btn = document.createElement('button');
  btn.className   = 'btn-drop';
  btn.disabled    = !canAfford;
  btn.textContent = canAfford ? `DROP · ${bet}` : `Need ${bet} tokens`;
  btn.addEventListener('click', () => {
    if (dropping || tokens < bet) return;
    dropping = true;
    btn.disabled = true;
    sendWS({ type: 'plinko:drop', bet, risk });
  });
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

// ── Risk selector ──────────────────────────────────────────────────
document.querySelectorAll('.risk-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (dropping) return;
    risk = btn.dataset.val;
    document.querySelectorAll('.risk-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    drawIdleBoard();
    renderIdle();
  });
});

// ── Bet controls ───────────────────────────────────────────────────
function setBet(amount, btnEl) {
  if (dropping) return;
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
  if (dropping) return;
  const val = parseInt(this.value);
  if (val && val >= 10) {
    bet = val;
    document.querySelectorAll('.bet-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('betDisplay').textContent = bet;
    renderIdle();
  }
});
