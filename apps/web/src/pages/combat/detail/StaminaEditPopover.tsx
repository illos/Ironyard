import type { SetStaminaPayload } from '@ironyard/shared';
import { useState } from 'react';
import { Button } from '../../../primitives';

export interface StaminaEditPopoverProps {
  participantId: string;
  current: number;
  max: number;
  disabled: boolean;
  onApply: (payload: SetStaminaPayload) => void;
  onClose: () => void;
}

export function StaminaEditPopover({
  participantId,
  current,
  max,
  disabled,
  onApply,
  onClose,
}: StaminaEditPopoverProps) {
  const [currentInput, setCurrentInput] = useState(String(current));
  const [maxInput, setMaxInput] = useState(String(max));
  const parsedCurrent = Number.parseInt(currentInput, 10);
  const parsedMax = Number.parseInt(maxInput, 10);
  const validMax = Number.isFinite(parsedMax) && parsedMax >= 1;
  const effectiveMax = validMax ? parsedMax : max;
  const validCurrent =
    Number.isFinite(parsedCurrent) && parsedCurrent >= 0 && parsedCurrent <= effectiveMax;
  const canApply = !disabled && validMax && validCurrent;

  return (
    <div className="mt-3 border border-line bg-ink-0 p-3 text-sm">
      <div className="flex gap-3 items-end flex-wrap">
        <label className="flex flex-col text-xs text-text-dim">
          Current
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={effectiveMax}
            value={currentInput}
            onChange={(e) => setCurrentInput(e.target.value)}
            className="mt-1 w-24 min-h-11 bg-ink-1 border border-line px-2 py-1 text-base font-mono tabular-nums text-text"
          />
        </label>
        <label className="flex flex-col text-xs text-text-dim">
          Max
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={maxInput}
            onChange={(e) => setMaxInput(e.target.value)}
            className="mt-1 w-24 min-h-11 bg-ink-1 border border-line px-2 py-1 text-base font-mono tabular-nums text-text"
          />
        </label>
        <div className="ml-auto flex gap-2">
          <Button type="button" onClick={onClose} className="min-h-11">
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={!canApply}
            onClick={() => {
              onApply({
                participantId,
                currentStamina: parsedCurrent,
                maxStamina: parsedMax,
              });
              onClose();
            }}
            className="min-h-11"
          >
            Apply
          </Button>
        </div>
      </div>
      {!validCurrent && <p className="mt-2 text-xs text-foe">Current must be between 0 and Max.</p>}
      {!validMax && <p className="mt-2 text-xs text-foe">Max must be at least 1.</p>}
    </div>
  );
}
