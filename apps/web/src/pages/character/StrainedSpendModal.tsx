import { useState } from 'react';
import { Button, Modal } from '../../primitives';

// Pass 3 Slice 2a — Talent strained-spend confirmation modal.
//
// Surfaced on a Talent ability click when the spend would push clarity below
// zero, when the Talent is already strained, or when the Talent has the Psion
// (10th-level) feature regardless of spend amount. The modal shows the
// projected clarity-after value and, for Psions, exposes the two opt
// toggles that ride along with the UseAbility intent:
//
//   - talentStrainedOptInRider  (Psion + spend would NOT strain):
//       opt INTO the Strained: rider voluntarily.
//   - talentClarityDamageOptOutThisTurn  (Psion + spend WOULD strain):
//       opt OUT of taking EoT clarity damage this turn.
//
// The modal is intentionally pure: confirmation calls onConfirm with the
// toggle bag; cancellation calls onCancel. The parent owns intent dispatch
// and is responsible for deciding when to open the modal.

export interface StrainedSpendModalProps {
  open: boolean;
  abilityName: string;
  currentClarity: number;
  spendCost: number;
  isPsion: boolean;
  onCancel: () => void;
  onConfirm: (toggles: {
    talentStrainedOptInRider?: boolean;
    talentClarityDamageOptOutThisTurn?: boolean;
  }) => void;
}

export function StrainedSpendModal({
  open,
  abilityName,
  currentClarity,
  spendCost,
  isPsion,
  onCancel,
  onConfirm,
}: StrainedSpendModalProps) {
  const projected = currentClarity - spendCost;
  const willBeStrained = projected < 0;
  const wasStrained = currentClarity < 0;

  const showOptInRider = isPsion && !willBeStrained && !wasStrained;
  const showOptOutDamage = isPsion && willBeStrained;

  const [optInRider, setOptInRider] = useState(false);
  const [optOutDamage, setOptOutDamage] = useState(false);

  const handleConfirm = () => {
    const toggles: {
      talentStrainedOptInRider?: boolean;
      talentClarityDamageOptOutThisTurn?: boolean;
    } = {};
    if (showOptInRider && optInRider) toggles.talentStrainedOptInRider = true;
    if (showOptOutDamage && optOutDamage) toggles.talentClarityDamageOptOutThisTurn = true;
    onConfirm(toggles);
  };

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={<>Spend clarity — {abilityName}</>}
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
            Clarity after
          </span>
          <span
            data-testid="strained-projected"
            className={`font-mono text-2xl font-bold tabular-nums ${
              willBeStrained ? 'text-foe' : 'text-text'
            }`}
          >
            {projected}
          </span>
        </div>

        <p className="text-xs text-text-mute leading-snug">
          Current {currentClarity} − spend {spendCost}
        </p>

        {willBeStrained && (
          <p
            data-testid="strained-warning"
            className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foe"
          >
            You will be strained — take damage = strained value at end of each turn.
          </p>
        )}

        {showOptInRider && (
          <label
            htmlFor="psion-opt-in-rider"
            className="flex items-start gap-2 min-h-11 cursor-pointer border border-line-soft p-2"
          >
            <input
              id="psion-opt-in-rider"
              data-testid="psion-opt-in-rider"
              type="checkbox"
              checked={optInRider}
              onChange={(e) => setOptInRider(e.target.checked)}
              className="mt-1 h-4 w-4"
            />
            <span className="text-sm text-text leading-snug">
              <span className="font-semibold">Opt into the rider.</span>
              <span className="ml-1 text-text-mute">
                Become Strained voluntarily to add the ability&apos;s Strained: rider this use.
              </span>
            </span>
          </label>
        )}

        {showOptOutDamage && (
          <label
            htmlFor="psion-opt-out-damage"
            className="flex items-start gap-2 min-h-11 cursor-pointer border border-line-soft p-2"
          >
            <input
              id="psion-opt-out-damage"
              data-testid="psion-opt-out-damage"
              type="checkbox"
              checked={optOutDamage}
              onChange={(e) => setOptOutDamage(e.target.checked)}
              className="mt-1 h-4 w-4"
            />
            <span className="text-sm text-text leading-snug">
              <span className="font-semibold">Skip the strained damage this turn.</span>
              <span className="ml-1 text-text-mute">
                Psion feature — opt out of taking strained damage at the end of this turn.
              </span>
            </span>
          </label>
        )}
      </div>
    </Modal>
  );
}
