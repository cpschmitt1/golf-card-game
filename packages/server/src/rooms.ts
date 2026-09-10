import { randomUUID } from 'node:crypto';
import type { GameState, LobbyPlayer, LobbyView } from '@golf/engine';

/** How long a room survives with zero connected players before it's dropped from memory. */
export const ROOM_EMPTY_TTL_MS = 10 * 60 * 1000;

export interface RoomRecord {
  code: string;
  hostId: string;
  lobbyPlayers: LobbyPlayer[];
  gameState: GameState | null;
  /** playerId -> reconnect secret. Never sent in any broadcast — only handed to the owning client once. */
  playerTokens: Map<string, string>;
  /** playerId -> the socket currently bound to them, so a reconnect can evict a stale old one. */
  socketByPlayerId: Map<string, string>;
  /** Set while the room has zero connected players; fires deletion if nobody returns in time. */
  emptyTimer: ReturnType<typeof setTimeout> | null;
}

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid confusion

export class RoomStore {
  private rooms = new Map<string, RoomRecord>();

  private generateCode(): string {
    let code: string;
    do {
      code = Array.from({ length: 4 }, () => ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)]).join('');
    } while (this.rooms.has(code));
    return code;
  }

  /** Creates a room and its host's stable identity. Returns the new playerId/token alongside the room. */
  create(hostName: string): { room: RoomRecord; playerId: string; token: string } {
    const code = this.generateCode();
    const playerId = randomUUID();
    const token = randomUUID();
    const room: RoomRecord = {
      code,
      hostId: playerId,
      lobbyPlayers: [{ id: playerId, name: hostName, connected: true }],
      gameState: null,
      playerTokens: new Map([[playerId, token]]),
      socketByPlayerId: new Map(),
      emptyTimer: null,
    };
    this.rooms.set(code, room);
    return { room, playerId, token };
  }

  /** Adds a new player to a room's lobby. Returns their new stable identity. */
  join(room: RoomRecord, playerName: string): { playerId: string; token: string } {
    const playerId = randomUUID();
    const token = randomUUID();
    room.lobbyPlayers.push({ id: playerId, name: playerName, connected: true });
    room.playerTokens.set(playerId, token);
    return { playerId, token };
  }

  /** Validates a reconnect credential. Returns false if the room forgot this player or the token is wrong. */
  verifyToken(room: RoomRecord, playerId: string, token: string): boolean {
    return room.playerTokens.get(playerId) === token;
  }

  get(code: string): RoomRecord | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  delete(code: string): void {
    const room = this.rooms.get(code.toUpperCase());
    if (room?.emptyTimer) clearTimeout(room.emptyTimer);
    this.rooms.delete(code.toUpperCase());
  }

  toLobbyView(room: RoomRecord): LobbyView {
    return {
      roomCode: room.code,
      hostId: room.hostId,
      players: room.lobbyPlayers,
      started: room.gameState !== null,
    };
  }

  private isEmpty(room: RoomRecord): boolean {
    const players = room.gameState ? room.gameState.players : room.lobbyPlayers;
    return players.every((p) => !p.connected);
  }

  /** Call after any connect/disconnect to arm or disarm the room's empty-room cleanup timer. */
  reconcileEmptyTimer(room: RoomRecord): void {
    const empty = this.isEmpty(room);
    if (empty && !room.emptyTimer) {
      room.emptyTimer = setTimeout(() => this.delete(room.code), ROOM_EMPTY_TTL_MS);
    } else if (!empty && room.emptyTimer) {
      clearTimeout(room.emptyTimer);
      room.emptyTimer = null;
    }
  }
}
