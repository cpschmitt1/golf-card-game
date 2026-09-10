import type { LobbyView } from '@golf/engine';

interface LobbyProps {
  lobby: LobbyView;
  playerId: string;
  onStart: () => void;
  error: string | null;
}

export function Lobby({ lobby, playerId, onStart, error }: LobbyProps) {
  const isHost = lobby.hostId === playerId;
  const canStart = lobby.players.length >= 2 && lobby.players.length <= 6;

  return (
    <div className="screen lobby-screen">
      <h1>Room {lobby.roomCode}</h1>
      <p className="subtitle">Share this code with friends so they can join.</p>

      <ul className="player-list">
        {lobby.players.map((p) => (
          <li key={p.id}>
            {p.name}
            {p.id === lobby.hostId && <span className="badge">host</span>}
            {p.id === playerId && <span className="badge badge-you">you</span>}
            {!p.connected && <span className="badge badge-disconnected">disconnected</span>}
          </li>
        ))}
      </ul>

      {isHost ? (
        <>
          <button disabled={!canStart} onClick={onStart}>
            Start Game
          </button>
          {!canStart && <p className="hint">Need 2-6 players to start.</p>}
        </>
      ) : (
        <p className="hint">Waiting for the host to start the game…</p>
      )}

      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
