import { useState } from 'react';

interface HomeProps {
  onCreate: (playerName: string) => void;
  onJoin: (roomCode: string, playerName: string) => void;
  busy: boolean;
  error: string | null;
}

export function Home({ onCreate, onJoin, busy, error }: HomeProps) {
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');

  return (
    <div className="screen home-screen">
      <h1>⛳ Golf</h1>
      <p className="subtitle">The card game. 2-6 players, 18 holes, lowest score wins.</p>

      <label className="field">
        Your name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Claire" maxLength={24} />
      </label>

      <div className="home-actions">
        <button disabled={busy || !name.trim()} onClick={() => onCreate(name)}>
          Create Game
        </button>

        <div className="join-row">
          <input
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            placeholder="ROOM CODE"
            maxLength={4}
          />
          <button disabled={busy || !name.trim() || roomCode.trim().length !== 4} onClick={() => onJoin(roomCode.trim(), name)}>
            Join Game
          </button>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
