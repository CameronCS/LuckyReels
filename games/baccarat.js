'use strict';
const SUITS = ['♠','♥','♦','♣'];
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

function freshShoe() {
  const shoe = [];
  for (let i = 0; i < 8; i++)
    for (const s of SUITS) for (const r of RANKS) shoe.push({ rank: r, suit: s });
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
  return shoe;
}

function cardValue(rank) {
  if (rank === 'A') return 1;
  if (['10','J','Q','K'].includes(rank)) return 0;
  return parseInt(rank);
}

function handTotal(hand) {
  return hand.reduce((s, c) => s + cardValue(c.rank), 0) % 10;
}

function playBaccarat(betType, bet) {
  const shoe = freshShoe();
  let pos = 0;
  const draw = () => shoe[pos++];

  const playerHand = [draw(), draw()];
  const bankerHand = [draw(), draw()];

  const natural = handTotal(playerHand) >= 8 || handTotal(bankerHand) >= 8;

  let playerThird = null;
  if (!natural) {
    if (handTotal(playerHand) <= 5) {
      playerThird = draw();
      playerHand.push(playerThird);
    }
    const bt = handTotal(bankerHand);
    let bankerDraws;
    if (playerThird === null) {
      bankerDraws = bt <= 5;
    } else {
      const p3 = cardValue(playerThird.rank);
      bankerDraws =
        bt <= 2                           ? true  :
        bt === 3                          ? p3 !== 8 :
        bt === 4                          ? p3 >= 2 && p3 <= 7 :
        bt === 5                          ? p3 >= 4 && p3 <= 7 :
        bt === 6                          ? p3 === 6 || p3 === 7 :
        false;
    }
    if (bankerDraws) bankerHand.push(draw());
  }

  const playerTotal = handTotal(playerHand);
  const bankerTotal = handTotal(bankerHand);
  const outcome     = playerTotal > bankerTotal ? 'player' : bankerTotal > playerTotal ? 'banker' : 'tie';

  let net;
  if (betType === 'player') {
    net = outcome === 'player' ? bet : outcome === 'tie' ? 0 : -bet;
  } else if (betType === 'banker') {
    net = outcome === 'banker' ? Math.floor(bet * 0.95) : outcome === 'tie' ? 0 : -bet;
  } else {
    net = outcome === 'tie' ? bet * 8 : -bet;
  }

  return { playerHand, bankerHand, playerTotal, bankerTotal, outcome, net };
}

module.exports = { playBaccarat };
