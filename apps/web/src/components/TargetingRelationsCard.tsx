// Pass 3 Slice 2b — TargetingRelationsCard
//
// Renders one (source, relationKind) targeting relation as a persistent card
// under the player's heroic-resource block. Lets the player (or director)
// toggle which targets the source is judging / marking / null-fielding.
//
// Pure presentational — callers own intent dispatch via the onToggle callback.

import type { TargetingRelationKind, TargetingRelations } from '@ironyard/shared';
import { useState } from 'react';
import { Button } from '../primitives';

// ── Types ─────────────────────────────────────────────────────────────────────

export type Candidate = { id: string; name: string };

export interface TargetingRelationsCardProps {
  source: {
    id: string;
    name: string;
    targetingRelations: TargetingRelations;
  };
  relationKind: TargetingRelationKind;
  /** Candidates the source could add (typically opposing-side participants). */
  candidates: Candidate[];
  /** Called with (targetId, present) when the user toggles an entry. */
  onToggle: (targetId: string, present: boolean) => void;
}

// ── Label map ─────────────────────────────────────────────────────────────────

/**
 * Section aria-label (not rendered as visible text) and heading text shown
 * when the relation list is non-empty.
 */
const LABEL: Record<TargetingRelationKind, string> = {
  judged: 'Judging',
  marked: 'Marked',
  nullField: 'Null Field',
};

/**
 * Full empty-state sentence rendered when the relation list is empty.
 * The h3 heading is always rendered above it (unconditionally).
 */
const EMPTY_LABEL: Record<TargetingRelationKind, string> = {
  judged: 'Judging: none.',
  marked: 'Marked: none.',
  nullField: 'Null Field: none.',
};

// ── Component ─────────────────────────────────────────────────────────────────

export function TargetingRelationsCard({
  source,
  relationKind,
  candidates,
  onToggle,
}: TargetingRelationsCardProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const currentIds = source.targetingRelations[relationKind];

  // Build a lookup map from all candidates (so we can resolve names for
  // entries that are already in the relation list).
  const candidateMap = new Map<string, string>(candidates.map((c) => [c.id, c.name]));

  // Candidates available to add — exclude ids already in the relation.
  const addableCandidates = candidates.filter((c) => !currentIds.includes(c.id));

  const handleAdd = (targetId: string) => {
    onToggle(targetId, true);
    setPickerOpen(false);
  };

  const label = LABEL[relationKind];
  const isEmpty = currentIds.length === 0;

  return (
    <section aria-label={label} className="border border-line bg-ink-1 p-3 space-y-2">
      {/* Header — always rendered so the section label is visible even when empty. */}
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-mute">
          {label}
        </h3>
      </header>

      {/* Entry list or empty state */}
      {isEmpty ? (
        <p className="text-[11px] text-text-mute leading-snug">{EMPTY_LABEL[relationKind]}</p>
      ) : (
        <ul className="space-y-1">
          {currentIds.map((targetId) => {
            const name = candidateMap.get(targetId) ?? targetId;
            return (
              <li key={targetId} className="flex items-center justify-between gap-2 min-h-11">
                <span className="flex-1 min-w-0 text-sm text-text">{name}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove ${name}`}
                  onClick={() => onToggle(targetId, false)}
                  className="min-h-11"
                >
                  ✕
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Add target button + inline picker */}
      <div className="pt-1">
        <Button
          type="button"
          size="sm"
          variant="default"
          onClick={() => setPickerOpen((v) => !v)}
          className="min-h-11 w-full justify-center"
        >
          Add target
        </Button>

        {pickerOpen && (
          <div
            className="mt-1 border border-line bg-ink-2 flex flex-col"
            aria-label={`Pick a target to ${label.toLowerCase()}`}
          >
            {addableCandidates.length === 0 ? (
              <p className="px-3 py-2 text-xs text-text-mute">No candidates to add.</p>
            ) : (
              addableCandidates.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm text-text hover:bg-ink-3 min-h-11 transition-colors"
                  onClick={() => handleAdd(c.id)}
                >
                  {c.name}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </section>
  );
}
