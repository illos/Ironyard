import { type StaticDataBundle, deriveCharacterRuntime } from '@ironyard/rules';
import {
  type Ability,
  type GainResourcePayload,
  HEROIC_RESOURCE_NAMES,
  type HeroicResourceName,
  IntentTypes,
  type Item,
  type Kit,
  type Monster,
  type Participant,
  type SetResourcePayload,
  type SetTargetingRelationPayload,
  type SpendRecoveryPayload,
  type SpendResourcePayload,
  type SpendSurgePayload,
} from '@ironyard/shared';
import { useEffect, useMemo, useState } from 'react';
import { buildIntent } from '../../../api/dispatch';
import { useCharacter, useMe } from '../../../api/queries';
import { useItems, useKits, useWizardStaticData } from '../../../api/static-data';
import { TargetingRelationsCard } from '../../../components/TargetingRelationsCard';
import { pcFreeStrike } from '../../../data/monsterAbilities';
import { CLASS_RELATION_KIND } from '../../../lib/class-relation-kind';
import { useLongPress } from '../../../lib/longPress';
import { Button, Section } from '../../../primitives';
import { isParticipantEntry, useSessionSocket } from '../../../ws/useSessionSocket';
import { AbilityCard } from '../AbilityCard';
import { InventoryPanel } from '../inventory/InventoryPanel';
import { SwapKitModal } from '../inventory/SwapKitModal';
import { capitalize } from '../rails/rail-utils';
import { MonsterStatBlock } from './MonsterStatBlock';

export interface FullSheetTabProps {
  focused: Participant;
  participants: Participant[];
  monsterByParticipantId: Map<string, Monster>;
  disabled: boolean;
  canRoll?: boolean;
  /** Campaign id — forwarded to PC-only sub-panels (inventory, kit, hero tokens). */
  campaignId: string;
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
  campaignId,
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

      {focused.kind === 'pc' && (
        <TargetingRelationsSection
          focused={focused}
          allParticipants={participants}
          campaignId={campaignId}
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

      {focused.kind === 'monster' && <MonsterStatBlock participant={focused} />}

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
              readOnly={!canRoll}
              targetMissing={ab.type === 'action' && !target && candidates.length > 0}
              onRoll={(ability, args) => onRoll(ability, args)}
            />
          ))}
        </div>
        {candidates.length === 0 && (
          <p className="mt-2 text-xs text-text-mute">No valid target — add another participant.</p>
        )}
      </Section>

      {focused.kind === 'pc' && focused.characterId !== null && (
        <>
          <HeroTokensSection focused={focused} campaignId={campaignId} disabled={disabled} />
          <KitSection focused={focused} campaignId={campaignId} disabled={disabled} />
          <InventorySection focused={focused} participants={participants} campaignId={campaignId} />
        </>
      )}
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

// ── PC-only panels ────────────────────────────────────────────────────────────
// These components mirror the sub-components in the former PlayerSheetPanel.
// They are gated on focused.kind === 'pc' && focused.characterId !== null in
// the parent, so they can safely assume both conditions.

/**
 * Renders the TargetingRelationsCard for Censor / Tactician / Null PCs.
 * Returns null for any other class or when the participant has no className.
 */
function TargetingRelationsSection({
  focused,
  allParticipants,
  campaignId,
}: {
  focused: Participant;
  allParticipants: Participant[];
  campaignId: string;
}) {
  const me = useMe();
  const sock = useSessionSocket(campaignId);

  const relationKind = focused.className
    ? CLASS_RELATION_KIND[focused.className.toLowerCase()]
    : undefined;

  if (!relationKind || !me.data) return null;

  // Candidates are opposing-side participants (monsters for PCs).
  const candidates = allParticipants
    .filter((p) => p.kind === 'monster')
    .map((p) => ({ id: p.id, name: p.name }));

  const handleToggle = (targetId: string, present: boolean) => {
    if (!me.data) return;
    const payload: SetTargetingRelationPayload = {
      sourceId: focused.id,
      relationKind,
      targetId,
      present,
    };
    sock.dispatch(
      buildIntent({
        campaignId,
        type: IntentTypes.SetTargetingRelation,
        payload,
        actor: { userId: me.data.user.id, role: 'player' },
      }),
    );
  };

  return (
    <TargetingRelationsCard
      source={focused}
      relationKind={relationKind}
      candidates={candidates}
      onToggle={handleToggle}
    />
  );
}

function HeroTokensSection({
  focused,
  campaignId,
  disabled,
}: {
  focused: Participant;
  campaignId: string;
  disabled: boolean;
}) {
  const me = useMe();
  const sock = useSessionSocket(campaignId);
  const { currentSessionId, heroTokens } = sock;

  if (!currentSessionId || !me.data) return null;

  const userId = me.data.user.id;
  const spend = (amount: 1 | 2, reason: 'surge_burst' | 'regain_stamina') => {
    sock.dispatch(
      buildIntent({
        campaignId,
        type: IntentTypes.SpendHeroToken,
        payload: { amount, reason, participantId: focused.id },
        actor: { userId, role: 'player' },
      }),
    );
  };

  return (
    <Section heading="Hero tokens" aria-label="hero-tokens">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-sm text-text-dim">Available</span>
        <span className="font-mono tabular-nums text-base text-text">{heroTokens}</span>
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          disabled={disabled || heroTokens < 1}
          onClick={() => spend(1, 'surge_burst')}
          className="flex-1 min-h-11 justify-center"
        >
          +2 Surges (1 token)
        </Button>
        <Button
          type="button"
          disabled={disabled || heroTokens < 2}
          onClick={() => spend(2, 'regain_stamina')}
          className="flex-1 min-h-11 justify-center"
        >
          Regain Stamina (2 tokens)
        </Button>
      </div>
    </Section>
  );
}

function KitSection({
  focused,
  campaignId,
  disabled,
}: {
  focused: Participant;
  campaignId: string;
  disabled: boolean;
}) {
  const me = useMe();
  const ch = useCharacter(focused.characterId ?? undefined);
  const kits = useKits();
  const sock = useSessionSocket(campaignId);
  const [open, setOpen] = useState(false);

  if (!me.data || !ch.data || !kits.data) return null;

  const userId = me.data.user.id;
  const character = ch.data.data;
  const characterId = ch.data.id;
  const currentKitId = character.kitId ?? null;
  const currentKit = kits.data.find((k) => k.id === currentKitId);
  const actor = { userId, role: 'player' as const };
  // Cast: useKits()'s value type carries Zod input-side optionality on defaulted fields.
  const kitList = kits.data as unknown as Kit[];

  return (
    <Section heading="Kit" aria-label="kit">
      <div className="flex items-center justify-between text-sm">
        <span className="text-text-dim">{currentKit?.name ?? '—'}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => setOpen(true)}
          className="min-h-[44px]"
        >
          Swap
        </Button>
      </div>
      {open && (
        <SwapKitModal
          kits={kitList}
          currentKitId={currentKitId}
          onConfirm={(newKitId) => {
            sock.dispatch(
              buildIntent({
                campaignId,
                type: IntentTypes.SwapKit,
                payload: { characterId, newKitId, ownerId: userId },
                actor,
              }),
            );
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </Section>
  );
}

function InventorySection({
  focused,
  participants,
  campaignId,
}: {
  focused: Participant;
  participants: Participant[];
  campaignId: string;
}) {
  const me = useMe();
  const ch = useCharacter(focused.characterId ?? undefined);
  const items = useItems();
  const sock = useSessionSocket(campaignId);

  if (!me.data || !ch.data || !items.data) return null;

  const userId = me.data.user.id;
  const characterId = focused.characterId!;
  const actor = { userId, role: 'player' as const };
  // Cast: useItems()'s value type carries Zod input-side optionality on defaulted fields.
  const itemList = items.data as unknown as Item[];

  // Other participants for the UseConsumable target picker. Filter self out.
  const otherParticipants: Participant[] = participants.filter(
    (p): p is Participant => isParticipantEntry(p) && p.id !== focused.id,
  );

  return (
    <Section heading="Inventory" aria-label="inventory">
      <InventoryPanel
        character={ch.data.data}
        items={itemList}
        participants={otherParticipants}
        onEquip={(inventoryEntryId) =>
          sock.dispatch(
            buildIntent({
              campaignId,
              type: IntentTypes.EquipItem,
              payload: { characterId, inventoryEntryId },
              actor,
            }),
          )
        }
        onUnequip={(inventoryEntryId) =>
          sock.dispatch(
            buildIntent({
              campaignId,
              type: IntentTypes.UnequipItem,
              payload: { characterId, inventoryEntryId },
              actor,
            }),
          )
        }
        onUse={(inventoryEntryId, targetParticipantId) =>
          sock.dispatch(
            buildIntent({
              campaignId,
              type: IntentTypes.UseConsumable,
              payload: { characterId, inventoryEntryId, targetParticipantId },
              actor,
            }),
          )
        }
      />
    </Section>
  );
}
