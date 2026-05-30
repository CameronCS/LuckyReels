'use strict';

function generateCrashPoint() {
  const r = Math.random();
  return Math.max(1.00, Math.floor(0.99 / (1 - r) * 100) / 100);
}

function getMultiplier(elapsedMs) {
  return Math.floor(Math.pow(Math.E, elapsedMs / 8000) * 100) / 100;
}

function crashToMs(multiplier) {
  return Math.log(multiplier) * 8000;
}

module.exports = { generateCrashPoint, getMultiplier, crashToMs };
