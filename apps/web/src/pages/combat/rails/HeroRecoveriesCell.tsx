import type { Participant } from '@ironyard/shared';

export interface HeroRecoveriesCellProps {
  participant: Participant;
}

export function HeroRecoveriesCell({ participant }: HeroRecoveriesCellProps) {
  const { current, max } = participant.recoveries;
  return (
    <div className="flex flex-col items-end gap-1 leading-none">
      <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-text-mute">
        Rec
      </span>
      <span className="font-mono text-[11px] font-semibold tabular-nums text-text">
        {current}
        <span className="text-text-mute font-normal text-[9px]">/{max}</span>
      </span>
    </div>
  );
}
