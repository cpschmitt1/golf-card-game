import { shuffle } from './cards.js';
import { GolfEngineError } from './errors.js';
import { computeHandScore } from './scoring.js';
import { GRID_SIZE, HOLES_PER_MATCH, type Card, type GameState, type Player } from './types.js';

function clone(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((p) => ({ ...p, grid: p.grid.map((s) => ({ ...s })), holeScores: [...p.holeScores] })),
    drawPile: [...state.drawPile],
    discardPile: [...state.discardPile],
    playersAwaitingPeek: [...state.playersAwaitingPeek],
    pendingDraw: state.pendingDraw ? { ...state.pendingDraw } : null,
  };
}

function requirePlayer(state: GameState, playerId: string): Player {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new GolfEngineError('UNKNOWN_PLAYER', 'That player is not in this game.');
  return player;
}

function requireCurrentPlayer(state: GameState, playerId: string): void {
  const current = state.players[state.currentPlayerIndex];
  if (!current || current.id !== playerId) {
    throw new GolfEngineError('NOT_YOUR_TURN', 'It is not your turn.');
  }
}

/** Each player picks 2 of their own 6 face-down cards to flip face-up at the start of a hole. */
export function choosePeek(state: GameState, playerId: string, slotIndices: [number, number]): GameState {
  if (state.phase !== 'peek') {
    throw new GolfEngineError('WRONG_PHASE', 'Peeking only happens at the start of a hole.');
  }
  if (!state.playersAwaitingPeek.includes(playerId)) {
    throw new GolfEngineError('ALREADY_PEEKED', 'You already chose your peek cards for this hole.');
  }
  const [a, b] = slotIndices;
  if (a === b || [a, b].some((i) => i < 0 || i >= GRID_SIZE)) {
    throw new GolfEngineError('INVALID_SLOTS', 'Choose two different cards from your own grid.');
  }

  const next = clone(state);
  const player = requirePlayer(next, playerId);
  player.grid[a].faceUp = true;
  player.grid[b].faceUp = true;
  next.playersAwaitingPeek = next.playersAwaitingPeek.filter((id) => id !== playerId);

  if (next.playersAwaitingPeek.length === 0) {
    next.phase = 'turn';
  }
  return next;
}

function reshuffleIfNeeded(state: GameState, rng: () => number): void {
  if (state.drawPile.length > 0) return;
  if (state.discardPile.length <= 1) {
    throw new GolfEngineError('NO_CARDS_LEFT', 'No cards left to draw or reshuffle.');
  }
  const top = state.discardPile[state.discardPile.length - 1];
  const rest = state.discardPile.slice(0, -1);
  state.drawPile = shuffle(rest, rng);
  state.discardPile = [top];
}

export function drawFromDrawPile(state: GameState, playerId: string, rng: () => number = Math.random): GameState {
  assertCanDraw(state, playerId);
  const next = clone(state);
  reshuffleIfNeeded(next, rng);
  const card = next.drawPile.pop() as Card;
  next.pendingDraw = { card, source: 'draw', playerId };
  return next;
}

export function drawFromDiscardPile(state: GameState, playerId: string): GameState {
  assertCanDraw(state, playerId);
  if (state.discardPile.length === 0) {
    throw new GolfEngineError('DISCARD_EMPTY', 'The discard pile is empty.');
  }
  const next = clone(state);
  const card = next.discardPile.pop() as Card;
  next.pendingDraw = { card, source: 'discard', playerId };
  return next;
}

function assertCanDraw(state: GameState, playerId: string): void {
  if (state.phase !== 'turn' && state.phase !== 'final-turns') {
    throw new GolfEngineError('WRONG_PHASE', 'Cannot draw right now.');
  }
  requireCurrentPlayer(state, playerId);
  if (state.pendingDraw) {
    throw new GolfEngineError('ALREADY_DRAWN', 'You have already drawn a card this turn.');
  }
}

function assertHasPendingDraw(state: GameState, playerId: string): void {
  if (!state.pendingDraw || state.pendingDraw.playerId !== playerId) {
    throw new GolfEngineError('NOTHING_DRAWN', 'You need to draw a card first.');
  }
  requireCurrentPlayer(state, playerId);
}

/** Swap the drawn card into a grid slot. The displaced card goes face-up on the discard pile. */
export function swapCard(state: GameState, playerId: string, slotIndex: number): GameState {
  assertHasPendingDraw(state, playerId);
  if (slotIndex < 0 || slotIndex >= GRID_SIZE) {
    throw new GolfEngineError('INVALID_SLOT', 'That is not a valid grid slot.');
  }

  const next = clone(state);
  const player = requirePlayer(next, playerId);
  const pending = next.pendingDraw as NonNullable<GameState['pendingDraw']>;

  const displaced = player.grid[slotIndex].card;
  next.discardPile.push(displaced);
  player.grid[slotIndex] = { card: pending.card, faceUp: true };
  next.pendingDraw = null;

  const justFinished = player.grid.every((slot) => slot.faceUp);
  let triggeredFinalTurns = false;
  if (justFinished && next.finisherId === null) {
    next.finisherId = playerId;
    next.phase = 'final-turns';
    next.finalTurnsRemaining = next.players.length - 1;
    triggeredFinalTurns = true;
  }

  return advanceTurn(next, triggeredFinalTurns);
}

/** Discard the drawn card without swapping. Only allowed when it came from the draw pile. */
export function discardDrawn(state: GameState, playerId: string): GameState {
  assertHasPendingDraw(state, playerId);
  const pending = state.pendingDraw as NonNullable<GameState['pendingDraw']>;
  if (pending.source === 'discard') {
    throw new GolfEngineError('LOCKED_IN', 'A card drawn from the discard pile must be swapped in.');
  }

  const next = clone(state);
  next.discardPile.push(pending.card);
  next.pendingDraw = null;

  return advanceTurn(next, false);
}

/**
 * Advances past the turn that just completed. `justTriggeredFinalTurns` is true only for the
 * exact swap that ended the hole (revealed a player's last card) — that turn moves play to the
 * next player without consuming one of the "everyone else gets one more turn" allowance, since
 * the finisher's own turn is not one of those final turns.
 */
function advanceTurn(state: GameState, justTriggeredFinalTurns: boolean): GameState {
  const n = state.players.length;

  if (state.phase === 'final-turns') {
    if (!justTriggeredFinalTurns) {
      state.finalTurnsRemaining -= 1;
    }
    if (state.finalTurnsRemaining <= 0) {
      return scoreHole(state);
    }
    state.currentPlayerIndex = (state.currentPlayerIndex + 1) % n;
    return state;
  }

  state.currentPlayerIndex = (state.currentPlayerIndex + 1) % n;
  return state;
}

/**
 * Ends the match immediately, in any phase. If a hole is in progress, it is discarded — no score
 * is recorded for it (unlike `scoreHole`, this never touches `holeScores`/`totalScore`), and cards
 * are left exactly as they were rather than being revealed. Between holes (phase already
 * 'complete'), there's nothing in-progress to discard, so this is just a flag flip.
 */
export function endMatch(state: GameState): GameState {
  if (state.matchComplete) {
    throw new GolfEngineError('MATCH_COMPLETE', 'The match is already over.');
  }

  const next = clone(state);
  next.matchComplete = true;
  next.phase = 'complete';
  next.pendingDraw = null;
  next.playersAwaitingPeek = [];
  next.finisherId = null;
  next.finalTurnsRemaining = 0;
  return next;
}

function scoreHole(state: GameState): GameState {
  for (const player of state.players) {
    for (const slot of player.grid) slot.faceUp = true;
    const score = computeHandScore(player.grid);
    player.holeScores.push(score);
    player.totalScore += score;
  }
  state.phase = 'complete';
  state.matchComplete = state.holeNumber >= HOLES_PER_MATCH;
  return state;
}
