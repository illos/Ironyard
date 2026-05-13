import { RespitePayloadSchema } from '@ironyard/shared';
import type { CampaignState, IntentResult, StampedIntent } from '../types';
import { isParticipant } from '../types';

export function applyRespite(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = RespitePayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `Respite rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }

  // Reject during an active encounter.
  if (state.encounter !== null) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: 'Respite rejected: cannot respite during an active encounter',
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'in_encounter', message: 'cannot respite during an active encounter' }],
    };
  }

  // Capture pre-respite victory count for the log message.
  const xpAwarded = state.partyVictories;

  // For every PC participant:
  //   - refill recoveries.current to recoveries.max (canon § 11.1)
  //   - restore currentStamina to maxStamina (canon § 11.1)
  //   - clamp any negative heroicResources value to 0 (Talent Clarity
  //     floor reset — the per-encounter clarity floor is `-(1+Reason)`,
  //     so a hero who finished an encounter with negative clarity has
  //     it cleared on respite).
  // Monsters and any other roster entries are untouched.
  const newParticipants = state.participants.map((entry) => {
    if (!isParticipant(entry) || entry.kind !== 'pc') return entry;
    const fixedResources = entry.heroicResources.map((r) => (r.value < 0 ? { ...r, value: 0 } : r));
    return {
      ...entry,
      recoveries: { current: entry.recoveries.max, max: entry.recoveries.max },
      currentStamina: entry.maxStamina,
      heroicResources: fixedResources,
    };
  });

  const heroCount = newParticipants.filter((e) => isParticipant(e) && e.kind === 'pc').length;

  // Per canon § 10.17: emit a warning log entry for every PC carrying
  // more than 3 leveled treasures. The stamper computes this from D1
  // inventory state; the reducer just folds the entries into the log.
  const warningLogs = parsed.data.safelyCarryWarnings.map((w) => ({
    kind: 'warning' as const,
    text: `${w.characterName ?? w.characterId} is carrying ${w.count} leveled treasures (canon § 10.17). Roll Presence: t1 director discards one for you, t2 you pick three to keep, t3 nothing happens.`,
    intentId: intent.id,
  }));

  // Per canon § 5.3: Dragon Knight may change their Wyrmplate damage
  // type on respite. The reducer just validates and logs the picks; the
  // actual D1 write happens in the post-reducer side-effect handler
  // (non-Dragon-Knight characters silently no-op there).
  const wyrmplateLogs = Object.entries(parsed.data.wyrmplateChoices).map(
    ([characterId, newType]) => ({
      kind: 'info' as const,
      text: `Wyrmplate damage type changed to ${newType} for ${characterId}.`,
      intentId: intent.id,
    }),
  );

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      participants: newParticipants,
      partyVictories: 0,
    },
    derived: [],
    log: [
      {
        kind: 'info',
        text: `Respite: refilled recoveries for ${heroCount} hero${heroCount !== 1 ? 'es' : ''}; ${xpAwarded} XP each.`,
        intentId: intent.id,
      },
      ...warningLogs,
      ...wyrmplateLogs,
    ],
  };
}
