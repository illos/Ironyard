import type { Participant } from '@ironyard/shared';

export interface TargetBannerProps {
  target: Participant | null;
  selfParticipantId: string | null;
}

export function TargetBanner({ target, selfParticipantId }: TargetBannerProps) {
  if (!target) return null;
  const isSelf = target.id === selfParticipantId;
  const conditionsText =
    target.conditions.length > 0 ? target.conditions.map((c) => c.type).join(', ') : null;
  return (
    <div className="bg-ink-3 border border-accent-glow px-3 py-1.5 text-sm">
      {'→ Targeting '}
      <b className="font-semibold">{isSelf ? 'yourself' : target.name}</b>
      <span className="text-text-mute ml-2 font-mono tabular-nums">
        {target.currentStamina}/{target.maxStamina}
      </span>
      {conditionsText && <span className="text-text-mute ml-2">· {conditionsText}</span>}
    </div>
  );
}
