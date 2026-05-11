import type {
  ApproveCharacterPayload,
  BringCharacterIntoEncounterPayload,
  CampaignCharacter,
  DenyCharacterPayload,
  JumpBehindScreenPayload,
  KickPlayerPayload,
  Participant,
  SubmitCharacterPayload,
} from '@ironyard/shared';
import { IntentTypes, ulid } from '@ironyard/shared';
import { Link, useParams } from '@tanstack/react-router';
import { useState } from 'react';
import { buildIntent } from '../api/dispatch';
import {
  useCreateCharacter,
  useDeleteEncounterTemplate,
  useGrantDirectorPermission,
  useRevokeDirectorPermission,
} from '../api/mutations';
import {
  type CampaignMember,
  type OwnedCharacter,
  useCampaign,
  useCampaignCharacters,
  useCampaignMembers,
  useEncounterTemplates,
  useMe,
  useMyCharacters,
} from '../api/queries';
import { useSessionSocket } from '../ws/useSessionSocket';

export function CampaignView() {
  const { id } = useParams({ from: '/campaigns/$id' });
  const me = useMe();
  const campaign = useCampaign(id);
  const { members, status, activeEncounter, dispatch } = useSessionSocket(id);

  if (me.isLoading || campaign.isLoading) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <p className="text-neutral-400">Loading…</p>
      </main>
    );
  }

  if (!me.data) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <p className="text-neutral-400">
          Not signed in.{' '}
          <Link to="/" className="underline">
            Go home
          </Link>
          .
        </p>
      </main>
    );
  }

  if (campaign.error || !campaign.data) {
    return (
      <main className="mx-auto max-w-2xl p-6 space-y-2">
        <p className="text-rose-400">
          {(campaign.error as Error)?.message ?? 'Campaign not found.'}
        </p>
        <Link to="/" className="underline text-neutral-300">
          Back home
        </Link>
      </main>
    );
  }

  const meId = me.data.user.id;
  const actor = {
    userId: meId,
    role: (campaign.data.isDirector ? 'director' : 'player') as 'director' | 'player',
  };

  return (
    <main className="mx-auto max-w-2xl p-6 space-y-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{campaign.data.name}</h1>
          <p className="text-xs text-neutral-500 mt-1">
            Invite code:{' '}
            <span className="text-neutral-200 tracking-widest font-mono">
              {campaign.data.inviteCode}
            </span>
            {' · '}
            {campaign.data.isOwner ? 'Owner' : campaign.data.isDirector ? 'Director' : 'Player'}
          </p>
        </div>
        <div className="flex items-center gap-4">
          {activeEncounter && activeEncounter.currentRound !== null && (
            <Link
              to="/campaigns/$id/play"
              params={{ id }}
              className="text-sm text-emerald-300 hover:text-emerald-200 underline"
            >
              Continue in play screen →
            </Link>
          )}
          <Link
            to="/campaigns/$id/build"
            params={{ id }}
            className="text-sm text-neutral-300 hover:text-neutral-100 underline"
          >
            Build encounter
          </Link>
          <Link to="/" className="text-sm text-neutral-400 hover:text-neutral-200">
            Leave
          </Link>
        </div>
      </header>

      {/* Active director banner */}
      <ActiveDirectorBanner
        activeDirectorId={campaign.data.activeDirectorId}
        members={members}
        meId={meId}
        isDirectorPermitted={campaign.data.isDirector}
        campaignId={id}
        actor={actor}
        dispatch={dispatch}
        wsOpen={status === 'open'}
      />

      {/* Connected members */}
      <section>
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">Connected ({members.length})</h2>
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              status === 'open'
                ? 'bg-emerald-900/40 text-emerald-300'
                : status === 'connecting'
                  ? 'bg-amber-900/40 text-amber-300'
                  : 'bg-rose-900/40 text-rose-300'
            }`}
          >
            {status}
          </span>
        </div>

        <ul className="mt-3 space-y-1">
          {members.length === 0 && (
            <li className="text-sm text-neutral-500">Waiting for the socket…</li>
          )}
          {members.map((m) => (
            <li
              key={m.userId}
              className="flex items-center gap-3 rounded-md bg-neutral-900/60 px-3 py-2"
            >
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-neutral-800 font-semibold">
                {m.displayName[0]?.toUpperCase() ?? '?'}
              </span>
              <span>
                {m.displayName}
                {m.userId === meId && <span className="text-neutral-500 text-xs"> (you)</span>}
                {m.userId === campaign.data.activeDirectorId && (
                  <span className="ml-2 text-xs text-amber-400">director</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Submit character (player flow) */}
      <SubmitCharacterPanel
        campaignId={id}
        actor={actor}
        dispatch={dispatch}
        wsOpen={status === 'open'}
      />

      {/* Director: pending approvals */}
      {campaign.data.isDirector && (
        <PendingCharactersPanel
          campaignId={id}
          actor={actor}
          dispatch={dispatch}
          wsOpen={status === 'open'}
        />
      )}

      {/* Approved roster */}
      <ApprovedRosterPanel
        campaignId={id}
        actor={actor}
        dispatch={dispatch}
        wsOpen={status === 'open'}
        isDirector={campaign.data.isDirector}
      />

      {/* Saved encounter templates */}
      {campaign.data.isDirector && <SavedTemplatesPanel campaignId={id} />}

      {/* Owner admin: manage director permissions + kick */}
      {campaign.data.isOwner && (
        <OwnerAdminPanel
          campaignId={id}
          ownerId={campaign.data.activeDirectorId}
          meId={meId}
          actor={actor}
          dispatch={dispatch}
          wsOpen={status === 'open'}
        />
      )}
    </main>
  );
}

// ─── Saved Templates Panel ─────────────────────────────────────────────────────

function SavedTemplatesPanel({ campaignId }: { campaignId: string }) {
  const templates = useEncounterTemplates(campaignId);
  const deleteTpl = useDeleteEncounterTemplate(campaignId);

  if (templates.isLoading) return null;
  const items = templates.data ?? [];

  return (
    <section className="rounded-lg border border-neutral-800 p-4 space-y-3">
      <header className="flex items-baseline justify-between">
        <h2 className="font-semibold text-sm">Saved encounter templates</h2>
        <Link
          to="/campaigns/$id/build"
          params={{ id: campaignId }}
          className="text-xs text-neutral-400 hover:text-neutral-200 underline"
        >
          Builder →
        </Link>
      </header>
      {items.length === 0 ? (
        <p className="text-sm text-neutral-500">
          No templates yet. Compose a monster lineup in the encounter builder, then save it as a
          template to load it again in any future session.
        </p>
      ) : (
        <ul className="space-y-1">
          {items.map((t) => {
            const total = t.data.monsters.reduce((acc, m) => acc + m.quantity, 0);
            return (
              <li
                key={t.id}
                className="flex items-center gap-3 rounded-md bg-neutral-900/60 px-3 py-2"
              >
                <span className="flex-1">
                  <span className="font-medium">{t.name}</span>
                  <span className="ml-2 text-xs text-neutral-500">
                    {total} monster{total === 1 ? '' : 's'} · {t.data.monsters.length} entr
                    {t.data.monsters.length === 1 ? 'y' : 'ies'}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (!confirm(`Delete template "${t.name}"?`)) return;
                    deleteTpl.mutate(t.id);
                  }}
                  disabled={deleteTpl.isPending}
                  className="min-h-11 px-3 rounded-md border border-rose-800 text-rose-300 text-xs hover:bg-rose-900/40 disabled:opacity-50"
                >
                  Delete
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ─── Active Director Banner ───────────────────────────────────────────────────

function ActiveDirectorBanner({
  activeDirectorId,
  members,
  meId,
  isDirectorPermitted,
  campaignId: _campaignId,
  actor,
  dispatch,
  wsOpen,
}: {
  activeDirectorId: string;
  members: { userId: string; displayName: string }[];
  meId: string;
  isDirectorPermitted: boolean;
  campaignId: string;
  actor: { userId: string; role: 'director' | 'player' };
  dispatch: (intent: unknown) => boolean;
  wsOpen: boolean;
}) {
  const directorMember = members.find((m) => m.userId === activeDirectorId);
  const directorName = directorMember?.displayName ?? activeDirectorId.slice(0, 8);
  const iAmDirector = meId === activeDirectorId;
  const canJump = isDirectorPermitted && !iAmDirector && wsOpen;

  const handleJump = () => {
    // DO stamps { permitted } — client sends empty object.
    // Cast via unknown because the shared type includes the DO-stamped field.
    const payload = {} as unknown as JumpBehindScreenPayload;
    dispatch(
      buildIntent({
        campaignId: _campaignId,
        type: IntentTypes.JumpBehindScreen,
        payload,
        actor,
      }),
    );
  };

  return (
    <div className="flex items-center justify-between rounded-md bg-amber-950/30 border border-amber-900/40 px-3 py-2 text-sm">
      <span className="text-amber-200">
        {iAmDirector ? 'You are directing' : `Directing: ${directorName}`}
      </span>
      {canJump && (
        <button
          type="button"
          onClick={handleJump}
          className="min-h-11 px-3 rounded-md bg-amber-700 text-neutral-950 font-medium hover:bg-amber-600 text-xs"
        >
          Jump behind the screen
        </button>
      )}
    </div>
  );
}

// ─── Submit Character Panel ───────────────────────────────────────────────────

function SubmitCharacterPanel({
  campaignId,
  actor,
  dispatch,
  wsOpen,
}: {
  campaignId: string;
  actor: { userId: string; role: 'director' | 'player' };
  dispatch: (intent: unknown) => boolean;
  wsOpen: boolean;
}) {
  const myChars = useMyCharacters();
  const createChar = useCreateCharacter();
  const [newCharName, setNewCharName] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const handleSubmit = (characterId: string) => {
    // DO stamps { ownsCharacter, isCampaignMember } — client sends only characterId.
    const payload = { characterId } as unknown as SubmitCharacterPayload;
    dispatch(
      buildIntent({
        campaignId,
        type: IntentTypes.SubmitCharacter,
        payload,
        actor,
      }),
    );
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newCharName.trim();
    if (!name) return;
    createChar.mutate(
      { name },
      {
        onSuccess: () => {
          setNewCharName('');
          setShowCreate(false);
        },
      },
    );
  };

  return (
    <section className="rounded-lg border border-neutral-800 p-4 space-y-3">
      <h2 className="font-semibold text-sm">Submit a character</h2>

      {myChars.isLoading && <p className="text-xs text-neutral-500">Loading…</p>}

      {myChars.data && myChars.data.length === 0 && !showCreate && (
        <p className="text-xs text-neutral-500">
          You have no characters.{' '}
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="underline text-neutral-300"
          >
            Create one
          </button>
          .
        </p>
      )}

      {myChars.data && myChars.data.length > 0 && (
        <ul className="space-y-1">
          {myChars.data.map((ch) => (
            <CharacterRow key={ch.id} character={ch} onSubmit={handleSubmit} disabled={!wsOpen} />
          ))}
        </ul>
      )}

      {myChars.data && myChars.data.length > 0 && (
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="text-xs text-neutral-400 underline"
        >
          {showCreate ? 'Cancel' : 'Create another character'}
        </button>
      )}

      {showCreate && (
        <form onSubmit={handleCreate} className="flex gap-2">
          <input
            type="text"
            value={newCharName}
            onChange={(e) => setNewCharName(e.target.value)}
            placeholder="Character name"
            className="flex-1 min-h-11 rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm outline-none focus:border-neutral-600"
          />
          <button
            type="submit"
            disabled={createChar.isPending || !newCharName.trim()}
            className="min-h-11 px-3 rounded-md bg-neutral-100 text-neutral-900 text-sm font-medium disabled:opacity-60"
          >
            {createChar.isPending ? '…' : 'Create'}
          </button>
        </form>
      )}
    </section>
  );
}

function CharacterRow({
  character,
  onSubmit,
  disabled,
}: {
  character: OwnedCharacter;
  onSubmit: (id: string) => void;
  disabled: boolean;
}) {
  return (
    <li className="flex items-center gap-3 rounded-md bg-neutral-900/60 px-3 py-2">
      <span className="flex-1 text-sm">{character.name}</span>
      <button
        type="button"
        onClick={() => onSubmit(character.id)}
        disabled={disabled}
        className="min-h-11 px-3 rounded-md border border-neutral-700 text-sm hover:bg-neutral-800 disabled:opacity-50"
      >
        Submit
      </button>
    </li>
  );
}

// ─── Pending Characters Panel (director) ─────────────────────────────────────

function PendingCharactersPanel({
  campaignId,
  actor,
  dispatch,
  wsOpen,
}: {
  campaignId: string;
  actor: { userId: string; role: 'director' | 'player' };
  dispatch: (intent: unknown) => boolean;
  wsOpen: boolean;
}) {
  const pending = useCampaignCharacters(campaignId, 'pending');

  const handleApprove = (characterId: string) => {
    const payload: ApproveCharacterPayload = { characterId };
    dispatch(buildIntent({ campaignId, type: IntentTypes.ApproveCharacter, payload, actor }));
    void pending.refetch();
  };

  const handleDeny = (characterId: string) => {
    const payload: DenyCharacterPayload = { characterId };
    dispatch(buildIntent({ campaignId, type: IntentTypes.DenyCharacter, payload, actor }));
    void pending.refetch();
  };

  if (pending.isLoading) return null;
  if (!pending.data || pending.data.length === 0) {
    return (
      <section className="rounded-lg border border-neutral-800 p-4">
        <h2 className="font-semibold text-sm">Pending characters</h2>
        <p className="text-xs text-neutral-500 mt-2">No pending submissions.</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-amber-900/40 bg-amber-950/20 p-4 space-y-3">
      <h2 className="font-semibold text-sm text-amber-200">
        Pending characters ({pending.data.length})
      </h2>
      <ul className="space-y-1">
        {pending.data.map((cc) => (
          <PendingCharacterRow
            key={cc.characterId}
            cc={cc}
            onApprove={handleApprove}
            onDeny={handleDeny}
            disabled={!wsOpen}
          />
        ))}
      </ul>
    </section>
  );
}

function PendingCharacterRow({
  cc,
  onApprove,
  onDeny,
  disabled,
}: {
  cc: CampaignCharacter;
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
  disabled: boolean;
}) {
  return (
    <li className="flex items-center gap-3 rounded-md bg-neutral-900/60 px-3 py-2">
      <span className="flex-1 text-sm font-mono text-neutral-300">
        {cc.characterId.slice(0, 8)}…
      </span>
      <button
        type="button"
        onClick={() => onApprove(cc.characterId)}
        disabled={disabled}
        className="min-h-11 px-3 rounded-md bg-emerald-700 text-sm font-medium hover:bg-emerald-600 disabled:opacity-50"
      >
        Approve
      </button>
      <button
        type="button"
        onClick={() => onDeny(cc.characterId)}
        disabled={disabled}
        className="min-h-11 px-3 rounded-md border border-rose-800 text-rose-300 text-sm hover:bg-rose-900/40 disabled:opacity-50"
      >
        Deny
      </button>
    </li>
  );
}

// ─── Approved Roster Panel ────────────────────────────────────────────────────

function ApprovedRosterPanel({
  campaignId,
  actor,
  dispatch,
  wsOpen,
  isDirector,
}: {
  campaignId: string;
  actor: { userId: string; role: 'director' | 'player' };
  dispatch: (intent: unknown) => boolean;
  wsOpen: boolean;
  isDirector: boolean;
}) {
  const approved = useCampaignCharacters(campaignId, 'approved');

  const handleBring = (cc: CampaignCharacter) => {
    // Bring as a stub PC participant. Phase 2 will link to the real character sheet.
    const participant: Participant = {
      id: `pc-${cc.characterId}`,
      name: cc.characterId.slice(0, 8),
      kind: 'pc',
      level: 1,
      currentStamina: 20,
      maxStamina: 20,
      characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
      immunities: [],
      weaknesses: [],
      conditions: [],
      heroicResources: [],
      extras: [],
      surges: 0,
      recoveries: { current: 3, max: 3 },
      recoveryValue: 10,
    };
    const payload: BringCharacterIntoEncounterPayload = { participant };
    dispatch(
      buildIntent({
        campaignId,
        type: IntentTypes.BringCharacterIntoEncounter,
        payload,
        actor,
      }),
    );
  };

  if (approved.isLoading) return null;

  return (
    <section className="rounded-lg border border-neutral-800 p-4 space-y-3">
      <h2 className="font-semibold text-sm">Approved roster ({approved.data?.length ?? 0})</h2>
      {(!approved.data || approved.data.length === 0) && (
        <p className="text-xs text-neutral-500">No approved characters yet.</p>
      )}
      {approved.data && approved.data.length > 0 && (
        <ul className="space-y-1">
          {approved.data.map((cc) => (
            <li
              key={cc.characterId}
              className="flex items-center gap-3 rounded-md bg-neutral-900/60 px-3 py-2"
            >
              <span className="flex-1 text-sm font-mono text-neutral-300">
                {cc.characterId.slice(0, 8)}…
              </span>
              {isDirector && (
                <button
                  type="button"
                  onClick={() => handleBring(cc)}
                  disabled={!wsOpen}
                  className="min-h-11 px-3 rounded-md border border-neutral-700 text-sm hover:bg-neutral-800 disabled:opacity-50"
                >
                  Bring into lobby
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── Owner Admin Panel ────────────────────────────────────────────────────────

function OwnerAdminPanel({
  campaignId,
  ownerId: _ownerId,
  meId,
  actor,
  dispatch,
  wsOpen,
}: {
  campaignId: string;
  ownerId: string;
  meId: string;
  actor: { userId: string; role: 'director' | 'player' };
  dispatch: (intent: unknown) => boolean;
  wsOpen: boolean;
}) {
  const members = useCampaignMembers(campaignId);
  const grant = useGrantDirectorPermission(campaignId);
  const revoke = useRevokeDirectorPermission(campaignId);

  const handleKick = (userId: string) => {
    // DO stamps { participantIdsToRemove } — client sends only userId.
    const payload = { userId } as unknown as KickPlayerPayload;
    dispatch(buildIntent({ campaignId, type: IntentTypes.KickPlayer, payload, actor }));
  };

  const handleToggleDirector = (userId: string, isDirector: boolean) => {
    if (isDirector) {
      revoke.mutate(userId);
    } else {
      grant.mutate(userId);
    }
  };

  if (members.isLoading) return null;

  return (
    <section className="rounded-lg border border-neutral-800 p-4 space-y-3">
      <h2 className="font-semibold text-sm">Campaign members (owner admin)</h2>
      <ul className="space-y-1">
        {(members.data ?? []).map((m: CampaignMember) => {
          const isMe = m.userId === meId;
          return (
            <li
              key={m.userId}
              className="flex items-center gap-3 rounded-md bg-neutral-900/60 px-3 py-2"
            >
              <span className="flex-1 text-sm">
                {m.displayName}
                {isMe && <span className="text-neutral-500 text-xs"> (you)</span>}
                {m.isDirector && <span className="ml-2 text-xs text-amber-400">director</span>}
              </span>
              {!isMe && (
                <>
                  <button
                    type="button"
                    onClick={() => handleToggleDirector(m.userId, m.isDirector)}
                    disabled={grant.isPending || revoke.isPending}
                    className="min-h-11 px-3 rounded-md border border-neutral-700 text-neutral-200 text-xs hover:bg-neutral-800 disabled:opacity-50"
                  >
                    {m.isDirector ? 'Revoke director' : 'Make director'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleKick(m.userId)}
                    disabled={!wsOpen}
                    className="min-h-11 px-3 rounded-md border border-rose-800 text-rose-300 text-xs hover:bg-rose-900/40 disabled:opacity-50"
                  >
                    Kick
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
