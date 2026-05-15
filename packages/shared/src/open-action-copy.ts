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
  'spatial-trigger-elementalist-essence': {
    title: () => 'Were you within 10 squares?',
    body: (oa) => {
      const payload = oa.payload as { targetName?: string; amount?: number; type?: string };
      return `${payload.targetName ?? 'A creature'} just took ${payload.amount ?? 0} ${payload.type ?? 'damage'}. If you or anyone was within 10 squares, claim for +1 essence.`;
    },
    claimLabel: () => 'Gain 1 essence',
  },
  'spatial-trigger-tactician-ally-heroic': {
    title: () => 'Was the heroic ability within 10 squares?',
    body: (oa) => {
      const payload = oa.payload as { actorName?: string; abilityName?: string };
      return `${payload.actorName ?? 'An ally'} just used ${payload.abilityName ?? 'a heroic ability'}. If they were within 10 squares of you, claim for +1 focus.`;
    },
    claimLabel: () => 'Gain 1 focus',
  },
  'spatial-trigger-null-field': {
    title: () => 'Was the enemy in your Null Field?',
    body: (oa) => {
      const payload = oa.payload as { actorName?: string };
      return `${payload.actorName ?? 'An enemy'} used a main action. If they were in the area of your Null Field, claim for +1 discipline.`;
    },
    claimLabel: () => 'Gain 1 discipline',
  },
  'spatial-trigger-troubadour-line-of-effect': {
    title: () => 'Was that in your line of effect?',
    body: (oa) => {
      const payload = oa.payload as { actorName?: string; naturalValue?: number };
      return `${payload.actorName ?? 'A creature'} rolled a natural ${payload.naturalValue ?? '19/20'}. If they were within your line of effect, claim for +3 drama.`;
    },
    claimLabel: () => 'Gain 3 drama',
  },
  'pray-to-the-gods': {
    title: () => 'Pray to the gods?',
    body: () =>
      `Roll 1d3 to pray instead of taking your standard piety gain. 1: +1 piety but take 1d6 + level psychic damage that can't be reduced. 2: +1 piety. 3: +2 piety.`,
    claimLabel: () => 'Pray',
  },
  'troubadour-auto-revive': {
    title: () => 'Return to life?',
    body: () =>
      `You've reached 30 drama posthumous. You can come back to life with 1 stamina and 0 drama.`,
    claimLabel: () => 'Return to life',
  },
};
