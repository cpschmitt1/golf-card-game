import { useEffect, useState } from 'react';
import type { GameStateView } from '@golf/engine';
import { CardView } from './CardView.js';
import { PlayerGridView } from './PlayerGridView.js';
import { Scoreboard } from './Scoreboard.js';

interface GameBoardProps {
  state: GameStateView;
  playerId: string;
  onPeek: (slots: [number, number]) => void;
  onDrawDraw: () => void;
  onDrawDiscard: () => void;
  onSwap: (slotIndex: number) => void;
  onDiscard: () => void;
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
  onNextHole,
  onEndMatch,
  onPlayAgain,
  onLeave,
}: GameBoardProps) {
  const [selectedPeekSlots, setSelectedPeekSlots] = useState<number[]>([]);
  const [readyForScoreboard, setReadyForScoreboard] = useState(false);

  const me = state.players.find((p) => p.id === playerId);
  const others = state.players.filter((p) => p.id !== playerId);
  const amAwaitingPeek = state.playersAwaitingPeek.includes(playerId);
  const isMyTurn = state.currentPlayerId === playerId;
  const isHost = state.hostId === playerId;
  const myPendingDraw = isMyTurn && me?.hasPendingDraw ? { card: me.pendingDrawCard, source: me.pendingDrawSource } : null;
  const canDraw = isMyTurn && !amAwaitingPeek && (state.phase === 'turn' || state.phase === 'final-turns') && !me?.hasPendingDraw;
  // A hole that ended normally reveals every card as part of scoring; a hole discarded by
  // "End Match" mid-round does not (it's void, so there's nothing new to show). That difference
  // is exactly the signal for whether the "here's everyone's final hand" pause is worth showing.
  const allRevealed = state.players.every((p) => p.grid.every((slot) => slot.faceUp));
  const showReveal = state.phase === 'complete' && allRevealed && !readyForScoreboard;
  const showScoreboard = state.phase === 'complete' && (!allRevealed || readyForScoreboard);

  useEffect(() => {
    setSelectedPeekSlots([]);
  }, [amAwaitingPeek, state.holeNumber]);

  useEffect(() => {
    setReadyForScoreboard(false);
  }, [state.holeNumber]);

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

  return (
    <div className="screen game-screen">
      <header className="game-header">
        <div>
          Hole <strong>{state.holeNumber}</strong> / 18
        </div>
        <div className="turn-status">
          {amAwaitingPeek
            ? 'Choose 2 of your cards to reveal'
            : state.phase === 'peek'
              ? `Waiting for ${state.playersAwaitingPeek.length} player(s) to peek…`
              : state.phase === 'final-turns'
                ? `Final round — ${finisherName} finished! Everyone gets one more turn.`
                : isMyTurn
                  ? 'Your turn'
                  : `${currentPlayerName}'s turn`}
        </div>
        {isHost && !state.matchComplete && (
          <button className="end-match-button" onClick={handleEndMatch}>
            End Match
          </button>
        )}
      </header>

      {showReveal && (
        <div className="reveal-banner">
          <p>Hole {state.holeNumber} is over — here's everyone's final hand.</p>
          <button onClick={() => setReadyForScoreboard(true)}>See Scores →</button>
        </div>
      )}

      <section className="opponents-row">
        {others.map((p) => (
          <div key={p.id} className={`opponent ${state.currentPlayerId === p.id ? 'opponent-active' : ''}`}>
            <div className="opponent-name">
              {p.name}
              {!p.connected && <span className="badge badge-disconnected">disconnected</span>}
              {state.playersAwaitingPeek.includes(p.id) && <span className="badge">peeking</span>}
            </div>
            <PlayerGridView grid={p.grid} size="small" />
            <div className="opponent-total">Total: {p.totalScore}</div>
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
          {me.name} <span className="badge badge-you">you</span>
        </div>
        <PlayerGridView grid={me.grid} selectedSlots={selectedPeekSlots} onSlotClick={handleMySlotClick} />
        {amAwaitingPeek && (
          <button disabled={selectedPeekSlots.length !== 2} onClick={() => onPeek(selectedPeekSlots as [number, number])}>
            Confirm Peek
          </button>
        )}
        <div className="opponent-total">Total: {me.totalScore}</div>
      </section>

      {showScoreboard && (
        <Scoreboard
          players={state.players}
          holeNumber={state.holeNumber}
          matchComplete={state.matchComplete}
          isHost={isHost}
          onNextHole={onNextHole}
          onPlayAgain={onPlayAgain}
          onLeave={onLeave}
        />
      )}
    </div>
  );
}
