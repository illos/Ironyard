import type { Participant } from '@ironyard/shared';
import { ParticipantRow, Section } from '../../primitives';

export interface EncounterRailProps {
  foes: Participant[];
  defeatedCount: number;
  activeParticipantId: string | null;
  selectedParticipantId: string | null;
  onSelect: (id: string) => void;
}

export function EncounterRail({
  foes,
  defeatedCount,
  activeParticipantId,
  selectedParticipantId,
  onSelect,
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

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function summarizeRole(p: Participant): string {
  // Same gap as PartyRail — ParticipantSchema (packages/shared/src/participant.ts)
  // exposes only `level` and `kind` for role-shaped metadata. There is no
  // monster role / ev / size materialized onto the in-encounter snapshot today.
  // Render what we have: L{level} · FOE. When monster metadata is materialized
  // onto the participant in a later phase, extend this.
  return p.level ? `L${p.level} · FOE` : 'FOE';
}
