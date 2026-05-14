import { Pill } from '../../../primitives';

export interface MalicePillProps {
  malice: number;
  // Task 31 will add `editable: boolean` — for now both buttons always render.
  onGain: () => void;
  onSpend: () => void;
  disabled: boolean;
}

export function MalicePill({ malice, onGain, onSpend, disabled }: MalicePillProps) {
  return (
    <Pill dotClassName="bg-foe">
      <button
        type="button"
        onClick={onSpend}
        disabled={disabled}
        className="px-1.5 text-foe hover:text-text disabled:opacity-40"
        aria-label="Spend 1 Malice"
      >
        −
      </button>
      <span className="font-mono uppercase tracking-[0.08em] text-text-mute">
        Malice <b className="text-text font-sans">{malice}</b>
      </span>
      <button
        type="button"
        onClick={onGain}
        disabled={disabled}
        className="px-1.5 text-foe hover:text-text disabled:opacity-40"
        aria-label="Gain 1 Malice"
      >
        +
      </button>
    </Pill>
  );
}
