import {
  type ConditionInstance,
  type ConditionType,
  type RemoveConditionPayload,
  type SetConditionPayload,
} from '@ironyard/shared';
import { useState } from 'react';
import { Button } from '../../../primitives';
import { ConditionChip } from '../ConditionChip';

const CONDITION_TYPES: ConditionType[] = [
  'Bleeding',
  'Dazed',
  'Frightened',
  'Grabbed',
  'Prone',
  'Restrained',
  'Slowed',
  'Taunted',
  'Weakened',
];

export interface ConditionPickerPopoverProps {
  participantId: string;
  conditions: ConditionInstance[];
  disabled: boolean;
  /** When false the × remove button is hidden on each condition chip. Defaults true. */
  canRemoveConditions?: boolean;
  dispatchSetCondition: (payload: SetConditionPayload) => void;
  dispatchRemoveCondition: (payload: RemoveConditionPayload) => void;
}

export function ConditionPickerPopover({
  participantId,
  conditions,
  disabled,
  canRemoveConditions = true,
  dispatchSetCondition,
  dispatchRemoveCondition,
}: ConditionPickerPopoverProps) {
  const [conditionMenuOpen, setConditionMenuOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          type="button"
          size="sm"
          onClick={() => setConditionMenuOpen((v) => !v)}
          disabled={disabled}
        >
          + Add
        </Button>
      </div>
      <div className="flex flex-wrap gap-2 mt-2">
        {conditions.length === 0 && (
          <span className="text-sm text-text-mute">None.</span>
        )}
        {conditions.map((c: ConditionInstance, idx) => (
          <ConditionChip
            key={`${c.type}-${c.source.id}-${idx}`}
            condition={c}
            removable={canRemoveConditions}
            onRemove={() =>
              dispatchRemoveCondition({ targetId: participantId, condition: c.type })
            }
          />
        ))}
      </div>
      {conditionMenuOpen && (
        <div className="mt-3 border border-line bg-ink-0 p-3 grid grid-cols-3 sm:grid-cols-5 gap-2">
          {CONDITION_TYPES.map((cond) => (
            <Button
              key={cond}
              type="button"
              onClick={() => {
                dispatchSetCondition({
                  targetId: participantId,
                  condition: cond,
                  source: { kind: 'effect', id: 'manual-override' },
                  duration: { kind: 'EoT' },
                });
                setConditionMenuOpen(false);
              }}
              className="min-h-11 w-full justify-center"
            >
              {cond}
            </Button>
          ))}
        </div>
      )}
    </>
  );
}
