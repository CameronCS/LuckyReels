'use strict';
const HR_NAMES  = ['Thunder Bolt','Lucky Strike','Iron Duke','Wild Fire','Night Shadow','Silver Fox'];
const HR_N      = 6;
const HR_ADV    = 0.27;
const HR_PAYOUT = 4;

function playHorse(bet, horseIndex) {
  const isBlowout = Math.random() < 0.10;
  const speeds    = [];
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
  const pos    = new Array(HR_N).fill(0);
  let   winner = -1;
  while (winner < 0) {
    for (let i = 0; i < HR_N; i++) {
      if (pos[i] >= 100) continue;
      pos[i] = Math.min(100, pos[i] + HR_ADV * speeds[i] + (Math.random() - 0.5) * 0.09);
      if (pos[i] >= 100 && winner < 0) winner = i;
    }
  }
  const net = (winner === horseIndex ? bet * HR_PAYOUT : 0) - bet;
  return { winnerIdx: winner, winnerName: HR_NAMES[winner], net };
}

module.exports = { playHorse, HR_NAMES, HR_N };
