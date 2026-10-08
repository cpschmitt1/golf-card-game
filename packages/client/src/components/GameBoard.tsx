import { useEffect, useState } from 'react';
import type { AckResponse, GameStateView } from '@golf/engine';
import { CardView } from './CardView.js';
import { PlayerGridView } from './PlayerGridView.js';
import { ScoresPanel } from './ScoresPanel.js';
import { DisconnectedDot } from './DisconnectedDot.js';

interface GameBoardProps {
  state: GameStateView;
  playerId: string;
  onPeek: (slots: [number, number]) => void;
  onDrawDraw: () => void;
  onDrawDiscard: () => void;
  onSwap: (slotIndex: number) => void;
  onDiscard: () => void;
  onNudge: (done: (res: AckResponse<null>) => void) => void;
  onNextHole: () => void;
  onEndMatch: () => void;
  onPlayAgain: () => void;
  onLeave: () => void;
}

export function GameBoard({
  state,
  playerId,
  onPeek,
  onDrawDraw,
  onDrawDiscard,
  onSwap,
  onDiscard,
  onNudge,
  onNextHole,
  onEndMatch,
  onPlayAgain,
  onLeave,
}: GameBoardProps) {
  const [selectedPeekSlots, setSelectedPeekSlots] = useState<number[]>([]);
  const [nudge, setNudge] = useState<{ sent: boolean; message: string } | null>(null);
  const [scoresOpen, setScoresOpen] = useState(false);
  const [dealerLabelOpen, setDealerLabelOpen] = useState(false);

  const me = state.players.find((p) => p.id === playerId);
  const others = state.players.filter((p) => p.id !== playerId);
  const amAwaitingPeek = state.playersAwaitingPeek.includes(playerId);
  const isMyTurn = state.currentPlayerId === playerId;
  const isHost = state.hostId === playerId;
  const myPendingDraw = isMyTurn && me?.hasPendingDraw ? { card: me.pendingDrawCard, source: me.pendingDrawSource } : null;
  const canDraw = isMyTurn && !amAwaitingPeek && (state.phase === 'turn' || state.phase === 'final-turns') && !me?.hasPendingDraw;
  // A hole that ended normally reveals every card as part of scoring; a hole discarded by
  // "End Match" mid-round does not (it's void and never scored). That difference decides whether
  // the last entry in holeScores is actually this hole's score, so only show it in the first case.
  const allRevealed = state.players.every((p) => p.grid.every((slot) => slot.faceUp));
  const holeScored = state.phase === 'complete' && allRevealed;
  const hasCompletedHoles = state.players.some((p) => p.holeScores.length > 0);
  const lowestTotal = Math.min(...state.players.map((p) => p.totalScore));

  function scoreLine(p: { holeScores: number[]; totalScore: number }) {
    const hole = holeScored && p.holeScores.length > 0 ? p.holeScores[p.holeScores.length - 1] : null;
    return hole === null ? `Total: ${p.totalScore}` : `This hole: ${hole} · Total: ${p.totalScore}`;
  }
  function isWinner(p: { totalScore: number }) {
    return state.matchComplete && hasCompletedHoles && p.totalScore === lowestTotal;
  }

  useEffect(() => {
    setSelectedPeekSlots([]);
  }, [amAwaitingPeek, state.holeNumber]);

  // A nudge result only describes whoever was up when it was sent.
  useEffect(() => {
    setNudge(null);
  }, [state.currentPlayerId]);

  // Phones have no hover, so tapping the "D" chip briefly spells it out as "Dealer".
  useEffect(() => {
    if (!dealerLabelOpen) return;
    const timer = setTimeout(() => setDealerLabelOpen(false), 2500);
    return () => clearTimeout(timer);
  }, [dealerLabelOpen]);

  // Swaps the page background to red for the final round (see body.final-round in styles.css);
  // the cleanup also covers leaving the game or the hole ending, which both unmount/change phase.
  const isFinalRound = state.phase === 'final-turns';
  useEffect(() => {
    if (!isFinalRound) return;
    document.body.classList.add('final-round');
    return () => document.body.classList.remove('final-round');
  }, [isFinalRound]);

  if (!me) return null;

  function handleEndMatch() {
    if (window.confirm('End the match now? This discards the current hole for everyone.')) {
      onEndMatch();
    }
  }

  function handleMySlotClick(index: number) {
    if (amAwaitingPeek) {
      setSelectedPeekSlots((prev) => {
        if (prev.includes(index)) return prev.filter((i) => i !== index);
        if (prev.length >= 2) return prev;
        return [...prev, index];
      });
      return;
    }
    if (myPendingDraw) {
      onSwap(index);
    }
  }

  const currentPlayerName = state.players.find((p) => p.id === state.currentPlayerId)?.name ?? '';
  const finisherName = state.players.find((p) => p.id === state.finisherId)?.name ?? '';
  const dealerId = state.players[state.dealerIndex]?.id ?? null;
  const dealerName = state.players[state.dealerIndex]?.name ?? '';
  // During the peek phase currentPlayerId is the first player to act (the seat after the dealer).
  const firstPlayerName = state.players.find((p) => p.id === state.currentPlayerId)?.name ?? '';
  const peekNote =
    state.phase === 'peek'
      ? `${dealerId === playerId ? "You're" : `${dealerName} is`} dealing — ${
          state.currentPlayerId === playerId ? 'you go' : `${firstPlayerName} goes`
        } first`
      : null;

  const dealerChip = (
    <span
      className={`dealer-chip ${dealerLabelOpen ? 'dealer-chip-open' : ''}`}
      title="Dealer"
      onClick={() => setDealerLabelOpen(true)}
    >
      {dealerLabelOpen ? 'Dealer' : 'D'}
    </span>
  );
  const canNudge = !isMyTurn && !!state.currentPlayerId && (state.phase === 'turn' || state.phase === 'final-turns');

  function handleNudge() {
    onNudge((res) => setNudge(res.ok ? { sent: true, message: `Nudge sent to ${currentPlayerName}.` } : { sent: false, message: res.error }));
  }

  return (
    <div className="screen game-screen">
      <header className="game-header">
        <div className="header-left">
          <div>
            Hole <strong>{state.holeNumber}</strong> / 18
          </div>
          <button className="scores-button" onClick={() => setScoresOpen((open) => !open)}>
            📊 Scores
          </button>
        </div>
        <div className="turn-status">
          {state.phase === 'complete' ? (
            state.matchComplete ? (
              'Match complete'
            ) : (
              `Hole ${state.holeNumber} complete`
            )
          ) : amAwaitingPeek ? (
            'Choose 2 of your cards to reveal'
          ) : state.phase === 'peek' ? (
            `Waiting for ${state.playersAwaitingPeek.length} player(s) to peek…`
          ) : state.phase === 'final-turns' ? (
            <>
              <div className="final-round-note">Final round — {finisherName} finished!</div>
              <div>{isMyTurn ? 'Your turn' : `${currentPlayerName}'s turn`}</div>
            </>
          ) : isMyTurn ? (
            'Your turn'
          ) : (
            `${currentPlayerName}'s turn`
          )}
        </div>
        {isHost && !state.matchComplete && (
          <button className="end-match-button" onClick={handleEndMatch}>
            End Match
          </button>
        )}
      </header>

      {peekNote && <div className="peek-note">{peekNote}</div>}

      {canNudge && (
        <div className="nudge-row">
          <button className="nudge-button" disabled={nudge?.sent === true} onClick={handleNudge}>
            👋 Nudge {currentPlayerName}
          </button>
          {nudge && <span className={nudge.sent ? 'hint' : 'error-text'}>{nudge.message}</span>}
        </div>
      )}

      <section className="opponents-row">
        {others.map((p) => (
          <div
            key={p.id}
            className={`opponent ${state.currentPlayerId === p.id ? 'opponent-active' : ''} ${p.connected ? '' : 'opponent-disconnected'}`}
          >
            <div className="opponent-name">
              {isWinner(p) && '🏆 '}
              {p.name}
              {p.id === dealerId && dealerChip}
              {!p.connected && <DisconnectedDot />}
              {state.playersAwaitingPeek.includes(p.id) && <span className="badge">peeking</span>}
            </div>
            <PlayerGridView grid={p.grid} size="small" />
            <div className="opponent-total">{scoreLine(p)}</div>
          </div>
        ))}
      </section>

      <section className="table-center">
        <div className="pile draw-pile" onClick={canDraw ? onDrawDraw : undefined}>
          <CardView card={null} faceUp={false} highlighted={canDraw} />
          <div className="pile-count">{state.drawPileCount} left</div>
        </div>

        <div className="pending-draw-area">
          {myPendingDraw?.card && (
            <div className="pending-draw">
              <div className="hint">You drew:</div>
              <CardView card={myPendingDraw.card} faceUp />
              <div className="pending-draw-actions">
                {myPendingDraw.source === 'draw' ? (
                  <>
                    <button onClick={onDiscard}>Discard</button>
                    <span className="hint">or click a card below to swap</span>
                  </>
                ) : (
                  <span className="hint">Locked in — click a card below to swap it in</span>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="pile discard-pile" onClick={canDraw && state.discardTop ? onDrawDiscard : undefined}>
          <CardView card={state.discardTop} faceUp={state.discardTop !== null} highlighted={canDraw && !!state.discardTop} />
          <div className="pile-count">discard</div>
        </div>
      </section>

      <section className="my-area">
        <div className="opponent-name">
          {isWinner(me) && '🏆 '}
          {me.name} <span className="badge badge-you">you</span>
          {me.id === dealerId && dealerChip}
        </div>
        <PlayerGridView grid={me.grid} selectedSlots={selectedPeekSlots} onSlotClick={handleMySlotClick} />
        {amAwaitingPeek && (
          <button disabled={selectedPeekSlots.length !== 2} onClick={() => onPeek(selectedPeekSlots as [number, number])}>
            Confirm Peek
          </button>
        )}
        <div className="opponent-total">{scoreLine(me)}</div>
      </section>

      {state.phase === 'complete' && (
        <section className="hole-end-bar">
          {!state.matchComplete && (
            <>
              <h2>Hole {state.holeNumber} complete</h2>
              {isHost ? (
                <button onClick={onNextHole}>Start Hole {state.holeNumber + 1}</button>
              ) : (
                <p className="hint">Waiting for the host to start the next hole…</p>
              )}
            </>
          )}
          {state.matchComplete && (
            <>
              <h2>Match complete</h2>
              <p className="hint">
                {hasCompletedHoles ? 'Lowest score wins!' : 'Match ended before any hole finished — no scores to show.'}
              </p>
              {isHost ? (
                <button onClick={onPlayAgain}>Play Again</button>
              ) : (
                <p className="hint">Waiting for the host to start a new match…</p>
              )}
            </>
          )}
          <button className="link-button" onClick={onLeave}>
            Leave game
          </button>
        </section>
      )}

      {scoresOpen && <ScoresPanel players={state.players} myPlayerId={playerId} onClose={() => setScoresOpen(false)} />}
    </div>
  );
}
