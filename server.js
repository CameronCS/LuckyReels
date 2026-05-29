'use strict';
require('dotenv').config();
const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const WebSocket = require('ws');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');

const PORT = process.env.PORT || 3000;
const DIR  = path.join(__dirname, 'public');

// ── Database pool ──────────────────────────────────────────────────
const db = mysql.createPool({
  host:               process.env.DB_HOST || 'localhost',
  user:               process.env.DB_USER || 'root',
  password:           process.env.DB_PASS || '',
  database:           process.env.DB_NAME || 'lucky_reels',
  waitForConnections: true,
  connectionLimit:    10,
  timezone:           'Z',
});

// ── In-memory state ────────────────────────────────────────────────
const sessions = new Map(); // token → playerId
const online   = new Map(); // playerId → { name, tokens, ws }
const admins   = new Set(); // authenticated admin sockets
const bjGames  = new Map(); // playerId → { deck, playerHand, dealerHand, bet }

// ── Per-connection rate limiter ────────────────────────────────────
const GAME_ACTIONS = new Set([
  'slots:spin','bj:deal','bj:hit','bj:stand','bj:double','roulette:spin','horse:race',
]);

function makeRateLimiter(maxActions = 20, windowMs = 10_000) {
  const timestamps = [];
  return () => {
    const now = Date.now();
    while (timestamps.length && timestamps[0] <= now - windowMs) timestamps.shift();
    if (timestamps.length >= maxActions) return false;
    timestamps.push(now);
    return true;
  };
}

// ── Slots — server-side RNG + payout ──────────────────────────────
const SLOT_SYM = ['💎','7️⃣','🍀','⭐','🍒','🍋','🍇','🔔'];
const SLOT_WT  = [1, 3, 5, 8, 12, 15, 18, 20];
const SLOT_PAY = {'💎':50,'7️⃣':20,'🍀':15,'⭐':10,'🍒':5,'🍋':3,'🍇':2,'🔔':2};

function slotRng() {
  const total = SLOT_WT.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < SLOT_SYM.length; i++) { r -= SLOT_WT[i]; if (r <= 0) return SLOT_SYM[i]; }
  return SLOT_SYM[SLOT_SYM.length - 1];
}

function playSlots(bet) {
  const s = [slotRng(), slotRng(), slotRng()];
  const [a, b, c] = s;
  let winAmount = 0, result = 'loss';
  if (a === b && b === c) {
    winAmount = bet * SLOT_PAY[a]; result = 'jackpot';
  } else if (a === b || b === c || a === c) {
    const sym = (a === b) ? a : (b === c ? b : a);
    winAmount = Math.floor(bet * SLOT_PAY[sym] * 0.5); result = 'match';
  }
  return { symbols: s, winAmount, result };
}

// ── Roulette — server-side spin + payout ──────────────────────────
const RL_RED   = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const RL_WHEEL = [0,28,9,26,30,11,7,20,32,17,5,22,34,15,3,24,36,13,1,37,27,10,25,29,12,8,19,31,18,6,21,33,16,4,23,35,14,2];

function rlRange(a, b) { const r = []; for (let i = a; i <= b; i++) r.push(i); return r; }

const RL_BETS = (() => {
  const d = {};
  d['straight-0']  = { w: [0],  p: 35 };
  d['straight-37'] = { w: [37], p: 35 };
  for (let n = 1; n <= 36; n++) d[`straight-${n}`] = { w: [n], p: 35 };
  const BLK = rlRange(1, 36).filter(n => !RL_RED.has(n));
  d['col-1']   = { w: [1,4,7,10,13,16,19,22,25,28,31,34], p: 2 };
  d['col-2']   = { w: [2,5,8,11,14,17,20,23,26,29,32,35], p: 2 };
  d['col-3']   = { w: [3,6,9,12,15,18,21,24,27,30,33,36], p: 2 };
  d['dozen-1'] = { w: rlRange(1, 12),  p: 2 };
  d['dozen-2'] = { w: rlRange(13, 24), p: 2 };
  d['dozen-3'] = { w: rlRange(25, 36), p: 2 };
  d['low']     = { w: rlRange(1, 18),                          p: 1 };
  d['high']    = { w: rlRange(19, 36),                         p: 1 };
  d['even']    = { w: rlRange(2, 36).filter(n => n % 2 === 0), p: 1 };
  d['odd']     = { w: rlRange(1, 35).filter(n => n % 2 === 1), p: 1 };
  d['red']     = { w: [...RL_RED], p: 1 };
  d['black']   = { w: BLK, p: 1 };
  return d;
})();

function playRoulette(betMap) {
  const winNum = RL_WHEEL[Math.floor(Math.random() * 38)];
  let totalBet = 0, totalReturn = 0;
  const winningKeys = [];
  for (const [key, amt] of Object.entries(betMap)) {
    const a = Math.max(0, parseInt(amt) || 0);
    if (!a) continue;
    totalBet += a;
    const def = RL_BETS[key];
    if (def && def.w.includes(winNum)) { totalReturn += a * (def.p + 1); winningKeys.push(key); }
  }
  return { winNum, totalBet, net: totalReturn - totalBet, winningKeys };
}

// ── Horse — server-side simulation ────────────────────────────────
const HR_NAMES  = ['Thunder Bolt','Lucky Strike','Iron Duke','Wild Fire','Night Shadow','Silver Fox'];
const HR_N      = 6;
const HR_ADV    = 0.27;
const HR_PAYOUT = 4;

function playHorse(bet, horseIndex) {
  const isBlowout = Math.random() < 0.10;
  const speeds = [];
  if (isBlowout) {
    const losers = Math.random() < 0.5 ? 2 : 3;
    for (let i = 0; i < HR_N; i++)
      speeds.push(i < losers ? 0.28 + Math.random() * 0.24 : 0.84 + Math.random() * 0.36);
    for (let i = speeds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [speeds[i], speeds[j]] = [speeds[j], speeds[i]];
    }
  } else {
    const base = 0.88 + Math.random() * 0.12;
    for (let i = 0; i < HR_N; i++) speeds.push(base + (Math.random() - 0.5) * 0.30);
  }
  const pos = new Array(HR_N).fill(0);
  let winner = -1;
  while (winner < 0) {
    for (let i = 0; i < HR_N; i++) {
      if (pos[i] >= 100) continue;
      pos[i] = Math.min(100, pos[i] + HR_ADV * speeds[i] + (Math.random() - 0.5) * 0.09);
      if (pos[i] >= 100 && winner < 0) winner = i;
    }
  }
  const playerWon = winner === horseIndex;
  const net = (playerWon ? bet * HR_PAYOUT : 0) - bet;
  return { winnerIdx: winner, winnerName: HR_NAMES[winner], net };
}

// ── Blackjack — server-side game logic ────────────────────────────
const BJ_SUITS = ['♠','♥','♦','♣'];
const BJ_RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

function bjFreshShoe() {
  const shoe = [];
  for (let i = 0; i < 6; i++)
    for (const s of BJ_SUITS) for (const r of BJ_RANKS) shoe.push({ rank: r, suit: s });
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
  return shoe;
}

function bjDraw(game) {
  if (game.deck.length < 20) game.deck = bjFreshShoe();
  return game.deck.pop();
}

function bjHandValue(hand) {
  let total = 0, aces = 0;
  for (const c of hand) {
    const v = c.rank === 'A' ? 11 : ['J','Q','K'].includes(c.rank) ? 10 : parseInt(c.rank);
    if (c.rank === 'A') aces++;
    total += v;
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

function bjDealerPlay(game) {
  while (bjHandValue(game.dealerHand) < 17) game.dealerHand.push(bjDraw(game));
}

function bjResolve(game) {
  const pv = bjHandValue(game.playerHand);
  const dv = bjHandValue(game.dealerHand);
  const playerBJ = pv === 21 && game.playerHand.length === 2;
  const dealerBJ = dv === 21 && game.dealerHand.length === 2;
  if (playerBJ && dealerBJ) return 'push';
  if (playerBJ)             return 'blackjack';
  if (pv > 21)              return 'bust';
  if (dv > 21)              return 'dealer_bust';
  if (pv > dv)              return 'win';
  if (pv < dv)              return 'loss';
  return 'push';
}

function bjPayout(result, bet) {
  switch (result) {
    case 'blackjack':   return bet + Math.floor(bet * 1.5);
    case 'win':
    case 'dealer_bust': return bet * 2;
    case 'push':        return bet;
    default:            return 0;
  }
}

function bjNet(result, bet) {
  switch (result) {
    case 'blackjack':   return Math.floor(bet * 1.5);
    case 'win':
    case 'dealer_bust': return bet;
    case 'push':        return 0;
    default:            return -bet;
  }
}

async function bjEndRound(playerId, game, result) {
  bjGames.delete(playerId);

  const net    = bjNet(result, game.bet);
  const payout = bjPayout(result, game.bet);
  const p      = online.get(playerId);
  p.tokens     = Math.max(0, p.tokens + payout);

  const playerCards = game.playerHand.map(c => `${c.rank}${c.suit}`).join(',');
  const dealerCards = game.dealerHand.map(c => `${c.rank}${c.suit}`).join(',');

  await Promise.all([
    db.query('UPDATE players SET tokens = ? WHERE id = ?', [p.tokens, playerId]),
    db.query(
      'INSERT INTO bj_logs (player_id, result, player_cards, dealer_cards, bet, net) VALUES (?, ?, ?, ?, ?, ?)',
      [playerId, result, playerCards, dealerCards, game.bet, net]
    ),
  ]);

  broadcastAdmins({
    type: 'bjEvent', playerId, playerName: p.name,
    result, playerCards, dealerCards, bet: game.bet, net,
  });
  await pushPlayerList();

  return { net, tokens: p.tokens };
}

function bjResultMsg(game, result, net, tokens) {
  return {
    type:        'bj:result',
    playerHand:  game.playerHand,
    dealerHand:  game.dealerHand,
    playerTotal: bjHandValue(game.playerHand),
    dealerTotal: bjHandValue(game.dealerHand),
    result, net, tokens,
    bet:         game.bet,
  };
}

function bjStateMsg(game, tokens) {
  return {
    type:          'bj:state',
    playerHand:    game.playerHand,
    dealerHand:    [game.dealerHand[0], { hidden: true }],
    playerTotal:   bjHandValue(game.playerHand),
    dealerVisible: bjHandValue([game.dealerHand[0]]),
    bet:           game.bet,
    tokens,
  };
}

// ── Static file server ─────────────────────────────────────────────
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };

const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "connect-src 'self'",
  "img-src 'self'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join('; ');

const server = http.createServer((req, res) => {
  const url      = req.url.split('?')[0];
  const filePath = path.join(DIR, url === '/' ? 'index.html' : url);
  const ext      = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const headers = { 'Content-Type': MIME[ext] || 'text/plain', 'X-Content-Type-Options': 'nosniff' };
    if (ext === '.html') {
      headers['Content-Security-Policy'] = CSP;
      headers['X-Frame-Options']         = 'DENY';
      headers['Referrer-Policy']         = 'strict-origin-when-cross-origin';
    }
    res.writeHead(200, headers);
    res.end(data);
  });
});

// ── WebSocket server ───────────────────────────────────────────────
const wss = new WebSocket.Server({ server });

function send(ws, msg) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function broadcastAdmins(msg) {
  admins.forEach(ws => send(ws, msg));
}

async function pushPlayerList() {
  if (admins.size === 0) return;
  const [rows] = await db.query('SELECT id, name, tokens FROM players ORDER BY name');
  const list = rows.map(r => {
    const cached = online.get(r.id);
    return {
      id:     r.id,
      name:   r.name,
      tokens: cached ? cached.tokens : r.tokens,
      online: !!(cached && cached.ws && cached.ws.readyState === WebSocket.OPEN),
    };
  });
  broadcastAdmins({ type: 'players', list });
}

// ── Connection handler ─────────────────────────────────────────────
wss.on('connection', (ws) => {
  let myPlayerId  = null;
  let isAdmin     = false;
  let adminUsername = null;
  const checkRate = makeRateLimiter();

  ws.on('message', async (raw) => {
    if (raw.length > 4096) { ws.close(1009, 'Message too large'); return; }
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    try { await handleMessage(ws, msg); } catch (err) { console.error('WS handler error:', err); }
  });

  async function handleMessage(ws, msg) {

    if (GAME_ACTIONS.has(msg.type) && !checkRate()) {
      send(ws, { type: 'error', code: 'RATE_LIMITED', message: 'Slow down.' });
      return;
    }

    // ── ADMIN AUTH ─────────────────────────────────────────────────
    if (msg.type === 'adminLogin') {
      const username = String(msg.username || '').trim();
      const password = String(msg.password || '');
      if (!username || !password) {
        send(ws, { type: 'adminAuthError', reason: 'Enter username and password.' });
        return;
      }
      const [rows] = await db.query(
        'SELECT password_hash FROM admins WHERE username = ?', [username]
      );
      if (!rows.length || !await bcrypt.compare(password, rows[0].password_hash)) {
        send(ws, { type: 'adminAuthError', reason: 'Invalid credentials.' });
        return;
      }
      isAdmin = true;
      adminUsername = username;
      admins.add(ws);
      await db.query(
        'INSERT INTO admin_logs (admin_user, action) VALUES (?, ?)',
        [username, 'login']
      );
      send(ws, { type: 'adminAuthOk' });
      const [playerRows] = await db.query('SELECT id, name, tokens FROM players ORDER BY name');
      const list = playerRows.map(r => {
        const cached = online.get(r.id);
        return {
          id:     r.id,
          name:   r.name,
          tokens: cached ? cached.tokens : r.tokens,
          online: !!(cached && cached.ws && cached.ws.readyState === WebSocket.OPEN),
        };
      });
      send(ws, { type: 'players', list });
      return;
    }

    // ── ADMIN: fetch merged game history ───────────────────────────
    if (msg.type === 'getLogs') {
      if (!isAdmin) return;
      const limit = Math.min(parseInt(msg.limit) || 100, 500);

      const [[slotRows], [bjRows], [rlRows], [hrRows]] = await Promise.all([
        db.query(
          `SELECT machine_num, symbols, bet, win_amount, spin_type, created_at
           FROM spin_logs WHERE player_id = ? ORDER BY created_at DESC LIMIT ?`,
          [msg.playerId, limit]
        ),
        db.query(
          `SELECT result, player_cards, dealer_cards, bet, net, created_at
           FROM bj_logs WHERE player_id = ? ORDER BY created_at DESC LIMIT ?`,
          [msg.playerId, limit]
        ),
        db.query(
          `SELECT win_num, total_bet, net, created_at
           FROM roulette_logs WHERE player_id = ? ORDER BY created_at DESC LIMIT ?`,
          [msg.playerId, limit]
        ),
        db.query(
          `SELECT winner_name, picked_name, bet, net, created_at
           FROM horse_logs WHERE player_id = ? ORDER BY created_at DESC LIMIT ?`,
          [msg.playerId, limit]
        ),
      ]);

      const slots = slotRows.map(r => ({
        game: 'slots', machineNum: r.machine_num,
        symbols: r.symbols.split(','), bet: r.bet,
        net: r.win_amount > 0 ? r.win_amount : -r.bet,
        result: r.spin_type,
        ts: new Date(r.created_at).getTime(), time: new Date(r.created_at).toLocaleTimeString(),
      }));
      const bj = bjRows.map(r => ({
        game: 'blackjack', playerCards: r.player_cards, dealerCards: r.dealer_cards,
        bet: r.bet, net: r.net, result: r.result,
        ts: new Date(r.created_at).getTime(), time: new Date(r.created_at).toLocaleTimeString(),
      }));
      const roulette = rlRows.map(r => ({
        game: 'roulette', winNum: r.win_num, totalBet: r.total_bet, net: r.net,
        ts: new Date(r.created_at).getTime(), time: new Date(r.created_at).toLocaleTimeString(),
      }));
      const horse = hrRows.map(r => ({
        game: 'horse', winnerName: r.winner_name, pickedName: r.picked_name,
        bet: r.bet, net: r.net,
        ts: new Date(r.created_at).getTime(), time: new Date(r.created_at).toLocaleTimeString(),
      }));

      const logs = [...slots, ...bj, ...roulette, ...horse]
        .sort((a, b) => b.ts - a.ts)
        .slice(0, limit)
        .map(({ ts, ...rest }) => rest);

      send(ws, { type: 'playerLogs', playerId: msg.playerId, logs });
      return;
    }

    // ── PLAYER REGISTER ────────────────────────────────────────────
    if (msg.type === 'register') {
      const name = String(msg.name || '').trim().slice(0, 20);
      const pass = String(msg.password || '');
      if (!name) { send(ws, { type: 'authError', reason: 'Name is required.' }); return; }
      if (pass.length < 4) { send(ws, { type: 'authError', reason: 'Password must be at least 4 characters.' }); return; }
      const [existing] = await db.query('SELECT id FROM players WHERE name = ?', [name]);
      if (existing.length) { send(ws, { type: 'authError', reason: 'That name is already taken.' }); return; }
      const id   = randomUUID();
      const hash = await bcrypt.hash(pass, 10);
      await db.query('INSERT INTO players (id, name, password_hash, tokens) VALUES (?, ?, ?, 0)', [id, name, hash]);
      const token = randomUUID();
      sessions.set(token, id);
      online.set(id, { name, tokens: 0, ws });
      myPlayerId = id;
      await db.query('INSERT INTO sessions (token, player_id) VALUES (?, ?)', [token, id]);
      send(ws, { type: 'joined', sessionToken: token, playerId: id, name, tokens: 0 });
      await pushPlayerList();
      return;
    }

    // ── PLAYER LOGIN ───────────────────────────────────────────────
    if (msg.type === 'login') {
      const name = String(msg.name || '').trim();
      const pass = String(msg.password || '');
      if (!name || !pass) { send(ws, { type: 'authError', reason: 'Enter your name and password.' }); return; }
      const [rows] = await db.query(
        'SELECT id, name, password_hash, tokens FROM players WHERE name = ?', [name]
      );
      if (!rows.length) { send(ws, { type: 'authError', reason: 'Account not found.' }); return; }
      const p = rows[0];
      if (!await bcrypt.compare(pass, p.password_hash)) { send(ws, { type: 'authError', reason: 'Wrong password.' }); return; }
      const prev = online.get(p.id);
      if (prev && prev.ws && prev.ws !== ws) prev.ws.close();
      const token = randomUUID();
      sessions.set(token, p.id);
      online.set(p.id, { name: p.name, tokens: p.tokens, ws });
      myPlayerId = p.id;
      await db.query('INSERT INTO sessions (token, player_id) VALUES (?, ?)', [token, p.id]);
      send(ws, { type: 'joined', sessionToken: token, playerId: p.id, name: p.name, tokens: p.tokens });
      await pushPlayerList();
      return;
    }

    // ── PLAYER RECONNECT ───────────────────────────────────────────
    if (msg.type === 'reconnect') {
      let playerId = sessions.get(msg.token);
      if (!playerId) {
        // Memory cache miss — check DB (survives server restarts)
        const [sessRows] = await db.query(
          'SELECT player_id FROM sessions WHERE token = ?', [msg.token]
        );
        if (sessRows.length) {
          playerId = sessRows[0].player_id;
          sessions.set(msg.token, playerId);
        }
      }
      if (!playerId) {
        send(ws, { type: 'authError', reason: 'Session expired — please log in.' });
        return;
      }
      const [rows] = await db.query('SELECT id, name, tokens FROM players WHERE id = ?', [playerId]);
      if (!rows.length) {
        sessions.delete(msg.token);
        await db.query('DELETE FROM sessions WHERE token = ?', [msg.token]);
        send(ws, { type: 'authError', reason: 'Account not found.' });
        return;
      }
      const p = rows[0];
      online.set(p.id, { name: p.name, tokens: p.tokens, ws });
      myPlayerId = p.id;
      send(ws, { type: 'joined', sessionToken: msg.token, playerId: p.id, name: p.name, tokens: p.tokens });
      const resumeGame = bjGames.get(p.id);
      if (resumeGame) send(ws, bjStateMsg(resumeGame, p.tokens));
      await pushPlayerList();
      return;
    }

    // ── SLOTS: server picks symbols, calculates win ────────────────
    if (msg.type === 'slots:spin' && myPlayerId) {
      const bet        = Math.max(1, parseInt(msg.bet) || 1);
      const machineNum = Math.max(1, parseInt(msg.machineNum) || 1);
      const p = online.get(myPlayerId);
      if (!p || p.tokens < bet) {
        send(ws, { type: 'error', code: 'INSUFFICIENT_FUNDS', message: 'Not enough tokens.' });
        return;
      }
      // Compute result + update balance synchronously before any await
      const { symbols, winAmount, result } = playSlots(bet);
      p.tokens = Math.max(0, p.tokens - bet + winAmount);
      // Persist
      await db.query('UPDATE players SET tokens = ? WHERE id = ?', [p.tokens, myPlayerId]);
      const net = winAmount > 0 ? winAmount : -bet;
      send(ws, { type: 'slots:result', machineNum, symbols, result, net, tokens: p.tokens });
      broadcastAdmins({
        type: 'spinEvent', playerId: myPlayerId, playerName: p.name,
        machineNum, symbols, bet, winAmount, spinType: result,
      });
      await db.query(
        'INSERT INTO spin_logs (player_id, machine_num, symbols, bet, win_amount, spin_type) VALUES (?, ?, ?, ?, ?, ?)',
        [myPlayerId, machineNum, symbols.join(','), bet, winAmount, result]
      );
      await pushPlayerList();
      return;
    }

    // ── BLACKJACK: deal ────────────────────────────────────────────
    if (msg.type === 'bj:deal' && myPlayerId) {
      if (bjGames.has(myPlayerId)) {
        send(ws, { type: 'error', code: 'GAME_IN_PROGRESS', message: 'Finish your current hand first.' });
        return;
      }
      const bet = Math.max(1, parseInt(msg.bet) || 1);
      const p   = online.get(myPlayerId);
      if (!p || p.tokens < bet) {
        send(ws, { type: 'error', code: 'INSUFFICIENT_FUNDS', message: 'Not enough tokens.' });
        return;
      }

      // Reserve tokens + create game before any await (prevents concurrent deals)
      p.tokens -= bet;
      const game = { deck: bjFreshShoe(), playerHand: [], dealerHand: [], bet };
      bjGames.set(myPlayerId, game);

      await db.query('UPDATE players SET tokens = ? WHERE id = ?', [p.tokens, myPlayerId]);

      game.playerHand = [bjDraw(game), bjDraw(game)];
      game.dealerHand = [bjDraw(game), bjDraw(game)];

      const pv = bjHandValue(game.playerHand);
      const dv = bjHandValue(game.dealerHand);

      if (pv === 21) {
        const result = dv === 21 ? 'push' : 'blackjack';
        const { net, tokens } = await bjEndRound(myPlayerId, game, result);
        send(ws, bjResultMsg(game, result, net, tokens));
        return;
      }

      send(ws, bjStateMsg(game, p.tokens));
      return;
    }

    // ── BLACKJACK: hit ─────────────────────────────────────────────
    if (msg.type === 'bj:hit' && myPlayerId) {
      const game = bjGames.get(myPlayerId);
      if (!game) {
        send(ws, { type: 'error', code: 'NO_GAME', message: 'No active game.' });
        return;
      }

      game.playerHand.push(bjDraw(game));
      const pv = bjHandValue(game.playerHand);

      if (pv > 21) {
        const { net, tokens } = await bjEndRound(myPlayerId, game, 'bust');
        send(ws, bjResultMsg(game, 'bust', net, tokens));
        return;
      }

      if (pv === 21) {
        bjDealerPlay(game);
        const result = bjResolve(game);
        const { net, tokens } = await bjEndRound(myPlayerId, game, result);
        send(ws, bjResultMsg(game, result, net, tokens));
        return;
      }

      send(ws, bjStateMsg(game, online.get(myPlayerId).tokens));
      return;
    }

    // ── BLACKJACK: stand ───────────────────────────────────────────
    if (msg.type === 'bj:stand' && myPlayerId) {
      const game = bjGames.get(myPlayerId);
      if (!game) {
        send(ws, { type: 'error', code: 'NO_GAME', message: 'No active game.' });
        return;
      }

      bjDealerPlay(game);
      const result = bjResolve(game);
      const { net, tokens } = await bjEndRound(myPlayerId, game, result);
      send(ws, bjResultMsg(game, result, net, tokens));
      return;
    }

    // ── BLACKJACK: double down ─────────────────────────────────────
    if (msg.type === 'bj:double' && myPlayerId) {
      const game = bjGames.get(myPlayerId);
      if (!game) {
        send(ws, { type: 'error', code: 'NO_GAME', message: 'No active game.' });
        return;
      }
      if (game.playerHand.length !== 2) {
        send(ws, { type: 'error', code: 'INVALID_ACTION', message: 'Double only allowed on initial two cards.' });
        return;
      }
      const p = online.get(myPlayerId);
      if (!p || p.tokens < game.bet) {
        send(ws, { type: 'error', code: 'INSUFFICIENT_FUNDS', message: 'Not enough tokens to double.' });
        return;
      }

      p.tokens -= game.bet;
      game.bet  *= 2;
      await db.query('UPDATE players SET tokens = ? WHERE id = ?', [p.tokens, myPlayerId]);

      game.playerHand.push(bjDraw(game));
      const pv = bjHandValue(game.playerHand);

      if (pv > 21) {
        const { net, tokens } = await bjEndRound(myPlayerId, game, 'bust');
        send(ws, bjResultMsg(game, 'bust', net, tokens));
        return;
      }

      bjDealerPlay(game);
      const result = bjResolve(game);
      const { net, tokens } = await bjEndRound(myPlayerId, game, result);
      send(ws, bjResultMsg(game, result, net, tokens));
      return;
    }

    // ── ROULETTE: server picks number, resolves bets ───────────────
    if (msg.type === 'roulette:spin' && myPlayerId) {
      const betMap = (msg.bets && typeof msg.bets === 'object') ? msg.bets : {};
      // Compute totalBet for up-front validation (only counting known bet keys)
      let totalBet = 0;
      const cleanBets = {};
      for (const [key, amt] of Object.entries(betMap)) {
        const a = Math.max(0, parseInt(amt) || 0);
        if (RL_BETS[key] && a > 0) { cleanBets[key] = a; totalBet += a; }
      }
      if (totalBet <= 0) {
        send(ws, { type: 'error', code: 'INVALID_BET', message: 'Place at least one bet.' });
        return;
      }
      const p = online.get(myPlayerId);
      if (!p || p.tokens < totalBet) {
        send(ws, { type: 'error', code: 'INSUFFICIENT_FUNDS', message: 'Not enough tokens.' });
        return;
      }
      // Spin + update balance synchronously
      const { winNum, net, winningKeys } = playRoulette(cleanBets);
      p.tokens = Math.max(0, p.tokens + net);
      await db.query('UPDATE players SET tokens = ? WHERE id = ?', [p.tokens, myPlayerId]);
      const label = winNum === 37 ? '00' : String(winNum);
      send(ws, { type: 'roulette:result', winNum, net, tokens: p.tokens, winningKeys });
      broadcastAdmins({
        type: 'rouletteEvent', playerId: myPlayerId, playerName: p.name,
        winNum: label, totalBet, net,
      });
      await db.query(
        'INSERT INTO roulette_logs (player_id, win_num, total_bet, net) VALUES (?, ?, ?, ?)',
        [myPlayerId, label, totalBet, net]
      );
      await pushPlayerList();
      return;
    }

    // ── HORSE RACE: server simulates race, picks winner ────────────
    if (msg.type === 'horse:race' && myPlayerId) {
      const bet        = Math.max(1, parseInt(msg.bet) || 1);
      const horseIndex = parseInt(msg.horseIndex);
      if (isNaN(horseIndex) || horseIndex < 0 || horseIndex >= HR_N) {
        send(ws, { type: 'error', code: 'INVALID_INPUT', message: 'Invalid horse selection.' });
        return;
      }
      const p = online.get(myPlayerId);
      if (!p || p.tokens < bet) {
        send(ws, { type: 'error', code: 'INSUFFICIENT_FUNDS', message: 'Not enough tokens.' });
        return;
      }
      // Simulate + update balance synchronously
      const { winnerIdx, winnerName, net } = playHorse(bet, horseIndex);
      p.tokens = Math.max(0, p.tokens + net);
      await db.query('UPDATE players SET tokens = ? WHERE id = ?', [p.tokens, myPlayerId]);
      send(ws, { type: 'horse:result', winnerIndex: winnerIdx, winnerName, net, tokens: p.tokens });
      const pickedName = HR_NAMES[horseIndex];
      broadcastAdmins({
        type: 'horseEvent', playerId: myPlayerId, playerName: p.name,
        winnerName, pickedName, bet, net,
      });
      await db.query(
        'INSERT INTO horse_logs (player_id, winner_name, picked_name, bet, net) VALUES (?, ?, ?, ?, ?)',
        [myPlayerId, winnerName, pickedName, bet, net]
      );
      await pushPlayerList();
      return;
    }

    // ── ADMIN: create a new admin account ─────────────────────────
    if (msg.type === 'createAdmin' && isAdmin) {
      const username = String(msg.username || '').trim().slice(0, 40);
      const password = String(msg.password || '');
      if (!username) {
        send(ws, { type: 'createAdmin:error', message: 'Username is required.' });
        return;
      }
      if (password.length < 6) {
        send(ws, { type: 'createAdmin:error', message: 'Password must be at least 6 characters.' });
        return;
      }
      const [existing] = await db.query('SELECT id FROM admins WHERE username = ?', [username]);
      if (existing.length) {
        send(ws, { type: 'createAdmin:error', message: 'That username is already taken.' });
        return;
      }
      const hash = await bcrypt.hash(password, 10);
      await db.query('INSERT INTO admins (username, password_hash) VALUES (?, ?)', [username, hash]);
      await db.query(
        'INSERT INTO admin_logs (admin_user, action, detail) VALUES (?, ?, ?)',
        [adminUsername, 'create_admin', `username=${username}`]
      );
      send(ws, { type: 'createAdmin:ok', username });
      return;
    }

    // ── ADMIN: set one player's token balance ──────────────────────
    if (msg.type === 'setTokens' && isAdmin) {
      const value = Math.max(0, parseInt(msg.value) || 0);
      await db.query('UPDATE players SET tokens = ? WHERE id = ?', [value, msg.playerId]);
      await db.query(
        'INSERT INTO admin_logs (admin_user, action, target_id, detail) VALUES (?, ?, ?, ?)',
        [adminUsername, 'set_tokens', msg.playerId, `tokens=${value}`]
      );
      const p = online.get(msg.playerId);
      if (p) {
        p.tokens = value;
        send(p.ws, { type: 'tokens', value });
      }
      await pushPlayerList();
      return;
    }
  }

  ws.on('close', async () => {
    if (isAdmin) admins.delete(ws);
    if (myPlayerId) {
      const p = online.get(myPlayerId);
      if (p && p.ws === ws) p.ws = null;
      await pushPlayerList();
    }
  });
});

server.listen(PORT, () => {
  console.log(`\nLucky Reels → http://localhost:${PORT}`);
  console.log(`Admin panel  → http://localhost:${PORT}/admin.html\n`);
});

// ── Graceful shutdown ──────────────────────────────────────────────
function shutdown(signal) {
  console.log(`\n${signal} — shutting down gracefully...`);
  wss.clients.forEach(client => {
    send(client, { type: 'serverShutdown', message: 'Server restarting — reconnect in a moment.' });
    client.close(1001, 'Server shutting down');
  });
  server.close(() => {
    db.end().catch(() => {}).finally(() => {
      console.log('Goodbye.');
      process.exit(0);
    });
  });
  // Force exit if server.close stalls (e.g. a hung connection)
  setTimeout(() => process.exit(0), 5000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
