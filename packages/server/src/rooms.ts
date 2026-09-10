import type { GameState, LobbyPlayer, LobbyView } from '@golf/engine';

export interface RoomRecord {
  code: string;
  hostId: string;
  lobbyPlayers: LobbyPlayer[];
  gameState: GameState | null;
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

  create(hostId: string, hostName: string): RoomRecord {
    const code = this.generateCode();
    const room: RoomRecord = {
      code,
      hostId,
      lobbyPlayers: [{ id: hostId, name: hostName }],
      gameState: null,
    };
    this.rooms.set(code, room);
    return room;
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

  findRoomByPlayerId(playerId: string): RoomRecord | undefined {
    for (const room of this.rooms.values()) {
      if (room.lobbyPlayers.some((p) => p.id === playerId)) return room;
    }
    return undefined;
  }
}
