'use strict';

const sessions = new Map(); // token     → playerId
const online   = new Map(); // playerId  → { name, tokens, ws }
const admins   = new Set(); // authenticated admin sockets
const bjGames  = new Map(); // playerId  → { deck, playerHand, dealerHand, bet }

const GAME_ACTIONS = new Set([
  'slots:spin', 'bj:deal', 'bj:hit', 'bj:stand', 'bj:double',
  'roulette:spin', 'horse:race', 'baccarat:deal',
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

module.exports = { sessions, online, admins, bjGames, GAME_ACTIONS, makeRateLimiter };
