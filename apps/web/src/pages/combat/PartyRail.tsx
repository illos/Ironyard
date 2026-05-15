import type { Participant } from '@ironyard/shared';
import { ParticipantRow, Section } from '../../primitives';
import { initials, roleReadoutFor } from './rails/rail-utils';
import { RoleReadout } from './rails/RoleReadout';
import { derivePickAffordance } from './initiative';

export interface PartyRailProps {
  heroes: Participant[];
  activeParticipantId: string | null;
  selectedParticipantId: string | null;
  onSelect: (id: string) => void;
  /** Set of participant ids who've already acted this round. */
  actedIds: Set<string>;
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

export function PartyRail({
  heroes,
  activeParticipantId,
  selectedParticipantId,
  onSelect,
  actedIds,
  viewerRole,
  selfParticipantId,
  targetParticipantIds,
  onToggleTarget,
  currentPickingSide,
  actedThisRound,
  viewerId,
  isActingAsDirector,
  onPick,
}: PartyRailProps) {
  const heading = `PARTY · ${heroes.length} HEROES`;
  return (
    <Section heading={heading}>
      <div className="flex flex-col gap-1">
        {heroes.map((h) => {
          const isSelf = h.id === selfParticipantId;
          const isGated = viewerRole === 'player' && !isSelf;
          const pickAffordance = derivePickAffordance({
            participant: h,
            currentPickingSide,
            acted: actedThisRound,
            viewerId,
            isActingAsDirector,
            onPick: () => onPick(h.id),
          });
          return (
            <ParticipantRow
              key={h.id}
              sigil={initials(h.name)}
              name={h.name}
              role={isGated ? null : <RoleReadout data={roleReadoutFor(h)} />}
              resource={isGated ? null : undefined}
              recoveries={isGated ? null : undefined}
              staminaCurrent={h.currentStamina}
              staminaMax={h.maxStamina}
              active={selectedParticipantId === h.id}
              isTurn={activeParticipantId === h.id}
              acted={actedIds.has(h.id)}
              isActed={actedThisRound.includes(h.id)}
              isSurprised={h.surprised}
              target={{
                index: targetParticipantIds.indexOf(h.id) >= 0 ? targetParticipantIds.indexOf(h.id) + 1 : null,
                onToggle: () => onToggleTarget(h.id),
              }}
              pickAffordance={pickAffordance ?? undefined}
              onSelect={() => onSelect(h.id)}
            />
          );
        })}
      </div>
    </Section>
  );
}
