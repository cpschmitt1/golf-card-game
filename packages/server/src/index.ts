import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server, type Socket } from 'socket.io';

import {
  choosePeek,
  createMatch,
  dealHole,
  discardDrawn,
  drawFromDiscardPile,
  drawFromDrawPile,
  endMatch,
  getPlayerView,
  GolfEngineError,
  swapCard,
  type AckResponse,
  type ClientToServerEvents,
  type GameState,
  type ServerToClientEvents,
} from '@golf/engine';

import { RoomStore, type RoomRecord } from './rooms.js';
import { savePushSubscription } from './pushSubscriptions.js';
import { sendPushToPlayer, type PushPayload } from './pushSend.js';

const PORT = Number(process.env.PORT ?? 3001);
// Comma-separated so a custom domain can be added alongside a platform-provided one
// (e.g. Railway's *.up.railway.app domain) without needing a code change to redeploy.
// A literal "*" allows any origin — only meant for local testing against a throwaway tunnel
// URL that changes on every restart; never set this in a real deployment.
const CLIENT_ORIGIN_ENV = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';
const CLIENT_ORIGINS: true | string[] =
  CLIENT_ORIGIN_ENV.trim() === '*'
    ? true
    : CLIENT_ORIGIN_ENV.split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);

const app = express();
app.use(cors({ origin: CLIENT_ORIGINS }));
app.get('/health', (_req, res) => res.json({ ok: true }));

// Local testing only, opt-in via env var: serves the already-built client from this same
// process/port, so a single tunnel (e.g. a free ngrok account's one-simultaneous-tunnel limit)
// can expose the whole app instead of needing two kept in sync. Never set this on Railway —
// client and server are separate services there for real.
if (process.env.SERVE_CLIENT_DIST === 'true') {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/socket.io/')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: CLIENT_ORIGINS },
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
}

function broadcastRoom(room: RoomRecord): void {
  if (room.gameState) broadcastGameState(room.gameState);
  else broadcastLobby(room);
}

/** Sends a push notification to a player, unless they're currently looking at their own tab. */
function pushUnlessFocused(room: RoomRecord, playerId: string, payload: PushPayload): void {
  if (room.focusedByPlayerId.get(playerId) === true) return;
  void sendPushToPlayer(playerId, payload);
}

/**
 * Compares the state before and after a game action to decide whether anyone needs a "come back"
 * push notification. Call this right after applying an action, with `previous` being the state
 * as it was *before* that action (every handler already has this in scope as `state`, captured
 * before mutating room.gameState).
 *
 * Two triggers, both blocking-until-actioned so there's no risk of double-firing before someone
 * responds: a new hole starting (everyone needs to peek) and a new current player's turn
 * starting (during 'turn' or 'final-turns', including the peek->turn handoff).
 */
function notifyOnStateChange(previous: GameState, room: RoomRecord): void {
  const next = room.gameState;
  if (!next) return;

  if (previous.phase !== 'peek' && next.phase === 'peek') {
    for (const player of next.players) {
      pushUnlessFocused(room, player.id, {
        title: 'Golf Card Game',
        body: `Hole ${next.holeNumber} has started — time to peek!`,
      });
    }
    return;
  }

  const wasActiveTurn = previous.phase === 'turn' || previous.phase === 'final-turns';
  const isActiveTurn = next.phase === 'turn' || next.phase === 'final-turns';
  const previousCurrentId = wasActiveTurn ? previous.players[previous.currentPlayerIndex]?.id : null;
  const nextCurrentId = isActiveTurn ? next.players[next.currentPlayerIndex]?.id : null;

  if (isActiveTurn && nextCurrentId && nextCurrentId !== previousCurrentId) {
    pushUnlessFocused(room, nextCurrentId, {
      title: 'Golf Card Game',
      body: `It's your turn — Hole ${next.holeNumber} of 18`,
    });
  }
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
      // Only for a genuinely new player joining, not room:reconnect — an existing player coming
      // back isn't news to the host the way a new arrival is.
      pushUnlessFocused(room, room.hostId, {
        title: 'Golf Card Game',
        body: `${name} joined your room!`,
      });
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
          room.focusedByPlayerId.delete(playerId);
          setConnected(room, playerId, false);
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
      notifyOnStateChange(match, room);
      return null;
    });
  });

  socket.on('room:restart', (_payload, callback) => {
    ack(callback, () => {
      const room = requireRoom(socket.data.roomCode);
      const state = requireGameState(room);
      if (room.hostId !== requirePlayerId(socket)) throw new GolfEngineError('NOT_HOST', 'Only the host can start a new match.');
      if (!state.matchComplete) throw new GolfEngineError('NOT_COMPLETE', 'The match is not finished yet.');
      // Rebuild the lobby roster from the finished match's players (preserves connected status);
      // playerTokens/socketByPlayerId are untouched, so everyone's reconnect credentials still work.
      room.lobbyPlayers = state.players.map((p) => ({ id: p.id, name: p.name, connected: p.connected }));
      room.gameState = null;
      broadcastLobby(room);
      return null;
    });
  });

  socket.on('room:kickPlayer', ({ playerId: targetId }, callback) => {
    ack(callback, () => {
      const room = requireRoom(socket.data.roomCode);
      const hostId = requirePlayerId(socket);
      if (room.hostId !== hostId) throw new GolfEngineError('NOT_HOST', 'Only the host can remove players.');
      if (room.gameState) throw new GolfEngineError('ALREADY_STARTED', 'Players can only be removed before the game starts.');
      if (targetId === hostId) throw new GolfEngineError('CANNOT_KICK_HOST', 'The host cannot remove themselves.');
      if (!room.lobbyPlayers.some((p) => p.id === targetId)) {
        throw new GolfEngineError('PLAYER_NOT_FOUND', 'That player is no longer in the room.');
      }

      room.lobbyPlayers = room.lobbyPlayers.filter((p) => p.id !== targetId);
      room.playerTokens.delete(targetId);
      const targetSocketId = room.socketByPlayerId.get(targetId);
      room.socketByPlayerId.delete(targetId);
      room.focusedByPlayerId.delete(targetId);

      // Tell the removed player directly, then detach their socket from the room so any further
      // action they send fails with NOT_IN_ROOM — same end state as if they'd left voluntarily.
      // No forced socket.disconnect() here: that would also fire the client's 'disconnect'
      // handler, which shows a different ("opened in another tab") message and would stomp this one.
      io.to(targetId).emit('room:kicked', { roomCode: room.code });
      const targetSocket = targetSocketId ? io.sockets.sockets.get(targetSocketId) : undefined;
      if (targetSocket) {
        targetSocket.leave(targetId);
        targetSocket.data.playerId = undefined;
        targetSocket.data.roomCode = undefined;
      }

      broadcastLobby(room);
      return null;
    });
  });

  socket.on('game:peek', ({ slotIndices }, callback) => {
    ack(callback, () => {
      const room = requireRoom(socket.data.roomCode);
      const state = requireGameState(room);
      room.gameState = choosePeek(state, requirePlayerId(socket), slotIndices);
      broadcastGameState(room.gameState);
      notifyOnStateChange(state, room);
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
      notifyOnStateChange(state, room);
      return null;
    });
  });

  socket.on('game:discard', (_payload, callback) => {
    ack(callback, () => {
      const room = requireRoom(socket.data.roomCode);
      const state = requireGameState(room);
      room.gameState = discardDrawn(state, requirePlayerId(socket));
      broadcastGameState(room.gameState);
      notifyOnStateChange(state, room);
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
      notifyOnStateChange(state, room);
      return null;
    });
  });

  socket.on('game:endMatch', (_payload, callback) => {
    ack(callback, () => {
      const room = requireRoom(socket.data.roomCode);
      const state = requireGameState(room);
      if (room.hostId !== requirePlayerId(socket)) throw new GolfEngineError('NOT_HOST', 'Only the host can end the match.');
      room.gameState = endMatch(state);
      broadcastGameState(room.gameState);
      return null;
    });
  });

  socket.on('push:subscribe', ({ subscription }, callback) => {
    ack(callback, () => {
      const playerId = requirePlayerId(socket);
      // Fire-and-forget: a slow/failed Upstash write shouldn't block the client's ack, and
      // savePushSubscription never throws (it just logs and no-ops if Upstash isn't configured).
      void savePushSubscription(playerId, subscription);
      return null;
    });
  });

  socket.on('presence:focus', ({ focused }, callback) => {
    ack(callback, () => {
      const room = requireRoom(socket.data.roomCode);
      const playerId = requirePlayerId(socket);
      room.focusedByPlayerId.set(playerId, focused);
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
    room.focusedByPlayerId.delete(playerId);
    setConnected(room, playerId, false);
    broadcastRoom(room);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Golf server listening on http://localhost:${PORT}`);
});
