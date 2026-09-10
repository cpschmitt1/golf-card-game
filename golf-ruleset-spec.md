# Golf Card Game — Ruleset Spec

## Setup

- 2–6 players  
- Standard 52-card deck \+ 2 jokers (54 cards total)  
- Each player dealt 6 cards, arranged face-down in a 2x3 grid (2 rows, 3 columns)  
- Remaining cards form the draw pile; top card flipped to start the discard pile  
- At the start of each hole, each player chooses 2 of their own 6 cards to flip face-up (player's choice, not random)  
- First player each hole: rotates around the table (person to the left of the "dealer," dealer also rotates each hole)

  ## Card Values

| Card | Value |
| :---- | :---- |
| Number cards (2–10) | Face value |
| Jack / Queen / King | 10 |
| Ace | 1 |
| Joker | \-5 |

  ## Turn Structure

  On a turn, a player must:

1. Draw one card — either from the top of the draw pile, or the top of the discard pile.  
2. **If drawn from the discard pile**: the player is locked in and must swap it into their grid (cannot discard it back).  
3. **If drawn from the draw pile**: the player chooses one of:  
   - Swap it with a face-up card in their grid (they see what they're swapping in and out).  
   - Swap it with a face-down card in their grid — **without looking at that face-down card first**. Once revealed by the swap, they cannot change their mind and keep the original.  
   - Discard it (only allowed when drawn from the draw pile).  
4. Whatever card is displaced (from a swap) goes face-up on the discard pile.

   Swapping always flips the new card face-up in the grid, regardless of which grid slot it came from.

   ## Deck Exhaustion

   If the draw pile is empty when a player needs to draw from it: reshuffle the entire discard pile *except the current top card*, and use that as the new draw pile. The top discard card stays in place and remains drawable/visible.

   ## Ending a Hole

- A hole ends when one player reveals all 6 of their cards face-up (via a swap that flips their last face-down card).  
- Every other player gets exactly one more turn, in normal turn order, starting from the player after the one who finished.  
- After all final turns are taken, all remaining face-down cards are revealed and hands are scored.

  ## Scoring a Hand

  Base score \= sum of all 6 card values, adjusted by:

1. **Four-of-a-kind block (-20 override)**: If all 4 cards of the same rank occupy a contiguous 2x2 block within the grid, those 4 cards score a flat **\-20 total** (replacing their individual face values and overriding column scoring for those two columns). This does *not* apply if the matching cards are split across non-adjacent columns (e.g., columns 1 and 3 with column 2 in between).  
2. **Column match (score 0\)**: For any column not covered by rule 1, if both cards in that column share the same rank, that column scores **0** instead of the sum of the two cards.  
   - This does **not** apply to jokers — two jokers in the same column do *not* zero out; they score normally as \-5 and \-5 (i.e., \-10 for the column).  
   - **Column scoring when only one card in a column is a joker** (e.g., 5 \+ joker in a column \= 0, not matching by rank) — this is just normal sum, no special treatment  
3. **Rows**: No bonus or penalty for matching rows.  
4. All other cards score their face value as normal.

   ## Match Structure

- Play 18 holes.  
- Cumulative score across all 18 holes; lowest total score wins.  
- No tiebreaker if score is tied at the end of 18 holes.

  