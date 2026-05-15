import type { Participant } from '@ironyard/shared';
import { ParticipantRow, Section } from '../../primitives';
import { initials, summarizeRole } from './rails/rail-utils';
import { derivePickAffordance } from './initiative';

export interface EncounterRailProps {
  foes: Participant[];
  defeatedCount: number;
  activeParticipantId: string | null;
  selectedParticipantId: string | null;
  onSelect: (id: string) => void;
  // Phase 5 Pass 2a — role-asymmetric rendering + target signal.
  viewerRole: 'director' | 'player';
  selfParticipantId: string | null;
  /** Ordered target ids. Index in this array drives the reticle's target-number badge. */
  targetParticipantIds: string[];
  onToggleTarget: (id: string) => void;
  // Phase 5 Pass 2b1 — zipper-initiative picking phase.
  currentPickingSide: 'heroes' | 'foes' | null;
  actedThisRound: string[];
  viewerId: string | null;
  isActingAsDirector: boolean;
  onPick: (participantId: string) => void;
}

export function EncounterRail({
  foes,
  defeatedCount,
  activeParticipantId,
  selectedParticipantId,
  onSelect,
  viewerRole,
  selfParticipantId,
  targetParticipantIds,
  onToggleTarget,
  currentPickingSide,
  actedThisRound,
  viewerId,
  isActingAsDirector,
  onPick,
}: EncounterRailProps) {
  const heading = `ENCOUNTER · ${foes.length} ACTIVE`;
  const right = `${defeatedCount} defeated`;
  return (
    <Section heading={heading} right={right}>
      <div className="flex flex-col gap-1">
        {foes.map((f) => {
          const isSelf = f.id === selfParticipantId;
          const isGated = viewerRole === 'player' && !isSelf;
          const pickAffordance = derivePickAffordance({
            participant: f,
            currentPickingSide,
            acted: actedThisRound,
            viewerId,
            isActingAsDirector,
            onPick: () => onPick(f.id),
          });
          return (
            <ParticipantRow
              key={f.id}
              sigil={initials(f.name)}
              name={f.name}
              role={isGated ? null : summarizeRole(f)}
              staminaCurrent={f.currentStamina}
              staminaMax={f.maxStamina}
              active={selectedParticipantId === f.id}
              isTurn={activeParticipantId === f.id}
              isActed={actedThisRound.includes(f.id)}
              isSurprised={f.surprised}
              target={{
                index: targetParticipantIds.indexOf(f.id) >= 0 ? targetParticipantIds.indexOf(f.id) + 1 : null,
                onToggle: () => onToggleTarget(f.id),
              }}
              pickAffordance={pickAffordance ?? undefined}
              onSelect={() => onSelect(f.id)}
            />
          );
        })}
      </div>
    </Section>
  );
}
