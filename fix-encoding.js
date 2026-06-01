const fs = require('fs');

function fix(path, pairs) {
  let t = fs.readFileSync(path, 'utf8');
  for (const [a, b] of pairs) t = t.split(a).join(b);
  fs.writeFileSync(path, t, 'utf8');
  console.log('Fixed:', path.split(/[/\\]/).pop());
}

const base = 'C:/Users/USER-PC/OneDrive/Documents/dev/Gambling Game/Client/src/app/pages/';

fix(base + 'horse/horse.component.ts', [
  ["'ðŸ\x80\x81 GO!'", "'🏁 GO!'"],
  ["`ðŸ\x80\x86 ", "`🏆 "],
  ['  Â·  âˆ'', '  ·  −'],
  ["'Out of tokens â€” ask", "'Out of tokens — ask"],
  ["'Ready to race â€” click RACE!'", "'Ready to race — click RACE!'"],
]);

fix(base + 'plinko/plinko.component.ts', [
  ["'Ã×'", "'×'"],
  ["'Ã×  '", "'×  '"],
]);

fix(base + 'baccarat/baccarat.component.ts', [
  ["'PUSH â€” BET RETURNED'", "'PUSH — BET RETURNED'"],
  ["âˆ'", "−"],
]);

fix(base + 'mines/mines.component.ts', [
  ["= 'â€”'", "= '—'"],
  ["+ ' ðŸ\xaa\x99'", "+ ' 🪙'"],
  ["'CASH OUT Â· ", "'CASH OUT · "],
  ["'ðŸ\x92\xa5 BOOM!", "'💥 BOOM!"],
  ["ðŸ\x92\x8e ${this.multiplier}Ã×", "💎 ${this.multiplier}×"],
  ["b + ' ðŸ\xaa\x99'", "b + ' 🪙'"],
  ["mc + ' ðŸ\x92\xa3'", "mc + ' 💣'"],
  ["return 'ðŸ\x92\x8e'", "return '💎'"],
  ["return 'ðŸ\x92\xa3'", "return '💣'"],
]);
