import { type Participant, IntentTypes } from '@ironyard/shared';
import { buildIntent } from '../../api/dispatch';
import { useMe } from '../../api/queries';
import { useSessionSocket } from '../../ws/useSessionSocket';
import { HpBar } from './HpBar';
import { ConditionChip } from './ConditionChip';

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

// Abilities stub for F1. The materialized participant carries no characterId on
// ParticipantSchema yet — ability rendering is deferred to F2 which adds
// characterId to ParticipantSchema, populates it at StartEncounter
// materialization, then calls useCharacter(participant.characterId) +
// deriveCharacterRuntime to resolve the ability ids.
function Abilities({
  participant: _participant,
  campaignId: _campaignId,
  userId: _userId,
}: {
  participant: Participant;
  campaignId: string;
  userId: string;
}) {
  return (
    <div className="text-xs text-neutral-500">
      Ability roll affordances surface in F2 via deriveCharacterRuntime (characterId pending).
    </div>
  );
}
