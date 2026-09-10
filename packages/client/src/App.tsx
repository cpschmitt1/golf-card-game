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

    function handleDisconnect() {
      setSocketConnected(false);
    }
    function handleLobby(update: LobbyView) {
      setLobby(update);
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
        />
      </>
    );
  }

  if (lobby) {
    return (
      <>
        {connectionBanner}
        <Lobby lobby={lobby} playerId={playerId} onStart={handleStart} error={error} />
      </>
    );
  }

  return <div className="screen">Connecting…</div>;
}
