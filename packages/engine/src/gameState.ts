import { createDeck, shuffle } from './cards.js';
import { GRID_SIZE, type Card, type GameState, type Player } from './types.js';
import { GolfEngineError } from './errors.js';

export interface NewPlayerInfo {
  id: string;
  name: string;
}

export function createMatch(roomCode: string, hostId: string, players: NewPlayerInfo[]): GameState {
  if (players.length < 2 || players.length > 6) {
    throw new GolfEngineError('INVALID_PLAYER_COUNT', 'Golf is played with 2-6 players.');
  }

  return {
    roomCode,
    hostId,
    holeNumber: 0,
    dealerIndex: 0,
    currentPlayerIndex: 0,
    drawPile: [],
    discardPile: [],
    phase: 'complete',
    playersAwaitingPeek: [],
    pendingDraw: null,
    finisherId: null,
    finalTurnsRemaining: 0,
    matchComplete: false,
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      grid: [],
      totalScore: 0,
      holeScores: [],
      connected: true,
    })),
  };
}

/** Deals the next hole: rotates the dealer, deals fresh grids, and opens the peek phase. */
export function dealHole(state: GameState, rng: () => number = Math.random): GameState {
  if (state.phase !== 'complete') {
    throw new GolfEngineError('HOLE_IN_PROGRESS', 'Cannot deal a new hole while one is in progress.');
  }
  if (state.matchComplete) {
    throw new GolfEngineError('MATCH_COMPLETE', 'The match is already over.');
  }

  const n = state.players.length;
  const nextHoleNumber = state.holeNumber + 1;
  const dealerIndex = (nextHoleNumber - 1) % n;
  const firstPlayerIndex = (dealerIndex + 1) % n;

  const deck = shuffle(createDeck(), rng);
  const players: Player[] = state.players.map((p) => ({ ...p, grid: [] }));

  let cursor = 0;
  for (const player of players) {
    const cards = deck.slice(cursor, cursor + GRID_SIZE);
    cursor += GRID_SIZE;
    player.grid = cards.map((card) => ({ card, faceUp: false }));
  }

  const remaining = deck.slice(cursor);
  const discardPile: Card[] = [remaining.pop() as Card];
  const drawPile = remaining;

  return {
    ...state,
    holeNumber: nextHoleNumber,
    dealerIndex,
    currentPlayerIndex: firstPlayerIndex,
    drawPile,
    discardPile,
    phase: 'peek',
    playersAwaitingPeek: players.map((p) => p.id),
    pendingDraw: null,
    finisherId: null,
    finalTurnsRemaining: 0,
    players,
  };
}
