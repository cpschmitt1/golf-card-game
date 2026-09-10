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
  playerId: string;
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

io.on('connection', (socket: Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>) => {
  socket.data.playerId = socket.id;

  socket.on('room:create', ({ playerName }, callback) => {
    ack(callback, () => {
      const name = playerName.trim().slice(0, 24) || 'Player';
      const room = rooms.create(socket.id, name);
      socket.data.roomCode = room.code;
      socket.join(room.code);
      broadcastLobby(room);
      return { roomCode: room.code, playerId: socket.id };
    });
  });

  socket.on('room:join', ({ roomCode, playerName }, callback) => {
    ack(callback, () => {
      const room = requireRoom(roomCode);
      if (room.gameState) throw new GolfEngineError('ALREADY_STARTED', 'That game has already started.');
      if (room.lobbyPlayers.length >= 6) throw new GolfEngineError('ROOM_FULL', 'That room already has 6 players.');
      const name = playerName.trim().slice(0, 24) || 'Player';
      room.lobbyPlayers.push({ id: socket.id, name });
      socket.data.roomCode = room.code;
      socket.join(room.code);
      broadcastLobby(room);
      return { roomCode: room.code, playerId: socket.id };
    });
  });

  socket.on('room:start', ({ roomCode }, callback) => {
    ack(callback, () => {
      const room = requireRoom(roomCode);
      if (room.hostId !== socket.id) throw new GolfEngineError('NOT_HOST', 'Only the host can start the game.');
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
      room.gameState = choosePeek(state, socket.id, slotIndices);
      broadcastGameState(room.gameState);
      return null;
    });
  });

  socket.on('game:drawDraw', (_payload, callback) => {
    ack(callback, () => {
      const room = requireRoom(socket.data.roomCode);
      const state = requireGameState(room);
      room.gameState = drawFromDrawPile(state, socket.id);
      broadcastGameState(room.gameState);
      return null;
    });
  });

  socket.on('game:drawDiscard', (_payload, callback) => {
    ack(callback, () => {
      const room = requireRoom(socket.data.roomCode);
      const state = requireGameState(room);
      room.gameState = drawFromDiscardPile(state, socket.id);
      broadcastGameState(room.gameState);
      return null;
    });
  });

  socket.on('game:swap', ({ slotIndex }, callback) => {
    ack(callback, () => {
      const room = requireRoom(socket.data.roomCode);
      const state = requireGameState(room);
      room.gameState = swapCard(state, socket.id, slotIndex);
      broadcastGameState(room.gameState);
      return null;
    });
  });

  socket.on('game:discard', (_payload, callback) => {
    ack(callback, () => {
      const room = requireRoom(socket.data.roomCode);
      const state = requireGameState(room);
      room.gameState = discardDrawn(state, socket.id);
      broadcastGameState(room.gameState);
      return null;
    });
  });

  socket.on('game:nextHole', (_payload, callback) => {
    ack(callback, () => {
      const room = requireRoom(socket.data.roomCode);
      const state = requireGameState(room);
      if (room.hostId !== socket.id) throw new GolfEngineError('NOT_HOST', 'Only the host can start the next hole.');
      room.gameState = dealHole(state);
      broadcastGameState(room.gameState);
      return null;
    });
  });

  socket.on('disconnect', () => {
    const roomCode = socket.data.roomCode;
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room) return;

    if (!room.gameState) {
      room.lobbyPlayers = room.lobbyPlayers.filter((p) => p.id !== socket.id);
      if (room.lobbyPlayers.length === 0) {
        rooms.delete(room.code);
      } else {
        if (room.hostId === socket.id) room.hostId = room.lobbyPlayers[0].id;
        broadcastLobby(room);
      }
      return;
    }

    const player = room.gameState.players.find((p) => p.id === socket.id);
    if (player) {
      player.connected = false;
      broadcastGameState(room.gameState);
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Golf server listening on http://localhost:${PORT}`);
});
