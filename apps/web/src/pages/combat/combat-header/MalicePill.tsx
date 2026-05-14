import { Pill } from '../../../primitives';

export interface MalicePillProps {
  malice: number;
  editable: boolean;
  onGain?: () => void;
  onSpend?: () => void;
  disabled?: boolean;
}

export function MalicePill({ malice, editable, onGain, onSpend, disabled }: MalicePillProps) {
  return (
    <Pill dotClassName="bg-foe">
      {editable && (
        <button
          type="button"
          onClick={onSpend}
          disabled={disabled}
          className="px-1.5 text-foe hover:text-text disabled:opacity-40"
          aria-label="Spend 1 Malice"
        >
          −
        </button>
      )}
      <span className="font-mono uppercase tracking-[0.08em] text-text-mute">
        Malice <b className="text-text font-sans">{malice}</b>
      </span>
      {editable && (
        <button
          type="button"
          onClick={onGain}
          disabled={disabled}
          className="px-1.5 text-foe hover:text-text disabled:opacity-40"
          aria-label="Gain 1 Malice"
        >
          +
        </button>
      )}
    </Pill>
  );
}
