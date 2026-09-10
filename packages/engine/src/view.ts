import type { Card, GameState, HolePhase } from './types.js';

export interface GridSlotView {
  faceUp: boolean;
  card: Card | null;
}

export interface PlayerView {
  id: string;
  name: string;
  connected: boolean;
  totalScore: number;
  holeScores: number[];
  grid: GridSlotView[];
  hasPendingDraw: boolean;
  /** The pending drawn card, if public knowledge (came from the discard pile) or if you are the drawer. */
  pendingDrawCard: Card | null;
  pendingDrawSource: 'draw' | 'discard' | null;
}

export interface GameStateView {
  roomCode: string;
  hostId: string;
  holeNumber: number;
  dealerIndex: number;
  currentPlayerIndex: number;
  currentPlayerId: string | null;
  phase: HolePhase;
  playersAwaitingPeek: string[];
  drawPileCount: number;
  discardTop: Card | null;
  discardCount: number;
  finisherId: string | null;
  finalTurnsRemaining: number;
  matchComplete: boolean;
  viewerId: string;
  players: PlayerView[];
}

/**
 * Builds the state a specific player is allowed to see: opponents' face-down cards are hidden,
 * and a card drawn from the draw pile stays private to whoever drew it (a card drawn from the
 * discard pile was already public, so it stays visible to everyone).
 */
export function getPlayerView(state: GameState, viewerId: string): GameStateView {
  return {
    roomCode: state.roomCode,
    hostId: state.hostId,
    holeNumber: state.holeNumber,
    dealerIndex: state.dealerIndex,
    currentPlayerIndex: state.currentPlayerIndex,
    currentPlayerId: state.players[state.currentPlayerIndex]?.id ?? null,
    phase: state.phase,
    playersAwaitingPeek: state.playersAwaitingPeek,
    drawPileCount: state.drawPile.length,
    discardTop: state.discardPile.length ? state.discardPile[state.discardPile.length - 1] : null,
    discardCount: state.discardPile.length,
    finisherId: state.finisherId,
    finalTurnsRemaining: state.finalTurnsRemaining,
    matchComplete: state.matchComplete,
    viewerId,
    players: state.players.map((player) => {
      const pending = state.pendingDraw && state.pendingDraw.playerId === player.id ? state.pendingDraw : null;
      const pendingVisible = pending && (pending.source === 'discard' || player.id === viewerId);
      return {
        id: player.id,
        name: player.name,
        connected: player.connected,
        totalScore: player.totalScore,
        holeScores: player.holeScores,
        grid: player.grid.map((slot) => ({
          faceUp: slot.faceUp,
          card: slot.faceUp ? slot.card : null,
        })),
        hasPendingDraw: pending !== null,
        pendingDrawCard: pendingVisible ? pending!.card : null,
        pendingDrawSource: pending ? pending.source : null,
      };
    }),
  };
}
