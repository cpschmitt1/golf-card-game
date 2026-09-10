import type { GameStateView } from './view.js';

/** Shared Socket.IO event contract between the server and the client. */

export interface LobbyPlayer {
  id: string;
  name: string;
}

export interface LobbyView {
  roomCode: string;
  hostId: string;
  players: LobbyPlayer[];
  started: boolean;
}

export type AckResponse<T> = { ok: true; data: T } | { ok: false; error: string };

export interface ClientToServerEvents {
  'room:create': (payload: { playerName: string }, ack: (res: AckResponse<{ roomCode: string; playerId: string }>) => void) => void;
  'room:join': (
    payload: { roomCode: string; playerName: string },
    ack: (res: AckResponse<{ roomCode: string; playerId: string }>) => void,
  ) => void;
  'room:start': (payload: { roomCode: string }, ack: (res: AckResponse<null>) => void) => void;
  'game:peek': (payload: { slotIndices: [number, number] }, ack: (res: AckResponse<null>) => void) => void;
  'game:drawDraw': (payload: Record<string, never>, ack: (res: AckResponse<null>) => void) => void;
  'game:drawDiscard': (payload: Record<string, never>, ack: (res: AckResponse<null>) => void) => void;
  'game:swap': (payload: { slotIndex: number }, ack: (res: AckResponse<null>) => void) => void;
  'game:discard': (payload: Record<string, never>, ack: (res: AckResponse<null>) => void) => void;
  'game:nextHole': (payload: Record<string, never>, ack: (res: AckResponse<null>) => void) => void;
}

export interface ServerToClientEvents {
  'lobby:update': (lobby: LobbyView) => void;
  'game:state': (state: GameStateView) => void;
  'error': (err: { message: string }) => void;
}
