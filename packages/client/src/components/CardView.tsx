import type { Card } from '@golf/engine';

interface CardViewProps {
  card: Card | null;
  faceUp: boolean;
  selected?: boolean;
  highlighted?: boolean;
  onClick?: () => void;
  size?: 'normal' | 'small';
}

export function CardView({ card, faceUp, selected, highlighted, onClick, size = 'normal' }: CardViewProps) {
  const classNames = ['card', size === 'small' ? 'card-small' : '', selected ? 'card-selected' : '', highlighted ? 'card-highlighted' : '', onClick ? 'card-clickable' : '']
    .filter(Boolean)
    .join(' ');

  if (!faceUp || !card) {
    return (
      <div className={`${classNames} card-back`} onClick={onClick}>
        <span className="card-back-pattern">⛳</span>
      </div>
    );
  }

  const isJoker = card.rank === 'JOKER';
  const isRed = card.suit === '♥' || card.suit === '♦';

  return (
    <div className={`${classNames} card-face ${isRed ? 'card-red' : 'card-black'} ${isJoker ? 'card-joker' : ''}`} onClick={onClick}>
      {isJoker ? (
        <span className="card-joker-label">JOKER</span>
      ) : (
        <>
          <span className="card-rank">{card.rank}</span>
          <span className="card-suit">{card.suit}</span>
        </>
      )}
    </div>
  );
}
