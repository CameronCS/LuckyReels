'use strict';
let lobbyMode = 'register';

// Stars
const starsEl = document.getElementById('stars');
for (let i = 0; i < 100; i++) {
  const s = document.createElement('div');
  s.className = 'star';
  const sz = Math.random() * 2 + 1;
  s.style.cssText = `width:${sz}px;height:${sz}px;left:${Math.random()*100}%;top:${Math.random()*100}%;--d:${2+Math.random()*5}s;--o:${0.15+Math.random()*0.5};animation-delay:${Math.random()*5}s`;
  starsEl.appendChild(s);
}

// ── WebSocket ──────────────────────────────────────────────────────
const wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
const ws = new WebSocket(`${wsProto}://${location.host}`);

ws.addEventListener('open', () => {
  const token = sessionStorage.getItem('sessionToken');
  if (token) ws.send(JSON.stringify({ type: 'reconnect', token }));
});

ws.addEventListener('message', (e) => {
  const msg = JSON.parse(e.data);

  if (msg.type === 'joined') {
    sessionStorage.setItem('sessionToken', msg.sessionToken);
    document.getElementById('hubPlayerName').textContent = msg.name;
    document.getElementById('hubTokens').textContent = msg.tokens;
    document.getElementById('lobby').classList.add('hidden');
    document.getElementById('hub').style.display = '';
    return;
  }

  if (msg.type === 'authError') {
    document.getElementById('lobbyError').textContent = msg.reason;
    document.getElementById('lobby').classList.remove('hidden');
    document.getElementById('hub').style.display = 'none';
    sessionStorage.removeItem('sessionToken');
    return;
  }

  if (msg.type === 'tokens') {
    document.getElementById('hubTokens').textContent = msg.value;
    const el = document.getElementById('hubTokens');
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
    return;
  }
});

// ── Lobby ──────────────────────────────────────────────────────────
function switchTab(mode) {
  lobbyMode = mode;
  document.getElementById('tabRegister').classList.toggle('active', mode === 'register');
  document.getElementById('tabLogin').classList.toggle('active', mode === 'login');
  document.getElementById('lobbySubmitBtn').textContent = mode === 'register' ? 'CREATE ACCOUNT' : 'LOGIN';
  document.getElementById('lobbyError').textContent = '';
}

function submitLobby() {
  const name = document.getElementById('nameInput').value.trim();
  const pass = document.getElementById('passwordInput').value;
  if (!name) { document.getElementById('lobbyError').textContent = 'Enter a username.'; return; }
  if (!pass)  { document.getElementById('lobbyError').textContent = 'Enter a password.';  return; }
  if (lobbyMode === 'register' && pass.length < 4) {
    document.getElementById('lobbyError').textContent = 'Password must be at least 4 characters.';
    return;
  }
  document.getElementById('lobbyError').textContent = '';
  if (ws.readyState !== WebSocket.OPEN) {
    document.getElementById('lobbyError').textContent = 'Not connected — try again.';
    return;
  }
  ws.send(JSON.stringify({ type: lobbyMode, name, password: pass }));
}

// ── Event listeners (replaces inline onclick/onkeydown) ────────────
document.getElementById('tabRegister').addEventListener('click', () => switchTab('register'));
document.getElementById('tabLogin').addEventListener('click', () => switchTab('login'));
document.getElementById('lobbySubmitBtn').addEventListener('click', submitLobby);
document.getElementById('nameInput').addEventListener('keydown',     e => { if (e.key === 'Enter') submitLobby(); });
document.getElementById('passwordInput').addEventListener('keydown', e => { if (e.key === 'Enter') submitLobby(); });
