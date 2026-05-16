import type { Participant, TargetingRelationKind } from '@ironyard/shared';
import { ParticipantRow, Section } from '../../primitives';
import { ConditionGlyphs } from './ConditionGlyph';
import { derivePickAffordance } from './initiative';
import { RoleReadout } from './rails/RoleReadout';
import { initials, roleReadoutFor } from './rails/rail-utils';

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
  onToggleTarget: (id: string, opts?: { additive?: boolean }) => void;
  // Phase 5 Pass 2b1 — zipper-initiative picking phase.
  currentPickingSide: 'heroes' | 'foes' | null;
  actedThisRound: string[];
  viewerId: string | null;
  isActingAsDirector: boolean;
  onPick: (participantId: string) => void;
  // Pass 3 Slice 2b — targeting-relation chips.
  /** Full encounter roster (for computing inbound/outbound relation chips). */
  allParticipants?: Participant[];
  /**
   * Called when the viewer toggles a targeting relation chip on a row.
   * Signature: (sourceId, relationKind, targetId, present)
   */
  onToggleRelation?: (
    sourceId: string,
    relationKind: TargetingRelationKind,
    targetId: string,
    present: boolean,
  ) => void;
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
  allParticipants,
  onToggleRelation,
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
              role={isGated ? null : <RoleReadout data={roleReadoutFor(f)} />}
              conditions={<ConditionGlyphs conditions={f.conditions} />}
              staminaCurrent={f.currentStamina}
              staminaMax={f.maxStamina}
              active={selectedParticipantId === f.id}
              isTurn={activeParticipantId === f.id}
              isActed={actedThisRound.includes(f.id)}
              isSurprised={f.surprised}
              target={{
                index:
                  targetParticipantIds.indexOf(f.id) >= 0
                    ? targetParticipantIds.indexOf(f.id) + 1
                    : null,
                onToggle: (opts) => onToggleTarget(f.id, opts),
              }}
              participantKind="monster"
              pickAffordance={pickAffordance ?? undefined}
              onSelect={() => onSelect(f.id)}
              thisParticipantId={f.id}
              allParticipants={allParticipants}
              viewerUserId={viewerId}
              isActingAsDirector={isActingAsDirector}
              onToggleRelation={onToggleRelation}
            />
          );
        })}
      </div>
    </Section>
  );
}
