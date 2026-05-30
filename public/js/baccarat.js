'use strict';
let tokens = 0, bet = 1, betType = 'player';
let myPlayerId = null, dealing = false;

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
    myPlayerId = msg.playerId;
    tokens = msg.tokens;
    document.getElementById('playerNameDisplay').textContent = msg.name;
    document.getElementById('loadingScreen').classList.add('hidden');
    document.getElementById('gameUI').classList.remove('hidden');
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
  if (msg.type === 'baccarat:result') {
    dealing = false;
    handleResult(msg);
    return;
  }
  if (msg.type === 'error') {
    dealing = false;
    renderIdle();
    showResult(msg.message, '');
    return;
  }
});

function sendWS(obj) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); }

// ── Bet type selection ─────────────────────────────────────────────
['btnPlayer','btnTie','btnBanker'].forEach(id => {
  document.getElementById(id).addEventListener('click', () => {
    if (dealing) return;
    betType = id === 'btnPlayer' ? 'player' : id === 'btnTie' ? 'tie' : 'banker';
    document.querySelectorAll('.bet-type-btn').forEach(b => b.classList.remove('selected'));
    document.getElementById(id).classList.add('selected');
  });
});

// ── Bet amount ─────────────────────────────────────────────────────
function setBet(amount, btnEl) {
  if (dealing) return;
  bet = amount;
  document.querySelectorAll('.bet-btn').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  document.getElementById('betCustom').value = '';
  document.getElementById('betDisplay').textContent = bet;
}
function setCustomBet(inputEl) {
  if (dealing) return;
  const val = parseInt(inputEl.value);
  if (val && val > 0) {
    bet = val;
    document.querySelectorAll('.bet-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('betDisplay').textContent = bet;
  }
}

document.querySelectorAll('.bet-btn[data-val]').forEach(btn => {
  btn.addEventListener('click', () => setBet(parseInt(btn.dataset.val), btn));
});
document.getElementById('betCustom').addEventListener('input', function() { setCustomBet(this); });

// ── Deal ───────────────────────────────────────────────────────────
function sendDeal() {
  if (dealing || tokens < bet) return;
  dealing = true;
  clearTable();
  document.getElementById('actionBar').innerHTML = '';
  sendWS({ type: 'baccarat:deal', betType, bet });
}

// ── Result animation ───────────────────────────────────────────────
async function handleResult(msg) {
  const { playerHand, bankerHand, playerTotal, bankerTotal, outcome, net } = msg;

  // Deal cards in baccarat order: P1 B1 P2 B2 [P3] [B3]
  const sequence = [
    { hand: 'playerCards',  cards: [playerHand[0]] },
    { hand: 'bankerCards',  cards: [bankerHand[0]] },
    { hand: 'playerCards',  cards: [playerHand[1]] },
    { hand: 'bankerCards',  cards: [bankerHand[1]] },
    ...(playerHand[2] ? [{ hand: 'playerCards', cards: [playerHand[2]] }] : []),
    ...(bankerHand[2] ? [{ hand: 'bankerCards', cards: [bankerHand[2]] }] : []),
  ];

  for (const step of sequence) {
    await sleep(320);
    appendCard(step.hand, step.cards[0]);
  }

  // Show scores
  const playerNatural = playerHand.length === 2 && playerTotal >= 8;
  const bankerNatural = bankerHand.length === 2 && bankerTotal >= 8;
  setScore('playerScore', playerTotal, playerNatural);
  setScore('bankerScore', bankerTotal, bankerNatural);

  await sleep(200);

  // Show result
  const abs = Math.abs(net);
  if (net > 0) {
    const label = outcome === 'tie' ? `TIE! +${net}` :
                  outcome === 'player' ? `PLAYER WINS  +${net}` : `BANKER WINS  +${net}`;
    const cls   = outcome === 'player' ? 'player-win' : outcome === 'banker' ? 'banker-win' : 'tie-result';
    showResult(label, cls);
  } else if (net === 0) {
    showResult('PUSH — BET RETURNED', 'push');
  } else {
    const label = outcome === 'player' ? `Player Wins  −${abs}` : outcome === 'banker' ? `Banker Wins  −${abs}` : `Tie  −${abs}`;
    showResult(label, outcome === 'player' ? 'player-win' : outcome === 'banker' ? 'banker-win' : 'tie-result');
  }

  tokens = msg.tokens;
  bumpTokens();
  updateTokenDisplay();

  setTimeout(() => renderIdle(), 2000);
}

// ── Card rendering ─────────────────────────────────────────────────
function isRed(suit) { return suit === '♥' || suit === '♦'; }

function makeCardEl(card) {
  const div = document.createElement('div');
  div.className = `card ${isRed(card.suit) ? 'red' : 'black'}`;
  div.innerHTML = `
    <div class="card-rank-top">${card.rank}</div>
    <div class="card-suit-top">${card.suit}</div>
    <div class="card-suit-center">${card.suit}</div>
    <div class="card-suit-bot">${card.suit}</div>
    <div class="card-rank-bot">${card.rank}</div>`;
  return div;
}

function appendCard(containerId, card) {
  document.getElementById(containerId).appendChild(makeCardEl(card));
}

function clearTable() {
  document.getElementById('playerCards').innerHTML = '';
  document.getElementById('bankerCards').innerHTML = '';
  document.getElementById('playerScore').textContent = '';
  document.getElementById('playerScore').className  = 'side-score';
  document.getElementById('bankerScore').textContent = '';
  document.getElementById('bankerScore').className  = 'side-score';
  document.getElementById('resultBar').textContent   = '';
  document.getElementById('resultBar').className     = 'result-bar';
}

function setScore(id, total, isNatural) {
  const el = document.getElementById(id);
  el.textContent = total;
  el.className = 'side-score' + (isNatural ? ' natural' : '');
}

function showResult(text, cls) {
  const el = document.getElementById('resultBar');
  el.textContent = text;
  el.className = 'result-bar' + (cls ? ' ' + cls : '');
}

// ── Display helpers ────────────────────────────────────────────────
function updateTokenDisplay() {
  document.getElementById('tokenCount').textContent = tokens;
  document.getElementById('betDisplay').textContent = bet;
}
function bumpTokens() {
  const el = document.getElementById('tokenCount');
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
}

function renderIdle() {
  const bar      = document.getElementById('actionBar');
  const noTokens = document.getElementById('noTokensMsg');
  if (tokens <= 0) {
    bar.innerHTML = '';
    noTokens.classList.remove('hidden');
    return;
  }
  noTokens.classList.add('hidden');
  bar.innerHTML = '';
  const canAfford = tokens >= bet;
  const btn = document.createElement('button');
  btn.className   = 'btn-deal';
  btn.disabled    = !canAfford;
  btn.textContent = canAfford ? `DEAL · ${bet}` : `Need ${bet} tokens`;
  btn.addEventListener('click', sendDeal);
  bar.appendChild(btn);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
