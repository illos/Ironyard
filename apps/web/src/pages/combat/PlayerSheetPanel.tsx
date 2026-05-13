import { type StaticDataBundle, deriveCharacterRuntime } from '@ironyard/rules';
import { IntentTypes, type Item, type Participant } from '@ironyard/shared';
import { buildIntent } from '../../api/dispatch';
import { useCharacter, useMe } from '../../api/queries';
import { useItems, useWizardStaticData } from '../../api/static-data';
import { useSessionSocket } from '../../ws/useSessionSocket';
import { AbilityCard } from './AbilityCard';
import { ConditionChip } from './ConditionChip';
import { HpBar } from './HpBar';
import { InventoryPanel } from './inventory/InventoryPanel';

export function PlayerSheetPanel({ campaignId }: { campaignId: string }) {
  const me = useMe();
  const sock = useSessionSocket(campaignId);
  if (!me.data || !sock.activeEncounter) return null;
  const userId = me.data.user.id;
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
        </div>
      </header>
      <HpBar current={myParticipant.currentStamina} max={myParticipant.maxStamina} />
      <ConditionsStrip participant={myParticipant} campaignId={campaignId} userId={userId} />
      <ResourcePanel participant={myParticipant} campaignId={campaignId} userId={userId} />
      <RecoveryButton participant={myParticipant} campaignId={campaignId} userId={userId} />
      <Abilities participant={myParticipant} campaignId={campaignId} userId={userId} />
      <Inventory participant={myParticipant} campaignId={campaignId} userId={userId} />
    </aside>
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
  campaignId: _campaignId,
  userId: _userId,
}: {
  participant: Participant;
  campaignId: string;
  userId: string;
}) {
  const ch = useCharacter(participant.characterId ?? undefined);
  const staticData = useWizardStaticData();

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
            // Traits / maneuvers without a power roll get a passive renderer.
            return (
              <article
                key={id}
                className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3"
              >
                <h4 className="font-medium text-sm">{ability.name}</h4>
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

  return (
    <InventoryPanel
      character={ch.data.data}
      items={itemList}
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
    />
  );
}
