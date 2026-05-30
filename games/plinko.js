'use strict';

const ROWS  = 8;
const SLOTS = 9;

const MULTIPLIERS = {
  low:    [5.6, 2.1, 1.1, 1.0, 0.5, 1.0, 1.1, 2.1, 5.6],
  medium: [13,  3,   1.3, 0.7, 0.4, 0.7, 1.3, 3,   13 ],
  high:   [29,  4,   1.5, 0.3, 0.2, 0.3, 1.5, 4,   29 ],
};

function playPlinko(bet, risk) {
  const mults = MULTIPLIERS[risk] || MULTIPLIERS.medium;
  const path  = Array.from({ length: ROWS }, () => Math.random() < 0.5 ? 0 : 1);
  const slot  = path.reduce((s, d) => s + d, 0);
  const mult  = mults[slot];
  const net   = Math.floor(bet * mult) - bet;
  return { path, slot, mult, net };
}

module.exports = { playPlinko, MULTIPLIERS, ROWS, SLOTS };
