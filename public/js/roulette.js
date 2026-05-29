'use strict';
const RED_NUMS   = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const WHEEL_ORDER = [0,28,9,26,30,11,7,20,32,17,5,22,34,15,3,24,36,13,1,37,27,10,25,29,12,8,19,31,18,6,21,33,16,4,23,35,14,2];

let tokens = 0, selectedChip = 5, spinning = false, wheelRot = 0;
let myPlayerId = null;
const bets = {}; // key → { amount }

const wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
const ws = new WebSocket(`${wsProto}://${location.host}`);

ws.addEventListener('open', () => {
  const token = sessionStorage.getItem('sessionToken');
  if (!token) { window.location.href = '/'; return; }
  ws.send(JSON.stringify({ type: 'reconnect', token }));
});

ws.addEventListener('message', e => {
  const msg = JSON.parse(e.data);
  if (msg.type === 'joined') {
    sessionStorage.setItem('sessionToken', msg.sessionToken);
    myPlayerId = msg.playerId;
    tokens = msg.tokens;
    document.getElementById('playerNameDisplay').textContent = msg.name;
    document.getElementById('loadingScreen').classList.add('hidden');
    document.getElementById('gameUI').style.display = '';
    buildTable();
    initControls();
    updateTokenDisplay();
    return;
  }
  if (msg.type === 'authError') { sessionStorage.removeItem('sessionToken'); window.location.href = '/'; return; }
  if (msg.type === 'tokens') { tokens = msg.value; bumpTokens(); updateTokenDisplay(); return; }

  if (msg.type === 'roulette:result') {
    animateToResult(msg.winNum, msg.net, msg.tokens, msg.winningKeys);
    return;
  }

  if (msg.type === 'error') {
    spinning = false;
    document.getElementById('spinBtn').disabled = false;
    document.getElementById('clearBtn').disabled = false;
    document.getElementById('resultBar').textContent = msg.message || 'Error';
    document.getElementById('resultBar').className = 'result-bar loss';
    return;
  }
});

function sendWS(obj) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); }

function updateTokenDisplay() {
  document.getElementById('tokenCount').textContent = tokens;
  document.getElementById('noTokensMsg').style.display = tokens <= 0 ? '' : 'none';
}
function bumpTokens() {
  const el = document.getElementById('tokenCount');
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
}

// ── Canvas wheel ───────────────────────────────────────────────────
const canvas = document.getElementById('wheelCanvas');
const ctx    = canvas.getContext('2d');

function pocketColor(n) {
  if (n === 0 || n === 37) return '#1a5c1a';
  return RED_NUMS.has(n) ? '#8b1515' : '#0e0e1c';
}

function drawWheel() {
  const cx = canvas.width / 2, cy = canvas.height / 2;
  const r = cx - 10;
  const n = WHEEL_ORDER.length;
  const arc = (2 * Math.PI) / n;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.beginPath();
  ctx.arc(cx, cy, r + 8, 0, 2 * Math.PI);
  ctx.fillStyle = '#1a0a00'; ctx.fill();
  ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 2; ctx.stroke();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(wheelRot * Math.PI / 180);

  for (let i = 0; i < n; i++) {
    const num = WHEEL_ORDER[i];
    const s   = -Math.PI / 2 + i * arc;
    const e   = s + arc;
    const mid = s + arc / 2;

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, s, e);
    ctx.closePath();
    ctx.fillStyle = pocketColor(num); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 0.7; ctx.stroke();

    const tr = r * 0.77;
    ctx.save();
    ctx.translate(tr * Math.cos(mid), tr * Math.sin(mid));
    ctx.rotate(mid + Math.PI / 2);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(num === 37 ? '00' : String(num), 0, 0);
    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(0, 0, r * 0.2, 0, 2 * Math.PI);
  ctx.fillStyle = '#0a0a0f'; ctx.fill();
  ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 1.5; ctx.stroke();

  ctx.restore();

  ctx.save();
  ctx.translate(cx, cy - r - 2);
  ctx.beginPath();
  ctx.moveTo(-7, -6); ctx.lineTo(7, -6); ctx.lineTo(0, 10);
  ctx.closePath(); ctx.fillStyle = '#FFD700'; ctx.fill();
  ctx.restore();
}

drawWheel();

function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

function getTotalBet() {
  return Object.values(bets).reduce((s, b) => s + b.amount, 0);
}

function spin() {
  if (spinning) return;
  const totalBet = getTotalBet();
  if (totalBet === 0 || tokens < totalBet) return;

  spinning = true;
  document.querySelectorAll('.bet-cell.winner').forEach(el => el.classList.remove('winner'));
  document.getElementById('resultBar').className = 'result-bar';
  document.getElementById('resultBar').textContent = '';
  document.getElementById('spinBtn').disabled = true;
  document.getElementById('clearBtn').disabled = true;

  const betData = {};
  for (const [key, b] of Object.entries(bets)) {
    if (b.amount > 0) betData[key] = b.amount;
  }
  sendWS({ type: 'roulette:spin', bets: betData });

  const randomIdx = Math.floor(Math.random() * 38);
  const sectorDeg = 360 / 38;
  let fakeTarget  = -(randomIdx + 0.5) * sectorDeg;
  while (fakeTarget < wheelRot + 1800) fakeTarget += 360;

  const startRot  = wheelRot;
  const startTime = performance.now();
  let frameHandle;

  function animFrame(now) {
    const t = Math.min((now - startTime) / 4500, 1);
    wheelRot = startRot + (fakeTarget - startRot) * easeOut(t);
    drawWheel();
    if (t < 1) spin._frameHandle = requestAnimationFrame(animFrame);
  }
  spin._frameHandle = requestAnimationFrame(animFrame);
}

function animateToResult(winNum, net, newTokens, winningKeys) {
  cancelAnimationFrame(spin._frameHandle);

  const winIdx    = WHEEL_ORDER.indexOf(winNum);
  const sectorDeg = 360 / 38;
  let targetRot   = -(winIdx + 0.5) * sectorDeg;
  while (targetRot < wheelRot + 900) targetRot += 360;

  const startRot  = wheelRot;
  const duration  = 2200;
  const startTime = performance.now();

  function frame(now) {
    const t = Math.min((now - startTime) / duration, 1);
    wheelRot = startRot + (targetRot - startRot) * easeOut(t);
    drawWheel();
    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      wheelRot = targetRot;
      drawWheel();
      finishSpin(winNum, net, newTokens, winningKeys);
    }
  }
  requestAnimationFrame(frame);
}

function finishSpin(winNum, net, newTokens, winningKeys) {
  tokens = newTokens;
  updateTokenDisplay();
  if (net > 0) bumpTokens();

  const label      = winNum === 37 ? '00' : String(winNum);
  const numCls     = (winNum === 0 || winNum === 37) ? 'green-num' : RED_NUMS.has(winNum) ? 'red-num' : 'black-num';
  const colorLabel = (winNum === 0 || winNum === 37) ? 'GREEN' : RED_NUMS.has(winNum) ? 'RED' : 'BLACK';

  document.getElementById('winNum').textContent = label;
  document.getElementById('winNum').className   = `win-num-display ${numCls}`;

  const barCls  = net > 0 ? 'win' : net < 0 ? 'loss' : 'push';
  const barText = net > 0 ? `${colorLabel} · +${net}` : net < 0 ? `${colorLabel} · −${Math.abs(net)}` : `${colorLabel} · PUSH`;
  document.getElementById('resultBar').textContent = barText;
  document.getElementById('resultBar').className   = `result-bar ${barCls}`;

  for (const key of (winningKeys || [])) {
    const el = document.querySelector(`[data-bet-key="${key}"]`);
    if (el) el.classList.add('winner');
  }

  spinning = false;
  document.getElementById('spinBtn').disabled = false;
  document.getElementById('clearBtn').disabled = false;
}

// ── Bet management ─────────────────────────────────────────────────
function placeBet(key) {
  if (spinning) return;
  if (!bets[key]) bets[key] = { amount: 0 };
  bets[key].amount += selectedChip;
  updateChipDisplay(key);
  updateTotalBet();
}

function updateChipDisplay(key) {
  const cell = document.querySelector(`[data-bet-key="${key}"]`);
  if (!cell) return;
  let chip = cell.querySelector('.chip-stack');
  const amt = bets[key]?.amount || 0;
  if (amt === 0) { if (chip) chip.remove(); return; }
  if (!chip) {
    chip = document.createElement('div');
    chip.className = 'chip-stack';
    cell.appendChild(chip);
  }
  chip.textContent = amt >= 1000 ? Math.round(amt / 1000) + 'k' : String(amt);
}

function updateTotalBet() {
  document.getElementById('totalBetDisplay').textContent = getTotalBet();
}

function clearBets() {
  if (spinning) return;
  for (const key of Object.keys(bets)) { delete bets[key]; updateChipDisplay(key); }
  updateTotalBet();
  document.querySelectorAll('.bet-cell.winner').forEach(el => el.classList.remove('winner'));
  document.getElementById('winNum').textContent = '—';
  document.getElementById('winNum').className   = 'win-num-display';
  document.getElementById('resultBar').textContent = '';
  document.getElementById('resultBar').className   = 'result-bar';
}

// ── Table builder ──────────────────────────────────────────────────
function makeCell(cls, text, key) {
  const div = document.createElement('div');
  div.className  = `bet-cell ${cls}`;
  div.dataset.betKey = key;
  div.textContent = text;
  div.addEventListener('click', () => placeBet(key));
  return div;
}

function buildTable() {
  const table = document.getElementById('betTable');

  const z0 = makeCell('num-cell green-num', '0', 'straight-0');
  z0.style.gridRow = '1'; z0.style.gridColumn = '1 / 7';
  table.appendChild(z0);

  const z00 = makeCell('num-cell green-num', '00', 'straight-37');
  z00.style.gridRow = '1'; z00.style.gridColumn = '7 / 13';
  table.appendChild(z00);

  const numRows = [
    { nums: [3,6,9,12,15,18,21,24,27,30,33,36], colKey: 'col-3' },
    { nums: [2,5,8,11,14,17,20,23,26,29,32,35], colKey: 'col-2' },
    { nums: [1,4,7,10,13,16,19,22,25,28,31,34], colKey: 'col-1' },
  ];

  numRows.forEach(({ nums, colKey }, rowOffset) => {
    const gridRow = String(rowOffset + 2);
    nums.forEach((n, i) => {
      const cls  = RED_NUMS.has(n) ? 'num-cell red-num' : 'num-cell black-num';
      const cell = makeCell(cls, String(n), `straight-${n}`);
      cell.style.gridRow = gridRow; cell.style.gridColumn = String(i + 1);
      table.appendChild(cell);
    });
    const colBtn = document.createElement('div');
    colBtn.className = 'bet-cell col-bet'; colBtn.dataset.betKey = colKey;
    colBtn.textContent = '2:1';
    colBtn.style.gridRow = gridRow; colBtn.style.gridColumn = '13';
    colBtn.addEventListener('click', () => placeBet(colKey));
    table.appendChild(colBtn);
  });

  const dozens = [
    { text: '1st 12', key: 'dozen-1', col: '1 / 5'  },
    { text: '2nd 12', key: 'dozen-2', col: '5 / 9'  },
    { text: '3rd 12', key: 'dozen-3', col: '9 / 13' },
  ];
  dozens.forEach(({ text, key, col }) => {
    const cell = makeCell('dozen-cell', text, key);
    cell.style.gridRow = '5'; cell.style.gridColumn = col;
    table.appendChild(cell);
  });

  const evenBets = [
    { text: '1–18',  key: 'low',   col: '1 / 3',   cls: 'even-cell' },
    { text: 'Even',  key: 'even',  col: '3 / 5',   cls: 'even-cell' },
    { text: '●',     key: 'red',   col: '5 / 7',   cls: 'even-cell red-cell' },
    { text: '●',     key: 'black', col: '7 / 9',   cls: 'even-cell black-cell' },
    { text: 'Odd',   key: 'odd',   col: '9 / 11',  cls: 'even-cell' },
    { text: '19–36', key: 'high',  col: '11 / 13', cls: 'even-cell' },
  ];
  evenBets.forEach(({ text, key, col, cls }) => {
    const cell = makeCell(cls, text, key);
    cell.style.gridRow = '6'; cell.style.gridColumn = col;
    table.appendChild(cell);
  });
}

// ── Controls init ──────────────────────────────────────────────────
function setActiveChip(el) {
  document.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
}

function initControls() {
  document.querySelectorAll('.chip[data-val]').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedChip = parseInt(btn.dataset.val);
      setActiveChip(btn);
      document.getElementById('customChipInput').style.display = 'none';
    });
  });

  const customBtn   = document.getElementById('customChipBtn');
  const customInput = document.getElementById('customChipInput');

  customBtn.addEventListener('click', () => {
    setActiveChip(customBtn);
    customInput.style.display = '';
    customInput.focus(); customInput.select();
  });

  function applyCustom() {
    const val = Math.max(1, parseInt(customInput.value) || 1);
    selectedChip = val;
  }
  customInput.addEventListener('input', applyCustom);
  customInput.addEventListener('keydown', e => { if (e.key === 'Enter') { applyCustom(); customInput.blur(); } });

  document.getElementById('spinBtn').addEventListener('click', spin);
  document.getElementById('clearBtn').addEventListener('click', clearBets);
}
