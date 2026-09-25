import { useState } from 'react';
import type { LobbyView } from '@golf/engine';

interface LobbyProps {
  lobby: LobbyView;
  playerId: string;
  onStart: () => void;
  onLeave: () => void;
  error: string | null;
  notificationPermission: NotificationPermission | 'unsupported';
  onEnableNotifications: () => void;
  onKickPlayer: (playerId: string) => void;
}

export function Lobby({
  lobby,
  playerId,
  onStart,
  onLeave,
  error,
  notificationPermission,
  onEnableNotifications,
  onKickPlayer,
}: LobbyProps) {
  const isHost = lobby.hostId === playerId;
  const canStart = lobby.players.length >= 2 && lobby.players.length <= 6;
  // Two-tap confirm instead of window.confirm(): the latter renders inconsistently (or not at
  // all) inside an installed iOS PWA, so removal is confirmed in-line instead.
  const [pendingKickId, setPendingKickId] = useState<string | null>(null);

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
            {isHost &&
              p.id !== lobby.hostId &&
              (pendingKickId === p.id ? (
                <span className="kick-confirm">
                  <button
                    className="kick-confirm-yes"
                    onClick={() => {
                      setPendingKickId(null);
                      onKickPlayer(p.id);
                    }}
                  >
                    Remove?
                  </button>
                  <button className="link-button" onClick={() => setPendingKickId(null)}>
                    Cancel
                  </button>
                </span>
              ) : (
                <button className="kick-button" title={`Remove ${p.name}`} onClick={() => setPendingKickId(p.id)}>
                  ✕
                </button>
              ))}
          </li>
        ))}
      </ul>

      {notificationPermission === 'default' && (
        <div className="notification-banner">
          <p>🔔 Get notified when it's your turn — even if the game isn't open.</p>
          <button onClick={onEnableNotifications}>Enable notifications</button>
        </div>
      )}

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

      <button className="link-button" onClick={onLeave}>
        Leave room
      </button>
    </div>
  );
}
