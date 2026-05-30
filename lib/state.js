'use strict';

const sessions   = new Map(); // token     → playerId
const online     = new Map(); // playerId  → { name, tokens, ws }
const admins     = new Set(); // authenticated admin sockets
const bjGames    = new Map(); // playerId  → { deck, playerHand, dealerHand, bet }
const minesGames = new Map(); // playerId  → { grid, mineCount, bet, revealed }
const crashGames = new Map(); // playerId  → { bet, startTime, crashPoint, autoCashout, timer, autoTimer }

const GAME_ACTIONS = new Set([
  'slots:spin', 'bj:deal', 'bj:hit', 'bj:stand', 'bj:double',
  'roulette:spin', 'horse:race', 'baccarat:deal',
  'mines:start', 'mines:reveal', 'mines:cashout',
  'crash:start', 'crash:cashout',
  'plinko:drop',
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

// Stricter limiter for auth endpoints: 10 attempts per 60 seconds per connection
function makeAuthLimiter(maxAttempts = 10, windowMs = 60_000) {
  const timestamps = [];
  return () => {
    const now = Date.now();
    while (timestamps.length && timestamps[0] <= now - windowMs) timestamps.shift();
    if (timestamps.length >= maxAttempts) return false;
    timestamps.push(now);
    return true;
  };
}

module.exports = { sessions, online, admins, bjGames, minesGames, crashGames, GAME_ACTIONS, makeRateLimiter, makeAuthLimiter };
