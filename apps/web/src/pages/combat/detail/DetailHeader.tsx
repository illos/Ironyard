import {
  type Participant,
  type RemoveConditionPayload,
  type SetConditionPayload,
  type SetStaminaPayload,
} from '@ironyard/shared';
import { useState } from 'react';
import { HpBar, Section } from '../../../primitives';
import { ConditionPickerPopover } from './ConditionPickerPopover';
import { StaminaEditPopover } from './StaminaEditPopover';

export interface DetailHeaderProps {
  focused: Participant;
  monsterLevel: number | null;
  canEditStamina?: boolean;
  canEditConditions?: boolean;
  dispatchSetStamina: (payload: SetStaminaPayload) => void;
  dispatchSetCondition: (payload: SetConditionPayload) => void;
  dispatchRemoveCondition: (payload: RemoveConditionPayload) => void;
}

export function DetailHeader({
  focused,
  monsterLevel,
  canEditStamina = true,
  canEditConditions = true,
  dispatchSetStamina,
  dispatchSetCondition,
  dispatchRemoveCondition,
}: DetailHeaderProps) {
  const [hpEditOpen, setHpEditOpen] = useState(false);

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex h-6 px-2 items-center justify-center rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                focused.kind === 'monster' ? 'bg-foe text-ink-0' : 'bg-accent text-ink-0'
              }`}
            >
              {focused.kind}
            </span>
            {focused.kind === 'monster' && monsterLevel !== null && (
              <span className="text-xs text-text-mute font-mono tabular-nums">
                L{monsterLevel}
              </span>
            )}
          </div>
          <h2 className="text-2xl font-semibold mt-1 text-text">{focused.name}</h2>
        </div>
      </header>

      <Section heading="Stamina" aria-label="stamina">
        <div className="flex items-baseline justify-between mb-2">
          <button
            type="button"
            onClick={() => canEditStamina && setHpEditOpen(true)}
            className="text-2xl font-mono tabular-nums font-semibold select-none cursor-pointer px-2 -mx-2 hover:bg-ink-2 active:bg-ink-3 text-text"
            title="Click to edit"
            disabled={!canEditStamina}
          >
            {focused.currentStamina}
            <span className="text-text-mute text-base"> / {focused.maxStamina}</span>
          </button>
        </div>
        <HpBar current={focused.currentStamina} max={focused.maxStamina} size="lg" />
        {hpEditOpen && (
          <StaminaEditPopover
            participantId={focused.id}
            current={focused.currentStamina}
            max={focused.maxStamina}
            disabled={!canEditStamina}
            onApply={dispatchSetStamina}
            onClose={() => setHpEditOpen(false)}
          />
        )}
      </Section>

      <Section heading="Conditions" aria-label="conditions">
        <ConditionPickerPopover
          participantId={focused.id}
          conditions={focused.conditions}
          disabled={!canEditConditions}
          canRemoveConditions={canEditConditions}
          dispatchSetCondition={dispatchSetCondition}
          dispatchRemoveCondition={dispatchRemoveCondition}
        />
      </Section>
    </>
  );
}
