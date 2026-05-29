'use strict';
const WebSocket      = require('ws');
const bcrypt         = require('bcryptjs');
const { randomUUID } = require('crypto');

const db = require('./db');
const { sessions, online, admins, bjGames, GAME_ACTIONS, makeRateLimiter } = require('./state');
const { playSlots }                       = require('../games/slots');
const { playRoulette, RL_BETS }           = require('../games/roulette');
const { playHorse, HR_NAMES, HR_N }       = require('../games/horse');
const {
  bjFreshShoe, bjDraw, bjHandValue, bjDealerPlay,
  bjResolve, bjPayout, bjNet, bjResultMsg, bjStateMsg,
} = require('../games/blackjack');

// ── Helpers ────────────────────────────────────────────────────────
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

// ── BJ round commit (needs db + state + WS) ───────────────────────
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

// ── WS server ──────────────────────────────────────────────────────
let wss;

function setupWS(server) {
  wss = new WebSocket.Server({ server });

  wss.on('connection', (ws) => {
    let myPlayerId    = null;
    let isAdmin       = false;
    let adminUsername = null;
    const checkRate   = makeRateLimiter();

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

      // ── ADMIN AUTH ───────────────────────────────────────────────
      if (msg.type === 'adminLogin') {
        const username = String(msg.username || '').trim();
        const password = String(msg.password || '');
        if (!username || !password) {
          send(ws, { type: 'adminAuthError', reason: 'Enter username and password.' });
          return;
        }
        const [rows] = await db.query('SELECT password_hash FROM admins WHERE username = ?', [username]);
        if (!rows.length || !await bcrypt.compare(password, rows[0].password_hash)) {
          send(ws, { type: 'adminAuthError', reason: 'Invalid credentials.' });
          return;
        }
        isAdmin = true;
        adminUsername = username;
        admins.add(ws);
        await db.query('INSERT INTO admin_logs (admin_user, action) VALUES (?, ?)', [username, 'login']);
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

      // ── ADMIN: game history ──────────────────────────────────────
      if (msg.type === 'getLogs') {
        if (!isAdmin) return;
        const limit = Math.min(parseInt(msg.limit) || 100, 500);
        const [[slotRows], [bjRows], [rlRows], [hrRows]] = await Promise.all([
          db.query(`SELECT machine_num, symbols, bet, win_amount, spin_type, created_at FROM spin_logs WHERE player_id = ? ORDER BY created_at DESC LIMIT ?`, [msg.playerId, limit]),
          db.query(`SELECT result, player_cards, dealer_cards, bet, net, created_at FROM bj_logs WHERE player_id = ? ORDER BY created_at DESC LIMIT ?`, [msg.playerId, limit]),
          db.query(`SELECT win_num, total_bet, net, created_at FROM roulette_logs WHERE player_id = ? ORDER BY created_at DESC LIMIT ?`, [msg.playerId, limit]),
          db.query(`SELECT winner_name, picked_name, bet, net, created_at FROM horse_logs WHERE player_id = ? ORDER BY created_at DESC LIMIT ?`, [msg.playerId, limit]),
        ]);
        const toTime = d => new Date(d).toLocaleTimeString();
        const toTs   = d => new Date(d).getTime();
        const slots = slotRows.map(r => ({ game: 'slots', machineNum: r.machine_num, symbols: r.symbols.split(','), bet: r.bet, net: r.win_amount > 0 ? r.win_amount : -r.bet, result: r.spin_type, ts: toTs(r.created_at), time: toTime(r.created_at) }));
        const bj    = bjRows.map(r => ({ game: 'blackjack', playerCards: r.player_cards, dealerCards: r.dealer_cards, bet: r.bet, net: r.net, result: r.result, ts: toTs(r.created_at), time: toTime(r.created_at) }));
        const rl    = rlRows.map(r => ({ game: 'roulette', winNum: r.win_num, totalBet: r.total_bet, net: r.net, ts: toTs(r.created_at), time: toTime(r.created_at) }));
        const hr    = hrRows.map(r => ({ game: 'horse', winnerName: r.winner_name, pickedName: r.picked_name, bet: r.bet, net: r.net, ts: toTs(r.created_at), time: toTime(r.created_at) }));
        const logs  = [...slots, ...bj, ...rl, ...hr].sort((a, b) => b.ts - a.ts).slice(0, limit).map(({ ts, ...rest }) => rest);
        send(ws, { type: 'playerLogs', playerId: msg.playerId, logs });
        return;
      }

      // ── ADMIN: set tokens ────────────────────────────────────────
      if (msg.type === 'setTokens' && isAdmin) {
        const value = Math.max(0, parseInt(msg.value) || 0);
        await db.query('UPDATE players SET tokens = ? WHERE id = ?', [value, msg.playerId]);
        await db.query('INSERT INTO admin_logs (admin_user, action, target_id, detail) VALUES (?, ?, ?, ?)', [adminUsername, 'set_tokens', msg.playerId, `tokens=${value}`]);
        const p = online.get(msg.playerId);
        if (p) { p.tokens = value; send(p.ws, { type: 'tokens', value }); }
        await pushPlayerList();
        return;
      }

      // ── ADMIN: create admin ──────────────────────────────────────
      if (msg.type === 'createAdmin' && isAdmin) {
        const username = String(msg.username || '').trim().slice(0, 40);
        const password = String(msg.password || '');
        if (!username) { send(ws, { type: 'createAdmin:error', message: 'Username is required.' }); return; }
        if (password.length < 6) { send(ws, { type: 'createAdmin:error', message: 'Password must be at least 6 characters.' }); return; }
        const [existing] = await db.query('SELECT id FROM admins WHERE username = ?', [username]);
        if (existing.length) { send(ws, { type: 'createAdmin:error', message: 'That username is already taken.' }); return; }
        const hash = await bcrypt.hash(password, 10);
        await db.query('INSERT INTO admins (username, password_hash) VALUES (?, ?)', [username, hash]);
        await db.query('INSERT INTO admin_logs (admin_user, action, detail) VALUES (?, ?, ?)', [adminUsername, 'create_admin', `username=${username}`]);
        send(ws, { type: 'createAdmin:ok', username });
        return;
      }

      // ── REGISTER ─────────────────────────────────────────────────
      if (msg.type === 'register') {
        const name = String(msg.name || '').trim().slice(0, 20);
        const pass = String(msg.password || '');
        if (!name) { send(ws, { type: 'authError', reason: 'Name is required.' }); return; }
        if (pass.length < 4) { send(ws, { type: 'authError', reason: 'Password must be at least 4 characters.' }); return; }
        const [existing] = await db.query('SELECT id FROM players WHERE name = ?', [name]);
        if (existing.length) { send(ws, { type: 'authError', reason: 'That name is already taken.' }); return; }
        const id    = randomUUID();
        const hash  = await bcrypt.hash(pass, 10);
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

      // ── LOGIN ─────────────────────────────────────────────────────
      if (msg.type === 'login') {
        const name = String(msg.name || '').trim();
        const pass = String(msg.password || '');
        if (!name || !pass) { send(ws, { type: 'authError', reason: 'Enter your name and password.' }); return; }
        const [rows] = await db.query('SELECT id, name, password_hash, tokens FROM players WHERE name = ?', [name]);
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

      // ── RECONNECT ─────────────────────────────────────────────────
      if (msg.type === 'reconnect') {
        let playerId = sessions.get(msg.token);
        if (!playerId) {
          const [sessRows] = await db.query('SELECT player_id FROM sessions WHERE token = ?', [msg.token]);
          if (sessRows.length) { playerId = sessRows[0].player_id; sessions.set(msg.token, playerId); }
        }
        if (!playerId) { send(ws, { type: 'authError', reason: 'Session expired — please log in.' }); return; }
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

      // ── SLOTS ─────────────────────────────────────────────────────
      if (msg.type === 'slots:spin' && myPlayerId) {
        const bet        = Math.max(1, parseInt(msg.bet) || 1);
        const machineNum = Math.max(1, parseInt(msg.machineNum) || 1);
        const p = online.get(myPlayerId);
        if (!p || p.tokens < bet) { send(ws, { type: 'error', code: 'INSUFFICIENT_FUNDS', message: 'Not enough tokens.' }); return; }
        const { symbols, winAmount, result } = playSlots(bet);
        p.tokens = Math.max(0, p.tokens - bet + winAmount);
        await db.query('UPDATE players SET tokens = ? WHERE id = ?', [p.tokens, myPlayerId]);
        const net = winAmount > 0 ? winAmount : -bet;
        send(ws, { type: 'slots:result', machineNum, symbols, result, net, tokens: p.tokens });
        broadcastAdmins({ type: 'spinEvent', playerId: myPlayerId, playerName: p.name, machineNum, symbols, bet, winAmount, spinType: result });
        await db.query('INSERT INTO spin_logs (player_id, machine_num, symbols, bet, win_amount, spin_type) VALUES (?, ?, ?, ?, ?, ?)', [myPlayerId, machineNum, symbols.join(','), bet, winAmount, result]);
        await pushPlayerList();
        return;
      }

      // ── BLACKJACK: deal ───────────────────────────────────────────
      if (msg.type === 'bj:deal' && myPlayerId) {
        if (bjGames.has(myPlayerId)) { send(ws, { type: 'error', code: 'GAME_IN_PROGRESS', message: 'Finish your current hand first.' }); return; }
        const bet = Math.max(1, parseInt(msg.bet) || 1);
        const p   = online.get(myPlayerId);
        if (!p || p.tokens < bet) { send(ws, { type: 'error', code: 'INSUFFICIENT_FUNDS', message: 'Not enough tokens.' }); return; }
        p.tokens -= bet;
        const game = { deck: bjFreshShoe(), playerHand: [], dealerHand: [], bet };
        bjGames.set(myPlayerId, game);
        await db.query('UPDATE players SET tokens = ? WHERE id = ?', [p.tokens, myPlayerId]);
        game.playerHand = [bjDraw(game), bjDraw(game)];
        game.dealerHand = [bjDraw(game), bjDraw(game)];
        if (bjHandValue(game.playerHand) === 21) {
          const result = bjHandValue(game.dealerHand) === 21 ? 'push' : 'blackjack';
          const { net, tokens } = await bjEndRound(myPlayerId, game, result);
          send(ws, bjResultMsg(game, result, net, tokens));
          return;
        }
        send(ws, bjStateMsg(game, p.tokens));
        return;
      }

      // ── BLACKJACK: hit ────────────────────────────────────────────
      if (msg.type === 'bj:hit' && myPlayerId) {
        const game = bjGames.get(myPlayerId);
        if (!game) { send(ws, { type: 'error', code: 'NO_GAME', message: 'No active game.' }); return; }
        game.playerHand.push(bjDraw(game));
        const pv = bjHandValue(game.playerHand);
        if (pv > 21) {
          const { net, tokens } = await bjEndRound(myPlayerId, game, 'bust');
          send(ws, bjResultMsg(game, 'bust', net, tokens)); return;
        }
        if (pv === 21) {
          bjDealerPlay(game);
          const result = bjResolve(game);
          const { net, tokens } = await bjEndRound(myPlayerId, game, result);
          send(ws, bjResultMsg(game, result, net, tokens)); return;
        }
        send(ws, bjStateMsg(game, online.get(myPlayerId).tokens));
        return;
      }

      // ── BLACKJACK: stand ──────────────────────────────────────────
      if (msg.type === 'bj:stand' && myPlayerId) {
        const game = bjGames.get(myPlayerId);
        if (!game) { send(ws, { type: 'error', code: 'NO_GAME', message: 'No active game.' }); return; }
        bjDealerPlay(game);
        const result = bjResolve(game);
        const { net, tokens } = await bjEndRound(myPlayerId, game, result);
        send(ws, bjResultMsg(game, result, net, tokens));
        return;
      }

      // ── BLACKJACK: double ─────────────────────────────────────────
      if (msg.type === 'bj:double' && myPlayerId) {
        const game = bjGames.get(myPlayerId);
        if (!game) { send(ws, { type: 'error', code: 'NO_GAME', message: 'No active game.' }); return; }
        if (game.playerHand.length !== 2) { send(ws, { type: 'error', code: 'INVALID_ACTION', message: 'Double only allowed on initial two cards.' }); return; }
        const p = online.get(myPlayerId);
        if (!p || p.tokens < game.bet) { send(ws, { type: 'error', code: 'INSUFFICIENT_FUNDS', message: 'Not enough tokens to double.' }); return; }
        p.tokens -= game.bet;
        game.bet  *= 2;
        await db.query('UPDATE players SET tokens = ? WHERE id = ?', [p.tokens, myPlayerId]);
        game.playerHand.push(bjDraw(game));
        const pv = bjHandValue(game.playerHand);
        if (pv > 21) {
          const { net, tokens } = await bjEndRound(myPlayerId, game, 'bust');
          send(ws, bjResultMsg(game, 'bust', net, tokens)); return;
        }
        bjDealerPlay(game);
        const result = bjResolve(game);
        const { net, tokens } = await bjEndRound(myPlayerId, game, result);
        send(ws, bjResultMsg(game, result, net, tokens));
        return;
      }

      // ── ROULETTE ──────────────────────────────────────────────────
      if (msg.type === 'roulette:spin' && myPlayerId) {
        const betMap = (msg.bets && typeof msg.bets === 'object') ? msg.bets : {};
        let totalBet = 0;
        const cleanBets = {};
        for (const [key, amt] of Object.entries(betMap)) {
          const a = Math.max(0, parseInt(amt) || 0);
          if (RL_BETS[key] && a > 0) { cleanBets[key] = a; totalBet += a; }
        }
        if (totalBet <= 0) { send(ws, { type: 'error', code: 'INVALID_BET', message: 'Place at least one bet.' }); return; }
        const p = online.get(myPlayerId);
        if (!p || p.tokens < totalBet) { send(ws, { type: 'error', code: 'INSUFFICIENT_FUNDS', message: 'Not enough tokens.' }); return; }
        const { winNum, net, winningKeys } = playRoulette(cleanBets);
        p.tokens = Math.max(0, p.tokens + net);
        await db.query('UPDATE players SET tokens = ? WHERE id = ?', [p.tokens, myPlayerId]);
        const label = winNum === 37 ? '00' : String(winNum);
        send(ws, { type: 'roulette:result', winNum, net, tokens: p.tokens, winningKeys });
        broadcastAdmins({ type: 'rouletteEvent', playerId: myPlayerId, playerName: p.name, winNum: label, totalBet, net });
        await db.query('INSERT INTO roulette_logs (player_id, win_num, total_bet, net) VALUES (?, ?, ?, ?)', [myPlayerId, label, totalBet, net]);
        await pushPlayerList();
        return;
      }

      // ── HORSE ─────────────────────────────────────────────────────
      if (msg.type === 'horse:race' && myPlayerId) {
        const bet        = Math.max(1, parseInt(msg.bet) || 1);
        const horseIndex = parseInt(msg.horseIndex);
        if (isNaN(horseIndex) || horseIndex < 0 || horseIndex >= HR_N) { send(ws, { type: 'error', code: 'INVALID_INPUT', message: 'Invalid horse selection.' }); return; }
        const p = online.get(myPlayerId);
        if (!p || p.tokens < bet) { send(ws, { type: 'error', code: 'INSUFFICIENT_FUNDS', message: 'Not enough tokens.' }); return; }
        const { winnerIdx, winnerName, net } = playHorse(bet, horseIndex);
        p.tokens = Math.max(0, p.tokens + net);
        await db.query('UPDATE players SET tokens = ? WHERE id = ?', [p.tokens, myPlayerId]);
        send(ws, { type: 'horse:result', winnerIndex: winnerIdx, winnerName, net, tokens: p.tokens });
        const pickedName = HR_NAMES[horseIndex];
        broadcastAdmins({ type: 'horseEvent', playerId: myPlayerId, playerName: p.name, winnerName, pickedName, bet, net });
        await db.query('INSERT INTO horse_logs (player_id, winner_name, picked_name, bet, net) VALUES (?, ?, ?, ?, ?)', [myPlayerId, winnerName, pickedName, bet, net]);
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
}

function gracefulShutdown(server) {
  wss.clients.forEach(client => {
    send(client, { type: 'serverShutdown', message: 'Server restarting — reconnect in a moment.' });
    client.close(1001, 'Server shutting down');
  });
  server.close(() => {
    db.end().catch(() => {}).finally(() => { console.log('Goodbye.'); process.exit(0); });
  });
  setTimeout(() => process.exit(0), 5000);
}

module.exports = { setupWS, gracefulShutdown };
