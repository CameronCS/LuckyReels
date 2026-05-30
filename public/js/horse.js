'use strict';
const NUM_HORSES  = 6;
const ADVANCE     = 0.27;
const PAYOUT_MULT = 4;

const HORSES = [
  { name: 'Thunder Bolt', color: '#FFD700' },
  { name: 'Lucky Strike', color: '#00FF87' },
  { name: 'Iron Duke',    color: '#0AF5F5' },
  { name: 'Wild Fire',    color: '#FF4455' },
  { name: 'Night Shadow', color: '#bb88ff' },
  { name: 'Silver Fox',   color: '#cccccc' },
];

const ORDINALS  = ['1st', '2nd', '3rd', '4th', '5th', '6th'];
const POS_CLASS = ['p1', 'p2', 'p3', '', '', ''];

let tokens = 0, bet = 10, selectedChip = 10, selectedHorse = -1;
let myPlayerId = null;
let racing = false;
let currentBet = 0;
let racePositions = new Array(NUM_HORSES).fill(0);
let raceSpeeds    = [];
let finishOrder   = [];
let winnerIdx     = -1;
let framesAfterWin = 0;

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
    document.getElementById('gameUI').classList.remove('hidden');
    buildUI();
    updateTokenDisplay();
    return;
  }
  if (msg.type === 'authError') { sessionStorage.removeItem('sessionToken'); window.location.href = '/'; return; }
  if (msg.type === 'tokens') { tokens = msg.value; bumpTokens(); updateTokenDisplay(); return; }

  if (msg.type === 'horse:result') {
    startRaceAnimation(msg);
    return;
  }

  if (msg.type === 'error') {
    racing = false;
    document.getElementById('raceBtn').disabled = false;
    document.querySelectorAll('.chip').forEach(b => b.disabled = false);
    document.querySelectorAll('.horse-card').forEach(c => c.style.pointerEvents = '');
    setStatus(msg.message || 'Error', '');
    return;
  }
});

function sendWS(obj) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); }

function updateTokenDisplay() {
  document.getElementById('tokenCount').textContent = tokens;
  document.getElementById('noTokensMsg').classList.toggle('hidden', tokens > 0);
}
function bumpTokens() {
  const el = document.getElementById('tokenCount');
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
}
function setStatus(text, cls = '') {
  const el = document.getElementById('statusBar');
  el.textContent = text;
  el.className = 'status-bar' + (cls ? ' ' + cls : '');
}

function startRace() {
  if (racing) return;
  if (selectedHorse < 0) { setStatus('Pick a horse first!', ''); return; }
  if (tokens < bet) { setStatus('Not enough tokens!', ''); return; }
  if (bet <= 0) return;

  racing = true;
  currentBet = bet;
  racePositions = new Array(NUM_HORSES).fill(0);
  finishOrder   = [];
  winnerIdx     = -1;
  framesAfterWin = 0;

  updateTrackPositions();
  document.querySelectorAll('.lane').forEach(l => l.classList.remove('winner-lane'));
  document.querySelectorAll('.lane-pos').forEach(el => { el.textContent = ''; el.className = 'lane-pos'; });
  document.getElementById('raceBtn').disabled = true;
  document.querySelectorAll('.chip').forEach(b => b.disabled = true);
  document.querySelectorAll('.horse-card').forEach(c => c.style.pointerEvents = 'none');

  sendWS({ type: 'horse:race', bet: currentBet, horseIndex: selectedHorse });
  setStatus('Waiting for server...', 'countdown');
}

function startRaceAnimation(serverResult) {
  const { winnerIndex, winnerName, net, tokens: newTokens } = serverResult;

  const packBase = 0.88 + Math.random() * 0.12;
  raceSpeeds = Array.from({ length: NUM_HORSES }, () => packBase + (Math.random() - 0.5) * 0.30);
  const maxSpeed = Math.max(...raceSpeeds);
  raceSpeeds[winnerIndex] = maxSpeed + 0.15;
  for (let i = 0; i < NUM_HORSES; i++) {
    if (i !== winnerIndex) raceSpeeds[i] = Math.min(raceSpeeds[i], maxSpeed * 0.92);
  }

  const counts = ['3', '2', '1', '🏁 GO!'];
  let ci = 0;
  setStatus(counts[ci], 'countdown');
  const cid = setInterval(() => {
    ci++;
    if (ci < counts.length) {
      setStatus(counts[ci], 'countdown');
    } else {
      clearInterval(cid);
      requestAnimationFrame(() => raceFrame(winnerIndex, winnerName, net, newTokens));
    }
  }, 620);
}

function raceFrame(targetWinner, winnerName, net, newTokens) {
  for (let i = 0; i < NUM_HORSES; i++) {
    if (racePositions[i] >= 100) continue;
    const noise = (Math.random() - 0.5) * 0.09;
    racePositions[i] = Math.min(100, racePositions[i] + ADVANCE * raceSpeeds[i] + noise);
    if (racePositions[i] >= 100 && !finishOrder.includes(i)) {
      finishOrder.push(i);
      if (winnerIdx < 0) winnerIdx = i;
    }
  }

  updateTrackPositions();

  if (winnerIdx >= 0) {
    framesAfterWin++;
    if (framesAfterWin >= 72) {
      Array.from({ length: NUM_HORSES }, (_, i) => i)
        .filter(i => !finishOrder.includes(i))
        .sort((a, b) => racePositions[b] - racePositions[a])
        .forEach(i => finishOrder.push(i));
      endRace(targetWinner, winnerName, net, newTokens);
      return;
    }
  }

  requestAnimationFrame(() => raceFrame(targetWinner, winnerName, net, newTokens));
}

function updateTrackPositions() {
  const ranked = Array.from({ length: NUM_HORSES }, (_, i) => i)
    .sort((a, b) => racePositions[b] - racePositions[a]);
  const rankOf = new Array(NUM_HORSES);
  ranked.forEach((hi, rank) => { rankOf[hi] = rank; });

  for (let i = 0; i < NUM_HORSES; i++) {
    const runner = document.getElementById(`runner-${i}`);
    const posEl  = document.getElementById(`lpos-${i}`);
    runner.style.left = (2 + Math.min(racePositions[i], 100) * 0.885) + '%';
    const rank = rankOf[i];
    posEl.textContent = ORDINALS[rank];
    posEl.className   = 'lane-pos' + (POS_CLASS[rank] ? ' ' + POS_CLASS[rank] : '');
  }

  if (winnerIdx < 0) setStatus(`${HORSES[ranked[0]].name} leads!`, 'racing');
}

function endRace(targetWinner, winnerName, net, newTokens) {
  tokens = newTokens;
  updateTokenDisplay();
  if (net > 0) bumpTokens();

  const playerWon = targetWinner === selectedHorse;
  if (playerWon) {
    setStatus(`🏆 ${winnerName} wins!  +${net}`, 'win');
    document.getElementById(`hcard-${selectedHorse}`).classList.add('card-winner');
  } else {
    setStatus(`${winnerName} wins  ·  −${Math.abs(net)}`, 'loss');
  }

  document.getElementById(`lane-${targetWinner}`).classList.add('winner-lane');

  setTimeout(() => {
    racing = false;
    document.getElementById('raceBtn').disabled = false;
    document.querySelectorAll('.chip').forEach(b => b.disabled = false);
    document.querySelectorAll('.horse-card').forEach(c => c.style.pointerEvents = '');
    if (tokens > 0) setStatus('Place your bet for the next race');
    else setStatus('Out of tokens — ask the admin for more');
  }, 2200);
}

function buildUI() {
  buildTrack();
  buildHorseCards();
  buildBetControls();
}

function buildTrack() {
  const section = document.getElementById('trackSection');
  HORSES.forEach((horse, i) => {
    const lane = document.createElement('div');
    lane.className = 'lane'; lane.id = `lane-${i}`;
    lane.innerHTML = `
      <div class="lane-label">
        <span class="lane-num horse-color-${i}">${i + 1}</span>
        <span class="lane-name" id="lname-${i}">${horse.name}</span>
      </div>
      <div class="track-strip">
        <div class="horse-runner" id="runner-${i}">🏇</div>
      </div>
      <div class="lane-pos" id="lpos-${i}"></div>`;
    section.appendChild(lane);
  });
}

function buildHorseCards() {
  const grid = document.getElementById('horseCards');
  HORSES.forEach((horse, i) => {
    const card = document.createElement('div');
    card.className = 'horse-card'; card.id = `hcard-${i}`;
    card.innerHTML = `
      <div class="horse-badge horse-bg-${i}">${i + 1}</div>
      <div class="horse-card-info">
        <div class="horse-card-name">${horse.name}</div>
        <div class="horse-card-payout">Pays ${PAYOUT_MULT}×</div>
      </div>`;
    card.addEventListener('click', () => selectHorse(i));
    grid.appendChild(card);
  });
}

function selectHorse(idx) {
  if (racing) return;
  selectedHorse = idx;
  document.querySelectorAll('.horse-card').forEach((c, i) => {
    const h = HORSES[i];
    if (i === idx) {
      c.classList.add('selected');
      c.style.borderColor = h.color;
      c.style.boxShadow   = `0 0 12px ${h.color}33`;
    } else {
      c.classList.remove('selected');
      c.style.borderColor = '';
      c.style.boxShadow   = '';
    }
  });
  document.querySelectorAll('.lane-name').forEach((el, i) => {
    el.className = i === idx ? 'lane-name selected-horse' : 'lane-name';
  });
  if (!racing) setStatus('Ready to race — click RACE!');
}

function setActiveChip(el) {
  document.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
}

function buildBetControls() {
  document.querySelectorAll('.chip[data-val]').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedChip = parseInt(btn.dataset.val);
      bet = selectedChip;
      setActiveChip(btn);
      document.getElementById('customChipInput').classList.add('hidden');
      document.getElementById('betDisplay').textContent = bet;
    });
  });

  const customBtn   = document.getElementById('customChipBtn');
  const customInput = document.getElementById('customChipInput');

  customBtn.addEventListener('click', () => {
    setActiveChip(customBtn);
    customInput.classList.remove('hidden');
    customInput.focus(); customInput.select();
  });

  function applyCustom() {
    const val = Math.max(1, parseInt(customInput.value) || 1);
    selectedChip = val; bet = val;
    document.getElementById('betDisplay').textContent = bet;
  }
  customInput.addEventListener('input', applyCustom);
  customInput.addEventListener('keydown', e => { if (e.key === 'Enter') { applyCustom(); customInput.blur(); } });

  document.getElementById('raceBtn').addEventListener('click', startRace);
}
