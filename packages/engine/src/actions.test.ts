import { describe, expect, it } from 'vitest';
import { choosePeek, discardDrawn, drawFromDiscardPile, drawFromDrawPile, swapCard } from './actions.js';
import { GolfEngineError } from './errors.js';
import { createMatch, dealHole } from './gameState.js';
import type { GameState } from './types.js';

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function newTwoPlayerHole(): GameState {
  const rng = mulberry32(42);
  const match = createMatch('ABCD', 'p1', [
    { id: 'p1', name: 'Alice' },
    { id: 'p2', name: 'Bob' },
  ]);
  return dealHole(match, rng);
}

describe('dealHole', () => {
  it('deals 6 cards to each player and splits the rest between draw and discard piles', () => {
    const state = newTwoPlayerHole();
    expect(state.phase).toBe('peek');
    expect(state.players.every((p) => p.grid.length === 6)).toBe(true);
    expect(state.discardPile.length).toBe(1);
    expect(state.drawPile.length).toBe(54 - 12 - 1);
    expect(state.players.every((p) => p.grid.every((s) => !s.faceUp))).toBe(true);
  });

  it('rotates the dealer and first player each hole', () => {
    let state = newTwoPlayerHole();
    // finish hole 1 immediately by forcing it into 'complete' via a fresh peek-only state is not enough;
    // instead just check hole 1 assignment here and rely on the full-hole test below for hole 2 rotation.
    expect(state.dealerIndex).toBe(0);
    expect(state.currentPlayerIndex).toBe(1); // player after dealer
  });
});

describe('choosePeek', () => {
  it('flips exactly two chosen cards face-up and moves to turn phase once everyone has peeked', () => {
    let state = newTwoPlayerHole();
    state = choosePeek(state, 'p1', [0, 1]);
    expect(state.phase).toBe('peek');
    expect(state.players[0].grid[0].faceUp).toBe(true);
    expect(state.players[0].grid[1].faceUp).toBe(true);

    state = choosePeek(state, 'p2', [2, 3]);
    expect(state.phase).toBe('turn');
  });

  it('rejects picking the same slot twice', () => {
    const state = newTwoPlayerHole();
    expect(() => choosePeek(state, 'p1', [0, 0])).toThrow(GolfEngineError);
  });
});

describe('turn play', () => {
  it('enforces turn order', () => {
    let state = newTwoPlayerHole();
    state = choosePeek(state, 'p1', [0, 1]);
    state = choosePeek(state, 'p2', [0, 1]);
    // p2 goes first (dealer is p1, index 0 -> first player index 1)
    expect(() => drawFromDrawPile(state, 'p1')).toThrow(GolfEngineError);
  });

  it('locks a discard-drawn card in — it cannot be discarded back', () => {
    let state = newTwoPlayerHole();
    state = choosePeek(state, 'p1', [0, 1]);
    state = choosePeek(state, 'p2', [0, 1]);
    const firstPlayer = state.players[state.currentPlayerIndex].id;
    state = drawFromDiscardPile(state, firstPlayer);
    expect(() => discardDrawn(state, firstPlayer)).toThrow(GolfEngineError);
  });

  it('allows discarding a card drawn from the draw pile', () => {
    let state = newTwoPlayerHole();
    state = choosePeek(state, 'p1', [0, 1]);
    state = choosePeek(state, 'p2', [0, 1]);
    const firstPlayer = state.players[state.currentPlayerIndex].id;
    state = drawFromDrawPile(state, firstPlayer);
    state = discardDrawn(state, firstPlayer);
    expect(state.pendingDraw).toBeNull();
    // turn passed to the other player
    expect(state.players[state.currentPlayerIndex].id).not.toBe(firstPlayer);
  });
});

describe('full hole flow', () => {
  it('ends the hole once a player fills their grid, gives everyone else one last turn, then scores', () => {
    let state = newTwoPlayerHole();
    state = choosePeek(state, 'p1', [0, 1]);
    state = choosePeek(state, 'p2', [0, 1]);

    let guard = 0;
    while (state.phase === 'turn' || state.phase === 'final-turns') {
      if (++guard > 100) throw new Error('runaway loop');
      const currentId = state.players[state.currentPlayerIndex].id;
      state = drawFromDrawPile(state, currentId);
      const player = state.players.find((p) => p.id === currentId)!;
      const faceDownSlot = player.grid.findIndex((s) => !s.faceUp);
      state = swapCard(state, currentId, faceDownSlot);
    }

    expect(state.phase).toBe('complete');
    expect(state.finisherId).not.toBeNull();
    expect(state.players.every((p) => p.grid.every((s) => s.faceUp))).toBe(true);
    expect(state.players.every((p) => p.holeScores.length === 1)).toBe(true);
    expect(state.players.every((p) => p.totalScore === p.holeScores[0])).toBe(true);
    expect(state.matchComplete).toBe(false);

    const next = dealHole(state);
    expect(next.holeNumber).toBe(2);
    expect(next.dealerIndex).toBe(1);
    expect(next.phase).toBe('peek');
  });

  it('gives every other player exactly one more turn before scoring, not zero', () => {
    let state = newTwoPlayerHole();
    state = choosePeek(state, 'p1', [0, 1]);
    state = choosePeek(state, 'p2', [0, 1]);

    // Play turns until someone finishes their grid, but stop right at that moment.
    let guard = 0;
    while (state.phase === 'turn') {
      if (++guard > 100) throw new Error('runaway loop');
      const currentId = state.players[state.currentPlayerIndex].id;
      state = drawFromDrawPile(state, currentId);
      const player = state.players.find((p) => p.id === currentId)!;
      const faceDownSlot = player.grid.findIndex((s) => !s.faceUp);
      state = swapCard(state, currentId, faceDownSlot);
    }

    // The hole should now be in final-turns, NOT already scored, with the other player still owed a turn.
    expect(state.phase).toBe('final-turns');
    expect(state.finisherId).not.toBeNull();
    expect(state.finalTurnsRemaining).toBe(1);
    const otherPlayerId = state.players.find((p) => p.id !== state.finisherId)!.id;
    expect(state.players[state.currentPlayerIndex].id).toBe(otherPlayerId);
    // The other player should still have at least one face-down card left to reveal via their final turn.
    const otherPlayer = state.players.find((p) => p.id === otherPlayerId)!;
    expect(otherPlayer.grid.some((s) => !s.faceUp)).toBe(true);
  });
});
