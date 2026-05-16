import * as Popover from '@radix-ui/react-popover';
import { useState } from 'react';

export interface RollOverflowPopoverProps {
  onPickTier: (tier: 1 | 2 | 3) => void;
  disabled: boolean;
}

/**
 * Phase 5 Pass 2b2a — Manual-tier override popover for AbilityCard.
 * Replaces the inline expander that today's AbilityCard renders below
 * the Auto-roll button. Three tier buttons; clicking dispatches a manual
 * roll with the chosen tier's rigged 2d10 result.
 */
export function RollOverflowPopover({ onPickTier, disabled }: RollOverflowPopoverProps) {
  const [open, setOpen] = useState(false);

  const handlePick = (tier: 1 | 2 | 3) => {
    onPickTier(tier);
    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label="Manual roll"
          className="h-8 w-8 border border-line bg-ink-0 text-text-dim hover:bg-ink-2 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center"
        >
          <span aria-hidden="true">⋯</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={4}
          className="border border-line bg-ink-0 p-3 space-y-2 z-50"
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-text-mute">
            Force tier outcome
          </p>
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => handlePick(t as 1 | 2 | 3)}
                className="min-h-11 px-3 border border-line bg-ink-1 hover:bg-ink-2 font-mono text-xs font-semibold"
              >
                Tier {t}
              </button>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
