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

/** Optional features a server build supports. A client only shows UI for features its server reports. */
export interface ServerFeatures {
  chat: boolean;
  nudge: boolean;
}

/** One chat line. `name` is stamped by the server from the sender's room identity, never client-supplied. */
export interface ChatMessage {
  id: string;
  playerId: string;
  name: string;
  text: string;
  /** Epoch ms, set by the server. */
  sentAt: number;
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
  /** Host-only, lobby only. Removes a player from the room — e.g. to clear a duplicate join. */
  'room:kickPlayer': (payload: { playerId: string }, ack: (res: AckResponse<null>) => void) => void;
  'game:peek': (payload: { slotIndices: [number, number] }, ack: (res: AckResponse<null>) => void) => void;
  'game:drawDraw': (payload: Record<string, never>, ack: (res: AckResponse<null>) => void) => void;
  'game:drawDiscard': (payload: Record<string, never>, ack: (res: AckResponse<null>) => void) => void;
  'game:swap': (payload: { slotIndex: number }, ack: (res: AckResponse<null>) => void) => void;
  'game:discard': (payload: Record<string, never>, ack: (res: AckResponse<null>) => void) => void;
  'game:nextHole': (payload: Record<string, never>, ack: (res: AckResponse<null>) => void) => void;
  /** Host-only. Ends the match immediately in any phase; an in-progress hole is discarded, not scored. */
  'game:endMatch': (payload: Record<string, never>, ack: (res: AckResponse<null>) => void) => void;
  /** Asks which optional features this server supports. Servers older than this event never answer. */
  'server:features': (payload: Record<string, never>, ack: (res: AckResponse<ServerFeatures>) => void) => void;
  /** Posts a message to everyone in the sender's room. Rate-limited on the server. */
  'chat:send': (payload: { text: string }, ack: (res: AckResponse<null>) => void) => void;
  /** Sends the player whose turn it is a reminder push. Rate-limited per target on the server. */
  'game:nudge': (payload: Record<string, never>, ack: (res: AckResponse<null>) => void) => void;
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
  /** Sent to a player the host just removed from the lobby, in place of a lobby:update. */
  'room:kicked': (payload: { roomCode: string }) => void;
  /** A new chat message in the room. */
  'chat:message': (message: ChatMessage) => void;
  /** The room's stored chat (most recent messages), sent when a player joins or reconnects. */
  'chat:history': (messages: ChatMessage[]) => void;
}
