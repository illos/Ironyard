import { type StaticDataBundle, deriveCharacterRuntime } from '@ironyard/rules';
import { IntentTypes, type Item, type Kit, type Participant } from '@ironyard/shared';
import { useState } from 'react';
import { buildIntent } from '../../api/dispatch';
import { useCharacter, useMe } from '../../api/queries';
import { useItems, useKits, useWizardStaticData } from '../../api/static-data';
import { isParticipantEntry, useSessionSocket } from '../../ws/useSessionSocket';
import { AbilityCard } from './AbilityCard';
import { ConditionChip } from './ConditionChip';
import { HpBar } from './HpBar';
import { InventoryPanel } from './inventory/InventoryPanel';
import { OpenActionsList } from './OpenActionsList';
import { SwapKitModal } from './inventory/SwapKitModal';

export function PlayerSheetPanel({ campaignId }: { campaignId: string }) {
  const me = useMe();
  const sock = useSessionSocket(campaignId);
  if (!me.data || !sock.activeEncounter) return null;
  const userId = me.data.user.id;
  const { currentSessionId, heroTokens } = sock;
  const myParticipant = sock.activeEncounter.participants.find(
    (p) => p.kind === 'pc' && p.ownerId === userId,
  ) as Participant | undefined;

  if (!myParticipant) {
    return (
      <aside className="rounded-md border border-neutral-800 p-4 text-sm text-neutral-400">
        Your character isn't in this encounter yet.
      </aside>
    );
  }

  return (
    <aside className="rounded-md border border-neutral-800 p-4 space-y-4">
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="text-lg font-semibold">{myParticipant.name}</h2>
          <p className="text-xs text-neutral-500">Level {myParticipant.level}</p>
        </div>
        <div className="text-right text-sm">
          <div className="font-mono">
            {myParticipant.currentStamina} / {myParticipant.maxStamina} stamina
          </div>
          <div className="font-mono text-neutral-400">
            {myParticipant.recoveries.current} / {myParticipant.recoveries.max} recoveries
          </div>
          <div className="font-mono text-neutral-400">
            {myParticipant.victories ?? 0} victories
          </div>
        </div>
      </header>
      <HpBar current={myParticipant.currentStamina} max={myParticipant.maxStamina} />
      <ConditionsStrip participant={myParticipant} campaignId={campaignId} userId={userId} />
      <ActiveAbilitiesStrip participant={myParticipant} />
      <ResourcePanel participant={myParticipant} campaignId={campaignId} userId={userId} />
      <RecoveryButton participant={myParticipant} campaignId={campaignId} userId={userId} />
      {currentSessionId !== null && myParticipant && (
        <HeroTokenPanel
          heroTokens={heroTokens}
          participantId={myParticipant.id}
          campaignId={campaignId}
          userId={userId}
        />
      )}
      <Abilities participant={myParticipant} campaignId={campaignId} userId={userId} />
      <KitDisplayAndSwap participant={myParticipant} campaignId={campaignId} userId={userId} />
      <Inventory participant={myParticipant} campaignId={campaignId} userId={userId} />
      {/* OpenActionsList: lobby-visible queue (Phase 2b.0). Player sees the
          same list as the director; the Claim button is only enabled when the
          OA targets this player's participant. */}
      <OpenActionsList
        openActions={sock.openActions}
        currentUserId={userId}
        activeDirectorId={sock.activeDirectorId ?? ''}
        participantOwnerLookup={(pid) => {
          const p = sock.activeEncounter?.participants.find(
            (entry) => isParticipantEntry(entry) && entry.id === pid,
          );
          return p && isParticipantEntry(p) ? p.ownerId : null;
        }}
        onClaim={(id) =>
          sock.dispatch(
            buildIntent({
              campaignId,
              type: IntentTypes.ClaimOpenAction,
              payload: { openActionId: id },
              actor: { userId, role: 'player' },
            }),
          )
        }
      />
    </aside>
  );
}

function ActiveAbilitiesStrip({ participant }: { participant: Participant }) {
  const staticData = useWizardStaticData();
  const active = participant.activeAbilities ?? [];
  if (active.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {active.map((a) => {
        const name = staticData?.abilities?.get(a.abilityId)?.name ?? a.abilityId;
        return (
          <span
            key={a.abilityId}
            className="rounded-full border border-violet-700/60 bg-violet-900/30 px-2 py-0.5 text-xs text-violet-100"
            title={`Active until ${a.expiresAt.kind === 'EoT' ? 'end of turn' : 'end of encounter'}`}
          >
            {name}
          </span>
        );
      })}
    </div>
  );
}

function ConditionsStrip({
  participant,
  campaignId,
  userId,
}: {
  participant: Participant;
  campaignId: string;
  userId: string;
}) {
  const sock = useSessionSocket(campaignId);
  const remove = (type: string) =>
    sock.dispatch(
      buildIntent({
        campaignId,
        type: IntentTypes.RemoveCondition,
        payload: { targetId: participant.id, condition: type },
        actor: { userId, role: 'player' },
      }),
    );
  return (
    <div className="flex flex-wrap gap-1">
      {participant.conditions.length === 0 && (
        <span className="text-xs text-neutral-500">No conditions.</span>
      )}
      {participant.conditions.map((c, i) => (
        <ConditionChip key={i} condition={c} onRemove={() => remove(c.type)} />
      ))}
    </div>
  );
}

function ResourcePanel({
  participant,
  campaignId,
  userId,
}: {
  participant: Participant;
  campaignId: string;
  userId: string;
}) {
  const sock = useSessionSocket(campaignId);
  if (participant.heroicResources.length === 0) return null;
  const r = participant.heroicResources[0]!;
  const change = (delta: number) => {
    const type = delta > 0 ? IntentTypes.GainResource : IntentTypes.SpendResource;
    sock.dispatch(
      buildIntent({
        campaignId,
        type,
        payload: { participantId: participant.id, name: r.name, amount: Math.abs(delta) },
        actor: { userId, role: 'player' },
      }),
    );
  };
  return (
    <div className="rounded-md border border-neutral-800 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{r.name}</span>
        <span className="font-mono text-sm">
          {r.value}
          {r.max ? ` / ${r.max}` : ''}
        </span>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => change(-1)}
          className="flex-1 min-h-11 rounded-md bg-neutral-800 text-neutral-100 px-3 py-2"
        >
          − 1
        </button>
        <button
          type="button"
          onClick={() => change(+1)}
          className="flex-1 min-h-11 rounded-md bg-neutral-800 text-neutral-100 px-3 py-2"
        >
          + 1
        </button>
      </div>
    </div>
  );
}

function RecoveryButton({
  participant,
  campaignId,
  userId,
}: {
  participant: Participant;
  campaignId: string;
  userId: string;
}) {
  const sock = useSessionSocket(campaignId);
  const disabled = participant.recoveries.current <= 0;
  const onClick = () =>
    sock.dispatch(
      buildIntent({
        campaignId,
        type: IntentTypes.SpendRecovery,
        payload: { participantId: participant.id },
        actor: { userId, role: 'player' },
      }),
    );
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="w-full min-h-11 rounded-md bg-emerald-400 text-neutral-900 px-4 py-2 font-medium disabled:opacity-50"
    >
      Spend recovery (+{participant.recoveryValue})
    </button>
  );
}

// Abilities: look up the character by characterId, derive the runtime, and
// render full AbilityCard components for each ability id, resolved against
// the StaticDataBundle. Roll dispatch is stubbed until the RollPower intent
// flow lands in Epic 2C.
function Abilities({
  participant,
  campaignId,
  userId,
}: {
  participant: Participant;
  campaignId: string;
  userId: string;
}) {
  const ch = useCharacter(participant.characterId ?? undefined);
  const staticData = useWizardStaticData();
  const sock = useSessionSocket(campaignId);

  if (!participant.characterId) {
    return (
      <div className="text-xs text-neutral-500">
        No character attached — ability list unavailable.
      </div>
    );
  }

  if (!ch.data || !staticData) {
    return <div className="text-xs text-neutral-500">Loading abilities…</div>;
  }

  const bundle: StaticDataBundle = {
    ancestries: staticData.ancestries as StaticDataBundle['ancestries'],
    careers: staticData.careers as StaticDataBundle['careers'],
    classes: staticData.classes as StaticDataBundle['classes'],
    kits: staticData.kits as StaticDataBundle['kits'],
    abilities: staticData.abilities as StaticDataBundle['abilities'],
    items: staticData.items as StaticDataBundle['items'],
    titles: staticData.titles as StaticDataBundle['titles'],
  };
  const runtime = deriveCharacterRuntime(ch.data.data, bundle);

  if (runtime.abilityIds.length === 0) {
    return (
      <div className="text-xs text-neutral-500">
        No abilities recorded — complete level choices in the wizard.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Abilities</h3>
      <div className="space-y-3">
        {runtime.abilityIds.map((id) => {
          // Look up via the cast `bundle` (Map<string, Ability>) rather than
          // `staticData.abilities` directly — the latter's value type still
          // carries Zod input-side optionality on defaulted fields, which
          // doesn't satisfy AbilityCard's `Ability` prop.
          const ability = bundle.abilities.get(id);
          if (!ability) {
            return (
              <div
                key={id}
                className="rounded-md border border-amber-800/40 bg-amber-900/10 px-3 py-2 text-xs font-mono text-amber-200"
                title="Ability data not found — likely a stale id from before Epic 2B"
              >
                {id} <span className="text-amber-400">(missing)</span>
              </div>
            );
          }
          if (!ability.powerRoll) {
            // Maneuvers / traits without a power roll: render a passive card.
            // Maneuver-typed abilities also get an Activate button that
            // dispatches UseAbility — the engine tracks the active-tag
            // duration; the table adjudicates the effect (Q17 Bucket A).
            const isActive = (participant.activeAbilities ?? []).some((a) => a.abilityId === id);
            const canActivate = ability.type === 'maneuver';
            const activate = () =>
              sock.dispatch(
                buildIntent({
                  campaignId,
                  type: IntentTypes.UseAbility,
                  payload: {
                    participantId: participant.id,
                    abilityId: id,
                    source: 'ancestry',
                    duration: { kind: 'EoT' },
                  },
                  actor: { userId, role: 'player' },
                }),
              );
            return (
              <article
                key={id}
                className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3"
              >
                <header className="flex items-baseline justify-between gap-2">
                  <h4 className="font-medium text-sm">{ability.name}</h4>
                  {canActivate && (
                    <button
                      type="button"
                      onClick={activate}
                      disabled={isActive}
                      className="min-h-9 rounded-md bg-violet-500 text-neutral-900 px-3 py-1 text-xs font-medium disabled:opacity-50"
                    >
                      {isActive ? 'Active' : 'Activate'}
                    </button>
                  )}
                </header>
                <p className="mt-1 text-xs text-neutral-400">{ability.raw}</p>
              </article>
            );
          }
          return (
            <AbilityCard
              key={id}
              ability={ability}
              disabled={false}
              onRoll={(_a, _args) => {
                // Stub for Slice 1 — UI lights up; real RollPower intent flow lands in Epic 2C.
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

// Inventory: look up the character by characterId, fetch the static item
// catalogue, and dispatch EquipItem / UnequipItem intents directly via the
// socket (no hook wrapper — same pattern as the Respite dispatch in
// CampaignView). Renders nothing until both the character row and the item
// bundle have loaded, and is a no-op for PCs without an attached character.
function Inventory({
  participant,
  campaignId,
  userId,
}: {
  participant: Participant;
  campaignId: string;
  userId: string;
}) {
  const ch = useCharacter(participant.characterId ?? undefined);
  const items = useItems();
  const sock = useSessionSocket(campaignId);

  if (!participant.characterId || !ch.data || !items.data) return null;

  const characterId = participant.characterId;
  const actor = { userId, role: 'player' as const };

  // Cast: useItems()'s value type carries Zod input-side optionality on
  // `description`/`raw` (which default at parse time), so it doesn't satisfy
  // the strict `Item` output type. Same pattern as the abilities cast above.
  const itemList = items.data as unknown as Item[];

  // Other-than-self participants for the UseConsumable target picker. "Self"
  // is its own button in UseConsumableButton (dispatches with an undefined
  // targetParticipantId, which the reducer resolves to the character's own
  // participant), so we filter the self-participant out here.
  const otherParticipants: Participant[] = (sock.activeEncounter?.participants ?? []).filter(
    (p): p is Participant => isParticipantEntry(p) && p.id !== participant.id,
  );

  return (
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
  );
}

// Kit row + Swap trigger. Reads kitId off the D1 character (not the
// participant — participants don't carry kit data) and opens the
// SwapKitModal on Swap. On confirm, dispatches IntentTypes.SwapKit; the
// useSessionSocket character-mutating-intent hook invalidates the character
// query, so max-stamina / speed / stability re-derive automatically.
function KitDisplayAndSwap({
  participant,
  campaignId,
  userId,
}: {
  participant: Participant;
  campaignId: string;
  userId: string;
}) {
  const ch = useCharacter(participant.characterId ?? undefined);
  const kits = useKits();
  const sock = useSessionSocket(campaignId);
  const [open, setOpen] = useState(false);

  if (!participant.characterId || !ch.data || !kits.data) return null;

  const character = ch.data.data;
  const characterId = ch.data.id;
  const currentKitId = character.kitId ?? null;
  const currentKit = kits.data.find((k) => k.id === currentKitId);
  const actor = { userId, role: 'player' as const };

  // Cast: useKits()'s value type carries Zod input-side optionality on
  // defaulted fields, so it doesn't satisfy the strict `Kit` output type.
  // Same pattern as the items cast in <Inventory> above.
  const kitList = kits.data as unknown as Kit[];

  return (
    <div className="flex items-center justify-between text-xs text-neutral-400">
      <span>Kit: {currentKit?.name ?? '—'}</span>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-[44px] rounded border border-neutral-700 px-2 text-xs hover:bg-neutral-800"
      >
        Swap
      </button>
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
    </div>
  );
}

function HeroTokenPanel({
  heroTokens,
  participantId,
  campaignId,
  userId,
}: {
  heroTokens: number;
  participantId: string;
  campaignId: string;
  userId: string;
}) {
  const sock = useSessionSocket(campaignId);
  const spend = (amount: 1 | 2, reason: 'surge_burst' | 'regain_stamina') => {
    sock.dispatch(
      buildIntent({
        campaignId,
        type: IntentTypes.SpendHeroToken,
        payload: { amount, reason, participantId },
        actor: { userId, role: 'player' },
      }),
    );
  };
  return (
    <div className="rounded-md border border-violet-800/40 bg-violet-950/20 p-3 space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium">Hero tokens</span>
        <span className="font-mono tabular-nums text-sm">{heroTokens}</span>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={heroTokens < 1}
          onClick={() => spend(1, 'surge_burst')}
          className="flex-1 min-h-11 rounded-md bg-violet-500 text-neutral-900 text-sm font-medium disabled:opacity-40"
        >
          +2 Surges (1)
        </button>
        <button
          type="button"
          disabled={heroTokens < 2}
          onClick={() => spend(2, 'regain_stamina')}
          className="flex-1 min-h-11 rounded-md bg-violet-500 text-neutral-900 text-sm font-medium disabled:opacity-40"
        >
          Regain Stamina (2)
        </button>
      </div>
    </div>
  );
}
