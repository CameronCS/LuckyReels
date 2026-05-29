'use strict';
const BJ_SUITS = ['♠','♥','♦','♣'];
const BJ_RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

function bjFreshShoe() {
  const shoe = [];
  for (let i = 0; i < 6; i++)
    for (const s of BJ_SUITS) for (const r of BJ_RANKS) shoe.push({ rank: r, suit: s });
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
  return shoe;
}

function bjDraw(game) {
  if (game.deck.length < 20) game.deck = bjFreshShoe();
  return game.deck.pop();
}

function bjHandValue(hand) {
  let total = 0, aces = 0;
  for (const c of hand) {
    const v = c.rank === 'A' ? 11 : ['J','Q','K'].includes(c.rank) ? 10 : parseInt(c.rank);
    if (c.rank === 'A') aces++;
    total += v;
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

function bjDealerPlay(game) {
  while (bjHandValue(game.dealerHand) < 17) game.dealerHand.push(bjDraw(game));
}

function bjResolve(game) {
  const pv = bjHandValue(game.playerHand);
  const dv = bjHandValue(game.dealerHand);
  const playerBJ = pv === 21 && game.playerHand.length === 2;
  const dealerBJ = dv === 21 && game.dealerHand.length === 2;
  if (playerBJ && dealerBJ) return 'push';
  if (playerBJ)             return 'blackjack';
  if (pv > 21)              return 'bust';
  if (dv > 21)              return 'dealer_bust';
  if (pv > dv)              return 'win';
  if (pv < dv)              return 'loss';
  return 'push';
}

function bjPayout(result, bet) {
  switch (result) {
    case 'blackjack':   return bet + Math.floor(bet * 1.5);
    case 'win':
    case 'dealer_bust': return bet * 2;
    case 'push':        return bet;
    default:            return 0;
  }
}

function bjNet(result, bet) {
  switch (result) {
    case 'blackjack':   return Math.floor(bet * 1.5);
    case 'win':
    case 'dealer_bust': return bet;
    case 'push':        return 0;
    default:            return -bet;
  }
}

function bjResultMsg(game, result, net, tokens) {
  return {
    type:        'bj:result',
    playerHand:  game.playerHand,
    dealerHand:  game.dealerHand,
    playerTotal: bjHandValue(game.playerHand),
    dealerTotal: bjHandValue(game.dealerHand),
    result, net, tokens,
    bet:         game.bet,
  };
}

function bjStateMsg(game, tokens) {
  return {
    type:          'bj:state',
    playerHand:    game.playerHand,
    dealerHand:    [game.dealerHand[0], { hidden: true }],
    playerTotal:   bjHandValue(game.playerHand),
    dealerVisible: bjHandValue([game.dealerHand[0]]),
    bet:           game.bet,
    tokens,
  };
}

module.exports = {
  bjFreshShoe, bjDraw, bjHandValue, bjDealerPlay,
  bjResolve, bjPayout, bjNet, bjResultMsg, bjStateMsg,
};
