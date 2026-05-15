import type { OpenAction, OpenActionKind } from './open-action';

/**
 * Per-kind UI copy for OpenActionsList. Empty in 2b.0; populated by 2b.0.1
 * consumers as they register their kinds.
 *
 * `OpenActionsList.tsx` reads from this registry. If a kind is missing,
 * the component falls back to a generic title (`Open Action: <kind>`)
 * and disables the Claim button — that's the signal to the implementer
 * that they need to register copy for the new kind.
 */
export type OpenActionCopy = {
  title: (oa: OpenAction) => string;
  body: (oa: OpenAction) => string;
  claimLabel: (oa: OpenAction) => string;
};

export const OPEN_ACTION_COPY: Partial<Record<OpenActionKind, OpenActionCopy>> = {
  'title-doomed-opt-in': {
    title: () => 'Embrace your doom?',
    body: () =>
      'Your stamina has hit 0. Per the *Doomed* title, you may become doomed — ' +
      'automatically obtain a tier 3 outcome on every power roll, but you cannot ' +
      'regain Stamina, and you die at the end of the encounter.',
    claimLabel: () => 'Become doomed',
  },
};
