'use strict';
// SharedWorker — one WebSocket connection shared across all game pages.
// New pages receive a cached 'joined' immediately (no loading flash), then
// the server sends a fresh 'joined' + any active game state via reconnect.

let socket     = null;
let token      = null;
let lastJoined = null; // cached so new ports get instant session replay
const ports    = new Set();

function wsUrl() {
  const proto = self.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${self.location.host}`;
}

function broadcast(msg) {
  ports.forEach(p => p.postMessage(msg));
}

function openSocket() {
  if (socket && socket.readyState <= WebSocket.OPEN) return;

  socket = new WebSocket(wsUrl());

  socket.addEventListener('open', () => {
    broadcast({ type: 'ws-open' });
    if (token) socket.send(JSON.stringify({ type: 'reconnect', token }));
  });

  socket.addEventListener('message', ({ data }) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }

    if (msg.type === 'joined') {
      token      = msg.sessionToken;
      lastJoined = msg;
    }
    if (msg.type === 'loggedOut' || msg.type === 'authError') {
      token      = null;
      lastJoined = null;
    }

    broadcast(msg);
  });

  socket.addEventListener('close', () => {
    broadcast({ type: 'ws-closed' });
    if (token) setTimeout(openSocket, 1500); // auto-reconnect when authenticated
  });
}

self.addEventListener('connect', e => {
  const port = e.ports[0];
  ports.add(port);

  port.addEventListener('message', ({ data: msg }) => {
    switch (msg.type) {

      case 'init': {
        if (msg.token && !token) token = msg.token;

        if (!socket || socket.readyState > WebSocket.OPEN) {
          openSocket(); // fresh start — open handler sends reconnect
        } else if (socket.readyState === WebSocket.OPEN) {
          port.postMessage({ type: 'ws-open' }); // tell new page socket is live
          if (lastJoined) port.postMessage(lastJoined); // instant session replay
          if (token) socket.send(JSON.stringify({ type: 'reconnect', token })); // refresh game state from server
        }
        // If CONNECTING: open handler will broadcast ws-open + reconnect to all ports
        break;
      }

      case 'ws-send': {
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify(msg.data));
        }
        break;
      }

      case 'clear-token': {
        token      = null;
        lastJoined = null;
        break;
      }
    }
  });

  port.addEventListener('close', () => ports.delete(port));
  port.start();
});
