import type { PlayerView } from '@golf/engine';

interface ScoreboardProps {
  players: PlayerView[];
  holeNumber: number;
  matchComplete: boolean;
  isHost: boolean;
  onNextHole: () => void;
  onPlayAgain: () => void;
  onLeave: () => void;
}

export function Scoreboard({ players, holeNumber, matchComplete, isHost, onNextHole, onPlayAgain, onLeave }: ScoreboardProps) {
  const ranked = [...players].sort((a, b) => a.totalScore - b.totalScore);
  // holeScores can be empty if the match was ended before any hole finished (e.g. "End Match"
  // used during hole 1's peek/turn phase, before it was ever scored).
  const hasCompletedHoles = players.some((p) => p.holeScores.length > 0);

  return (
    <div className="scoreboard-overlay">
      <div className="scoreboard-panel">
        <h2>{matchComplete ? 'Final Results' : `Hole ${holeNumber} Complete`}</h2>

        <table className="scoreboard-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>This Hole</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((p, i) => (
              <tr key={p.id} className={matchComplete && i === 0 ? 'row-winner' : ''}>
                <td>
                  {matchComplete && i === 0 && '🏆 '}
                  {p.name}
                </td>
                <td>{p.holeScores.length > 0 ? p.holeScores[p.holeScores.length - 1] : '—'}</td>
                <td>{p.totalScore}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {!matchComplete && isHost && <button onClick={onNextHole}>Start Hole {holeNumber + 1}</button>}
        {!matchComplete && !isHost && <p className="hint">Waiting for the host to start the next hole…</p>}
        {matchComplete && !hasCompletedHoles && <p className="hint">Match ended before any hole finished — no scores to show.</p>}
        {matchComplete && hasCompletedHoles && <p className="hint">Match complete — lowest score wins!</p>}

        {matchComplete && isHost && <button onClick={onPlayAgain}>Play Again</button>}
        {matchComplete && !isHost && <p className="hint">Waiting for the host to start a new match…</p>}

        <button className="link-button" onClick={onLeave}>
          Leave game
        </button>
      </div>
    </div>
  );
}
