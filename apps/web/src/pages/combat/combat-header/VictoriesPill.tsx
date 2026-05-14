import { Pill } from '../../../primitives';

export interface VictoriesPillProps {
  victories: number;
  /** When false, renders display-only (no +/-). */
  editable: boolean;
  onIncrement?: () => void;
  onDecrement?: () => void;
  disabled?: boolean;
}

export function VictoriesPill({
  victories,
  editable,
  onIncrement,
  onDecrement,
  disabled,
}: VictoriesPillProps) {
  return (
    <Pill dotClassName="bg-victory">
      {editable && (
        <button
          type="button"
          onClick={onDecrement}
          disabled={disabled}
          className="px-1.5 text-victory hover:text-text disabled:opacity-40"
          aria-label="Decrement victories"
        >
          −
        </button>
      )}
      <span className="font-mono uppercase tracking-[0.08em] text-text-mute">
        Victories <b className="text-text font-sans">{victories}</b>
      </span>
      {editable && (
        <button
          type="button"
          onClick={onIncrement}
          disabled={disabled}
          className="px-1.5 text-victory hover:text-text disabled:opacity-40"
          aria-label="Increment victories"
        >
          +
        </button>
      )}
    </Pill>
  );
}
