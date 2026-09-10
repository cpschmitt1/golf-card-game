import { BLOCKS, COLUMNS, type PlayerGrid } from './types.js';

function isFourOfAKindBlock(grid: PlayerGrid, slots: [number, number, number, number]): boolean {
  const ranks = slots.map((s) => grid[s].card.rank);
  return ranks[0] !== 'JOKER' && ranks.every((r) => r === ranks[0]);
}

/**
 * Scores a fully-revealed 6-card grid per the hole-scoring rules:
 *  1. A contiguous 2x2 same-rank block scores a flat -20 for those 4 cards,
 *     overriding column scoring for the two columns it spans.
 *  2. Any other column where both cards share a rank (jokers excluded) scores 0.
 *  3. Everything else scores the sum of face values.
 */
export function computeHandScore(grid: PlayerGrid): number {
  let total = 0;
  const consumedColumns = new Set<number>();

  for (const block of BLOCKS) {
    const [colA, colB] = block.columns;
    if (consumedColumns.has(colA) || consumedColumns.has(colB)) continue;
    if (isFourOfAKindBlock(grid, block.slots)) {
      total += -20;
      consumedColumns.add(colA);
      consumedColumns.add(colB);
    }
  }

  COLUMNS.forEach(([a, b], colIndex) => {
    if (consumedColumns.has(colIndex)) return;
    const cardA = grid[a].card;
    const cardB = grid[b].card;
    if (cardA.rank === cardB.rank && cardA.rank !== 'JOKER') {
      total += 0;
    } else {
      total += cardA.value + cardB.value;
    }
  });

  return total;
}
