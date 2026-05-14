import { type StaticDataBundle, deriveCharacterRuntime } from '@ironyard/rules';
import {
  type Ability,
  type GainResourcePayload,
  HEROIC_RESOURCE_NAMES,
  type HeroicResourceName,
  type Monster,
  type Participant,
  type SetResourcePayload,
  type SpendRecoveryPayload,
  type SpendResourcePayload,
  type SpendSurgePayload,
} from '@ironyard/shared';
import { useEffect, useMemo, useState } from 'react';
import { useCharacter } from '../../../api/queries';
import { useWizardStaticData } from '../../../api/static-data';
import { pcFreeStrike } from '../../../data/monsterAbilities';
import { useLongPress } from '../../../lib/longPress';
import { Button, Section } from '../../../primitives';
import { AbilityCard } from '../AbilityCard';

export interface FullSheetTabProps {
  focused: Participant;
  participants: Participant[];
  monsterByParticipantId: Map<string, Monster>;
  disabled: boolean;
  canRoll?: boolean;
  /** Row-tap target from DirectorCombat (player view). Overrides the dropdown when set. */
  targetParticipantId?: string | null;
  dispatchRoll: (args: {
    ability: Ability;
    attacker: Participant;
    target: Participant;
    rolls: [number, number];
    source: 'manual' | 'auto';
  }) => void;
  dispatchGainResource: (payload: GainResourcePayload) => void;
  dispatchSpendResource: (payload: SpendResourcePayload) => void;
  dispatchSetResource: (payload: SetResourcePayload) => void;
  dispatchSpendSurge: (payload: SpendSurgePayload) => void;
  dispatchSpendRecovery: (payload: SpendRecoveryPayload) => void;
}

export function FullSheetTab({
  focused,
  participants,
  monsterByParticipantId,
  disabled,
  canRoll = true,
  targetParticipantId = null,
  dispatchRoll,
  dispatchGainResource,
  dispatchSpendResource,
  dispatchSetResource,
  dispatchSpendSurge,
  dispatchSpendRecovery,
}: FullSheetTabProps) {
  const candidates = useMemo(
    () => participants.filter((p) => p.id !== focused.id),
    [participants, focused.id],
  );
  const [targetId, setTargetId] = useState<string | null>(candidates[0]?.id ?? null);
  // Row-tap target (player view) takes precedence over the dropdown; when null,
  // the dropdown's local targetId is used — keeping director behaviour intact.
  const effectiveTargetId = targetParticipantId ?? targetId;
  const target = candidates.find((p) => p.id === effectiveTargetId) ?? null;

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

  // Pull real abilities from the cached monsters.json for monster focus, or
  // from the focused PC's derived runtime (mirrors PlayerSheetPanel). The PC
  // free-strike stub remains as a fallback when the character row isn't
  // attached or no rollable abilities are recorded. Only abilities with a
  // powerRoll are rollable from the combat run; pure traits / active-only
  // maneuvers stay on the sheet, not in the director's roll list.
  const focusedCharacter = useCharacter(
    focused.kind === 'pc' ? (focused.characterId ?? undefined) : undefined,
  );
  const staticData = useWizardStaticData();

  const abilities: Ability[] = useMemo(() => {
    if (focused.kind === 'monster') {
      const monster = monsterByParticipantId.get(focused.id);
      if (!monster) return [];
      return monster.abilities.filter((a) => a.powerRoll !== undefined);
    }
    // PC focus.
    if (!focusedCharacter.data || !staticData) return [pcFreeStrike()];
    const bundle: StaticDataBundle = {
      ancestries: staticData.ancestries as StaticDataBundle['ancestries'],
      careers: staticData.careers as StaticDataBundle['careers'],
      classes: staticData.classes as StaticDataBundle['classes'],
      kits: staticData.kits as StaticDataBundle['kits'],
      abilities: staticData.abilities as StaticDataBundle['abilities'],
      items: staticData.items as StaticDataBundle['items'],
      titles: staticData.titles as StaticDataBundle['titles'],
    };
    const runtime = deriveCharacterRuntime(focusedCharacter.data.data, bundle);
    const resolved = runtime.abilityIds
      .map((id) => bundle.abilities.get(id))
      .filter((a): a is Ability => !!a && a.powerRoll !== undefined);
    return resolved.length > 0 ? resolved : [pcFreeStrike()];
  }, [focused, monsterByParticipantId, focusedCharacter.data, staticData]);

  // Show the Quick-PC placeholder copy only while we're still on the stub —
  // either no character is attached, or the character has no rollable abilities.
  const showQuickPcCopy =
    focused.kind === 'pc' && (abilities.length === 0 || abilities[0]?.id === 'pc-free-strike');

  // Phase 5 mobile-UI pass will add a long-press affordance; for now plain
  // click opens the editor.
  void useLongPress;

  const onRoll = (
    ability: Ability,
    args: { rolls: [number, number]; source: 'manual' | 'auto' },
  ) => {
    if (!target) return;
    dispatchRoll({ ability, attacker: focused, target, rolls: args.rolls, source: args.source });
  };

  return (
    <>
      {focused.kind === 'pc' && (
        <ResourcesSection
          focused={focused}
          disabled={disabled}
          dispatchGainResource={dispatchGainResource}
          dispatchSpendResource={dispatchSpendResource}
          dispatchSetResource={dispatchSetResource}
          dispatchSpendSurge={dispatchSpendSurge}
          dispatchSpendRecovery={dispatchSpendRecovery}
        />
      )}

      <Section heading="Characteristics" aria-label="characteristics">
        <dl className="grid grid-cols-5 gap-1.5 text-center">
          {(Object.entries(focused.characteristics) as Array<[string, number]>).map(([k, v]) => (
            <div key={k} className="bg-ink-1 border border-line px-2 py-2">
              <dt className="text-[10px] uppercase tracking-wider text-text-mute">{k}</dt>
              <dd className="font-mono tabular-nums text-lg text-text">{v > 0 ? `+${v}` : v}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section
        heading="Abilities"
        aria-label="abilities"
        right={
          candidates.length > 0 ? (
            <label className="text-sm flex items-center gap-2 text-text-dim">
              <span className="text-xs text-text-mute">Target</span>
              <select
                value={targetId ?? ''}
                onChange={(e) => setTargetId(e.target.value)}
                className="min-h-11 bg-ink-0 border border-line px-2 py-1 text-sm text-text"
              >
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          ) : undefined
        }
      >
        {showQuickPcCopy && (
          <p className="text-xs text-text-mute">
            No class abilities ingested for this character — falling back to the generic free
            strike. Pick abilities in the wizard to populate the list.
          </p>
        )}
        <div className="mt-3 grid gap-3">
          {abilities.length === 0 && (
            <p className="text-sm text-text-mute">
              No rollable abilities — this monster has only traits or no ability data loaded.
            </p>
          )}
          {abilities.map((ab) => (
            <AbilityCard
              key={ab.name}
              ability={ab}
              disabled={!canRoll || disabled || candidates.length === 0 || !target}
              onRoll={(ability, args) => onRoll(ability, args)}
            />
          ))}
        </div>
        {candidates.length === 0 && (
          <p className="mt-2 text-xs text-text-mute">
            No valid target — add another participant.
          </p>
        )}
      </Section>
    </>
  );
}

function ResourcesSection({
  focused,
  disabled,
  dispatchGainResource,
  dispatchSpendResource,
  dispatchSetResource,
  dispatchSpendSurge,
  dispatchSpendRecovery,
}: {
  focused: Participant;
  disabled: boolean;
  dispatchGainResource: (payload: GainResourcePayload) => void;
  dispatchSpendResource: (payload: SpendResourcePayload) => void;
  dispatchSetResource: (payload: SetResourcePayload) => void;
  dispatchSpendSurge: (payload: SpendSurgePayload) => void;
  dispatchSpendRecovery: (payload: SpendRecoveryPayload) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const hasResources = focused.heroicResources.length > 0 || focused.extras.length > 0;
  const recoveriesAvailable =
    focused.recoveries.current > 0 && focused.currentStamina < focused.maxStamina;
  const surgesAvailable = focused.surges > 0;

  return (
    <Section
      heading="Resources"
      aria-label="resources"
      right={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setAddOpen((v) => !v)}
          disabled={disabled}
        >
          {addOpen ? 'Cancel' : 'Add…'}
        </Button>
      }
    >
      <div className="space-y-3">
        {addOpen && (
          <AddHeroicResource
            focused={focused}
            disabled={disabled}
            onAdd={(payload) => {
              dispatchSetResource(payload);
              setAddOpen(false);
            }}
            onClose={() => setAddOpen(false)}
          />
        )}

        {focused.heroicResources.map((r) => (
          <ResourceRow
            key={`heroic-${r.name}`}
            label={capitalize(r.name)}
            value={r.value}
            max={r.max}
            floor={r.floor}
            disabled={disabled}
            onGain={(amount) =>
              dispatchGainResource({ participantId: focused.id, name: r.name, amount })
            }
            onSpend={(amount) =>
              dispatchSpendResource({ participantId: focused.id, name: r.name, amount })
            }
          />
        ))}

        {focused.extras.map((r) => (
          <ResourceRow
            key={`extra-${r.name}`}
            label={r.name}
            value={r.value}
            max={r.max}
            floor={r.floor}
            disabled={disabled}
            onGain={(amount) =>
              dispatchGainResource({
                participantId: focused.id,
                name: { extra: r.name },
                amount,
              })
            }
            onSpend={(amount) =>
              dispatchSpendResource({
                participantId: focused.id,
                name: { extra: r.name },
                amount,
              })
            }
          />
        ))}

        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="border border-line bg-ink-0 p-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs uppercase tracking-wider text-text-mute">Surges</span>
              <span className="font-mono tabular-nums text-base text-text">{focused.surges}</span>
            </div>
            <Button
              type="button"
              disabled={disabled || !surgesAvailable}
              onClick={() => dispatchSpendSurge({ participantId: focused.id, count: 1 })}
              className="mt-1.5 w-full min-h-11 justify-center"
            >
              Spend 1
            </Button>
          </div>

          <div className="border border-line bg-ink-0 p-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs uppercase tracking-wider text-text-mute">Recoveries</span>
              <span className="font-mono tabular-nums text-base text-text">
                {focused.recoveries.current}
                <span className="text-text-mute text-sm">/{focused.recoveries.max}</span>
              </span>
            </div>
            <Button
              type="button"
              disabled={disabled || !recoveriesAvailable}
              onClick={() => dispatchSpendRecovery({ participantId: focused.id })}
              className="mt-1.5 w-full min-h-11 justify-center"
              title={
                recoveriesAvailable
                  ? `Heal up to ${focused.recoveryValue} HP`
                  : focused.recoveries.current === 0
                    ? 'No recoveries left'
                    : 'Already at full HP'
              }
            >
              Spend (heal {focused.recoveryValue})
            </Button>
          </div>
        </div>

        {!hasResources && !addOpen && (
          <p className="text-xs text-text-mute">
            No heroic resource set. Tap Add… to attach one (Focus, Wrath, Clarity, etc.).
          </p>
        )}
      </div>
    </Section>
  );
}

function ResourceRow({
  label,
  value,
  max,
  floor,
  disabled,
  onGain,
  onSpend,
}: {
  label: string;
  value: number;
  max?: number;
  floor: number;
  disabled: boolean;
  onGain: (amount: number) => void;
  onSpend: (amount: number) => void;
}) {
  const canSpend = !disabled && value > floor;
  const canGain = !disabled && (max === undefined || value < max);
  return (
    <div className="flex items-center gap-2 bg-ink-0 border border-line px-3 py-2">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate text-text">{label}</div>
        <div className="text-xs text-text-mute font-mono tabular-nums">
          {value}
          {max !== undefined && <span className="text-text-mute">/{max}</span>}
          {floor < 0 && <span className="ml-2 text-accent">floor {floor}</span>}
        </div>
      </div>
      <Button
        type="button"
        disabled={!canSpend}
        onClick={() => onSpend(1)}
        className="min-h-11 w-11 justify-center text-base"
        aria-label={`Spend 1 ${label}`}
      >
        −
      </Button>
      <Button
        type="button"
        disabled={!canGain}
        onClick={() => onGain(1)}
        className="min-h-11 w-11 justify-center text-base"
        aria-label={`Gain 1 ${label}`}
      >
        +
      </Button>
    </div>
  );
}

function AddHeroicResource({
  focused,
  disabled,
  onAdd,
  onClose,
}: {
  focused: Participant;
  disabled: boolean;
  onAdd: (payload: SetResourcePayload) => void;
  onClose: () => void;
}) {
  const owned = new Set(focused.heroicResources.map((r) => r.name));
  const choices = HEROIC_RESOURCE_NAMES.filter((n) => !owned.has(n));
  const [name, setName] = useState<HeroicResourceName | ''>(choices[0] ?? '');

  if (choices.length === 0) {
    return (
      <div className="border border-line bg-ink-0 p-3 text-xs text-text-dim">
        All 9 heroic resources already attached.{' '}
        <button type="button" onClick={onClose} className="underline text-accent">
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="border border-line bg-ink-0 p-3 space-y-2">
      <label className="flex flex-col text-xs text-text-dim">
        Resource
        <select
          value={name}
          onChange={(e) => setName(e.target.value as HeroicResourceName)}
          className="mt-1 min-h-11 bg-ink-1 border border-line px-2 py-1 text-sm text-text"
        >
          {choices.map((n) => (
            <option key={n} value={n}>
              {capitalize(n)}
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-2 justify-end">
        <Button type="button" onClick={onClose} className="min-h-11">
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={disabled || !name}
          onClick={() => {
            if (!name) return;
            // Talent's Clarity uses a negative floor (−(1 + Reason)). Use a
            // conservative default; the director can SetResource later. The
            // engine accepts any signed integer for `value`.
            const isClarity = name === 'clarity';
            onAdd({
              participantId: focused.id,
              name,
              value: 0,
              initialize: isClarity
                ? { floor: -(1 + focused.characteristics.reason) }
                : { floor: 0 },
            });
          }}
          className="min-h-11"
        >
          Add
        </Button>
      </div>
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
