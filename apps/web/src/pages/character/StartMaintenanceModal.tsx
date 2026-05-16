import { useState } from 'react';
import { Button, Modal } from '../../primitives';

// Pass 3 Slice 2a — Elementalist sustained-use maintenance confirmation modal.
//
// Surfaced on the first Use of an Elementalist sustained ability. Shows the
// per-turn essence cost and the projected essence next turn
// (`currentEssence + baseGainPerTurn - costPerTurn`). If the projection is
// negative, warns the player that the ability may auto-drop next turn.
//
// The "Maintain after use" toggle defaults to ON; confirmation passes the
// toggle state to onConfirm. Cancellation calls onCancel.
//
// The modal is intentionally pure — the parent owns intent dispatch and is
// responsible for deciding when to open it.

export interface StartMaintenanceModalProps {
  open: boolean;
  abilityName: string;
  costPerTurn: number;
  currentEssence: number;
  baseGainPerTurn: number;
  onCancel: () => void;
  onConfirm: (startMaintenance: boolean) => void;
}

export function StartMaintenanceModal({
  open,
  abilityName,
  costPerTurn,
  currentEssence,
  baseGainPerTurn,
  onCancel,
  onConfirm,
}: StartMaintenanceModalProps) {
  const projected = currentEssence + baseGainPerTurn - costPerTurn;
  const mayAutoDrop = projected < 0;

  const [startMaintenance, setStartMaintenance] = useState(true);

  const handleConfirm = () => {
    onConfirm(startMaintenance);
  };

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={<>Sustain — {abilityName}</>}
      footer={
        <>
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            className="min-h-11"
            aria-label="Cancel"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleConfirm}
            className="min-h-11"
            aria-label="Confirm"
          >
            Confirm
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-mute">
            Cost per turn
          </span>
          <span
            data-testid="maintenance-cost-per-turn"
            className="font-mono text-2xl font-bold tabular-nums text-text"
          >
            {costPerTurn}
          </span>
        </div>

        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-mute">
            Essence next turn
          </span>
          <span
            data-testid="maintenance-projected"
            className={`font-mono text-2xl font-bold tabular-nums ${
              mayAutoDrop ? 'text-foe' : 'text-text'
            }`}
          >
            {projected}
          </span>
        </div>

        <p className="text-xs text-text-mute leading-snug">
          Current {currentEssence} + gain {baseGainPerTurn} − upkeep {costPerTurn}
        </p>

        {mayAutoDrop && (
          <p
            data-testid="maintenance-autodrop-warning"
            className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foe"
          >
            Essence may go negative — sustained ability may auto-drop next turn.
          </p>
        )}

        <label
          htmlFor="maintenance-toggle"
          className="flex items-start gap-2 min-h-11 cursor-pointer border border-line-soft p-2"
        >
          <input
            id="maintenance-toggle"
            data-testid="maintenance-toggle"
            type="checkbox"
            checked={startMaintenance}
            onChange={(e) => setStartMaintenance(e.target.checked)}
            className="mt-1 h-4 w-4"
          />
          <span className="text-sm text-text leading-snug">
            <span className="font-semibold">Maintain after use.</span>
            <span className="ml-1 text-text-mute">
              Spend {costPerTurn} essence at the start of each of your turns to keep this ability
              active.
            </span>
          </span>
        </label>
      </div>
    </Modal>
  );
}
