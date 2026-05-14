import type { ReactNode } from 'react';
import { Chip } from './Chip';

export interface SkillItem {
  id: string;
  label: ReactNode;
  selected?: boolean;
}

export interface SkillChipGroupProps {
  heading: ReactNode;
  items: SkillItem[];
  onToggle?: (id: string) => void;
}

export function SkillChipGroup({ heading, items, onToggle }: SkillChipGroupProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-mute">
        {heading}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it) => (
          <Chip
            key={it.id}
            selected={!!it.selected}
            onClick={onToggle ? () => onToggle(it.id) : undefined}
            style={onToggle ? { cursor: 'pointer' } : undefined}
          >
            {it.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}
