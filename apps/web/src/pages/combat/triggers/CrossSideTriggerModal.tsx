import { useState } from 'react';
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { PendingTriggerSet } from '@ironyard/shared';
import { formatTriggerEvent } from '../../../lib/format-trigger-event';

type Candidate = PendingTriggerSet['candidates'][number];

type Props = {
  pendingTriggers: PendingTriggerSet;
  resolveName: (id: string) => string;
  onResolve: (order: string[]) => void;
};

export function CrossSideTriggerModal({ pendingTriggers, resolveName, onResolve }: Props) {
  // Default order: foes first, then heroes.
  const sortedDefault = [...pendingTriggers.candidates].sort((a, b) => {
    if (a.side === b.side) return 0;
    return a.side === 'foes' ? -1 : 1;
  });

  const [order, setOrder] = useState<Candidate[]>(sortedDefault);

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (over === null || active.id === over.id) return;
    const oldIndex = order.findIndex((c) => c.participantId === active.id);
    const newIndex = order.findIndex((c) => c.participantId === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    setOrder(arrayMove(order, oldIndex, newIndex));
  }

  return (
    <div role="dialog" className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-ink-2 p-6 max-w-lg border border-line">
        <h2 className="text-sm font-mono uppercase tracking-wider mb-2">Resolve trigger order</h2>
        <p className="text-xs text-ink-mute mb-4">
          Trigger: {formatTriggerEvent(pendingTriggers.triggerEvent, resolveName)}
        </p>
        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={order.map((c) => c.participantId)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="space-y-1">
              {order.map((cand, i) => (
                <SortableRow
                  key={cand.participantId}
                  index={i + 1}
                  cand={cand}
                  name={resolveName(cand.participantId)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
        <p className="text-xs text-ink-mute mt-3">Drag to reorder.</p>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => onResolve(order.map((c) => c.participantId))}
            className="px-4 py-2 bg-foe text-bg font-mono uppercase text-sm min-h-11"
          >
            Resolve in order
          </button>
        </div>
      </div>
    </div>
  );
}

function SortableRow({
  cand,
  name,
  index,
}: {
  cand: Candidate;
  name: string;
  index: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: cand.participantId,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <li
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="flex items-center gap-3 bg-ink-3 px-3 py-2 text-sm cursor-grab"
    >
      <span className="font-mono w-6">[{index}]</span>
      <span className="flex-1">
        {name} — {cand.triggeredActionId}
      </span>
      <span
        className={`text-xs uppercase ${cand.side === 'foes' ? 'text-foe' : 'text-accent'}`}
      >
        {cand.side}
      </span>
    </li>
  );
}
