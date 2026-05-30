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

// ── Shared WebSocket worker ────────────────────────────────────────
if (sessionStorage.getItem('sessionToken')) {
  document.getElementById('lobby').classList.add('hidden');
}

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
    document.getElementById('hubPlayerName').textContent = msg.name;
    document.getElementById('hubTokens').textContent = msg.tokens;
    if (!sessionReady) {
      sessionReady = true;
      document.getElementById('lobby').classList.add('hidden');
      document.getElementById('hub').classList.remove('hidden');
    }
    return;
  }

  if (msg.type === 'authError') {
    sessionReady = false;
    document.getElementById('lobbyError').textContent = msg.reason;
    document.getElementById('lobby').classList.remove('hidden');
    document.getElementById('hub').classList.add('hidden');
    sessionStorage.removeItem('sessionToken');
    return;
  }

  if (msg.type === 'loggedOut') {
    sessionReady = false;
    worker.port.postMessage({ type: 'clear-token' });
    sessionStorage.removeItem('sessionToken');
    document.getElementById('hub').classList.add('hidden');
    document.getElementById('lobby').classList.remove('hidden');
    document.getElementById('lobbyError').textContent = '';
    document.getElementById('nameInput').value = '';
    document.getElementById('passwordInput').value = '';
    return;
  }

  if (msg.type === 'tokens') {
    document.getElementById('hubTokens').textContent = msg.value;
    const el = document.getElementById('hubTokens');
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
    return;
  }

  if (msg.type === 'bonus') {
    document.getElementById('hubTokens').textContent = msg.tokens;
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
  if (!wsReady) {
    document.getElementById('lobbyError').textContent = 'Not connected — try again.';
    return;
  }
  worker.port.postMessage({ type: 'ws-send', data: { type: lobbyMode, name, password: pass } });
}

// ── Event listeners ────────────────────────────────────────────────
document.getElementById('tabRegister').addEventListener('click', () => switchTab('register'));
document.getElementById('tabLogin').addEventListener('click', () => switchTab('login'));
document.getElementById('lobbySubmitBtn').addEventListener('click', submitLobby);
document.getElementById('nameInput').addEventListener('keydown',     e => { if (e.key === 'Enter') submitLobby(); });
document.getElementById('passwordInput').addEventListener('keydown', e => { if (e.key === 'Enter') submitLobby(); });
document.getElementById('logoutBtn').addEventListener('click', () => {
  if (wsReady) worker.port.postMessage({ type: 'ws-send', data: { type: 'logout' } });
});
