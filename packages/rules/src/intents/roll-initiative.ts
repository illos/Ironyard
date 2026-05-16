import { type Participant, RollInitiativePayloadSchema } from '@ironyard/shared';
import { participantSide } from '../state-helpers';
import type { CampaignState, IntentResult, StampedIntent } from '../types';
import { isParticipant } from '../types';

export function applyRollInitiative(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = RollInitiativePayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `RollInitiative rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }
  if (!state.encounter) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: 'RollInitiative: no active encounter', intentId: intent.id }],
      errors: [{ code: 'no_active_encounter', message: 'no active encounter' }],
    };
  }
  if (state.encounter.firstSide !== null) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'info',
          text: 'RollInitiative ignored: firstSide already set',
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'already_rolled', message: 'initiative already rolled this encounter' }],
    };
  }

  const { winner, surprised, rolledD10 } = parsed.data;
  const ids = new Set(state.participants.filter(isParticipant).map((p) => p.id));
  for (const sid of surprised) {
    if (!ids.has(sid)) {
      return {
        state,
        derived: [],
        log: [
          {
            kind: 'error',
            text: `RollInitiative: unknown participant ${sid}`,
            intentId: intent.id,
          },
        ],
        errors: [{ code: 'unknown_participant', message: `unknown participant id ${sid}` }],
      };
    }
  }

  // Phase 2b slice 2 — Memonek Unphased gate. Filter Unphased participants
  // out of the surprised set BEFORE the auto-pick rule runs, so an Unphased
  // hero on a side that would otherwise be "all surprised" doesn't force the
  // foes-must-win auto-pick. Surprised is a participant flag, not a
  // ConditionType, so this checks purchasedTraits directly.
  const participantById = new Map(state.participants.filter(isParticipant).map((p) => [p.id, p]));
  const droppedUnphased: string[] = [];
  const effectiveSurprised = surprised.filter((sid) => {
    const p = participantById.get(sid);
    if (p?.purchasedTraits.includes('unphased')) {
      droppedUnphased.push(sid);
      return false;
    }
    return true;
  });

  // Compute the post-stamp surprised set and validate the auto-pick rule.
  const willBeSurprised = new Set(effectiveSurprised);
  const participantsBySide = { heroes: [] as Participant[], foes: [] as Participant[] };
  for (const p of state.participants) {
    if (!isParticipant(p)) continue;
    participantsBySide[participantSide(p)].push(p);
  }
  function allSurprised(side: 'heroes' | 'foes'): boolean {
    const list = participantsBySide[side];
    return list.length > 0 && list.every((p) => willBeSurprised.has(p.id) || p.surprised);
  }
  const heroesAllSurprised = allSurprised('heroes');
  const foesAllSurprised = allSurprised('foes');
  // One side fully surprised AND the other side has at least one un-surprised participant
  if (heroesAllSurprised && !foesAllSurprised && winner !== 'foes') {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: 'RollInitiative: all heroes surprised; foes must win',
          intentId: intent.id,
        },
      ],
      errors: [
        {
          code: 'surprise_override_mismatch',
          message: 'heroes fully surprised — winner must be foes',
        },
      ],
    };
  }
  if (foesAllSurprised && !heroesAllSurprised && winner !== 'heroes') {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: 'RollInitiative: all foes surprised; heroes must win',
          intentId: intent.id,
        },
      ],
      errors: [
        {
          code: 'surprise_override_mismatch',
          message: 'foes fully surprised — winner must be heroes',
        },
      ],
    };
  }

  const nextParticipants = state.participants.map((p) =>
    isParticipant(p) && willBeSurprised.has(p.id) ? { ...p, surprised: true } : p,
  );

  const reason =
    rolledD10 !== undefined
      ? `d10=${rolledD10} → ${winner} first`
      : heroesAllSurprised || foesAllSurprised
        ? `auto-pick: one side fully surprised → ${winner} first`
        : `manual: ${winner} first`;

  const log = [{ kind: 'info' as const, text: `RollInitiative — ${reason}`, intentId: intent.id }];
  if (droppedUnphased.length > 0) {
    log.push({
      kind: 'info' as const,
      text: `Memonek Unphased — surprise filtered for ${droppedUnphased.join(', ')}`,
      intentId: intent.id,
    });
  }

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      participants: nextParticipants,
      encounter: {
        ...state.encounter,
        firstSide: winner,
        currentPickingSide: winner,
        actedThisRound: [],
      },
    },
    derived: [],
    log,
  };
}
