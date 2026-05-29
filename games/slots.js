'use strict';
const SLOT_SYM = ['💎','7️⃣','🍀','⭐','🍒','🍋','🍇','🔔'];
const SLOT_WT  = [1, 3, 5, 8, 12, 15, 18, 20];
const SLOT_PAY = { '💎':50, '7️⃣':20, '🍀':15, '⭐':10, '🍒':5, '🍋':3, '🍇':2, '🔔':2 };

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

module.exports = { playSlots };
