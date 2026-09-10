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
}

export function GameBoard({ state, playerId, onPeek, onDrawDraw, onDrawDiscard, onSwap, onDiscard, onNextHole }: GameBoardProps) {
  const [selectedPeekSlots, setSelectedPeekSlots] = useState<number[]>([]);

  const me = state.players.find((p) => p.id === playerId);
  const others = state.players.filter((p) => p.id !== playerId);
  const amAwaitingPeek = state.playersAwaitingPeek.includes(playerId);
  const isMyTurn = state.currentPlayerId === playerId;
  const isHost = state.hostId === playerId;
  const myPendingDraw = isMyTurn && me?.hasPendingDraw ? { card: me.pendingDrawCard, source: me.pendingDrawSource } : null;
  const canDraw = isMyTurn && !amAwaitingPeek && (state.phase === 'turn' || state.phase === 'final-turns') && !me?.hasPendingDraw;

  useEffect(() => {
    setSelectedPeekSlots([]);
  }, [amAwaitingPeek, state.holeNumber]);

  if (!me) return null;

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
      </header>

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

      {state.phase === 'complete' && (
        <Scoreboard players={state.players} holeNumber={state.holeNumber} matchComplete={state.matchComplete} isHost={isHost} onNextHole={onNextHole} />
      )}
    </div>
  );
}
