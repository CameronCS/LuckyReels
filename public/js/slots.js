'use strict';
// SYMBOLS kept for reel animation only — RNG and payouts are server-side
const SYMBOLS      = ['💎','7️⃣','🍀','⭐','🍒','🍋','🍇','🔔'];
const MAX_MACHINES = 6;

const pendingSpins = new Map(); // machineNum → resolver waiting for server response

let tokens = 0, bet = 1, spinning = false, myPlayerId = null;
let machines = [], machineCounter = 0;

// Stars
const starsEl = document.getElementById('stars');
for (let i = 0; i < 80; i++) {
  const s = document.createElement('div'); s.className = 'star';
  const sz = Math.random() * 2 + 1;
  s.style.cssText = `width:${sz}px;height:${sz}px;left:${Math.random()*100}%;top:${Math.random()*100}%;--d:${2+Math.random()*4}s;--o:${0.2+Math.random()*0.5};animation-delay:${Math.random()*4}s`;
  starsEl.appendChild(s);
}

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
      if (machines.length === 0) addMachine();
    }
    updateDisplay();
    return;
  }

  if (msg.type === 'authError') {
    sessionStorage.removeItem('sessionToken');
    window.location.href = '/';
    return;
  }

  if (msg.type === 'tokens') {
    const old = tokens; tokens = msg.value;
    bumpTokens(); updateDisplay();
    if (msg.value > old && !spinning) setMessage(`🎁 Admin added ${msg.value - old} tokens!`, 'win');
    return;
  }

  if (msg.type === 'slots:result') {
    const resolve = pendingSpins.get(msg.machineNum);
    if (resolve) { pendingSpins.delete(msg.machineNum); resolve(msg); }
    return;
  }

  if (msg.type === 'ws-closed') {
    wsReady = false;
    if (myPlayerId) setMessage('Connection lost — refresh to reconnect.', 'neutral');
    return;
  }

  if (msg.type === 'error') {
    setMessage(msg.message || 'Server error.', 'neutral');
    spinning = false;
    machines.forEach(m => { m.spinning = false; });
    updateDisplay();
    return;
  }
});

function sendWS(obj) { if (wsReady) worker.port.postMessage({ type: 'ws-send', data: obj }); }

// ── Display ────────────────────────────────────────────────────────
function updateDisplay() {
  document.getElementById('tokenCount').textContent = tokens;
  const spinBtn  = document.getElementById('spinBtn');
  const noTokens = document.getElementById('noTokens');
  const cost = bet * machines.length;
  spinBtn.textContent = machines.length > 1 ? `SPIN ALL · ${cost}` : 'SPIN';
  if (tokens <= 0) { spinBtn.classList.add('hidden'); noTokens.classList.remove('hidden'); }
  else if (tokens < cost) { spinBtn.disabled = true; spinBtn.classList.remove('hidden'); noTokens.classList.add('hidden'); }
  else { spinBtn.disabled = false; spinBtn.classList.remove('hidden'); noTokens.classList.add('hidden'); }
  machines.forEach(m => {
    const btn = document.getElementById(`slot-${m.id}-spinbtn`);
    if (btn) btn.disabled = spinning || m.spinning || tokens < bet;
  });
}

function setMessage(text, type) {
  const el = document.getElementById('messageBar');
  el.textContent = text; el.className = 'message-bar ' + type;
}
function setSlotMsg(id, text, type) {
  const el = document.getElementById(`slot-${id}-msg`);
  if (el) { el.textContent = text; el.className = 'slot-msg ' + type; }
}
function bumpTokens() {
  const el = document.getElementById('tokenCount');
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
}

// ── Bet ────────────────────────────────────────────────────────────
function setBet(amount, btnEl) {
  bet = amount;
  document.querySelectorAll('.bet-btn').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  document.getElementById('betCustom').value = '';
  updateDisplay();
}
function setCustomBet(inputEl) {
  const val = parseInt(inputEl.value);
  if (val && val > 0) { bet = val; document.querySelectorAll('.bet-btn').forEach(b => b.classList.remove('active')); updateDisplay(); }
}

// ── Paytable ───────────────────────────────────────────────────────
function togglePaytable() {
  const content = document.getElementById('paytableContent');
  const open = content.classList.toggle('open');
  document.querySelector('.paytable-toggle-btn').textContent = open ? 'Paytable ▴' : 'Paytable ▾';
}

// ── Machines ───────────────────────────────────────────────────────
function getColCount(n) { if (n<=1) return 1; if (n===2) return 2; if (n===3) return 3; if (n===4) return 2; return 3; }

function addMachine() {
  if (machines.length >= MAX_MACHINES) return;
  const id = ++machineCounter;
  machines.push({ id, spinning: false });

  const card = document.createElement('div');
  card.className = 'slot-card';
  card.id = `slot-${id}`;

  const header = document.createElement('div');
  header.className = 'slot-header';

  const title = document.createElement('span');
  title.className = 'slot-title';
  title.textContent = `Machine ${machines.length}`;

  const removeBtn = document.createElement('button');
  removeBtn.className = `remove-slot-btn${machines.length <= 1 ? ' hidden' : ''}`;
  removeBtn.id = `remove-${id}`;
  removeBtn.textContent = '×';
  removeBtn.addEventListener('click', () => removeMachine(id));

  header.appendChild(title);
  header.appendChild(removeBtn);

  const reels = document.createElement('div');
  reels.className = 'slot-reels';
  for (let i = 0; i < 3; i++) {
    const sym = document.createElement('div');
    sym.className = 'slot-symbol';
    sym.id = `slot-${id}-r${i}`;
    sym.textContent = '🎰';
    reels.appendChild(sym);
  }

  const msgEl = document.createElement('div');
  msgEl.className = 'slot-msg neutral';
  msgEl.id = `slot-${id}-msg`;
  msgEl.textContent = 'Ready to spin';

  const spinBtn = document.createElement('button');
  spinBtn.className = 'slot-spin-btn';
  spinBtn.id = `slot-${id}-spinbtn`;
  spinBtn.textContent = 'SPIN';
  spinBtn.addEventListener('click', () => spinOne(id));

  card.appendChild(header);
  card.appendChild(reels);
  card.appendChild(msgEl);
  card.appendChild(spinBtn);

  document.getElementById('machinesGrid').appendChild(card);
  updateMachineLayout();
}

function removeMachine(id) {
  if (machines.length <= 1) return;
  machines = machines.filter(m => m.id !== id);
  document.getElementById(`slot-${id}`)?.remove();
  updateMachineLayout();
}

function updateMachineLayout() {
  const grid = document.getElementById('machinesGrid');
  const count = machines.length;
  grid.className = `machines-grid cols-${getColCount(count)}`;
  machines.forEach((m, i) => {
    const titleEl = document.querySelector(`#slot-${m.id} .slot-title`);
    if (titleEl) titleEl.textContent = `Machine ${i+1}`;
    const rb = document.getElementById(`remove-${m.id}`);
    if (rb) rb.classList.toggle('hidden', count <= 1);
  });
  const addBtn = document.getElementById('addMachineBtn');
  if (addBtn) addBtn.disabled = count >= MAX_MACHINES;
  const label = document.getElementById('machineCountLabel');
  if (label) label.textContent = count === 1 ? '1 MACHINE' : `${count} MACHINES`;
  updateDisplay();
}

// ── Confetti ───────────────────────────────────────────────────────
function confetti(x, y) {
  const colors = ['#FFD700','#FF2D55','#00FF87','#7F5AF0','#FFA500'];
  for (let i = 0; i < 28; i++) {
    const c = document.createElement('div'); c.className = 'confetti-piece';
    c.style.cssText = `left:${x+(Math.random()-.5)*200}px;top:${y}px;background:${colors[Math.floor(Math.random()*colors.length)]};border-radius:${Math.random()>.5?'50%':'2px'};transform:rotate(${Math.random()*360}deg);animation-delay:${Math.random()*.3}s;animation-duration:${1+Math.random()}s;`;
    document.body.appendChild(c); setTimeout(() => c.remove(), 2000);
  }
}

// ── Spin ───────────────────────────────────────────────────────────
function spinMachine(id, machineNum) {
  return new Promise((resolve) => {
    const reels = [0,1,2].map(i => document.getElementById(`slot-${id}-r${i}`));
    reels.forEach(r => r?.classList.remove('winner'));

    const DURATIONS = [700, 900, 1100];

    Promise.all([
      Promise.all([0,1,2].map(i => new Promise(res => {
        const el = reels[i]; if (!el) return res();
        let n = 0, total = Math.floor(DURATIONS[i] / 80);
        const iv = setInterval(() => {
          el.textContent = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
          if (++n >= total) { clearInterval(iv); res(); }
        }, 80);
      }))),
      new Promise(res => pendingSpins.set(machineNum, res)),
    ]).then(([, serverMsg]) => {
      const { symbols, result, net } = serverMsg;
      reels.forEach((r, i) => { if (r) r.textContent = symbols[i]; });
      tokens = serverMsg.tokens;

      if (result === 'jackpot') {
        reels.forEach(r => r?.classList.add('winner'));
        const card = document.getElementById(`slot-${id}`);
        if (card) { const rect = card.getBoundingClientRect(); confetti(rect.left + rect.width / 2, rect.top + rect.height / 4); }
        setSlotMsg(id, `🎉 JACKPOT! +${net}`, 'win');
      } else if (result === 'match') {
        const [a, b, c] = symbols;
        if (a === b) { reels[0]?.classList.add('winner'); reels[1]?.classList.add('winner'); }
        if (b === c) { reels[1]?.classList.add('winner'); reels[2]?.classList.add('winner'); }
        if (a === c) { reels[0]?.classList.add('winner'); reels[2]?.classList.add('winner'); }
        setSlotMsg(id, `✨ Match! +${net}`, 'win');
      } else {
        document.getElementById(`slot-${id}`)?.classList.add('shake');
        setTimeout(() => document.getElementById(`slot-${id}`)?.classList.remove('shake'), 400);
        setSlotMsg(id, `No match  −${bet}`, 'lose');
      }

      if (net > 0) bumpTokens();
      resolve();
    });
  });
}

async function spinOne(id) {
  const machine = machines.find(m => m.id === id);
  if (!machine || machine.spinning || spinning || tokens < bet) return;
  machine.spinning = true;
  setSlotMsg(id, 'Spinning...', 'neutral');
  updateDisplay();
  const machineNum = machines.findIndex(m => m.id === id) + 1;
  sendWS({ type: 'slots:spin', bet, machineNum });
  await spinMachine(id, machineNum);
  machine.spinning = false;
  updateDisplay();
}

async function spinAll() {
  if (spinning || machines.some(m => m.spinning)) return;
  const cost = bet * machines.length;
  if (tokens < cost) return;
  spinning = true;
  machines.forEach(m => setSlotMsg(m.id, 'Spinning...', 'neutral'));
  updateDisplay();
  await Promise.all(machines.map((m, i) => {
    const machineNum = i + 1;
    sendWS({ type: 'slots:spin', bet, machineNum });
    return spinMachine(m.id, machineNum);
  }));
  spinning = false;
  updateDisplay();
}

// ── Event listeners (replaces inline onclick/oninput) ──────────────
document.querySelectorAll('.bet-btn[data-val]').forEach(btn => {
  btn.addEventListener('click', () => setBet(parseInt(btn.dataset.val), btn));
});
document.getElementById('betCustom').addEventListener('input', function () { setCustomBet(this); });
document.getElementById('addMachineBtn').addEventListener('click', addMachine);
document.getElementById('spinBtn').addEventListener('click', spinAll);
document.querySelector('.paytable-toggle-btn').addEventListener('click', togglePaytable);
