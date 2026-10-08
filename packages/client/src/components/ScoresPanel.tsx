import type { PlayerView } from '@golf/engine';

interface ScoresPanelProps {
  players: PlayerView[];
  myPlayerId: string;
  onClose: () => void;
}

export function ScoresPanel({ players, myPlayerId, onClose }: ScoresPanelProps) {
  const ranked = [...players].sort((a, b) => a.totalScore - b.totalScore);
  const lowest = ranked[0]?.totalScore ?? 0;
  const holesPlayed = Math.max(0, ...players.map((p) => p.holeScores.length));

  function rankOf(p: PlayerView): number {
    return ranked.filter((other) => other.totalScore < p.totalScore).length + 1;
  }

  return (
    <div className="scores-panel" role="dialog" aria-label="Scores">
      <div className="scores-header">
        <strong>Scores</strong>
        <button className="scores-close" onClick={onClose} aria-label="Close scores">
          ✕
        </button>
      </div>

      <div className="scores-body">
        <ol className="standings">
          {ranked.map((p) => (
            <li key={p.id} className={p.id === myPlayerId ? 'standings-me' : ''}>
              <span className="standings-rank">{rankOf(p)}</span>
              <span className="standings-name">
                {p.name}
                {p.id === myPlayerId && ' (you)'}
              </span>
              <span className="standings-total">{p.totalScore}</span>
              <span className="standings-gap">{p.totalScore === lowest ? 'lead' : `+${p.totalScore - lowest}`}</span>
            </li>
          ))}
        </ol>

        {holesPlayed === 0 ? (
          <p className="scores-empty">No holes finished yet — hole scores appear here after hole 1.</p>
        ) : (
          <div className="scores-table-wrap">
            <table className="scores-table">
              <thead>
                <tr>
                  <th>Hole</th>
                  {players.map((p) => (
                    <th key={p.id} className={p.id === myPlayerId ? 'scores-me' : ''}>
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: holesPlayed }, (_, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    {players.map((p) => (
                      <td key={p.id} className={p.id === myPlayerId ? 'scores-me' : ''}>
                        {p.holeScores[i] ?? '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  {players.map((p) => (
                    <td key={p.id} className={p.id === myPlayerId ? 'scores-me' : ''}>
                      {p.totalScore}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
