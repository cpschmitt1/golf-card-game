import cors from 'cors';
import express from 'express';
import { createServer } from 'node:http';
import { Server, type Socket } from 'socket.io';

import {
  choosePeek,
  createMatch,
  dealHole,
  discardDrawn,
  drawFromDiscardPile,
  drawFromDrawPile,
  getPlayerView,
  GolfEngineError,
  swapCard,
  type AckResponse,
  type ClientToServerEvents,
  type GameState,
  type ServerToClientEvents,
} from '@golf/engine';

import { RoomStore, type RoomRecord } from './rooms.js';

const PORT = Number(process.env.PORT ?? 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.get('/health', (_req, res) => res.json({ ok: true }));

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: CLIENT_ORIGIN },
});

const rooms = new RoomStore();

interface SocketData {
  playerId?: string;
  roomCode?: string;
}

function broadcastLobby(room: RoomRecord): void {
  const lobby = rooms.toLobbyView(room);
  for (const player of room.lobbyPlayers) {
    io.to(player.id).emit('lobby:update', lobby);
  }
}

function broadcastGameState(state: GameState): void {
  for (const player of state.players) {
    io.to(player.id).emit('game:state', getPlayerView(state, player.id));
  }
}

function ack<T>(callback: (res: AckResponse<T>) => void, fn: () => T): void {
  try {
    callback({ ok: true, data: fn() });
  } catch (err) {
    const message = err instanceof GolfEngineError || err instanceof Error ? err.message : 'Unknown error';
    callback({ ok: false, error: message });
  }
}

function requireRoom(roomCode: string | undefined): RoomRecord {
  if (!roomCode) throw new GolfEngineError('NOT_IN_ROOM', 'You are not in a room yet.');
  const room = rooms.get(roomCode);
  if (!room) throw new GolfEngineError('ROOM_NOT_FOUND', `Room ${roomCode} does not exist.`);
  return room;
}

function requireGameState(room: RoomRecord): GameState {
  if (!room.gameState) throw new GolfEngineError('NOT_STARTED', 'The game has not started yet.');
  return room.gameState;
}

function requirePlayerId(socket: Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>): string {
  if (!socket.data.playerId) throw new GolfEngineError('NOT_IN_ROOM', 'You are not in a room yet.');
  return socket.data.playerId;
}

function setConnected(room: RoomRecord, playerId: string, connected: boolean): void {
  const target = room.gameState ? room.gameState.players : room.lobbyPlayers;
  const player = target.find((p) => p.id === playerId);
  if (player) player.connected = connected;
}

/**
 * Binds a socket to a stable player identity: joins the Socket.IO room used to target that
 * player in broadcasts, evicts any stale socket previously bound to them (e.g. a dead tab that
 * hasn't timed out yet), and marks them connected.
 */
function bindSocketToPlayer(
  socket: Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>,
  room: RoomRecord,
  playerId: string,
): void {
  const staleSocketId = room.socketByPlayerId.get(playerId);
  room.socketByPlayerId.set(playerId, socket.id);
  if (staleSocketId && staleSocketId !== socket.id) {
    io.sockets.sockets.get(staleSocketId)?.disconnect(true);
  }

  socket.data.playerId = playerId;
  socket.data.roomCode = room.code;
  socket.join(playerId);

  setConnected(room, playerId, true);
  rooms.reconcileEmptyTimer(room);
}

function broadcastRoom(room: RoomRecord): void {
  if (room.gameState) broadcastGameState(room.gameState);
  else broadcastLobby(room);
}

io.on('connection', (socket: Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>) => {
  socket.on('room:create', ({ playerName }, callback) => {
    ack(callback, () => {
      const name = playerName.trim().slice(0, 24) || 'Player';
      const { room, playerId, token } = rooms.create(name);
      bindSocketToPlayer(socket, room, playerId);
      broadcastLobby(room);
      return { roomCode: room.code, playerId, playerToken: token };
    });
  });

  socket.on('room:join', ({ roomCode, playerName }, callback) => {
    ack(callback, () => {
      const room = requireRoom(roomCode);
      if (room.gameState) throw new GolfEngineError('ALREADY_STARTED', 'That game has already started.');
      if (room.lobbyPlayers.length >= 6) throw new GolfEngineError('ROOM_FULL', 'That room already has 6 players.');
      const name = playerName.trim().slice(0, 24) || 'Player';
      const { playerId, token } = rooms.join(room, name);
      bindSocketToPlayer(socket, room, playerId);
      broadcastLobby(room);
      return { roomCode: room.code, playerId, playerToken: token };
    });
  });

  socket.on('room:reconnect', ({ roomCode, playerId, playerToken }, callback) => {
    ack(callback, () => {
      const room = requireRoom(roomCode);
      if (!rooms.verifyToken(room, playerId, playerToken)) {
        throw new GolfEngineError('INVALID_SESSION', 'Could not resume that session — please rejoin.');
      }
      bindSocketToPlayer(socket, room, playerId);
      broadcastRoom(room);
      return {
        playerId,
        lobby: room.gameState ? null : rooms.toLobbyView(room),
        gameState: room.gameState ? getPlayerView(room.gameState, playerId) : null,
      };
    });
  });

  socket.on('room:leave', (_payload, callback) => {
    ack(callback, () => {
      const { roomCode, playerId } = socket.data;
      if (roomCode && playerId) {
        const room = rooms.get(roomCode);
        // Only tear down the seat if this socket is still the one bound to it — if it was
        // already evicted by a newer connection for the same player, leave that state alone.
        if (room && room.socketByPlayerId.get(playerId) === socket.id) {
          room.socketByPlayerId.delete(playerId);
          setConnected(room, playerId, false);
          rooms.reconcileEmptyTimer(room);
          broadcastRoom(room);
        }
        socket.leave(playerId);
      }
      socket.data.playerId = undefined;
      socket.data.roomCode = undefined;
      return null;
    });
  });

  socket.on('room:start', ({ roomCode }, callback) => {
    ack(callback, () => {
      const room = requireRoom(roomCode);
      if (room.hostId !== requirePlayerId(socket)) throw new GolfEngineError('NOT_HOST', 'Only the host can start the game.');
      if (room.gameState) throw new GolfEngineError('ALREADY_STARTED', 'The game has already started.');
      const match = createMatch(room.code, room.hostId, room.lobbyPlayers);
      room.gameState = dealHole(match);
      broadcastGameState(room.gameState);
      return null;
    });
  });

  socket.on('game:peek', ({ slotIndices }, callback) => {
    ack(callback, () => {
      const room = requireRoom(socket.data.roomCode);
      const state = requireGameState(room);
      room.gameState = choosePeek(state, requirePlayerId(socket), slotIndices);
      broadcastGameState(room.gameState);
      return null;
    });
  });

  socket.on('game:drawDraw', (_payload, callback) => {
    ack(callback, () => {
      const room = requireRoom(socket.data.roomCode);
      const state = requireGameState(room);
      room.gameState = drawFromDrawPile(state, requirePlayerId(socket));
      broadcastGameState(room.gameState);
      return null;
    });
  });

  socket.on('game:drawDiscard', (_payload, callback) => {
    ack(callback, () => {
      const room = requireRoom(socket.data.roomCode);
      const state = requireGameState(room);
      room.gameState = drawFromDiscardPile(state, requirePlayerId(socket));
      broadcastGameState(room.gameState);
      return null;
    });
  });

  socket.on('game:swap', ({ slotIndex }, callback) => {
    ack(callback, () => {
      const room = requireRoom(socket.data.roomCode);
      const state = requireGameState(room);
      room.gameState = swapCard(state, requirePlayerId(socket), slotIndex);
      broadcastGameState(room.gameState);
      return null;
    });
  });

  socket.on('game:discard', (_payload, callback) => {
    ack(callback, () => {
      const room = requireRoom(socket.data.roomCode);
      const state = requireGameState(room);
      room.gameState = discardDrawn(state, requirePlayerId(socket));
      broadcastGameState(room.gameState);
      return null;
    });
  });

  socket.on('game:nextHole', (_payload, callback) => {
    ack(callback, () => {
      const room = requireRoom(socket.data.roomCode);
      const state = requireGameState(room);
      if (room.hostId !== requirePlayerId(socket)) throw new GolfEngineError('NOT_HOST', 'Only the host can start the next hole.');
      room.gameState = dealHole(state);
      broadcastGameState(room.gameState);
      return null;
    });
  });

  socket.on('disconnect', () => {
    const { roomCode, playerId } = socket.data;
    if (!roomCode || !playerId) return;
    const room = rooms.get(roomCode);
    if (!room) return;

    // If a newer socket already took over this player's seat (e.g. this is the stale
    // connection being evicted during a reconnect), don't clobber the fresh state.
    if (room.socketByPlayerId.get(playerId) !== socket.id) return;

    room.socketByPlayerId.delete(playerId);
    setConnected(room, playerId, false);
    rooms.reconcileEmptyTimer(room);
    broadcastRoom(room);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Golf server listening on http://localhost:${PORT}`);
});
