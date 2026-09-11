import { randomUUID } from 'node:crypto';
import type { GameState, LobbyPlayer, LobbyView } from '@golf/engine';

export interface RoomRecord {
  code: string;
  hostId: string;
  lobbyPlayers: LobbyPlayer[];
  gameState: GameState | null;
  /** playerId -> reconnect secret. Never sent in any broadcast — only handed to the owning client once. */
  playerTokens: Map<string, string>;
  /** playerId -> the socket currently bound to them, so a reconnect can evict a stale old one. */
  socketByPlayerId: Map<string, string>;
}

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid confusion

/**
 * Rooms are never auto-expired: a room lives for as long as the server process runs, regardless
 * of how long everyone's been disconnected. This is deliberate — the game is meant to be played
 * asynchronously by people in different time zones, with real gaps of hours or days between
 * turns, so there's no timeout short enough to be "safe" without also risking wiping out a game
 * someone fully intends to come back to. A server restart (e.g. a redeploy) still ends all games,
 * same as always — that's the only thing that clears rooms out.
 */
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
}
