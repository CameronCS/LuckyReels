'use strict';
let currentPlayers   = [];
const gameLogs       = {};
const playerMachines = {};
const expandedLogs   = new Set();
const gameFilters    = {};
const adminLog       = [];

const wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
const ws = new WebSocket(`${wsProto}://${location.host}`);

ws.addEventListener('open', () => { updatePlayerLink(); });

ws.addEventListener('message', (e) => {
  const msg = JSON.parse(e.data);

  if (msg.type === 'adminAuthOk') {
    document.getElementById('adminLoginOverlay').classList.add('hidden');
    document.getElementById('mainPanel').style.display = '';
    return;
  }
  if (msg.type === 'adminAuthError') {
    document.getElementById('adminLoginError').textContent = msg.reason;
    return;
  }
  if (msg.type === 'players') {
    currentPlayers = msg.list;
    renderPlayers();
    updateStats();
    return;
  }
  if (msg.type === 'spinEvent') {
    const { playerId, machineNum, symbols, bet, winAmount, spinType } = msg;
    if (!playerMachines[playerId]) playerMachines[playerId] = new Set();
    playerMachines[playerId].add(machineNum);
    pushGameEvent(playerId, { game: 'slots', machineNum, symbols, bet, net: winAmount > 0 ? winAmount : -bet, result: spinType, time: new Date().toLocaleTimeString() });
    return;
  }
  if (msg.type === 'bjEvent') {
    const { playerId, result, playerCards, dealerCards, bet, net } = msg;
    pushGameEvent(playerId, { game: 'blackjack', result, playerCards, dealerCards, bet, net, time: new Date().toLocaleTimeString() });
    return;
  }
  if (msg.type === 'rouletteEvent') {
    const { playerId, winNum, totalBet, net } = msg;
    pushGameEvent(playerId, { game: 'roulette', winNum, totalBet, net, time: new Date().toLocaleTimeString() });
    return;
  }
  if (msg.type === 'horseEvent') {
    const { playerId, winnerName, pickedName, bet, net } = msg;
    pushGameEvent(playerId, { game: 'horse', winnerName, pickedName, bet, net, time: new Date().toLocaleTimeString() });
    return;
  }

  if (msg.type === 'createAdmin:ok') {
    document.getElementById('newAdminUsername').value = '';
    document.getElementById('newAdminPassword').value = '';
    document.getElementById('addAdminError').textContent = '';
    addAdminLog(`Created admin: ${msg.username}`, 'neutral');
    showToast(`Admin "${msg.username}" created`);
    return;
  }

  if (msg.type === 'createAdmin:error') {
    document.getElementById('addAdminError').textContent = msg.message;
    return;
  }

  if (msg.type === 'playerLogs') {
    const { playerId, logs } = msg;
    gameLogs[playerId] = logs;
    playerMachines[playerId] = new Set(
      logs.filter(l => l.game === 'slots' && l.machineNum).map(l => l.machineNum)
    );
    if (expandedLogs.has(playerId)) {
      renderPlayerLog(playerId);
      renderGameFilters(playerId);
    }
    updateLogToggleBtn(playerId);
    return;
  }
});

function sendWS(msg) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

// ── Admin login ────────────────────────────────────────────────────
function submitAdminLogin() {
  const username = document.getElementById('adminUsernameInput').value.trim();
  const password = document.getElementById('adminPasswordInput').value;
  if (!username || !password) {
    document.getElementById('adminLoginError').textContent = 'Enter username and password.';
    return;
  }
  document.getElementById('adminLoginError').textContent = '';
  sendWS({ type: 'adminLogin', username, password });
}

// ── Game event handler ─────────────────────────────────────────────
function pushGameEvent(playerId, entry) {
  if (!gameLogs[playerId]) gameLogs[playerId] = [];
  gameLogs[playerId].unshift(entry);
  if (gameLogs[playerId].length > 200) gameLogs[playerId].pop();
  if (expandedLogs.has(playerId)) { renderPlayerLog(playerId); renderGameFilters(playerId); }
  updateLogToggleBtn(playerId);
}

// ── Admin token actions ────────────────────────────────────────────
function applyTokens(playerId, newValue, logText, logCls, toastText) {
  const p = currentPlayers.find(x => x.id === playerId);
  if (!p) return;
  p.tokens = newValue;           // optimistic update
  patchPlayerCard(p);
  updateStats();
  sendWS({ type: 'setTokens', playerId, value: newValue });
  addAdminLog(logText, logCls);
  showToast(toastText);
}

function addToPlayer(playerId, amount) {
  const p = currentPlayers.find(x => x.id === playerId);
  if (!p) return;
  const newValue = Math.max(0, p.tokens + amount);
  applyTokens(playerId, newValue,
    `${amount > 0 ? '+' : ''}${amount} → ${p.name}`, amount >= 0 ? 'pos' : 'neg',
    amount > 0 ? `+${amount} to ${p.name}` : `${Math.abs(amount)} from ${p.name}`
  );
}

function customAdd(playerId) {
  const input = document.getElementById(`custom-${playerId}`);
  const val = parseInt(input.value);
  if (!val || val <= 0) return;
  input.value = '';
  addToPlayer(playerId, val);
}

function customSub(playerId) {
  const input = document.getElementById(`custom-${playerId}`);
  const val = parseInt(input.value);
  if (!val || val <= 0) return;
  input.value = '';
  addToPlayer(playerId, -val);
}

function customSet(playerId) {
  const input = document.getElementById(`custom-${playerId}`);
  const val = parseInt(input.value);
  if (isNaN(val) || val < 0) return;
  const p = currentPlayers.find(x => x.id === playerId);
  input.value = '';
  if (!p) return;
  applyTokens(playerId, val, `Set ${p.name} → ${val}`, 'neutral', 'Updated');
}

// ── Render players ─────────────────────────────────────────────────

// Patches only the mutable parts of an existing card; preserves inputs and log state.
// Returns false if the card doesn't exist yet (caller should create it).
function patchPlayerCard(p) {
  const card = document.getElementById(`pcard-${p.id}`);
  if (!card) return false;

  card.classList.toggle('offline', !p.online);

  const dot = card.querySelector('.online-dot, .offline-dot');
  if (dot) dot.className = p.online ? 'online-dot' : 'offline-dot';

  const badge = card.querySelector('.offline-label');
  if (p.online && badge) {
    badge.remove();
  } else if (!p.online && !badge) {
    const nameEl = card.querySelector('.player-name');
    if (nameEl) nameEl.insertAdjacentHTML('afterend', '<span class="offline-label">offline</span>');
  }

  const tokenEl = card.querySelector('.player-tokens');
  if (tokenEl) tokenEl.textContent = `${p.tokens} 🪙`;

  return true;
}

function renderPlayers() {
  const list    = document.getElementById('playerList');
  const countEl = document.getElementById('playerCount');

  const onlinePlayers  = currentPlayers.filter(p => p.online);
  const offlinePlayers = currentPlayers.filter(p => !p.online);
  countEl.textContent = `${onlinePlayers.length} online · ${currentPlayers.length} total`;

  if (currentPlayers.length === 0) {
    list.innerHTML = '<div class="empty-state">No players registered yet</div>';
    return;
  }

  // Clear the empty-state placeholder if the first player just registered
  list.querySelector('.empty-state')?.remove();

  const sorted = [
    ...onlinePlayers.sort((a, b) => a.name.localeCompare(b.name)),
    ...offlinePlayers.sort((a, b) => a.name.localeCompare(b.name)),
  ];

  // Remove cards for players no longer in the list
  const liveIds = new Set(sorted.map(p => p.id));
  list.querySelectorAll('.player-card').forEach(card => {
    if (!liveIds.has(card.id.replace('pcard-', ''))) card.remove();
  });

  // Patch existing cards or create new ones
  sorted.forEach(p => {
    if (!patchPlayerCard(p)) list.insertAdjacentHTML('beforeend', buildPlayerCard(p));
  });

  // Re-order DOM to match sorted array (appendChild moves existing nodes without re-creating them)
  sorted.forEach(p => {
    const card = document.getElementById(`pcard-${p.id}`);
    if (card) list.appendChild(card);
  });
}

function buildPlayerCard(p) {
  const id      = p.id;
  const isOpen  = expandedLogs.has(id);
  const logCount = (gameLogs[id] || []).length;

  const statusDot   = p.online ? `<div class="online-dot"></div>` : `<div class="offline-dot"></div>`;
  const offlineBadge = p.online ? '' : `<span class="offline-label">offline</span>`;

  return `
<div class="player-card ${p.online ? '' : 'offline'}" id="pcard-${id}">
  <div class="card-top">
    <div class="player-info">
      ${statusDot}
      <span class="player-name">${escHtml(p.name)}</span>
      ${offlineBadge}
    </div>
    <span class="player-tokens">${p.tokens} 🪙</span>
  </div>
  <div class="card-quick">
    <button class="card-add" data-action="add" data-player="${id}" data-amount="10">+10</button>
    <button class="card-add" data-action="add" data-player="${id}" data-amount="25">+25</button>
    <button class="card-add" data-action="add" data-player="${id}" data-amount="50">+50</button>
    <button class="card-add" data-action="add" data-player="${id}" data-amount="100">+100</button>
  </div>
  <div class="card-quick">
    <button class="card-sub" data-action="sub" data-player="${id}" data-amount="10">-10</button>
    <button class="card-sub" data-action="sub" data-player="${id}" data-amount="25">-25</button>
    <button class="card-sub" data-action="sub" data-player="${id}" data-amount="50">-50</button>
    <button class="card-sub" data-action="sub" data-player="${id}" data-amount="100">-100</button>
  </div>
  <div class="card-custom">
    <input class="card-num" type="number" id="custom-${id}" placeholder="amount…" min="0">
    <button class="card-ca"  data-action="customAdd" data-player="${id}">+</button>
    <button class="card-cs"  data-action="customSub" data-player="${id}">−</button>
    <button class="card-set" data-action="customSet" data-player="${id}">SET</button>
  </div>
  <button class="log-toggle-btn ${isOpen ? 'open' : ''}" id="logtoggle-${id}"
          data-action="toggleLog" data-player="${id}">
    <span>Activity Log</span>
    <span style="display:flex;align-items:center;gap:6px">
      ${logCount > 0 ? `<span class="log-toggle-count">${logCount}</span>` : ''}
      <span id="logtoggle-arrow-${id}">${isOpen ? '▴' : '▾'}</span>
    </span>
  </button>
  <div class="card-log" id="cardlog-${id}" ${isOpen ? '' : 'style="display:none"'}>
    <div class="machine-filters" id="filters-${id}">
      ${buildFilterPills(id)}
    </div>
    <div class="spin-log-scroll">
      <div id="log-entries-${id}">${buildLogEntries(id)}</div>
    </div>
    <button class="load-history-btn" data-action="loadHistory" data-player="${id}">
      Load last 100 from database
    </button>
  </div>
</div>`;
}

// ── Event delegation for all player card actions ───────────────────
document.getElementById('playerList').addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action   = btn.dataset.action;
  const playerId = btn.dataset.player;
  switch (action) {
    case 'add':         addToPlayer(playerId, parseInt(btn.dataset.amount)); break;
    case 'sub':         addToPlayer(playerId, -parseInt(btn.dataset.amount)); break;
    case 'customAdd':   customAdd(playerId);   break;
    case 'customSub':   customSub(playerId);   break;
    case 'customSet':   customSet(playerId);   break;
    case 'toggleLog':   toggleLog(playerId);   break;
    case 'loadHistory': loadHistory(playerId); break;
    case 'filter':      setGameFilter(playerId, btn.dataset.filter); break;
  }
});

// ── Log expand / collapse ──────────────────────────────────────────
function toggleLog(playerId) {
  const logEl  = document.getElementById(`cardlog-${playerId}`);
  const btn    = document.getElementById(`logtoggle-${playerId}`);
  const arrow  = document.getElementById(`logtoggle-arrow-${playerId}`);
  const isOpen = expandedLogs.has(playerId);

  if (isOpen) {
    expandedLogs.delete(playerId);
    logEl.style.display = 'none';
    btn.classList.remove('open');
    if (arrow) arrow.textContent = '▾';
  } else {
    expandedLogs.add(playerId);
    logEl.style.display = '';
    btn.classList.add('open');
    if (arrow) arrow.textContent = '▴';
    renderPlayerLog(playerId);
    renderGameFilters(playerId);
    const player = currentPlayers.find(p => p.id === playerId);
    if (!gameLogs[playerId] || gameLogs[playerId].length === 0 || !player?.online) {
      sendWS({ type: 'getLogs', playerId, limit: 100 });
    }
  }
}

function loadHistory(playerId) {
  sendWS({ type: 'getLogs', playerId, limit: 100 });
  showToast('Loading history…');
}

// ── Game / machine filter ──────────────────────────────────────────
function setGameFilter(playerId, filter) {
  gameFilters[playerId] = filter;
  renderPlayerLog(playerId);
  renderGameFilters(playerId);
}

function renderGameFilters(playerId) {
  const el = document.getElementById(`filters-${playerId}`);
  if (el) el.innerHTML = buildFilterPills(playerId);
}

function buildFilterPills(playerId) {
  const active      = gameFilters[playerId] ?? 'all';
  const logs        = gameLogs[playerId] || [];
  const hasSlots    = logs.some(l => l.game === 'slots');
  const hasBj       = logs.some(l => l.game === 'blackjack');
  const hasRoulette = logs.some(l => l.game === 'roulette');
  const hasHorse    = logs.some(l => l.game === 'horse');
  const machines    = Array.from(playerMachines[playerId] || []).sort((a, b) => a - b);

  const pills = [
    `<button class="filter-pill ${active === 'all' ? 'active' : ''}" data-action="filter" data-player="${playerId}" data-filter="all">All</button>`,
  ];
  if (hasSlots)
    pills.push(`<button class="filter-pill ${active === 'slots' ? 'active' : ''}" data-action="filter" data-player="${playerId}" data-filter="slots">🎰 Slots</button>`);
  if (hasBj)
    pills.push(`<button class="filter-pill ${active === 'blackjack' ? 'active' : ''}" data-action="filter" data-player="${playerId}" data-filter="blackjack">🃏 Blackjack</button>`);
  if (hasRoulette)
    pills.push(`<button class="filter-pill ${active === 'roulette' ? 'active' : ''}" data-action="filter" data-player="${playerId}" data-filter="roulette">🎡 Roulette</button>`);
  if (hasHorse)
    pills.push(`<button class="filter-pill ${active === 'horse' ? 'active' : ''}" data-action="filter" data-player="${playerId}" data-filter="horse">🏇 Horses</button>`);
  machines.forEach(n =>
    pills.push(`<button class="filter-pill ${active === n ? 'active' : ''}" data-action="filter" data-player="${playerId}" data-filter="${n}">M${n}</button>`)
  );
  return pills.join('');
}

// ── Log entries ────────────────────────────────────────────────────
function renderPlayerLog(playerId) {
  const el = document.getElementById(`log-entries-${playerId}`);
  if (el) el.innerHTML = buildLogEntries(playerId);
}

function buildLogEntries(playerId) {
  const filter = gameFilters[playerId] ?? 'all';
  const all    = gameLogs[playerId] || [];

  let entries;
  if      (filter === 'all')       entries = all;
  else if (filter === 'slots')     entries = all.filter(e => e.game === 'slots');
  else if (filter === 'blackjack') entries = all.filter(e => e.game === 'blackjack');
  else if (filter === 'roulette')  entries = all.filter(e => e.game === 'roulette');
  else if (filter === 'horse')     entries = all.filter(e => e.game === 'horse');
  else                             entries = all.filter(e => e.game === 'slots' && e.machineNum === filter);

  if (entries.length === 0) {
    const msg = all.length > 0 ? 'No entries for this filter' : 'No activity yet — click load below';
    return `<div class="log-empty">${msg}</div>`;
  }

  return entries.map(e => {
    if (e.game === 'horse') {
      const won = e.net > 0;
      const amtClass = won ? 'pos' : 'neg';
      const amtText  = e.net > 0 ? `+${e.net}` : `−${Math.abs(e.net)}`;
      return `<div class="spin-entry">
        <span class="spin-icon">${won ? '🏆' : '·'}</span>
        <span class="spin-machine" style="color:#00FF87;font-size:8px">HR</span>
        <span class="spin-symbols" style="font-size:10px;letter-spacing:1px"><strong>${escHtml(e.winnerName)}</strong> won · picked ${escHtml(e.pickedName)}</span>
        <span class="spin-amount ${amtClass}">${amtText}</span>
        <span class="spin-time">${e.time}</span></div>`;
    }
    if (e.game === 'roulette') {
      const amtClass = e.net > 0 ? 'pos' : e.net < 0 ? 'neg' : '';
      const amtText  = e.net > 0 ? `+${e.net}` : e.net < 0 ? `−${Math.abs(e.net)}` : 'Push';
      return `<div class="spin-entry">
        <span class="spin-icon">🎡</span>
        <span class="spin-machine" style="color:#FF2D55;font-size:8px">RL</span>
        <span class="spin-symbols" style="font-size:11px;letter-spacing:1px">Landed <strong>${escHtml(String(e.winNum))}</strong> · bet ${e.totalBet}</span>
        <span class="spin-amount ${amtClass}">${amtText}</span>
        <span class="spin-time">${e.time}</span></div>`;
    }
    if (e.game === 'blackjack') {
      const icons = { blackjack:'🃏', win:'✅', dealer_bust:'✅', push:'🔵', bust:'💥', loss:'❌' };
      const amtClass = e.net > 0 ? 'pos' : e.net < 0 ? 'neg' : '';
      const amtText  = e.net > 0 ? `+${e.net}` : e.net < 0 ? `−${Math.abs(e.net)}` : 'Push';
      return `<div class="spin-entry">
        <span class="spin-icon">${icons[e.result] || '·'}</span>
        <span class="spin-machine" style="color:#0AF5F5;font-size:8px">BJ</span>
        <span class="spin-symbols" style="font-size:10px;letter-spacing:1px">${escHtml(e.playerCards || '')} <span style="color:#444">vs</span> ${escHtml(e.dealerCards || '')}</span>
        <span class="spin-amount ${amtClass}">${amtText}</span>
        <span class="spin-time">${e.time}</span></div>`;
    }
    const amtClass = e.net > 0 ? 'pos' : 'neg';
    const amtText  = e.net > 0 ? `+${e.net}` : `−${Math.abs(e.net)}`;
    return `<div class="spin-entry">
      <span class="spin-icon">${e.result === 'jackpot' ? '🎉' : e.result === 'match' ? '✨' : '·'}</span>
      <span class="spin-machine">M${e.machineNum}</span>
      <span class="spin-symbols">${(e.symbols || []).join('')}</span>
      <span class="spin-amount ${amtClass}">${amtText}</span>
      <span class="spin-time">${e.time}</span></div>`;
  }).join('');
}

function updateLogToggleBtn(playerId) {
  const btn = document.getElementById(`logtoggle-${playerId}`);
  if (!btn) return;
  const logCount = (gameLogs[playerId] || []).length;
  const isOpen   = expandedLogs.has(playerId);
  btn.innerHTML = `
    <span>Activity Log</span>
    <span style="display:flex;align-items:center;gap:6px">
      ${logCount > 0 ? `<span class="log-toggle-count">${logCount}</span>` : ''}
      <span id="logtoggle-arrow-${playerId}">${isOpen ? '▴' : '▾'}</span>
    </span>`;
}

// ── Stats ──────────────────────────────────────────────────────────
function updateStats() {
  const online = currentPlayers.filter(p => p.online);
  document.getElementById('statConnected').textContent = online.length;
  const total = currentPlayers.reduce((s, p) => s + p.tokens, 0);
  document.getElementById('statTokens').textContent = total.toLocaleString();
}

function updatePlayerLink() {
  const base = window.location.href.replace('admin.html', '').replace(/\?.*/, '');
  document.getElementById('playerLinkText').textContent = base;
}

function copyLink() {
  const text = document.getElementById('playerLinkText').textContent;
  navigator.clipboard.writeText(text)
    .then(() => showToast('Link copied!'))
    .catch(() => showToast('Copy failed'));
}

function addAdminLog(action, cls) {
  adminLog.unshift({ action, cls, time: new Date().toLocaleTimeString() });
  if (adminLog.length > 50) adminLog.pop();
  document.getElementById('adminLogEntries').innerHTML = adminLog.map(l =>
    `<div class="global-log-entry">
       <span class="${l.cls}">${escHtml(l.action)}</span>
       <span class="time">${l.time}</span>
     </div>`
  ).join('');
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = '✓ ' + msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

// ── Create admin ───────────────────────────────────────────────────
function createAdmin() {
  const username = document.getElementById('newAdminUsername').value.trim();
  const password = document.getElementById('newAdminPassword').value;
  const errEl    = document.getElementById('addAdminError');
  if (!username) { errEl.textContent = 'Username is required.'; return; }
  if (password.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; return; }
  errEl.textContent = '';
  sendWS({ type: 'createAdmin', username, password });
}

// ── Static event listeners ─────────────────────────────────────────
document.getElementById('adminLoginBtn').addEventListener('click', submitAdminLogin);
document.getElementById('copyLinkBtn').addEventListener('click', copyLink);
document.getElementById('addAdminBtn').addEventListener('click', createAdmin);
document.getElementById('adminPasswordInput').addEventListener('keydown', e => { if (e.key === 'Enter') submitAdminLogin(); });
document.getElementById('adminUsernameInput').addEventListener('keydown', e => { if (e.key === 'Enter') submitAdminLogin(); });
document.getElementById('newAdminPassword').addEventListener('keydown', e => { if (e.key === 'Enter') createAdmin(); });

updatePlayerLink();
