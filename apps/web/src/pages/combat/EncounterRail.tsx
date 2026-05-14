import type { Participant } from '@ironyard/shared';
import { ParticipantRow, Section } from '../../primitives';
import { initials, summarizeRole } from './rails/rail-utils';

export interface EncounterRailProps {
  foes: Participant[];
  defeatedCount: number;
  activeParticipantId: string | null;
  selectedParticipantId: string | null;
  onSelect: (id: string) => void;
  // Phase 5 Pass 2a — role-asymmetric rendering + target signal.
  viewerRole: 'director' | 'player';
  selfParticipantId: string | null;
  targetParticipantId: string | null;
}

export function EncounterRail({
  foes,
  defeatedCount,
  activeParticipantId,
  selectedParticipantId,
  onSelect,
  viewerRole,
  selfParticipantId,
  targetParticipantId,
}: EncounterRailProps) {
  const heading = `ENCOUNTER · ${foes.length} ACTIVE`;
  const right = `${defeatedCount} defeated`;
  return (
    <Section heading={heading} right={right}>
      <div className="flex flex-col gap-1">
        {foes.map((f) => (
          <ParticipantRow
            key={f.id}
            sigil={initials(f.name)}
            name={f.name}
            role={summarizeRole(f)}
            staminaCurrent={f.currentStamina}
            staminaMax={f.maxStamina}
            active={selectedParticipantId === f.id}
            isTurn={activeParticipantId === f.id}
            onSelect={() => onSelect(f.id)}
          />
        ))}
      </div>
    </Section>
  );
}

