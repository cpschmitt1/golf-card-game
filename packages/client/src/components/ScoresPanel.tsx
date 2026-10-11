import type { PlayerView } from '@golf/engine';

/** Extra bits shown only once the match is over: a winner line and the buttons for what to do next. */
export interface FinalResultsProps {
  isHost: boolean;
  /** False when the match was ended before any hole finished, so there's nothing to rank. */
  hasScores: boolean;
  restartBusy: boolean;
  restartError: string | null;
  onPlayAgain: () => void;
  onLeave: () => void;
}

interface ScoresPanelProps {
  players: PlayerView[];
  myPlayerId: string;
  onClose: () => void;
  final?: FinalResultsProps;
}

function winnerLine(winners: PlayerView[], myPlayerId: string): string {
  if (winners.length === 1) {
    return winners[0].id === myPlayerId
      ? `🏆 You win with ${winners[0].totalScore}!`
      : `🏆 ${winners[0].name} wins with ${winners[0].totalScore}!`;
  }
  return `🏆 Tied for the win: ${winners.map((p) => (p.id === myPlayerId ? 'you' : p.name)).join(' & ')} (${winners[0].totalScore})`;
}

export function ScoresPanel({ players, myPlayerId, onClose, final }: ScoresPanelProps) {
  const ranked = [...players].sort((a, b) => a.totalScore - b.totalScore);
  const lowest = ranked[0]?.totalScore ?? 0;
  const holesPlayed = Math.max(0, ...players.map((p) => p.holeScores.length));
  const winners = ranked.filter((p) => p.totalScore === lowest);

  function rankOf(p: PlayerView): number {
    return ranked.filter((other) => other.totalScore < p.totalScore).length + 1;
  }

  return (
    <div className="scores-panel" role="dialog" aria-label={final ? 'Final results' : 'Scores'}>
      <div className="scores-header">
        <strong>{final ? (final.hasScores ? 'Final Results' : 'Match Ended') : 'Scores'}</strong>
        <button className="scores-close" onClick={onClose} aria-label="Close scores">
          ✕
        </button>
      </div>

      <div className="scores-body">
        {final?.hasScores && <p className="scores-winner">{winnerLine(winners, myPlayerId)}</p>}
        {final && !final.hasScores && (
          <p className="scores-empty">The match ended before any hole finished — there are no scores to show.</p>
        )}

        {(!final || final.hasScores) && (
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
        )}

        {holesPlayed === 0 ? (
          !final && <p className="scores-empty">No holes finished yet — hole scores appear here after hole 1.</p>
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

      {final && (
        <div className="scores-footer">
          {final.isHost ? (
            <button disabled={final.restartBusy} onClick={final.onPlayAgain}>
              {final.restartBusy ? 'Starting…' : 'Play Again'}
            </button>
          ) : (
            <p className="hint">Waiting for the host to start a new match…</p>
          )}
          {final.restartError && <p className="error-text">{final.restartError}</p>}
          <button className="link-button" onClick={final.onLeave}>
            Leave game
          </button>
        </div>
      )}
    </div>
  );
}
