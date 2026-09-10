import { useEffect, useState } from 'react';
import type { GameStateView, LobbyView } from '@golf/engine';
import { socket } from './socket.js';
import { clearSession, loadSession, saveSession } from './session.js';
import { Home } from './components/Home.js';
import { Lobby } from './components/Lobby.js';
import { GameBoard } from './components/GameBoard.js';

export default function App() {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [lobby, setLobby] = useState<LobbyView | null>(null);
  const [gameState, setGameState] = useState<GameStateView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reconnecting, setReconnecting] = useState(() => loadSession() !== null);
  const [socketConnected, setSocketConnected] = useState(socket.connected);

  useEffect(() => {
    function attemptResume() {
      setSocketConnected(true);
      const stored = loadSession();
      if (!stored) {
        setReconnecting(false);
        return;
      }
      socket.emit('room:reconnect', stored, (res) => {
        if (res.ok) {
          setPlayerId(res.data.playerId);
          setRoomCode(stored.roomCode);
          setLobby(res.data.lobby);
          setGameState(res.data.gameState);
          setError(null);
        } else {
          clearSession();
          setError(res.error);
        }
        setReconnecting(false);
      });
    }

    function handleDisconnect(reason: string) {
      setSocketConnected(false);
      // The server only force-disconnects a socket when a newer connection took over the same
      // player identity (see bindSocketToPlayer's eviction in the server) — with localStorage,
      // that now happens whenever this identity is opened in a second tab/window. socket.io does
      // NOT auto-reconnect after a server-initiated disconnect, so recover explicitly: drop the
      // stale identity, surface why, and manually reconnect as a fresh (anonymous) connection.
      if (reason === 'io server disconnect') {
        clearSession();
        setPlayerId(null);
        setRoomCode(null);
        setLobby(null);
        setGameState(null);
        setError('This game was opened in another tab or window — only one can play as this seat.');
        socket.connect();
      }
    }
    function handleLobby(update: LobbyView) {
      setLobby(update);
      // A lobby:update only ever arrives when the room has no active match (see broadcastRoom on
      // the server) — including right after a host uses "Play Again" to reset a finished match
      // back to the lobby. Without this, a stale gameState would keep GameBoard mounted forever
      // since App's render order checks gameState before lobby.
      setGameState(null);
    }
    function handleGameState(update: GameStateView) {
      setGameState(update);
    }
    function handleError(err: { message: string }) {
      setError(err.message);
    }

    socket.on('connect', attemptResume);
    socket.on('disconnect', handleDisconnect);
    socket.on('lobby:update', handleLobby);
    socket.on('game:state', handleGameState);
    socket.on('error', handleError);

    // The socket may have already connected before this effect ran (e.g. on a fast reload),
    // in which case the 'connect' event above already fired and won't fire again.
    if (socket.connected) attemptResume();

    return () => {
      socket.off('connect', attemptResume);
      socket.off('disconnect', handleDisconnect);
      socket.off('lobby:update', handleLobby);
      socket.off('game:state', handleGameState);
      socket.off('error', handleError);
    };
  }, []);

  function handleCreate(playerName: string) {
    setBusy(true);
    setError(null);
    socket.emit('room:create', { playerName }, (res) => {
      setBusy(false);
      if (res.ok) {
        setPlayerId(res.data.playerId);
        setRoomCode(res.data.roomCode);
        saveSession(res.data);
      } else {
        setError(res.error);
      }
    });
  }

  function handleJoin(code: string, playerName: string) {
    setBusy(true);
    setError(null);
    socket.emit('room:join', { roomCode: code, playerName }, (res) => {
      setBusy(false);
      if (res.ok) {
        setPlayerId(res.data.playerId);
        setRoomCode(res.data.roomCode);
        saveSession(res.data);
      } else {
        setError(res.error);
      }
    });
  }

  function handleStart() {
    if (!roomCode) return;
    setError(null);
    socket.emit('room:start', { roomCode }, (res) => {
      if (!res.ok) setError(res.error);
    });
  }

  function reportIfError(res: { ok: true; data: null } | { ok: false; error: string }) {
    if (!res.ok) setError(res.error);
  }

  function handleLeave() {
    clearSession();
    socket.emit('room:leave', {}, () => {});
    setPlayerId(null);
    setRoomCode(null);
    setLobby(null);
    setGameState(null);
    setError(null);
  }

  const connectionBanner = !socketConnected && (lobby || gameState) && (
    <div className="connection-banner">Connection lost — reconnecting…</div>
  );

  if (reconnecting) {
    return <div className="screen">Resuming your game…</div>;
  }

  if (!playerId || !roomCode) {
    return <Home onCreate={handleCreate} onJoin={handleJoin} busy={busy} error={error} />;
  }

  if (gameState) {
    return (
      <>
        {connectionBanner}
        <GameBoard
          state={gameState}
          playerId={playerId}
          onPeek={(slots) => socket.emit('game:peek', { slotIndices: slots }, reportIfError)}
          onDrawDraw={() => socket.emit('game:drawDraw', {}, reportIfError)}
          onDrawDiscard={() => socket.emit('game:drawDiscard', {}, reportIfError)}
          onSwap={(slotIndex) => socket.emit('game:swap', { slotIndex }, reportIfError)}
          onDiscard={() => socket.emit('game:discard', {}, reportIfError)}
          onNextHole={() => socket.emit('game:nextHole', {}, reportIfError)}
          onEndMatch={() => socket.emit('game:endMatch', {}, reportIfError)}
          onPlayAgain={() => socket.emit('room:restart', {}, reportIfError)}
          onLeave={handleLeave}
        />
      </>
    );
  }

  if (lobby) {
    return (
      <>
        {connectionBanner}
        <Lobby lobby={lobby} playerId={playerId} onStart={handleStart} onLeave={handleLeave} error={error} />
      </>
    );
  }

  return <div className="screen">Connecting…</div>;
}
