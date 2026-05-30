'use strict';
const WebSocket      = require('ws');
const bcrypt         = require('bcryptjs');
const { randomUUID } = require('crypto');

const db = require('./db');
const { sessions, online, admins, bjGames, minesGames, crashGames, GAME_ACTIONS, makeRateLimiter, makeAuthLimiter } = require('./state');
const { playSlots }                       = require('../games/slots');
const { playRoulette, RL_BETS }           = require('../games/roulette');
const { playHorse, HR_NAMES, HR_N }       = require('../games/horse');
const {
  bjFreshShoe, bjDraw, bjHandValue, bjDealerPlay,
  bjResolve, bjPayout, bjNet, bjResultMsg, bjStateMsg,
} = require('../games/blackjack');
const { playBaccarat } = require('../games/baccarat');
const { generateGrid, calcMultiplier, GRID_SIZE } = require('../games/mines');
const { generateCrashPoint, getMultiplier: crashMultiplier, crashToMs } = require('../games/crash');
const { playPlinko } = require('../games/plinko');

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
  const snap   = p.tokens;
  p.tokens     = Math.max(0, p.tokens + payout);

  const playerCards = game.playerHand.map(c => `${c.rank}${c.suit}`).join(',');
  const dealerCards = game.dealerHand.map(c => `${c.rank}${c.suit}`).join(',');

  await db.withTransaction(async tx => {
    await tx.query('UPDATE players SET tokens = ? WHERE id = ?', [p.tokens, playerId]);
    await tx.query(
      'INSERT INTO bj_logs (player_id, result, player_cards, dealer_cards, bet, net) VALUES (?, ?, ?, ?, ?, ?)',
      [playerId, result, playerCards, dealerCards, game.bet, net]
    );
  }).catch(() => { p.tokens = snap; });

  broadcastAdmins({
    type: 'bjEvent', playerId, playerName: p.name,
    result, playerCards, dealerCards, bet: game.bet, net,
  });
  await pushPlayerList();
  return { net, tokens: p.tokens };
}

// ── WS server ──────────────────────────────────────────────────────
const ADMIN_SESSION_TTL = 8 * 60 * 60 * 1000; // 8 hours
const STARTING_TOKENS   = 1000;

let wss;

function setupWS(server) {
  db.query('DELETE FROM sessions WHERE expires_at < NOW()').catch(err => {
    console.error('Session cleanup failed:', err.message);
  });

  wss = new WebSocket.Server({
    server,
    verifyClient: ({ origin }) => {
      const allowed = process.env.ALLOWED_ORIGIN;
      if (!allowed || !origin) return true;
      return origin === allowed;
    },
  });

  wss.on('connection', (ws) => {
    let myPlayerId    = null;
    let myToken       = null;
    let isAdmin       = false;
    let adminUsername = null;
    let adminAuthAt   = null;
    const checkRate   = makeRateLimiter();
    const authCheck   = makeAuthLimiter();

    function isAdminValid() {
      if (!isAdmin) return false;
      if (Date.now() - adminAuthAt > ADMIN_SESSION_TTL) {
        isAdmin = false;
        adminAuthAt = null;
        admins.delete(ws);
        send(ws, { type: 'adminAuthError', reason: 'Session expired — please log in again.' });
        return false;
      }
      return true;
    }

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
        if (!authCheck()) {
          send(ws, { type: 'adminAuthError', reason: 'Too many attempts — slow down.' });
          return;
        }
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
        adminAuthAt = Date.now();
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
        if (!isAdminValid()) return;
        const limit = Math.min(parseInt(msg.limit) || 100, 500);
        const [[slotRows], [bjRows], [rlRows], [hrRows], [bacRows], [mnRows], [crRows], [plRows]] = await Promise.all([
          db.query(`SELECT machine_num, symbols, bet, win_amount, spin_type, created_at FROM spin_logs WHERE player_id = ? ORDER BY created_at DESC LIMIT ?`, [msg.playerId, limit]),
          db.query(`SELECT result, player_cards, dealer_cards, bet, net, created_at FROM bj_logs WHERE player_id = ? ORDER BY created_at DESC LIMIT ?`, [msg.playerId, limit]),
          db.query(`SELECT win_num, total_bet, net, created_at FROM roulette_logs WHERE player_id = ? ORDER BY created_at DESC LIMIT ?`, [msg.playerId, limit]),
          db.query(`SELECT winner_name, picked_name, bet, net, created_at FROM horse_logs WHERE player_id = ? ORDER BY created_at DESC LIMIT ?`, [msg.playerId, limit]),
          db.query(`SELECT bet_type, outcome, player_hand, banker_hand, bet, net, created_at FROM baccarat_logs WHERE player_id = ? ORDER BY created_at DESC LIMIT ?`, [msg.playerId, limit]),
          db.query(`SELECT bet, mine_count, cells_revealed, net, outcome, created_at FROM mines_logs WHERE player_id = ? ORDER BY created_at DESC LIMIT ?`, [msg.playerId, limit]),
          db.query(`SELECT bet, crash_point, cashout_mult, net, outcome, created_at FROM crash_logs WHERE player_id = ? ORDER BY created_at DESC LIMIT ?`, [msg.playerId, limit]),
          db.query(`SELECT bet, risk, slot, multiplier, net, created_at FROM plinko_logs WHERE player_id = ? ORDER BY created_at DESC LIMIT ?`, [msg.playerId, limit]),
        ]);
        const toTime = d => new Date(d).toLocaleTimeString();
        const toTs   = d => new Date(d).getTime();
        const slots = slotRows.map(r => ({ game: 'slots', machineNum: r.machine_num, symbols: r.symbols.split(','), bet: r.bet, net: r.win_amount > 0 ? r.win_amount : -r.bet, result: r.spin_type, ts: toTs(r.created_at), time: toTime(r.created_at) }));
        const bj    = bjRows.map(r => ({ game: 'blackjack', playerCards: r.player_cards, dealerCards: r.dealer_cards, bet: r.bet, net: r.net, result: r.result, ts: toTs(r.created_at), time: toTime(r.created_at) }));
        const rl    = rlRows.map(r => ({ game: 'roulette', winNum: r.win_num, totalBet: r.total_bet, net: r.net, ts: toTs(r.created_at), time: toTime(r.created_at) }));
        const hr    = hrRows.map(r => ({ game: 'horse', winnerName: r.winner_name, pickedName: r.picked_name, bet: r.bet, net: r.net, ts: toTs(r.created_at), time: toTime(r.created_at) }));
        const bac   = bacRows.map(r => ({ game: 'baccarat', betType: r.bet_type, outcome: r.outcome, playerCards: r.player_hand, bankerCards: r.banker_hand, bet: r.bet, net: r.net, ts: toTs(r.created_at), time: toTime(r.created_at) }));
        const mn    = mnRows.map(r => ({ game: 'mines', bet: r.bet, mineCount: r.mine_count, cellsRevealed: r.cells_revealed, net: r.net, outcome: r.outcome, ts: toTs(r.created_at), time: toTime(r.created_at) }));
        const cr    = crRows.map(r => ({ game: 'crash', bet: r.bet, crashPoint: parseFloat(r.crash_point), cashoutMult: r.cashout_mult ? parseFloat(r.cashout_mult) : null, net: r.net, outcome: r.outcome, ts: toTs(r.created_at), time: toTime(r.created_at) }));
        const pl    = plRows.map(r => ({ game: 'plinko', bet: r.bet, risk: r.risk, slot: r.slot, mult: parseFloat(r.multiplier), net: r.net, ts: toTs(r.created_at), time: toTime(r.created_at) }));
        const logs  = [...slots, ...bj, ...rl, ...hr, ...bac, ...mn, ...cr, ...pl].sort((a, b) => b.ts - a.ts).slice(0, limit).map(({ ts, ...rest }) => rest);
        send(ws, { type: 'playerLogs', playerId: msg.playerId, logs });
        return;
      }

      // ── ADMIN: set tokens ────────────────────────────────────────
      if (msg.type === 'setTokens' && isAdminValid()) {
        const value = Math.min(Math.max(0, parseInt(msg.value) || 0), 10_000_000);
        await db.query('UPDATE players SET tokens = ? WHERE id = ?', [value, msg.playerId]);
        await db.query('INSERT INTO admin_logs (admin_user, action, target_id, detail) VALUES (?, ?, ?, ?)', [adminUsername, 'set_tokens', msg.playerId, `tokens=${value}`]);
        const p = online.get(msg.playerId);
        if (p) { p.tokens = value; send(p.ws, { type: 'tokens', value }); }
        await pushPlayerList();
        return;
      }

      // ── ADMIN: create admin ──────────────────────────────────────
      if (msg.type === 'createAdmin' && isAdminValid()) {
        const username = String(msg.username || '').trim().slice(0, 40);
        const password = String(msg.password || '');
        if (!username) { send(ws, { type: 'createAdmin:error', message: 'Username is required.' }); return; }
        if (password.length < 12) { send(ws, { type: 'createAdmin:error', message: 'Password must be at least 12 characters.' }); return; }
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
        if (!authCheck()) {
          send(ws, { type: 'authError', reason: 'Too many attempts — slow down.' });
          return;
        }
        const name = String(msg.name || '').trim().slice(0, 20);
        const pass = String(msg.password || '');
        if (!name) { send(ws, { type: 'authError', reason: 'Name is required.' }); return; }
        if (pass.length < 4) { send(ws, { type: 'authError', reason: 'Password must be at least 4 characters.' }); return; }
        const [existing] = await db.query('SELECT id FROM players WHERE name = ?', [name]);
        if (existing.length) { send(ws, { type: 'authError', reason: 'That name is already taken.' }); return; }
        const id    = randomUUID();
        const hash  = await bcrypt.hash(pass, 10);
        await db.query('INSERT INTO players (id, name, password_hash, tokens) VALUES (?, ?, ?, ?)', [id, name, hash, STARTING_TOKENS]);
        const token = randomUUID();
        sessions.set(token, id);
        myToken    = token;
        myPlayerId = id;
        online.set(id, { name, tokens: STARTING_TOKENS, ws });
        await db.query('INSERT INTO sessions (token, player_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))', [token, id]);
        send(ws, { type: 'joined', sessionToken: token, playerId: id, name, tokens: STARTING_TOKENS });
        await pushPlayerList();
        return;
      }

      // ── LOGIN ─────────────────────────────────────────────────────
      if (msg.type === 'login') {
        if (!authCheck()) {
          send(ws, { type: 'authError', reason: 'Too many attempts — slow down.' });
          return;
        }
        const name = String(msg.name || '').trim();
        const pass = String(msg.password || '');
        if (!name || !pass) { send(ws, { type: 'authError', reason: 'Enter your name and password.' }); return; }
        const [rows] = await db.query('SELECT id, name, password_hash, tokens FROM players WHERE name = ?', [name]);
        const p = rows[0];
        // Always run bcrypt to prevent timing-based username enumeration
        const hashToCheck = p ? p.password_hash : '$2a$10$X9Fy95LNjUxQqHLBOhV7yOFGG9TFG0jm6CYJLO3K9wuOAMUJGfgS2';
        if (!p || !await bcrypt.compare(pass, hashToCheck)) {
          send(ws, { type: 'authError', reason: 'Invalid name or password.' }); return;
        }
        const prev = online.get(p.id);
        if (prev && prev.ws && prev.ws !== ws) prev.ws.close();
        // Invalidate all previous sessions for this player before issuing a new one
        await db.query('DELETE FROM sessions WHERE player_id = ?', [p.id]);
        const token = randomUUID();
        sessions.set(token, p.id);
        myToken    = token;
        myPlayerId = p.id;
        online.set(p.id, { name: p.name, tokens: p.tokens, ws });
        await db.query('INSERT INTO sessions (token, player_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))', [token, p.id]);
        send(ws, { type: 'joined', sessionToken: token, playerId: p.id, name: p.name, tokens: p.tokens });
        await pushPlayerList();
        return;
      }

      // ── RECONNECT ─────────────────────────────────────────────────
      if (msg.type === 'reconnect') {
        if (!authCheck()) {
          send(ws, { type: 'authError', reason: 'Too many attempts — slow down.' });
          return;
        }
        let playerId = sessions.get(msg.token);
        if (!playerId) {
          const [sessRows] = await db.query('SELECT player_id FROM sessions WHERE token = ? AND expires_at > NOW()', [msg.token]);
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
        myToken    = msg.token;
        send(ws, { type: 'joined', sessionToken: msg.token, playerId: p.id, name: p.name, tokens: p.tokens });
        const resumeGame = bjGames.get(p.id);
        if (resumeGame) send(ws, bjStateMsg(resumeGame, p.tokens));
        const resumeCrash = crashGames.get(p.id);
        if (resumeCrash) {
          send(ws, {
            type: 'crash:resumed',
            bet: resumeCrash.bet,
            startTime: resumeCrash.startTime,
            autoCashout: resumeCrash.autoCashout || null,
            tokens: p.tokens,
          });
        }
        const resumeMines = minesGames.get(p.id);
        if (resumeMines) {
          const mult = resumeMines.revealed.length > 0
            ? calcMultiplier(resumeMines.mineCount, resumeMines.revealed.length)
            : 1.00;
          send(ws, {
            type: 'mines:resumed',
            mineCount: resumeMines.mineCount,
            bet: resumeMines.bet,
            revealed: resumeMines.revealed,
            multiplier: mult,
            cashoutValue: resumeMines.revealed.length > 0 ? Math.floor(resumeMines.bet * mult) : resumeMines.bet,
            gridSize: GRID_SIZE,
          });
        }
        await pushPlayerList();
        return;
      }

      // ── LOGOUT ───────────────────────────────────────────────────
      if (msg.type === 'logout' && myPlayerId) {
        if (myToken) {
          sessions.delete(myToken);
          await db.query('DELETE FROM sessions WHERE token = ?', [myToken]);
          myToken = null;
        }
        const p = online.get(myPlayerId);
        if (p && p.ws === ws) online.delete(myPlayerId);
        myPlayerId = null;
        send(ws, { type: 'loggedOut' });
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
        const snap = p.tokens;
        p.tokens = Math.max(0, p.tokens - bet + winAmount);
        const net = winAmount > 0 ? winAmount : -bet;
        try {
          await db.withTransaction(async tx => {
            await tx.query('UPDATE players SET tokens = ? WHERE id = ?', [p.tokens, myPlayerId]);
            await tx.query('INSERT INTO spin_logs (player_id, machine_num, symbols, bet, win_amount, spin_type) VALUES (?, ?, ?, ?, ?, ?)', [myPlayerId, machineNum, symbols.join(','), bet, winAmount, result]);
          });
        } catch { p.tokens = snap; }
        send(ws, { type: 'slots:result', machineNum, symbols, result, net, tokens: p.tokens });
        broadcastAdmins({ type: 'spinEvent', playerId: myPlayerId, playerName: p.name, machineNum, symbols, bet, winAmount, spinType: result });
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
        const snap = p.tokens;
        p.tokens = Math.max(0, p.tokens + net);
        const label = winNum === 37 ? '00' : String(winNum);
        try {
          await db.withTransaction(async tx => {
            await tx.query('UPDATE players SET tokens = ? WHERE id = ?', [p.tokens, myPlayerId]);
            await tx.query('INSERT INTO roulette_logs (player_id, win_num, total_bet, net) VALUES (?, ?, ?, ?)', [myPlayerId, label, totalBet, net]);
          });
        } catch { p.tokens = snap; }
        send(ws, { type: 'roulette:result', winNum, net, tokens: p.tokens, winningKeys });
        broadcastAdmins({ type: 'rouletteEvent', playerId: myPlayerId, playerName: p.name, winNum: label, totalBet, net });
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
        const snap = p.tokens;
        p.tokens = Math.max(0, p.tokens + net);
        const pickedName = HR_NAMES[horseIndex];
        try {
          await db.withTransaction(async tx => {
            await tx.query('UPDATE players SET tokens = ? WHERE id = ?', [p.tokens, myPlayerId]);
            await tx.query('INSERT INTO horse_logs (player_id, winner_name, picked_name, bet, net) VALUES (?, ?, ?, ?, ?)', [myPlayerId, winnerName, pickedName, bet, net]);
          });
        } catch { p.tokens = snap; }
        send(ws, { type: 'horse:result', winnerIndex: winnerIdx, winnerName, net, tokens: p.tokens });
        broadcastAdmins({ type: 'horseEvent', playerId: myPlayerId, playerName: p.name, winnerName, pickedName, bet, net });
        await pushPlayerList();
        return;
      }

      // ── BACCARAT ──────────────────────────────────────────────────
      if (msg.type === 'baccarat:deal' && myPlayerId) {
        const betType = String(msg.betType || '').toLowerCase();
        if (!['player', 'banker', 'tie'].includes(betType)) {
          send(ws, { type: 'error', code: 'INVALID_BET', message: 'Choose Player, Banker, or Tie.' });
          return;
        }
        const bet = Math.max(1, parseInt(msg.bet) || 1);
        const p   = online.get(myPlayerId);
        if (!p || p.tokens < bet) {
          send(ws, { type: 'error', code: 'INSUFFICIENT_FUNDS', message: 'Not enough tokens.' });
          return;
        }
        const { playerHand, bankerHand, playerTotal, bankerTotal, outcome, net } = playBaccarat(betType, bet);
        const snap = p.tokens;
        p.tokens = Math.max(0, p.tokens + net);
        const playerCards = playerHand.map(c => `${c.rank}${c.suit}`).join(',');
        const bankerCards = bankerHand.map(c => `${c.rank}${c.suit}`).join(',');
        try {
          await db.withTransaction(async tx => {
            await tx.query('UPDATE players SET tokens = ? WHERE id = ?', [p.tokens, myPlayerId]);
            await tx.query('INSERT INTO baccarat_logs (player_id, bet_type, outcome, player_hand, banker_hand, bet, net) VALUES (?, ?, ?, ?, ?, ?, ?)', [myPlayerId, betType, outcome, playerCards, bankerCards, bet, net]);
          });
        } catch { p.tokens = snap; }
        send(ws, { type: 'baccarat:result', playerHand, bankerHand, playerTotal, bankerTotal, outcome, betType, net, tokens: p.tokens });
        broadcastAdmins({ type: 'baccaratEvent', playerId: myPlayerId, playerName: p.name, betType, outcome, playerCards, bankerCards, bet, net });
        await pushPlayerList();
        return;
      }

      // ── MINES: start ──────────────────────────────────────────────
      if (msg.type === 'mines:start' && myPlayerId) {
        if (minesGames.has(myPlayerId)) {
          send(ws, { type: 'error', code: 'GAME_IN_PROGRESS', message: 'Finish your current game first.' });
          return;
        }
        const bet       = Math.max(10, parseInt(msg.bet) || 10);
        const mineCount = parseInt(msg.mineCount);
        if (isNaN(mineCount) || mineCount < 1 || mineCount > 24) {
          send(ws, { type: 'error', code: 'INVALID_INPUT', message: 'Mine count must be 1–24.' });
          return;
        }
        const p = online.get(myPlayerId);
        if (!p || p.tokens < bet) {
          send(ws, { type: 'error', code: 'INSUFFICIENT_FUNDS', message: 'Not enough tokens.' });
          return;
        }
        const snap = p.tokens;
        p.tokens -= bet;
        try {
          await db.withTransaction(async tx => {
            await tx.query('UPDATE players SET tokens = ? WHERE id = ?', [p.tokens, myPlayerId]);
          });
        } catch { p.tokens = snap; send(ws, { type: 'error', code: 'SERVER_ERROR', message: 'Something went wrong — try again.' }); return; }
        const grid = generateGrid(mineCount);
        minesGames.set(myPlayerId, { grid, mineCount, bet, revealed: [] });
        send(ws, { type: 'mines:started', mineCount, bet, tokens: p.tokens, gridSize: GRID_SIZE });
        await pushPlayerList();
        return;
      }

      // ── MINES: reveal ─────────────────────────────────────────────
      if (msg.type === 'mines:reveal' && myPlayerId) {
        const game = minesGames.get(myPlayerId);
        if (!game) { send(ws, { type: 'error', code: 'NO_GAME', message: 'No active game.' }); return; }
        const cellIndex = parseInt(msg.cellIndex);
        if (isNaN(cellIndex) || cellIndex < 0 || cellIndex >= GRID_SIZE) {
          send(ws, { type: 'error', code: 'INVALID_INPUT', message: 'Invalid cell.' }); return;
        }
        if (game.revealed.includes(cellIndex)) {
          send(ws, { type: 'error', code: 'INVALID_INPUT', message: 'Cell already revealed.' }); return;
        }
        const p = online.get(myPlayerId);
        if (game.grid[cellIndex]) {
          minesGames.delete(myPlayerId);
          const net = -game.bet;
          const minePositions = game.grid.map((m, i) => m ? i : -1).filter(i => i >= 0);
          await db.withTransaction(async tx => {
            await tx.query('INSERT INTO mines_logs (player_id, bet, mine_count, cells_revealed, net, outcome) VALUES (?, ?, ?, ?, ?, ?)', [myPlayerId, game.bet, game.mineCount, game.revealed.length, net, 'exploded']);
          }).catch(() => {});
          broadcastAdmins({ type: 'minesEvent', playerId: myPlayerId, playerName: p.name, bet: game.bet, mineCount: game.mineCount, cellsRevealed: game.revealed.length, net, outcome: 'exploded' });
          send(ws, { type: 'mines:exploded', cellIndex, minePositions, net, tokens: p.tokens });
          await pushPlayerList();
          return;
        }
        game.revealed.push(cellIndex);
        const multiplier   = calcMultiplier(game.mineCount, game.revealed.length);
        const cashoutValue = Math.floor(game.bet * multiplier);
        send(ws, { type: 'mines:safe', cellIndex, multiplier, cashoutValue, revealed: game.revealed.length });
        return;
      }

      // ── MINES: cashout ────────────────────────────────────────────
      if (msg.type === 'mines:cashout' && myPlayerId) {
        const game = minesGames.get(myPlayerId);
        if (!game) { send(ws, { type: 'error', code: 'NO_GAME', message: 'No active game.' }); return; }
        if (game.revealed.length === 0) {
          send(ws, { type: 'error', code: 'INVALID_ACTION', message: 'Reveal at least one cell first.' }); return;
        }
        minesGames.delete(myPlayerId);
        const multiplier   = calcMultiplier(game.mineCount, game.revealed.length);
        const payout       = Math.floor(game.bet * multiplier);
        const net          = payout - game.bet;
        const p            = online.get(myPlayerId);
        const snap         = p.tokens;
        p.tokens           = Math.max(0, p.tokens + payout);
        const minePositions = game.grid.map((m, i) => m ? i : -1).filter(i => i >= 0);
        try {
          await db.withTransaction(async tx => {
            await tx.query('UPDATE players SET tokens = ? WHERE id = ?', [p.tokens, myPlayerId]);
            await tx.query('INSERT INTO mines_logs (player_id, bet, mine_count, cells_revealed, net, outcome) VALUES (?, ?, ?, ?, ?, ?)', [myPlayerId, game.bet, game.mineCount, game.revealed.length, net, 'cashed_out']);
          });
        } catch { p.tokens = snap; }
        broadcastAdmins({ type: 'minesEvent', playerId: myPlayerId, playerName: p.name, bet: game.bet, mineCount: game.mineCount, cellsRevealed: game.revealed.length, net, outcome: 'cashed_out' });
        send(ws, { type: 'mines:cashout', minePositions, multiplier, net, tokens: p.tokens });
        await pushPlayerList();
        return;
      }

      // ── CRASH: start ──────────────────────────────────────────────
      if (msg.type === 'crash:start' && myPlayerId) {
        if (crashGames.has(myPlayerId)) {
          send(ws, { type: 'error', code: 'GAME_IN_PROGRESS', message: 'Finish your current game first.' });
          return;
        }
        const bet = Math.max(10, parseInt(msg.bet) || 10);
        const p   = online.get(myPlayerId);
        if (!p || p.tokens < bet) {
          send(ws, { type: 'error', code: 'INSUFFICIENT_FUNDS', message: 'Not enough tokens.' });
          return;
        }
        const autoCashoutRaw = parseFloat(msg.autoCashout);
        const autoCashout    = (!isNaN(autoCashoutRaw) && autoCashoutRaw > 1.00) ? Math.floor(autoCashoutRaw * 100) / 100 : null;

        const snap = p.tokens;
        p.tokens -= bet;
        try {
          await db.withTransaction(async tx => {
            await tx.query('UPDATE players SET tokens = ? WHERE id = ?', [p.tokens, myPlayerId]);
          });
        } catch { p.tokens = snap; send(ws, { type: 'error', code: 'SERVER_ERROR', message: 'Something went wrong — try again.' }); return; }

        const crashPoint = generateCrashPoint();
        const startTime  = Date.now();
        const game       = { bet, startTime, crashPoint, autoCashout, timer: null, autoTimer: null };
        crashGames.set(myPlayerId, game);

        const pid = myPlayerId; // captured for async callbacks

        async function doCrash() {
          if (!crashGames.has(pid)) return;
          clearTimeout(game.autoTimer);
          crashGames.delete(pid);
          const pp = online.get(pid);
          if (!pp) return;
          const net = -bet;
          await db.withTransaction(async tx => {
            await tx.query('INSERT INTO crash_logs (player_id, bet, crash_point, cashout_mult, net, outcome) VALUES (?, ?, ?, ?, ?, ?)', [pid, bet, crashPoint, null, net, 'crashed']);
          }).catch(() => {});
          broadcastAdmins({ type: 'crashEvent', playerId: pid, playerName: pp.name, bet, crashPoint, cashoutMult: null, net, outcome: 'crashed' });
          send(pp.ws, { type: 'crash:crashed', crashPoint, net, tokens: pp.tokens });
          await pushPlayerList();
        }

        async function doAutoCashout(mult) {
          if (!crashGames.has(pid)) return;
          clearTimeout(game.timer);
          crashGames.delete(pid);
          const pp = online.get(pid);
          if (!pp) return;
          const payout   = Math.floor(bet * mult);
          const net      = payout - bet;
          const snapAuto = pp.tokens;
          pp.tokens      = Math.max(0, pp.tokens + payout);
          try {
            await db.withTransaction(async tx => {
              await tx.query('UPDATE players SET tokens = ? WHERE id = ?', [pp.tokens, pid]);
              await tx.query('INSERT INTO crash_logs (player_id, bet, crash_point, cashout_mult, net, outcome) VALUES (?, ?, ?, ?, ?, ?)', [pid, bet, crashPoint, mult, net, 'cashed_out']);
            });
          } catch { pp.tokens = snapAuto; }
          broadcastAdmins({ type: 'crashEvent', playerId: pid, playerName: pp.name, bet, crashPoint, cashoutMult: mult, net, outcome: 'cashed_out' });
          send(pp.ws, { type: 'crash:cashed_out', multiplier: mult, net, tokens: pp.tokens });
          await pushPlayerList();
        }

        game.timer = setTimeout(doCrash, Math.max(0, Math.round(crashToMs(crashPoint))));
        if (autoCashout && autoCashout < crashPoint) {
          game.autoTimer = setTimeout(() => doAutoCashout(autoCashout), Math.round(crashToMs(autoCashout)));
        }

        send(ws, { type: 'crash:started', bet, startTime, tokens: p.tokens, autoCashout });
        await pushPlayerList();
        return;
      }

      // ── CRASH: cashout ────────────────────────────────────────────
      if (msg.type === 'crash:cashout' && myPlayerId) {
        const game = crashGames.get(myPlayerId);
        if (!game) { send(ws, { type: 'error', code: 'NO_GAME', message: 'No active game.' }); return; }
        const elapsed    = Date.now() - game.startTime;
        const multiplier = crashMultiplier(elapsed);
        clearTimeout(game.timer);
        clearTimeout(game.autoTimer);
        crashGames.delete(myPlayerId);
        const p = online.get(myPlayerId);
        if (multiplier >= game.crashPoint) {
          const net = -game.bet;
          await db.query('INSERT INTO crash_logs (player_id, bet, crash_point, cashout_mult, net, outcome) VALUES (?, ?, ?, ?, ?, ?)', [myPlayerId, game.bet, game.crashPoint, null, net, 'crashed']);
          broadcastAdmins({ type: 'crashEvent', playerId: myPlayerId, playerName: p.name, bet: game.bet, crashPoint: game.crashPoint, cashoutMult: null, net, outcome: 'crashed' });
          send(ws, { type: 'crash:crashed', crashPoint: game.crashPoint, net, tokens: p.tokens });
          await pushPlayerList();
          return;
        }
        const payout = Math.floor(game.bet * multiplier);
        const net    = payout - game.bet;
        const snap   = p.tokens;
        p.tokens     = Math.max(0, p.tokens + payout);
        try {
          await db.withTransaction(async tx => {
            await tx.query('UPDATE players SET tokens = ? WHERE id = ?', [p.tokens, myPlayerId]);
            await tx.query('INSERT INTO crash_logs (player_id, bet, crash_point, cashout_mult, net, outcome) VALUES (?, ?, ?, ?, ?, ?)', [myPlayerId, game.bet, game.crashPoint, multiplier, net, 'cashed_out']);
          });
        } catch { p.tokens = snap; }
        broadcastAdmins({ type: 'crashEvent', playerId: myPlayerId, playerName: p.name, bet: game.bet, crashPoint: game.crashPoint, cashoutMult: multiplier, net, outcome: 'cashed_out' });
        send(ws, { type: 'crash:cashed_out', multiplier, net, tokens: p.tokens });
        await pushPlayerList();
        return;
      }

      // ── PLINKO ────────────────────────────────────────────────────
      if (msg.type === 'plinko:drop' && myPlayerId) {
        const bet  = Math.max(10, parseInt(msg.bet) || 10);
        const risk = ['low', 'medium', 'high'].includes(msg.risk) ? msg.risk : 'medium';
        const p    = online.get(myPlayerId);
        if (!p || p.tokens < bet) {
          send(ws, { type: 'error', code: 'INSUFFICIENT_FUNDS', message: 'Not enough tokens.' });
          return;
        }
        const { path, slot, mult, net } = playPlinko(bet, risk);
        const snap = p.tokens;
        p.tokens = Math.max(0, p.tokens + net);
        try {
          await db.withTransaction(async tx => {
            await tx.query('UPDATE players SET tokens = ? WHERE id = ?', [p.tokens, myPlayerId]);
            await tx.query('INSERT INTO plinko_logs (player_id, bet, risk, slot, multiplier, net) VALUES (?, ?, ?, ?, ?, ?)', [myPlayerId, bet, risk, slot, mult, net]);
          });
        } catch { p.tokens = snap; }
        broadcastAdmins({ type: 'plinkoEvent', playerId: myPlayerId, playerName: p.name, bet, risk, slot, mult, net });
        send(ws, { type: 'plinko:result', path, slot, mult, net, tokens: p.tokens });
        await pushPlayerList();
        return;
      }
    }

    ws.on('close', () => {
      if (isAdmin) admins.delete(ws);
      if (myPlayerId) {
        const p = online.get(myPlayerId);
        if (p && p.ws === ws) {
          p.ws = null;
          const pid = myPlayerId;
          setTimeout(async () => {
            const current = online.get(pid);
            if (!current || !current.ws || current.ws.readyState !== WebSocket.OPEN) {
              await pushPlayerList();
            }
          }, 3000);
        }
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
