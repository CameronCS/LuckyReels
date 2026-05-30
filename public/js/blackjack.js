'use strict';
// ── State ──────────────────────────────────────────────────────────
let tokens = 0, bet = 1;
let myPlayerId = null;
let gameState = 'idle'; // idle | waiting | player | dealing

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
    myPlayerId = msg.playerId;
    tokens = msg.tokens;
    document.getElementById('playerNameDisplay').textContent = msg.name;
    if (!sessionReady) {
      sessionReady = true;
      document.getElementById('loadingScreen').classList.add('hidden');
      document.getElementById('gameUI').classList.remove('hidden');
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
    const old = tokens; tokens = msg.value;
    bumpTokens(); updateTokenDisplay();
    if (msg.value > old && gameState === 'idle') showResult(`Admin +${msg.value - old}`, 'win');
    return;
  }

  if (msg.type === 'bonus') {
    tokens = msg.tokens; bumpTokens(); updateTokenDisplay();
    if (gameState === 'idle') showResult(`+${msg.amount.toLocaleString()} hourly bonus!`, 'win');
    return;
  }

  if (msg.type === 'bj:state') {
    tokens = msg.tokens;
    updateTokenDisplay();
    clearResult();
    renderHand('playerCards', msg.playerHand);
    renderHand('dealerCards', msg.dealerHand);
    setPlayerTotal(msg.playerTotal, msg.playerHand.length);
    setDealerTotal(msg.dealerVisible, false);
    gameState = 'player';
    renderPlayerTurn(msg.playerHand.length, msg.tokens, msg.bet);
    return;
  }

  if (msg.type === 'bj:result') {
    gameState = 'dealing';
    handleBjResult(msg);
    return;
  }

  if (msg.type === 'error') {
    if (gameState === 'waiting') { gameState = 'idle'; renderIdle(); }
    showResult(msg.message, 'loss');
    return;
  }
});

function sendWS(obj) { if (wsReady) worker.port.postMessage({ type: 'ws-send', data: obj }); }

// ── Bet ────────────────────────────────────────────────────────────
function setBet(amount, btnEl) {
  if (gameState !== 'idle') return;
  bet = amount;
  document.querySelectorAll('.bet-btn').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  document.getElementById('betCustom').value = '';
  document.getElementById('betDisplay').textContent = bet;
}

function setCustomBet(inputEl) {
  if (gameState !== 'idle') return;
  const val = parseInt(inputEl.value);
  if (val && val > 0) {
    bet = val;
    document.querySelectorAll('.bet-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('betDisplay').textContent = bet;
  }
}

// ── Game actions (WS messages) ─────────────────────────────────────
function sendDeal() {
  if (gameState !== 'idle' || tokens < bet) return;
  gameState = 'waiting';
  document.getElementById('actionBar').innerHTML = '';
  sendWS({ type: 'bj:deal', bet });
}

function sendHit() {
  if (gameState !== 'player') return;
  gameState = 'waiting';
  document.getElementById('actionBar').innerHTML = '';
  sendWS({ type: 'bj:hit' });
}

function sendStand() {
  if (gameState !== 'player') return;
  gameState = 'waiting';
  document.getElementById('actionBar').innerHTML = '';
  sendWS({ type: 'bj:stand' });
}

function sendDouble() {
  if (gameState !== 'player') return;
  gameState = 'waiting';
  document.getElementById('actionBar').innerHTML = '';
  sendWS({ type: 'bj:double' });
}

// ── Dealer reveal animation ────────────────────────────────────────
async function handleBjResult(msg) {
  renderHand('playerCards', msg.playerHand);
  setPlayerTotal(msg.playerTotal, msg.playerHand.length);

  renderHand('dealerCards', msg.dealerHand.slice(0, 2));
  setDealerTotal(bjHandValue(msg.dealerHand.slice(0, 2)), msg.dealerHand.length === 2);

  for (let i = 2; i < msg.dealerHand.length; i++) {
    await sleep(600);
    const partial = msg.dealerHand.slice(0, i + 1);
    renderHand('dealerCards', partial);
    setDealerTotal(bjHandValue(partial), i + 1 === msg.dealerHand.length);
  }

  setDealerTotal(msg.dealerTotal, true);
  showResult(resultText(msg.result, msg.net), resultClass(msg.result));
  tokens = msg.tokens;
  bumpTokens();
  updateTokenDisplay();

  setTimeout(() => { gameState = 'idle'; renderIdle(); }, 1800);
}

function bjHandValue(hand) {
  let total = 0, aces = 0;
  for (const c of hand) {
    if (c.hidden) continue;
    const v = c.rank === 'A' ? 11 : ['J','Q','K'].includes(c.rank) ? 10 : parseInt(c.rank);
    if (c.rank === 'A') aces++;
    total += v;
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
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

function showResult(text, cls) {
  const el = document.getElementById('resultBar');
  el.textContent = text; el.className = 'result-bar ' + cls;
}

function clearResult() {
  const el = document.getElementById('resultBar');
  el.textContent = ''; el.className = 'result-bar';
}

function setPlayerTotal(total, handLen) {
  const el = document.getElementById('playerTotal');
  el.textContent = total;
  el.className = 'side-total' +
    (total > 21 ? ' bust' : total === 21 && handLen === 2 ? ' bj' : '');
}

function setDealerTotal(total, revealed) {
  const el = document.getElementById('dealerTotal');
  el.textContent = total > 0 ? total : '';
  el.className = 'side-total' +
    (revealed && total > 21 ? ' bust' : revealed && total >= 17 ? ' good' : '');
}

function resultText(result, net) {
  const abs = Math.abs(net);
  switch (result) {
    case 'blackjack':   return `🃏 BLACKJACK! +${net}`;
    case 'win':         return `You Win! +${net}`;
    case 'dealer_bust': return `Dealer Busts! +${net}`;
    case 'push':        return `Push — Bet Returned`;
    case 'bust':        return `Bust! −${abs}`;
    case 'loss':        return `Dealer Wins −${abs}`;
    default:            return '';
  }
}

function resultClass(result) {
  if (result === 'blackjack') return 'blackjack';
  if (result === 'win' || result === 'dealer_bust') return 'win';
  if (result === 'push') return 'push';
  return 'loss';
}

// ── Card rendering ─────────────────────────────────────────────────
function isRed(suit) { return suit === '♥' || suit === '♦'; }

function makeCardEl(card) {
  const div = document.createElement('div');
  if (card.hidden) { div.className = 'card face-down'; return div; }
  div.className = `card ${isRed(card.suit) ? 'red' : 'black'}`;
  div.innerHTML = `
    <div class="card-rank-top">${card.rank}</div>
    <div class="card-suit-top">${card.suit}</div>
    <div class="card-suit-center">${card.suit}</div>
    <div class="card-suit-bot">${card.suit}</div>
    <div class="card-rank-bot">${card.rank}</div>`;
  return div;
}

function renderHand(containerId, hand) {
  const el = document.getElementById(containerId);
  el.innerHTML = '';
  hand.forEach(c => el.appendChild(makeCardEl(c)));
}

// ── Action bar states ──────────────────────────────────────────────
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
  btn.className = 'btn-deal';
  btn.disabled  = !canAfford;
  btn.textContent = canAfford ? `DEAL · ${bet}` : `Need ${bet} tokens`;
  btn.addEventListener('click', sendDeal);
  bar.appendChild(btn);
}

function renderPlayerTurn(handLen, playerTokens, gameBet) {
  const bar = document.getElementById('actionBar');
  bar.innerHTML = '';
  const canDouble = playerTokens >= gameBet && handLen === 2;

  const hit = document.createElement('button');
  hit.className = 'action-btn btn-hit';
  hit.textContent = 'HIT';
  hit.addEventListener('click', sendHit);

  const stand = document.createElement('button');
  stand.className = 'action-btn btn-stand';
  stand.textContent = 'STAND';
  stand.addEventListener('click', sendStand);

  const dbl = document.createElement('button');
  dbl.className = 'action-btn btn-double';
  dbl.textContent = 'DOUBLE';
  dbl.disabled = !canDouble;
  dbl.addEventListener('click', sendDouble);

  bar.append(hit, stand, dbl);
}

// ── Event listeners ────────────────────────────────────────────────
document.querySelectorAll('.bet-btn[data-val]').forEach(btn => {
  btn.addEventListener('click', () => setBet(parseInt(btn.dataset.val), btn));
});
document.getElementById('betCustom').addEventListener('input', function () { setCustomBet(this); });

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
