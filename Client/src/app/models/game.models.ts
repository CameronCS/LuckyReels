export interface Card {
  rank: string;
  suit: string;
}

export interface SlotResult {
  symbols: string[];
  winAmount: number;
  resultType: string;
  newBalance: number;
}

export interface BlackjackState {
  playerHand: Card[];
  dealerVisible: Card;
  playerTotal: number;
  dealerVisibleTotal: number;
  bet: number;
  balance: number;
  isGameOver: boolean;
  result: string;
  dealerHand: Card[];
  dealerTotal: number;
  net: number;
}

export interface BlackjackResult {
  playerHand: Card[];
  dealerHand: Card[];
  playerTotal: number;
  dealerTotal: number;
  result: string;
  net: number;
  bet: number;
  newBalance: number;
}

export interface RouletteBet {
  key: string;
  amount: number;
}

export interface RouletteResult {
  winNumber: string;
  totalBet: number;
  net: number;
  newBalance: number;
  winningBets: string[];
}

export interface HorseResult {
  winnerName: string;
  pickedName: string;
  bet: number;
  net: number;
  newBalance: number;
}

export interface BaccaratResult {
  playerHand: Card[];
  bankerHand: Card[];
  betType: string;
  outcome: string;
  bet: number;
  net: number;
  newBalance: number;
}

export interface MinesState {
  revealed: number[];
  multiplier: number;
  bet: number;
  balance: number;
  isGameOver: boolean;
  hitMine: boolean;
  grid: boolean[];
  net: number;
}

export interface MinesResult {
  grid: boolean[];
  revealed: number[];
  net: number;
  newBalance: number;
}

export interface CrashUpdate {
  multiplier: number;
  crashed: boolean;
}

export interface CrashResult {
  crashedAt: number;
  cashedOutAt: number;
  bet: number;
  net: number;
  newBalance: number;
}

export interface PlinkoResult {
  path: number[];
  slot: number;
  multiplier: number;
  winAmount: number;
  net: number;
  newBalance: number;
}
