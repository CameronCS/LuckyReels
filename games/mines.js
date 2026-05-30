'use strict';

const GRID_SIZE = 25;

function generateGrid(mineCount) {
  const cells = Array(GRID_SIZE).fill(false);
  let placed = 0;
  while (placed < mineCount) {
    const idx = Math.floor(Math.random() * GRID_SIZE);
    if (!cells[idx]) { cells[idx] = true; placed++; }
  }
  return cells;
}

function calcMultiplier(mineCount, revealed) {
  const safe = GRID_SIZE - mineCount;
  let prob = 1.0;
  for (let i = 0; i < revealed; i++) {
    prob *= (safe - i) / (GRID_SIZE - i);
  }
  return Math.floor((0.97 / prob) * 100) / 100;
}

module.exports = { generateGrid, calcMultiplier, GRID_SIZE };
