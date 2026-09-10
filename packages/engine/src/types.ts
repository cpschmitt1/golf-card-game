export type Suit = '♠' | '♥' | '♦' | '♣' | null;

export type Rank =
  | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10'
  | 'J' | 'Q' | 'K' | 'A' | 'JOKER';

export interface Card {
  id: string;
  rank: Rank;
  suit: Suit;
  value: number;
}

export interface GridSlot {
  card: Card;
  faceUp: boolean;
}

/** Always length 6, laid out as a 2-row x 3-col grid: index = row * 3 + col. */
export type PlayerGrid = GridSlot[];

export interface Player {
  id: string;
  name: string;
  grid: PlayerGrid;
  totalScore: number;
  holeScores: number[];
  connected: boolean;
}

export type DrawSource = 'draw' | 'discard';

export interface PendingDraw {
  card: Card;
  source: DrawSource;
  playerId: string;
}

export type HolePhase =
  | 'peek'
  | 'turn'
  | 'final-turns'
  | 'scoring'
  | 'complete';

export interface GameState {
  roomCode: string;
  players: Player[];
  hostId: string;
  holeNumber: number;
  dealerIndex: number;
  currentPlayerIndex: number;
  drawPile: Card[];
  discardPile: Card[];
  phase: HolePhase;
  playersAwaitingPeek: string[];
  pendingDraw: PendingDraw | null;
  finisherId: string | null;
  finalTurnsRemaining: number;
  matchComplete: boolean;
}

export const HOLES_PER_MATCH = 18;
export const GRID_SIZE = 6;
export const GRID_ROWS = 2;
export const GRID_COLS = 3;

/** Grid index pairs that make up each column, e.g. column 0 = slots 0 and 3. */
export const COLUMNS: [number, number][] = [
  [0, 3],
  [1, 4],
  [2, 5],
];

/** The two possible contiguous 2x2 blocks in a 2x3 grid, by column pair. */
export const BLOCKS: { columns: [number, number]; slots: [number, number, number, number] }[] = [
  { columns: [0, 1], slots: [0, 1, 3, 4] },
  { columns: [1, 2], slots: [1, 2, 4, 5] },
];
