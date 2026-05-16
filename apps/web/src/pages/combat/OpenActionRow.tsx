import type { OpenAction } from '@ironyard/shared';
import { formatExpiry } from '../../lib/format-expiry';

export type ViewerRowRelation = 'self' | 'other-player';

export interface OpenActionRowProps {
  oa: OpenAction;
  title: string;
  body: string;
  claimLabel: string;
  currentRound: number;
  viewerOwnerForRow: ViewerRowRelation;
  /** True when the viewer is the owner of the target participant, or is the active director. */
  canClaim: boolean;
  /** Display name for the meta line — "You" for self, the participant name for others. */
  ownerName: string;
  onClaim: (openActionId: string) => void;
}

export function OpenActionRow({
  oa,
  title,
  body,
  claimLabel,
  currentRound,
  viewerOwnerForRow,
  canClaim,
  ownerName,
  onClaim,
}: OpenActionRowProps) {
  const isSelf = viewerOwnerForRow === 'self';
  const rowBg = isSelf ? 'bg-hero/6' : 'bg-ink-2';
  const dotClass = isSelf ? 'bg-hero shadow-[0_0_6px_oklch(0.78_0.04_220/0.5)]' : 'bg-ink-4';
  const metaLabel = isSelf ? 'FOR YOU' : `FOR ${ownerName.toUpperCase()}`;
  const expiryText = formatExpiry(oa, currentRound);

  // Button variants per the viewer × target matrix.
  let buttonClass = '';
  let buttonLabel = claimLabel;
  let buttonDisabled = false;
  if (isSelf) {
    buttonClass = 'bg-hero text-ink-0 font-semibold border-hero';
  } else if (canClaim) {
    // director override on someone else's row
    buttonClass = 'bg-transparent text-hero border-hero/50 hover:bg-hero/10';
  } else {
    buttonClass = 'bg-transparent text-text-mute border-line cursor-not-allowed';
    buttonLabel = 'Watching';
    buttonDisabled = true;
  }

  return (
    <div
      className={`grid grid-cols-[20px_1fr_auto] gap-3 items-start px-3 py-2.5 border border-line ${rowBg}`}
    >
      <span className={`mt-1.5 h-2 w-2 rounded-full ${dotClass}`} aria-hidden="true" />
      <div className="min-w-0">
        <div className="text-sm font-semibold text-text">{title}</div>
        <div className="text-xs text-text-dim leading-snug mt-0.5">{body}</div>
        <div className="font-mono text-[10px] uppercase tracking-[0.06em] text-text-mute mt-1">
          <span className={isSelf ? 'text-hero' : ''}>{metaLabel}</span>
          <span className="mx-1.5">·</span>
          <span>{expiryText}</span>
        </div>
      </div>
      <button
        type="button"
        disabled={buttonDisabled}
        onClick={() => !buttonDisabled && onClaim(oa.id)}
        className={`font-mono text-[10px] uppercase tracking-[0.06em] px-3 h-8 border ${buttonClass}`}
      >
        {buttonLabel}
      </button>
    </div>
  );
}
