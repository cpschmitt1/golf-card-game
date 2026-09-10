import type { GridSlotView } from '@golf/engine';
import { CardView } from './CardView.js';

interface PlayerGridViewProps {
  grid: GridSlotView[];
  selectedSlots?: number[];
  onSlotClick?: (slotIndex: number) => void;
  size?: 'normal' | 'small';
}

export function PlayerGridView({ grid, selectedSlots = [], onSlotClick, size = 'normal' }: PlayerGridViewProps) {
  return (
    <div className={`player-grid ${size === 'small' ? 'player-grid-small' : ''}`}>
      {grid.map((slot, index) => (
        <CardView
          key={index}
          card={slot.card}
          faceUp={slot.faceUp}
          selected={selectedSlots.includes(index)}
          size={size}
          onClick={onSlotClick ? () => onSlotClick(index) : undefined}
        />
      ))}
    </div>
  );
}
