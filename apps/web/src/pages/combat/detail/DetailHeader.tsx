import {
  type Participant,
  type RemoveConditionPayload,
  type SetConditionPayload,
  type SetStaminaPayload,
} from '@ironyard/shared';
import { useState } from 'react';
import { HpBar, Section } from '../../../primitives';
import { RoleReadout } from '../rails/RoleReadout';
import { roleReadoutFor } from '../rails/rail-utils';
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
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-mute">
              <RoleReadout data={roleReadoutFor(focused)} />
            </span>
            {focused.kind === 'monster' && focused.ancestry.length > 0 && (
              <span className="flex gap-1">
                {focused.ancestry.map((a) => (
                  <span
                    key={a}
                    className="font-mono text-[9px] uppercase tracking-[0.06em] text-text-mute bg-ink-2 border border-line px-1"
                  >
                    {a}
                  </span>
                ))}
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
