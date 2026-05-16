import type { OpenAction } from '@ironyard/shared';
import { OPEN_ACTION_COPY } from '@ironyard/shared';

export type FormattedOpenAction = {
  title: string;
  body: string;
  claimLabel: string;
};

/**
 * Pass-through helper around the `OPEN_ACTION_COPY` registry. Mirrors the
 * fallback logic in `OpenActionsList.tsx`: if a kind has no registered copy,
 * we synthesize a generic title and a `Claim` label so the row still renders
 * (and so missing copy is visually obvious to the implementer).
 */
export function formatOpenAction(oa: OpenAction): FormattedOpenAction {
  const copy = OPEN_ACTION_COPY[oa.kind];
  return {
    title: copy?.title(oa) ?? `Open Action: ${oa.kind}`,
    body: copy?.body(oa) ?? '',
    claimLabel: copy?.claimLabel(oa) ?? 'Claim',
  };
}
