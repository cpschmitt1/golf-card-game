import { describe, expect, it } from 'vitest';
import { rankValue } from './cards.js';
import { computeHandScore } from './scoring.js';
import type { Card, PlayerGrid, Rank } from './types.js';

function card(rank: Rank, id?: string): Card {
  return { id: id ?? `${rank}-${Math.random()}`, rank, suit: rank === 'JOKER' ? null : '♠', value: rankValue(rank) };
}

function grid(ranks: Rank[]): PlayerGrid {
  return ranks.map((r) => ({ card: card(r, `${r}-${Math.random()}`), faceUp: true }));
}

describe('computeHandScore', () => {
  it('sums plain face values with no matches', () => {
    // columns: (5,9) (3,K=10) (A=1,7)
    const g = grid(['5', '3', 'A', '9', 'K', '7']);
    expect(computeHandScore(g)).toBe(5 + 3 + 1 + 9 + 10 + 7);
  });

  it('zeroes a column where both cards share a rank', () => {
    // column0 = slots(0,3) = '7','7' -> match -> 0
    // column1 = slots(1,4) = '4','9' -> no match -> 13
    // column2 = slots(2,5) = '2','5' -> no match -> 7
    const g = grid(['7', '4', '2', '7', '9', '5']);
    expect(computeHandScore(g)).toBe(0 + 13 + 7);
  });

  it('does not zero a joker column — two jokers score -5 and -5', () => {
    const g = grid(['JOKER', '3', '2', 'JOKER', '3', '2']);
    // column0 = -5 + -5 = -10; column1 = 0 (match); column2 = 0 (match)
    expect(computeHandScore(g)).toBe(-10);
  });

  it('does not treat a lone joker paired with a number as a column match', () => {
    const g = grid(['JOKER', '3', '2', '5', '3', '2']);
    // column0 = -5 + 5 = 0 (sum, not a rank match); column1 = 0; column2 = 0
    expect(computeHandScore(g)).toBe(0);
  });

  it('applies the -20 four-of-a-kind block override for columns 0-1', () => {
    const g = grid(['9', '9', '4', '9', '9', '6']);
    // block slots [0,1,3,4] all rank 9 -> -20 flat, column2 = 4+6=10
    expect(computeHandScore(g)).toBe(-20 + 10);
  });

  it('applies the -20 four-of-a-kind block override for columns 1-2', () => {
    const g = grid(['4', '9', '9', '6', '9', '9']);
    // column0 = 4+6=10, block slots [1,2,4,5] all rank 9 -> -20
    expect(computeHandScore(g)).toBe(10 - 20);
  });

  it('does not apply the block override when matching cards are split across non-adjacent columns', () => {
    const g = grid(['9', '4', '9', '9', '6', '9']);
    // ranks at slots 0,2,3,5 are 9s but columns 0 and 2 are not adjacent -> no block bonus
    // column0 = 9+9 = 18 (match -> 0), column1 = 4+6=10, column2 = 9+9 (match -> 0)
    expect(computeHandScore(g)).toBe(0 + 10 + 0);
  });
});
