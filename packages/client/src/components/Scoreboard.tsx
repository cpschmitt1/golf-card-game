import type { PlayerView } from '@golf/engine';

interface ScoreboardProps {
  players: PlayerView[];
  holeNumber: number;
  matchComplete: boolean;
  isHost: boolean;
  onNextHole: () => void;
  onLeave: () => void;
}

export function Scoreboard({ players, holeNumber, matchComplete, isHost, onNextHole, onLeave }: ScoreboardProps) {
  const ranked = [...players].sort((a, b) => a.totalScore - b.totalScore);

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
                <td>{p.holeScores[p.holeScores.length - 1]}</td>
                <td>{p.totalScore}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {!matchComplete && isHost && <button onClick={onNextHole}>Start Hole {holeNumber + 1}</button>}
        {!matchComplete && !isHost && <p className="hint">Waiting for the host to start the next hole…</p>}
        {matchComplete && <p className="hint">18 holes complete — lowest score wins!</p>}

        <button className="link-button" onClick={onLeave}>
          Leave game
        </button>
      </div>
    </div>
  );
}
