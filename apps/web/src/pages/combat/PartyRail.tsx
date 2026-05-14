import type { Participant } from '@ironyard/shared';
import { ParticipantRow, Section } from '../../primitives';
import { initials, summarizeRole } from './rails/rail-utils';

export interface PartyRailProps {
  heroes: Participant[];
  activeParticipantId: string | null;
  selectedParticipantId: string | null;
  onSelect: (id: string) => void;
  /** Set of participant ids who've already acted this round. */
  actedIds: Set<string>;
}

export function PartyRail({
  heroes,
  activeParticipantId,
  selectedParticipantId,
  onSelect,
  actedIds,
}: PartyRailProps) {
  const heading = `PARTY · ${heroes.length} HEROES`;
  return (
    <Section heading={heading}>
      <div className="flex flex-col gap-1">
        {heroes.map((h) => (
          <ParticipantRow
            key={h.id}
            sigil={initials(h.name)}
            name={h.name}
            role={summarizeRole(h)}
            staminaCurrent={h.currentStamina}
            staminaMax={h.maxStamina}
            active={selectedParticipantId === h.id}
            isTurn={activeParticipantId === h.id}
            acted={actedIds.has(h.id)}
            onSelect={() => onSelect(h.id)}
          />
        ))}
      </div>
    </Section>
  );
}

