import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { type Character, LevelChoicesSchema } from '@ironyard/shared';
import { useEffect, useState } from 'react';
import type { WizardStaticData } from '../../../api/static-data';

// ── Canonical characteristic display labels ────────────────────────────────────

const CHAR_LABELS: Record<string, string> = {
  might: 'Might',
  agility: 'Agility',
  reason: 'Reason',
  intuition: 'Intuition',
  presence: 'Presence',
};

const ALL_CHARACTERISTICS = ['might', 'agility', 'reason', 'intuition', 'presence'] as const;

// ── Fallback arrays if class data is absent ────────────────────────────────────

const FALLBACK_ARRAYS: number[][] = [
  [2, -1, -1],
  [1, 1, -1],
  [-1, 0, 0],
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatValue(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Section A — Locked characteristics (read-only)
// ─────────────────────────────────────────────────────────────────────────────

function LockedCharacteristics({ lockedIds }: { lockedIds: string[] }) {
  return (
    <div>
      <h3 className="text-sm text-text-dim mb-1">Locked characteristics</h3>
      <p className="text-xs text-text-mute mb-2">Set by your class — these cannot be reassigned.</p>
      <div className="flex flex-wrap gap-2">
        {lockedIds.map((id) => (
          <div
            key={id}
            className="flex items-center gap-1 px-3 py-2 border border-line bg-ink-2 text-text-dim text-sm select-none"
          >
            <span>{CHAR_LABELS[id] ?? id}</span>
            <span className="font-mono text-text-dim">+2</span>
            <span className="ml-1 text-xs text-text-mute">(locked)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section B — Array picker
// ─────────────────────────────────────────────────────────────────────────────

function ArrayPicker({
  klass,
  value,
  onChange,
}: {
  klass: { characteristicArrays: number[][] };
  value: number[] | null;
  onChange: (arr: number[]) => void;
}) {
  const arrays =
    klass.characteristicArrays.length > 0 ? klass.characteristicArrays : FALLBACK_ARRAYS;

  return (
    <div>
      <h3 className="text-sm text-text-dim mb-1">Characteristic array</h3>
      <p className="text-xs text-text-mute mb-2">
        Choose the distribution you want to assign to your free characteristics.
      </p>
      <div className="flex flex-wrap gap-2">
        {arrays.map((arr) => {
          const isSelected = value !== null && arr.join(',') === value.join(',');
          return (
            <button
              key={arr.join(',')}
              type="button"
              onClick={() => onChange(arr)}
              className={`min-h-11 px-3 py-2 border text-sm font-mono ${
                isSelected
                  ? 'bg-accent text-ink-0 border-accent'
                  : 'bg-ink-1 text-text-dim border-line hover:border-accent'
              }`}
            >
              [{arr.map(formatValue).join(', ')}]
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section C — Drag-and-drop assignment
// ─────────────────────────────────────────────────────────────────────────────

// A tile representing one value from the chosen array.
// tileId format: "tile-{index}"
function DraggableTile({ tileId, value }: { tileId: string; value: number }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: tileId });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`min-w-[44px] min-h-[44px] flex items-center justify-center border text-sm font-mono font-semibold cursor-grab active:cursor-grabbing select-none ${
        isDragging
          ? 'opacity-40 border-line bg-ink-2 text-text-dim'
          : 'border-line bg-ink-2 text-text hover:border-accent'
      }`}
    >
      {formatValue(value)}
    </div>
  );
}

// A slot for one of the unlocked characteristics.
// slotId = characteristic slug
function DroppableSlot({
  slotId,
  label,
  tileValue,
  onClear,
}: {
  slotId: string;
  label: string;
  tileValue: number | null;
  onClear: () => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: slotId });
  const filled = tileValue !== null;

  return (
    <div className="flex items-center gap-3">
      <span className="w-24 text-sm text-text-dim shrink-0">{label}</span>
      <div
        ref={setNodeRef}
        className={`min-w-[60px] min-h-[44px] flex items-center justify-center border text-sm font-mono font-semibold transition-colors ${
          filled
            ? 'bg-ink-3 border-line text-text'
            : isOver
              ? 'bg-ink-2 border-accent text-text-dim'
              : 'bg-ink-1 border-dashed border-line text-text-mute'
        }`}
      >
        {filled && tileValue !== null ? (
          <span>{formatValue(tileValue)}</span>
        ) : (
          <span className="text-xs">drop here</span>
        )}
      </div>
      {filled && (
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-text-mute hover:text-text-dim"
          aria-label={`Clear ${label} slot`}
        >
          ✕
        </button>
      )}
    </div>
  );
}

function ArrayAssignment({
  klass,
  chosenArray,
  onPatch,
}: {
  klass: { id: string; lockedCharacteristics: string[] };
  chosenArray: number[] | null;
  onPatch: (p: Partial<Character>) => void;
}) {
  // assignment: tileIndex → characteristic slug (or null = unplaced).
  // The size of this map is `chosenArray.length` — varies per class
  // (3 tiles for classes that lock 2 characteristics, 4 tiles for classes
  // that lock 1, e.g. Conduit/Elementalist/Shadow).
  const [assignment, setAssignment] = useState<Record<number, string | null>>({});

  // Reset whenever the class or the chosen array changes — the tile
  // count + array values may have changed too.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional reset triggered by external ids
  useEffect(() => {
    const next: Record<number, string | null> = {};
    if (chosenArray !== null) {
      for (let i = 0; i < chosenArray.length; i++) next[i] = null;
    }
    setAssignment(next);
  }, [klass.id, chosenArray?.join(',')]);
  // Note: chosenArray?.join(',') is a stable primitive derived from the prop, used as a dep key.

  const sensors = useSensors(useSensor(PointerSensor));

  if (chosenArray === null) {
    return (
      <div>
        <h3 className="text-sm text-text-dim mb-1">Assign array values</h3>
        <p className="text-xs text-text-mute">Pick an array above to assign values.</p>
      </div>
    );
  }

  // Non-null alias for use inside closures where TypeScript loses the narrowing.
  const arr = chosenArray;
  const allIndices = arr.map((_, i) => i);

  const lockedSet = new Set(klass.lockedCharacteristics);
  const unlockedChars = ALL_CHARACTERISTICS.filter((c) => !lockedSet.has(c));

  // Build reverse maps for quick lookup.
  // tileIndexBySlot: characteristicSlug → tileIndex that is in that slot
  const tileIndexBySlot: Record<string, number | null> = {};
  for (const c of unlockedChars) tileIndexBySlot[c] = null;
  for (const [idxStr, charId] of Object.entries(assignment)) {
    if (charId !== null) tileIndexBySlot[charId] = Number(idxStr);
  }

  // Collect which tile indices are already placed in a slot.
  const placedIndices = new Set<number>();
  for (const [idxStr, charId] of Object.entries(assignment)) {
    if (charId !== null) placedIndices.add(Number(idxStr));
  }
  const unplacedTiles = allIndices.filter((i) => !placedIndices.has(i));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const draggedTileId = String(active.id);
    const targetSlotId = String(over.id);

    // Only drop onto characteristic slots.
    if (!unlockedChars.includes(targetSlotId as (typeof ALL_CHARACTERISTICS)[number])) return;

    // Parse the dragged tile index from the id ("tile-0", "tile-1", ...).
    if (!draggedTileId.startsWith('tile-')) return;
    const draggedIdx = Number(draggedTileId.slice(5));

    setAssignment((prev) => {
      const next = { ...prev };

      // Check if the target slot already has a tile.
      const incumbentIdx = tileIndexBySlot[targetSlotId];

      // Remove the dragged tile from whatever slot it was previously in.
      for (const k of allIndices) {
        if (next[k] === targetSlotId) next[k] = null;
      }

      // If target slot had a tile, move that tile to the slot the dragged tile just left.
      if (incumbentIdx !== null && incumbentIdx !== undefined) {
        const previousSlotOfDragged = prev[draggedIdx] ?? null; // may be null (came from tray)
        next[incumbentIdx] = previousSlotOfDragged; // swap or send back to tray (null)
      }

      // Place the dragged tile into the target slot.
      next[draggedIdx] = targetSlotId;

      // Derive characteristicSlots and fire onPatch.
      const slots: Record<string, number> = {};
      for (const [idxStr, charId] of Object.entries(next)) {
        if (charId !== null) {
          const v = arr[Number(idxStr)];
          if (v !== undefined) slots[charId] = v;
        }
      }
      const allPlaced = Object.keys(slots).length === arr.length;
      // Fire asynchronously to avoid setState-in-setState warning.
      setTimeout(() => {
        onPatch({ characteristicSlots: allPlaced ? slots : null });
      }, 0);

      return next;
    });
  }

  function clearSlot(charId: string) {
    setAssignment((prev) => {
      const next = { ...prev };
      for (const k of allIndices) {
        if (next[k] === charId) next[k] = null;
      }
      setTimeout(() => {
        onPatch({ characteristicSlots: null });
      }, 0);
      return next;
    });
  }

  return (
    <div>
      <h3 className="text-sm text-text-dim mb-1">Assign array values</h3>
      <p className="text-xs text-text-mute mb-3">
        Drag each value onto one of your free characteristics.
      </p>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        {/* Tile tray — unplaced tiles */}
        <div className="flex gap-2 mb-4 min-h-[44px]">
          {unplacedTiles.length === 0 ? (
            <p className="text-xs text-text-mute self-center">All values assigned.</p>
          ) : (
            unplacedTiles.map((i) => (
              <DraggableTile key={i} tileId={`tile-${i}`} value={arr[i] ?? 0} />
            ))
          )}
        </div>

        {/* Characteristic slots */}
        <div className="space-y-2">
          {unlockedChars.map((charId) => {
            const assignedTileIdx = tileIndexBySlot[charId];
            const tileValue: number | null =
              assignedTileIdx !== null && assignedTileIdx !== undefined
                ? (arr[assignedTileIdx] ?? null)
                : null;
            return (
              <DroppableSlot
                key={charId}
                slotId={charId}
                label={CHAR_LABELS[charId] ?? charId}
                tileValue={tileValue}
                onClear={() => clearSlot(charId)}
              />
            );
          })}
        </div>
      </DndContext>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ClassStep — top level
// ─────────────────────────────────────────────────────────────────────────────

export function ClassStep({
  draft,
  staticData,
  onPatch,
}: {
  draft: Character;
  staticData: WizardStaticData;
  onPatch: (p: Partial<Character>) => void;
}) {
  const classes = Array.from(staticData.classes.values());
  const selected = draft.classId ? staticData.classes.get(draft.classId) : null;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm text-text-dim mb-1">Class</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {classes.map((cl) => (
            <button
              key={cl.id}
              type="button"
              onClick={() =>
                onPatch({
                  classId: cl.id,
                  subclassId: null,
                  characteristicArray: null,
                  characteristicSlots: null,
                  levelChoices: {},
                })
              }
              className={`text-left border px-4 py-3 min-h-11 ${
                cl.id === draft.classId
                  ? 'bg-accent text-ink-0 border-accent'
                  : 'bg-ink-1 text-text-dim border-line hover:border-accent'
              }`}
            >
              <div className="font-medium">{cl.name}</div>
              {cl.description && <div className="text-xs opacity-80 mt-1">{cl.description}</div>}
            </button>
          ))}
        </div>
      </div>

      {selected && (
        <>
          <LockedCharacteristics lockedIds={selected.lockedCharacteristics} />

          <ArrayPicker
            klass={selected}
            value={draft.characteristicArray}
            onChange={(arr) => onPatch({ characteristicArray: arr, characteristicSlots: null })}
          />

          <ArrayAssignment
            klass={selected}
            chosenArray={draft.characteristicArray}
            onPatch={onPatch}
          />

          <SubclassPicker
            klass={selected}
            value={draft.subclassId}
            onChange={(id) => onPatch({ subclassId: id })}
          />
          <LevelPicks
            draft={draft}
            staticData={staticData}
            onChange={(levelChoices) => onPatch({ levelChoices })}
          />
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Subclass + Level picks (unchanged from before)
// ─────────────────────────────────────────────────────────────────────────────

function SubclassPicker({
  klass,
  value,
  onChange,
}: {
  klass: { subclasses?: Array<{ id: string; name: string }> };
  value: string | null;
  onChange: (id: string) => void;
}) {
  const subs = klass.subclasses ?? [];
  if (subs.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm text-text-dim mb-1">Subclass</h3>
      <div className="flex flex-wrap gap-2">
        {subs.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onChange(s.id)}
            className={`min-h-11 px-3 py-2 border text-sm ${
              value === s.id
                ? 'bg-accent text-ink-0 border-accent'
                : 'bg-ink-1 text-text-dim border-line hover:border-accent'
            }`}
          >
            {s.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function LevelPicks({
  draft,
  staticData,
  onChange,
}: {
  draft: Character;
  staticData: WizardStaticData;
  onChange: (lc: Character['levelChoices']) => void;
}) {
  const klass = draft.classId ? staticData.classes.get(draft.classId) : null;
  if (!klass) return null;

  // Materialize empty level entries up to the character's level on first render
  // so the slot loops below have something to bind to.
  useEffect(() => {
    let mutated = false;
    const next: Character['levelChoices'] = { ...draft.levelChoices };
    for (let lvl = 1; lvl <= draft.level; lvl++) {
      if (!next[String(lvl)]) {
        next[String(lvl)] = LevelChoicesSchema.parse({});
        mutated = true;
      }
    }
    if (mutated) onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.level, draft.classId]);

  // Pre-index the class's per-level abilities for filtering. Abilities carry
  // sourceClassId + tier + cost + isSubclass; we group by (tier, cost,
  // isSubclass) so each slot picker presents the correct subset.
  const allClassAbilities = Array.from(staticData.abilities.values()).filter(
    (a) => a.sourceClassId === klass.id,
  );

  const setPick = (
    lvl: number,
    field: 'abilityIds' | 'subclassAbilityIds',
    slotIdx: number,
    abilityId: string,
  ) => {
    const next: Character['levelChoices'] = { ...draft.levelChoices };
    const cur = next[String(lvl)] ?? LevelChoicesSchema.parse({});
    const arr = [...cur[field]];
    arr[slotIdx] = abilityId;
    next[String(lvl)] = { ...cur, [field]: arr };
    onChange(next);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm text-text-dim mb-1">Level picks</h3>
        <p className="text-xs text-text-mute mb-2">
          Pick one ability per slot. Slots are determined by your class's level table; the dropdown
          filters {klass.name} abilities by tier, cost, and subclass scope.
        </p>
      </div>
      {Array.from({ length: draft.level }, (_, i) => i + 1).map((lvl) => {
        const lvlData = klass.levels.find((l) => l.level === lvl);
        if (!lvlData) return null;
        const choices = draft.levelChoices[String(lvl)] ?? LevelChoicesSchema.parse({});

        // Split slots by subclass vs non-subclass; each picker writes into the
        // matching array (abilityIds vs subclassAbilityIds).
        const slots = lvlData.abilitySlots ?? [];
        const featureNames = lvlData.featureNames ?? [];
        const baseSlots = slots.filter((s) => !s.isSubclass);
        const subSlots = slots.filter((s) => s.isSubclass);

        return (
          <div key={lvl} className="border border-line bg-ink-0 p-3">
            <h4 className="text-sm font-medium text-text mb-2">Level {lvl}</h4>
            {featureNames.length > 0 && (
              <p className="text-xs text-text-mute mb-2">Features: {featureNames.join(' · ')}</p>
            )}
            <div className="space-y-2">
              {baseSlots.map((slot, idx) => (
                <AbilitySlotPicker
                  key={`base-${idx}`}
                  label={`Ability slot ${idx + 1} (${slot.cost === 0 ? 'Signature' : `Cost ${slot.cost}`})`}
                  options={allClassAbilities.filter(
                    (a) => a.tier === lvl && a.cost === slot.cost && a.isSubclass === false,
                  )}
                  value={choices.abilityIds[idx] ?? ''}
                  onChange={(id) => setPick(lvl, 'abilityIds', idx, id)}
                />
              ))}
              {subSlots.map((slot, idx) => (
                <AbilitySlotPicker
                  key={`sub-${idx}`}
                  label={`${klass.subclassLabel} ability slot ${idx + 1} (${slot.cost === 0 ? 'Signature' : `Cost ${slot.cost}`})`}
                  options={allClassAbilities.filter(
                    (a) => a.tier === lvl && a.cost === slot.cost && a.isSubclass === true,
                  )}
                  value={choices.subclassAbilityIds[idx] ?? ''}
                  onChange={(id) => setPick(lvl, 'subclassAbilityIds', idx, id)}
                />
              ))}
              {baseSlots.length === 0 && subSlots.length === 0 && (
                <p className="text-xs text-text-mute">No ability picks at this level.</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AbilitySlotPicker({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ id: string; name: string }>;
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs text-text-dim">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-11 bg-ink-1 border border-line px-2 py-1 text-sm text-text focus:border-accent"
      >
        <option value="">— pick one —</option>
        {options.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </label>
  );
}
