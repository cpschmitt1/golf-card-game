import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { randomUUID } from 'node:crypto';
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
  type ChatMessage,
  type ClientToServerEvents,
  type GameState,
  type ServerToClientEvents,
} from '@golf/engine';

import { logEvent } from './log.js';
import { RoomStore, type RoomRecord } from './rooms.js';
import { getPushSubscription, savePushSubscription } from './pushSubscriptions.js';
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

type GolfSocket = Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>;

/**
 * Which socket and event is being handled right now. Socket.IO runs the onAny listener and the
 * event's own handler back to back in the same tick, so setting this in onAny is enough for
 * `ack` (below) to say which action it just rejected.
 */
let currentCall: { event: string; socket: GolfSocket } | null = null;

/** Room code and player name for log lines, if this socket is in a room. */
function actor(socket: GolfSocket): { room?: string; by?: string } {
  const room = socket.data.roomCode ? rooms.get(socket.data.roomCode) : undefined;
  const by = room && socket.data.playerId ? roomPlayers(room).find((p) => p.id === socket.data.playerId)?.name : undefined;
  return { room: socket.data.roomCode, by };
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
    if (currentCall) {
      logEvent('action_rejected', {
        action: currentCall.event,
        code: err instanceof GolfEngineError ? err.code : 'ERROR',
        message,
        ...actor(currentCall.socket),
      });
    }
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

/** The "it's your turn" text, shared by the automatic notification and the manual nudge. */
function turnMessage(state: GameState): string {
  return state.phase === 'final-turns'
    ? `It's your final turn! — Hole ${state.holeNumber} of 18`
    : `It's your turn — Hole ${state.holeNumber} of 18`;
}

const NUDGE_COOLDOWN_MS = 30 * 60 * 1000;

const CHAT_MAX_LENGTH = 280;
const CHAT_HISTORY_LIMIT = 100;
const CHAT_RATE_LIMIT_COUNT = 5;
const CHAT_RATE_LIMIT_WINDOW_MS = 10_000;

/** Everyone currently in the room, whether or not the match has started. */
function roomPlayers(room: RoomRecord): { id: string; name: string }[] {
  return room.gameState ? room.gameState.players : room.lobbyPlayers;
}

function sendChatHistory(socket: Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>, room: RoomRecord): void {
  socket.emit('chat:history', room.chat);
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
    logEvent('hole_started', { room: room.code, hole: next.holeNumber, dealer: next.players[next.dealerIndex]?.name });
    for (const player of next.players) {
      pushUnlessFocused(room, player.id, {
        title: 'Golf Card Game',
        body: `Hole ${next.holeNumber} has started — time to peek!`,
      });
    }
    return;
  }

  // A hole just got scored. Only the host can start the next hole (game:nextHole is host-only),
  // so they're the one who needs the nudge. The host ending the match themselves (endMatch) never
  // goes through here, so they aren't pinged about their own action.
  if (previous.phase !== 'complete' && next.phase === 'complete') {
    logEvent('hole_scored', {
      room: room.code,
      hole: next.holeNumber,
      matchComplete: next.matchComplete,
      scores: next.players.map((p) => `${p.name}:${p.holeScores[p.holeScores.length - 1]}`).join(','),
    });
    pushUnlessFocused(room, room.hostId, {
      title: 'Golf Card Game',
      body: next.matchComplete
        ? `Hole ${next.holeNumber} is over — that was the last hole, the match is complete!`
        : `Hole ${next.holeNumber} is over — time to start the next hole!`,
    });
    return;
  }

  if (previous.phase === 'turn' && next.phase === 'final-turns') {
    logEvent('final_round_started', {
      room: room.code,
      hole: next.holeNumber,
      finisher: next.players.find((p) => p.id === next.finisherId)?.name,
      turnsOwed: next.finalTurnsRemaining,
    });
  }

  const wasActiveTurn = previous.phase === 'turn' || previous.phase === 'final-turns';
  const isActiveTurn = next.phase === 'turn' || next.phase === 'final-turns';
  const previousCurrentId = wasActiveTurn ? previous.players[previous.currentPlayerIndex]?.id : null;
  const nextCurrentId = isActiveTurn ? next.players[next.currentPlayerIndex]?.id : null;

  if (isActiveTurn && nextCurrentId && nextCurrentId !== previousCurrentId) {
    pushUnlessFocused(room, nextCurrentId, {
      title: 'Golf Card Game',
      body: turnMessage(next),
    });
  }
}

io.on('connection', (socket: Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>) => {
  socket.onAny((event: string) => {
    currentCall = { event, socket };
  });

  socket.on('room:create', ({ playerName }, callback) => {
    ack(callback, () => {
      const name = playerName.trim().slice(0, 24) || 'Player';
      const { room, playerId, token } = rooms.create(name);
      logEvent('room_created', { room: room.code, host: name });
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
      logEvent('player_joined', { room: room.code, name, players: room.lobbyPlayers.length });
      bindSocketToPlayer(socket, room, playerId);
      sendChatHistory(socket, room);
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
      logEvent('player_reconnected', {
        room: room.code,
        name: roomPlayers(room).find((p) => p.id === playerId)?.name,
        phase: room.gameState?.phase ?? 'lobby',
      });
      sendChatHistory(socket, room);
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
          logEvent('player_left', { ...actor(socket) });
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
      logEvent('match_started', { room: room.code, players: room.lobbyPlayers.map((p) => p.name).join(',') });
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
      logEvent('match_restarted', { ...actor(socket), players: room.lobbyPlayers.length });
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

      logEvent('player_removed', {
        ...actor(socket),
        removed: room.lobbyPlayers.find((p) => p.id === targetId)?.name,
      });
      room.lobbyPlayers = room.lobbyPlayers.filter((p) => p.id !== targetId);
      room.playerTokens.delete(targetId);
      const targetSocketId = room.socketByPlayerId.get(targetId);
      room.socketByPlayerId.delete(targetId);
      room.focusedByPlayerId.delete(targetId);
      room.chatSendTimesByPlayerId.delete(targetId);

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
      logEvent('match_ended_by_host', {
        ...actor(socket),
        hole: state.holeNumber,
        phase: state.phase,
        holesScored: Math.max(0, ...state.players.map((p) => p.holeScores.length)),
      });
      room.gameState = endMatch(state);
      broadcastGameState(room.gameState);
      return null;
    });
  });

  // Reports from the app about things only the device can see (a button that got no answer, a
  // crash, a dropped connection). Capped per connection so a misbehaving client can't flood the log.
  let clientLogTimes: number[] = [];
  socket.on('client:log', (payload) => {
    const now = Date.now();
    clientLogTimes = clientLogTimes.filter((t) => now - t < 60_000);
    if (clientLogTimes.length >= 20) return;
    clientLogTimes.push(now);
    if (!payload || typeof payload.kind !== 'string' || typeof payload.detail !== 'string') return;
    logEvent('client_report', {
      ...actor(socket),
      kind: payload.kind.slice(0, 40),
      detail: payload.detail.slice(0, 300),
      ua: typeof payload.ua === 'string' ? payload.ua.slice(0, 160) : undefined,
    });
  });

  socket.on('server:features', (_payload, callback) => {
    ack(callback, () => ({ chat: true, nudge: true }));
  });

  socket.on('chat:send', ({ text }, callback) => {
    ack(callback, () => {
      const room = requireRoom(socket.data.roomCode);
      const playerId = requirePlayerId(socket);
      const sender = roomPlayers(room).find((p) => p.id === playerId);
      if (!sender) throw new GolfEngineError('NOT_IN_ROOM', 'You are not in this room.');

      const body = typeof text === 'string' ? text.trim().slice(0, CHAT_MAX_LENGTH) : '';
      if (!body) throw new GolfEngineError('EMPTY_MESSAGE', 'Type a message first.');

      const now = Date.now();
      const recent = (room.chatSendTimesByPlayerId.get(playerId) ?? []).filter((t) => now - t < CHAT_RATE_LIMIT_WINDOW_MS);
      if (recent.length >= CHAT_RATE_LIMIT_COUNT) {
        throw new GolfEngineError('CHAT_RATE_LIMIT', "You're sending messages too fast — wait a few seconds.");
      }
      recent.push(now);
      room.chatSendTimesByPlayerId.set(playerId, recent);

      const message: ChatMessage = { id: randomUUID(), playerId, name: sender.name, text: body, sentAt: now };
      room.chat.push(message);
      if (room.chat.length > CHAT_HISTORY_LIMIT) room.chat.splice(0, room.chat.length - CHAT_HISTORY_LIMIT);

      for (const p of roomPlayers(room)) io.to(p.id).emit('chat:message', message);
      return null;
    });
  });

  // Not built on ack() because it has to await a subscription lookup before deciding whether the
  // nudge can actually reach anyone.
  socket.on('game:nudge', async (_payload, callback) => {
    let claimed: { room: RoomRecord; targetId: string; previous: number | undefined } | null = null;
    try {
      const room = requireRoom(socket.data.roomCode);
      const state = requireGameState(room);
      const nudgerId = requirePlayerId(socket);
      if (state.phase !== 'turn' && state.phase !== 'final-turns') {
        throw new GolfEngineError('NOT_IN_TURNS', 'Nudging only works while turns are being played.');
      }
      const target = state.players[state.currentPlayerIndex];
      if (!target || target.id === nudgerId) throw new GolfEngineError('OWN_TURN', "It's your own turn.");
      const nudger = state.players.find((p) => p.id === nudgerId);

      const previous = room.lastNudgeAtByTarget.get(target.id);
      const waitMs = previous === undefined ? 0 : previous + NUDGE_COOLDOWN_MS - Date.now();
      if (waitMs > 0) {
        throw new GolfEngineError(
          'NUDGE_COOLDOWN',
          `${target.name} was nudged recently — you can nudge again in ${Math.ceil(waitMs / 60000)} min.`,
        );
      }
      // Claim the cooldown before awaiting so two simultaneous nudges can't both get through.
      room.lastNudgeAtByTarget.set(target.id, Date.now());
      claimed = { room, targetId: target.id, previous };

      if (!(await getPushSubscription(target.id))) {
        throw new GolfEngineError(
          'NO_NOTIFICATIONS',
          `${target.name} hasn't turned on notifications, so a nudge can't reach them.`,
        );
      }
      // The turn may have moved on while we were checking the subscription.
      const latest = room.gameState;
      if (!latest || latest.players[latest.currentPlayerIndex]?.id !== target.id) {
        throw new GolfEngineError('TURN_MOVED', `It's no longer ${target.name}'s turn.`);
      }

      claimed = null;
      pushUnlessFocused(room, target.id, {
        title: 'Golf Card Game',
        body: `Nudge from ${nudger?.name ?? 'a player'}: ${turnMessage(latest)}`,
      });
      logEvent('nudge_sent', { ...actor(socket), target: target.name });
      callback({ ok: true, data: null });
    } catch (err) {
      if (claimed) {
        // The nudge never went out, so don't burn the cooldown.
        if (claimed.previous === undefined) claimed.room.lastNudgeAtByTarget.delete(claimed.targetId);
        else claimed.room.lastNudgeAtByTarget.set(claimed.targetId, claimed.previous);
      }
      const message = err instanceof Error ? err.message : 'Unknown error';
      logEvent('action_rejected', {
        action: 'game:nudge',
        code: err instanceof GolfEngineError ? err.code : 'ERROR',
        message,
        ...actor(socket),
      });
      callback({ ok: false, error: message });
    }
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

  socket.on('disconnect', (reason) => {
    const { roomCode, playerId } = socket.data;
    if (!roomCode || !playerId) return;
    const room = rooms.get(roomCode);
    if (!room) return;

    // If a newer socket already took over this player's seat (e.g. this is the stale
    // connection being evicted during a reconnect), don't clobber the fresh state.
    if (room.socketByPlayerId.get(playerId) !== socket.id) {
      logEvent('connection_replaced', { ...actor(socket), reason });
      return;
    }

    logEvent('player_disconnected', { ...actor(socket), reason, phase: room.gameState?.phase ?? 'lobby' });
    room.socketByPlayerId.delete(playerId);
    room.focusedByPlayerId.delete(playerId);
    setConnected(room, playerId, false);
    broadcastRoom(room);
  });
});

// Same outcome as Node's default (the process exits and Railway restarts it), but leaves a
// readable line in the log first so a crash isn't a mystery.
process.on('uncaughtException', (err) => {
  logEvent('uncaught_exception', { message: err.message });
  console.error(err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  logEvent('unhandled_rejection', { message: reason instanceof Error ? reason.message : String(reason) });
  console.error(reason);
  process.exit(1);
});

httpServer.listen(PORT, () => {
  console.log(`Golf server listening on http://localhost:${PORT}`);
  logEvent('server_started', { port: PORT });
});
