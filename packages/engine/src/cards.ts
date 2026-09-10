import type { Card, Rank, Suit } from './types.js';

const NUMBER_RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10'];
const FACE_RANKS: Rank[] = ['J', 'Q', 'K'];
const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];

export function rankValue(rank: Rank): number {
  if (rank === 'JOKER') return -5;
  if (rank === 'A') return 1;
  if (FACE_RANKS.includes(rank)) return 10;
  return parseInt(rank, 10);
}

/** Standard 52-card deck plus 2 jokers (54 cards total). */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of [...NUMBER_RANKS, ...FACE_RANKS, 'A' as Rank]) {
      deck.push({ id: `${rank}${suit}`, rank, suit, value: rankValue(rank) });
    }
  }
  deck.push({ id: 'JOKER-1', rank: 'JOKER', suit: null, value: -5 });
  deck.push({ id: 'JOKER-2', rank: 'JOKER', suit: null, value: -5 });
  return deck;
}

export function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
