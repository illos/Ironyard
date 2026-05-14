import { Stat } from '../../../primitives';

export interface VictoriesPillProps {
  victories: number;
  // Task 32 will add `editable: boolean` + onIncrement/onDecrement + disabled.
  // For now: pure display, mirroring today's <Stat label="Victories" value={...} />.
  editable?: boolean;
  onIncrement?: () => void;
  onDecrement?: () => void;
  disabled?: boolean;
}

export function VictoriesPill({ victories, editable, onIncrement, onDecrement, disabled }: VictoriesPillProps) {
  if (!editable) {
    return <Stat label="Victories" value={victories} />;
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={onDecrement}
        disabled={disabled}
        className="px-1.5 text-text-mute hover:text-text disabled:opacity-40"
        aria-label="Decrement victories"
      >
        −
      </button>
      <Stat label="Victories" value={victories} />
      <button
        type="button"
        onClick={onIncrement}
        disabled={disabled}
        className="px-1.5 text-text-mute hover:text-text disabled:opacity-40"
        aria-label="Increment victories"
      >
        +
      </button>
    </span>
  );
}
