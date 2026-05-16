import { type KeyboardEvent, type ReactNode, useRef } from 'react';

export interface TabItem {
  id: string;
  label: ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}

export function Tabs({ items, value, onChange, className = '' }: TabsProps) {
  const tablistRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = items.findIndex((t) => t.id === value);
    if (i < 0) return;
    const len = items.length;
    if (e.key === 'ArrowRight') {
      const next = items[(i + 1) % len];
      if (next) onChange(next.id);
    } else if (e.key === 'ArrowLeft') {
      const prev = items[(i - 1 + len) % len];
      if (prev) onChange(prev.id);
    }
  };

  return (
    <div
      ref={tablistRef}
      role="tablist"
      className={`flex gap-0 border-b border-line ${className}`}
      onKeyDown={handleKeyDown}
    >
      {items.map((tab) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={`px-3 h-9 font-mono text-[11px] uppercase tracking-[0.16em] transition-colors border-b-2 ${
              selected
                ? 'text-text border-accent'
                : 'text-text-mute border-transparent hover:text-text-dim'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
