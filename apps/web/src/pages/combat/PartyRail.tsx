import type { Participant } from '@ironyard/shared';
import { ParticipantRow, Section } from '../../primitives';

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

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function summarizeRole(p: Participant): string {
  // ParticipantSchema (packages/shared/src/participant.ts) exposes only `level`
  // and `kind` for class-shaped metadata — there is no `className` or `ancestry`
  // on the in-encounter participant snapshot today. Render what we have:
  //   L{level} · HERO
  // When character-class metadata is materialized onto the participant in a
  // later phase, extend this to include it.
  const parts: string[] = [`L${p.level}`, 'HERO'];
  return parts.join(' · ');
}
