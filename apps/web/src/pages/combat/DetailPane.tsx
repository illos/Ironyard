import {
  type Ability,
  type ConditionInstance,
  type ConditionType,
  IntentTypes,
  type Monster,
  type Participant,
  type RemoveConditionPayload,
  type RollPowerPayload,
  type SetConditionPayload,
  type SetStaminaPayload,
} from '@ironyard/shared';
import { useEffect, useMemo, useState } from 'react';
import { pcFreeStrike } from '../../data/monsterAbilities';
import { useLongPress } from '../../lib/longPress';
import { AbilityCard } from './AbilityCard';
import { ConditionChip } from './ConditionChip';
import { HpBar } from './HpBar';

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

type Props = {
  focused: Participant | null;
  // Everyone else in the encounter (target candidates).
  participants: Participant[];
  monsterLevelById: Map<string, number>;
  // Real monster data keyed by participant id (slice 10's `${monsterId}-instance-N`
  // convention). Used to pull the focused monster's full ability list.
  monsterByParticipantId: Map<string, Monster>;
  disabled: boolean;
  // Dispatch helpers wired by the parent CombatRun.
  dispatchRoll: (args: {
    ability: Ability;
    attacker: Participant;
    target: Participant;
    rolls: [number, number];
    source: 'manual' | 'auto';
  }) => void;
  dispatchSetCondition: (payload: SetConditionPayload) => void;
  dispatchRemoveCondition: (payload: RemoveConditionPayload) => void;
  dispatchSetStamina: (payload: SetStaminaPayload) => void;
};

export function DetailPane({
  focused,
  participants,
  monsterLevelById,
  monsterByParticipantId,
  disabled,
  dispatchRoll,
  dispatchSetCondition,
  dispatchRemoveCondition,
  dispatchSetStamina,
}: Props) {
  if (!focused) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-800 p-6 text-center text-sm text-neutral-500">
        Select a participant from initiative to see their detail.
      </div>
    );
  }

  return (
    <DetailBody
      focused={focused}
      participants={participants}
      monsterLevelById={monsterLevelById}
      monsterByParticipantId={monsterByParticipantId}
      disabled={disabled}
      dispatchRoll={dispatchRoll}
      dispatchSetCondition={dispatchSetCondition}
      dispatchRemoveCondition={dispatchRemoveCondition}
      dispatchSetStamina={dispatchSetStamina}
    />
  );
}

// Split into a separate component so per-focus state (target picker, popovers)
// resets cleanly when the parent switches focus.
function DetailBody({
  focused,
  participants,
  monsterLevelById,
  monsterByParticipantId,
  disabled,
  dispatchRoll,
  dispatchSetCondition,
  dispatchRemoveCondition,
  dispatchSetStamina,
}: Props & { focused: Participant }) {
  const candidates = useMemo(
    () => participants.filter((p) => p.id !== focused.id),
    [participants, focused.id],
  );
  const [targetId, setTargetId] = useState<string | null>(candidates[0]?.id ?? null);
  const target = candidates.find((p) => p.id === targetId) ?? null;
  const [hpEditOpen, setHpEditOpen] = useState(false);
  const [conditionMenuOpen, setConditionMenuOpen] = useState(false);

  // Resilient fallback if the currently-picked target leaves the encounter
  // (or focus shifts and the candidate list changes). Runs after render so we
  // don't set state inside the render path.
  useEffect(() => {
    if (targetId && !candidates.some((p) => p.id === targetId)) {
      setTargetId(candidates[0]?.id ?? null);
    } else if (targetId === null && candidates.length > 0) {
      setTargetId(candidates[0]?.id ?? null);
    }
  }, [targetId, candidates]);

  // Pull real abilities from the cached monsters.json for monster focus; PC
  // falls back to the single Free Strike stub until Phase 2 character sheets.
  // Only abilities with a powerRoll are rollable from the combat run; pure
  // traits (e.g. Crafty) are out-of-scope for the auto-roll loop.
  const abilities: Ability[] = useMemo(() => {
    if (focused.kind !== 'monster') return [pcFreeStrike()];
    const monster = monsterByParticipantId.get(focused.id);
    if (!monster) return [];
    return monster.abilities.filter((a) => a.powerRoll !== undefined);
  }, [focused, monsterByParticipantId]);

  const hpLongPress = useLongPress(() => setHpEditOpen(true), 500);

  const onRoll = (
    ability: Ability,
    args: { rolls: [number, number]; source: 'manual' | 'auto' },
  ) => {
    if (!target) return;
    dispatchRoll({ ability, attacker: focused, target, rolls: args.rolls, source: args.source });
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex h-6 px-2 items-center justify-center rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                focused.kind === 'monster'
                  ? 'bg-rose-900/40 text-rose-200'
                  : 'bg-sky-900/40 text-sky-200'
              }`}
            >
              {focused.kind}
            </span>
            {focused.kind === 'monster' && monsterLevelById.get(focused.id) !== undefined && (
              <span className="text-xs text-neutral-500 font-mono tabular-nums">
                L{monsterLevelById.get(focused.id)}
              </span>
            )}
          </div>
          <h2 className="text-2xl font-semibold mt-1">{focused.name}</h2>
        </div>
      </header>

      <section
        className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4"
        aria-label="stamina"
      >
        <div className="flex items-baseline justify-between mb-2">
          <h3 className="text-sm uppercase tracking-wider text-neutral-400">Stamina</h3>
          <div
            {...hpLongPress}
            className="text-2xl font-mono tabular-nums font-semibold select-none cursor-pointer rounded px-2 -mx-2 hover:bg-neutral-800/50 active:bg-neutral-800"
            title="Long-press (or right-click) to edit"
          >
            {focused.currentStamina}
            <span className="text-neutral-500 text-base"> / {focused.maxStamina}</span>
          </div>
        </div>
        <HpBar current={focused.currentStamina} max={focused.maxStamina} size="lg" />
        {hpEditOpen && (
          <StaminaEdit
            participantId={focused.id}
            current={focused.currentStamina}
            max={focused.maxStamina}
            disabled={disabled}
            onApply={dispatchSetStamina}
            onClose={() => setHpEditOpen(false)}
          />
        )}
      </section>

      <section aria-label="conditions">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm uppercase tracking-wider text-neutral-400">Conditions</h3>
          <button
            type="button"
            onClick={() => setConditionMenuOpen((v) => !v)}
            disabled={disabled}
            className="min-h-11 px-3 rounded-md border border-neutral-800 bg-neutral-900 text-sm hover:bg-neutral-800 disabled:opacity-50"
          >
            + Add
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {focused.conditions.length === 0 && (
            <span className="text-sm text-neutral-500">None.</span>
          )}
          {focused.conditions.map((c: ConditionInstance, idx) => (
            <ConditionChip
              key={`${c.type}-${c.source.id}-${idx}`}
              condition={c}
              onRemove={() => dispatchRemoveCondition({ targetId: focused.id, condition: c.type })}
            />
          ))}
        </div>
        {conditionMenuOpen && (
          <div className="mt-3 rounded-md border border-neutral-800 bg-neutral-950 p-3 grid grid-cols-3 sm:grid-cols-5 gap-2">
            {CONDITION_TYPES.map((cond) => (
              <button
                key={cond}
                type="button"
                onClick={() => {
                  dispatchSetCondition({
                    targetId: focused.id,
                    condition: cond,
                    source: { kind: 'effect', id: 'manual-override' },
                    duration: { kind: 'EoT' },
                  });
                  setConditionMenuOpen(false);
                }}
                className="min-h-11 rounded-md bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-sm font-medium"
              >
                {cond}
              </button>
            ))}
          </div>
        )}
      </section>

      <section aria-label="characteristics">
        <h3 className="text-sm uppercase tracking-wider text-neutral-400 mb-2">Characteristics</h3>
        <dl className="grid grid-cols-5 gap-1.5 text-center">
          {(Object.entries(focused.characteristics) as Array<[string, number]>).map(([k, v]) => (
            <div
              key={k}
              className="rounded-md bg-neutral-900/60 border border-neutral-800 px-2 py-2"
            >
              <dt className="text-[10px] uppercase tracking-wider text-neutral-500">{k}</dt>
              <dd className="font-mono tabular-nums text-lg">{v > 0 ? `+${v}` : v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-label="abilities">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <h3 className="text-sm uppercase tracking-wider text-neutral-400">Abilities</h3>
          {candidates.length > 0 && (
            <label className="text-sm flex items-center gap-2 text-neutral-300">
              <span className="text-xs text-neutral-500">Target</span>
              <select
                value={targetId ?? ''}
                onChange={(e) => setTargetId(e.target.value)}
                className="min-h-11 rounded-md bg-neutral-900 border border-neutral-800 px-2 py-1 text-sm"
              >
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {focused.kind === 'pc' && (
          <p className="mt-1 text-xs text-neutral-500">
            Quick-PC. Full sheet lands in Phase 2; for now the generic free strike keeps the loop
            testable.
          </p>
        )}
        <div className="mt-3 grid gap-3">
          {abilities.length === 0 && (
            <p className="text-sm text-neutral-500">
              No rollable abilities — this monster has only traits or no ability data loaded.
            </p>
          )}
          {abilities.map((ab) => (
            <AbilityCard
              key={ab.name}
              ability={ab}
              disabled={disabled || candidates.length === 0 || !target}
              onRoll={(ability, args) => onRoll(ability, args)}
            />
          ))}
        </div>
        {candidates.length === 0 && (
          <p className="mt-2 text-xs text-neutral-500">
            No valid target — add another participant.
          </p>
        )}
      </section>
    </div>
  );
}

function StaminaEdit({
  participantId,
  current,
  max,
  disabled,
  onApply,
  onClose,
}: {
  participantId: string;
  current: number;
  max: number;
  disabled: boolean;
  onApply: (payload: SetStaminaPayload) => void;
  onClose: () => void;
}) {
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
    <div className="mt-3 rounded-md border border-neutral-800 bg-neutral-950 p-3 text-sm">
      <div className="flex gap-3 items-end flex-wrap">
        <label className="flex flex-col text-xs text-neutral-400">
          Current
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={effectiveMax}
            value={currentInput}
            onChange={(e) => setCurrentInput(e.target.value)}
            className="mt-1 w-24 min-h-11 rounded-md bg-neutral-900 border border-neutral-800 px-2 py-1 text-base font-mono tabular-nums"
          />
        </label>
        <label className="flex flex-col text-xs text-neutral-400">
          Max
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={maxInput}
            onChange={(e) => setMaxInput(e.target.value)}
            className="mt-1 w-24 min-h-11 rounded-md bg-neutral-900 border border-neutral-800 px-2 py-1 text-base font-mono tabular-nums"
          />
        </label>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 px-3 rounded-md bg-neutral-800 text-neutral-200"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canApply}
            onClick={() => {
              onApply({
                participantId,
                currentStamina: parsedCurrent,
                maxStamina: parsedMax,
              });
              onClose();
            }}
            className="min-h-11 px-3 rounded-md bg-emerald-700 text-emerald-50 disabled:bg-neutral-800 disabled:text-neutral-500"
          >
            Apply
          </button>
        </div>
      </div>
      {!validCurrent && (
        <p className="mt-2 text-xs text-rose-400">Current must be between 0 and Max.</p>
      )}
      {!validMax && <p className="mt-2 text-xs text-rose-400">Max must be at least 1.</p>}
    </div>
  );
}

// Re-exporting the intent type identifiers used by the parent helps callers
// build the SetCondition / RemoveCondition payloads without re-importing from
// shared. Keep the import path stable.
export const COMBAT_INTENT_TYPES = {
  SetCondition: IntentTypes.SetCondition,
  RemoveCondition: IntentTypes.RemoveCondition,
  RollPower: IntentTypes.RollPower,
  SetStamina: IntentTypes.SetStamina,
} as const;
export type { RollPowerPayload };
