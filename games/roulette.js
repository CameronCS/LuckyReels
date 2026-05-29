'use strict';
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
  d['low']   = { w: rlRange(1, 18),                          p: 1 };
  d['high']  = { w: rlRange(19, 36),                         p: 1 };
  d['even']  = { w: rlRange(2, 36).filter(n => n % 2 === 0), p: 1 };
  d['odd']   = { w: rlRange(1, 35).filter(n => n % 2 === 1), p: 1 };
  d['red']   = { w: [...RL_RED], p: 1 };
  d['black'] = { w: BLK, p: 1 };
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

module.exports = { playRoulette, RL_BETS };
