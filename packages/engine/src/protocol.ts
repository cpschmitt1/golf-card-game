import type { GameStateView } from './view.js';

/** Shared Socket.IO event contract between the server and the client. */

export interface LobbyPlayer {
  id: string;
  name: string;
  connected: boolean;
}

export interface LobbyView {
  roomCode: string;
  hostId: string;
  players: LobbyPlayer[];
  started: boolean;
}

export type AckResponse<T> = { ok: true; data: T } | { ok: false; error: string };

export interface JoinedRoom {
  roomCode: string;
  playerId: string;
  /** Secret credential the client must store and present to `room:reconnect`. Never broadcast. */
  playerToken: string;
}

export interface ResumedRoom {
  playerId: string;
  /** Present when the room's match hasn't started yet. */
  lobby: LobbyView | null;
  /** Present once the match has started — this player's redacted view of the current state. */
  gameState: GameStateView | null;
}

/** The shape browsers return from PushManager.subscribe() — also what's stored server-side. */
export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface ClientToServerEvents {
  'room:create': (payload: { playerName: string }, ack: (res: AckResponse<JoinedRoom>) => void) => void;
  'room:join': (payload: { roomCode: string; playerName: string }, ack: (res: AckResponse<JoinedRoom>) => void) => void;
  'room:reconnect': (
    payload: { roomCode: string; playerId: string; playerToken: string },
    ack: (res: AckResponse<ResumedRoom>) => void,
  ) => void;
  'room:leave': (payload: Record<string, never>, ack: (res: AckResponse<null>) => void) => void;
  'room:start': (payload: { roomCode: string }, ack: (res: AckResponse<null>) => void) => void;
  /** Host-only. Resets a finished match's room back to the lobby, keeping the room code and roster. */
  'room:restart': (payload: Record<string, never>, ack: (res: AckResponse<null>) => void) => void;
  'game:peek': (payload: { slotIndices: [number, number] }, ack: (res: AckResponse<null>) => void) => void;
  'game:drawDraw': (payload: Record<string, never>, ack: (res: AckResponse<null>) => void) => void;
  'game:drawDiscard': (payload: Record<string, never>, ack: (res: AckResponse<null>) => void) => void;
  'game:swap': (payload: { slotIndex: number }, ack: (res: AckResponse<null>) => void) => void;
  'game:discard': (payload: Record<string, never>, ack: (res: AckResponse<null>) => void) => void;
  'game:nextHole': (payload: Record<string, never>, ack: (res: AckResponse<null>) => void) => void;
  /** Host-only. Ends the match immediately in any phase; an in-progress hole is discarded, not scored. */
  'game:endMatch': (payload: Record<string, never>, ack: (res: AckResponse<null>) => void) => void;
  /** Registers (or re-registers) this player's push subscription. Safe to call repeatedly. */
  'push:subscribe': (payload: { subscription: PushSubscriptionData }, ack: (res: AckResponse<null>) => void) => void;
  /** Reports whether this player's tab is currently focused/visible, so the server can skip
   *  sending a push notification when they're already looking at the game. */
  'presence:focus': (payload: { focused: boolean }, ack: (res: AckResponse<null>) => void) => void;
}

export interface ServerToClientEvents {
  'lobby:update': (lobby: LobbyView) => void;
  'game:state': (state: GameStateView) => void;
  'error': (err: { message: string }) => void;
}
