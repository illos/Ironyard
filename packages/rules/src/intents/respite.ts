import { IntentTypes, RespitePayloadSchema } from '@ironyard/shared';
import { recomputeStaminaState } from '../stamina';
import type { CampaignState, DerivedIntent, IntentResult, StampedIntent } from '../types';
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

  // Phase 2b cleanup 2b.12 — canon §8.1 (heroes-flat:1417-1419, 1443-1445):
  // *"Whenever you finish a respite, your Victories are converted into
  // Experience ... Each time you finish a respite, you gain XP equal to your
  // Victories, then your Victories reset to 0."* Per-character, not party-wide.
  // Capture each attending PC's pre-respite victories so the log + downstream
  // side-effect handler can write per-PC XP and reset per-PC victories.
  const attending = new Set(state.attendingCharacterIds);
  const xpAwardsByName: { name: string; xp: number }[] = [];

  // For every PC participant:
  //   - refill recoveries.current to recoveries.max (canon § 11.1)
  //   - restore currentStamina to maxStamina (canon § 11.1)
  //   - clamp any negative heroicResources value to 0 (Talent Clarity
  //     floor reset — the per-encounter clarity floor is `-(1+Reason)`,
  //     so a hero who finished an encounter with negative clarity has
  //     it cleared on respite).
  //   - reset victories to 0 if the PC is attending (canon § 8.1: respite
  //     converts victories to XP and resets). Non-attending PCs keep their
  //     victories (they didn't respite this session).
  //   - Pass 3 Slice 1: if a CoP extra-dying-trigger override is held and
  //     recoveries.current > 0 after the refill, clear the override and
  //     re-derive staminaState via recomputeStaminaState.
  // Monsters and any other roster entries are untouched.
  const derived: DerivedIntent[] = [];
  const newParticipants = state.participants.map((entry) => {
    if (!isParticipant(entry) || entry.kind !== 'pc') return entry;
    const fixedResources = entry.heroicResources.map((r) => (r.value < 0 ? { ...r, value: 0 } : r));
    const isAttending = entry.characterId !== null && attending.has(entry.characterId);
    const preRespiteVictories = entry.victories ?? 0;
    if (isAttending && preRespiteVictories > 0) {
      xpAwardsByName.push({ name: entry.name, xp: preRespiteVictories });
    }
    const victoriesNext = isAttending ? 0 : preRespiteVictories;

    // Base participant after standard respite fields are applied.
    let updated = {
      ...entry,
      recoveries: { current: entry.recoveries.max, max: entry.recoveries.max },
      currentStamina: entry.maxStamina,
      heroicResources: fixedResources,
      victories: victoriesNext,
    };

    // Pass 3 Slice 1 — CoP override: predicate 'recoveries-exhausted' no longer
    // holds once recoveries.current > 0 after the refill. Clear the override and
    // re-derive staminaState.
    if (
      updated.staminaOverride?.kind === 'extra-dying-trigger' &&
      updated.staminaOverride.predicate === 'recoveries-exhausted' &&
      updated.recoveries.current > 0
    ) {
      const prevState = updated.staminaState;
      updated = { ...updated, staminaOverride: null };
      const { newState } = recomputeStaminaState(updated);
      updated = { ...updated, staminaState: newState };
      if (newState !== prevState) {
        derived.push({
          actor: intent.actor,
          source: 'server' as const,
          type: IntentTypes.StaminaTransitioned,
          payload: {
            participantId: entry.id,
            from: prevState,
            to: newState,
            cause: 'recoveries-refilled',
          },
          causedBy: intent.id,
        });
      }
    }

    return updated;
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

  // Phase 2b 2b.12 — per-PC XP log line. Format:
  //   "Respite: refilled recoveries for N heroes; XP awarded: Aldric +3, Korva +2."
  // If no attending PC earned XP, omit the XP clause entirely.
  const xpClause =
    xpAwardsByName.length > 0
      ? `; XP awarded: ${xpAwardsByName.map(({ name, xp }) => `${name} +${xp}`).join(', ')}`
      : '';
  const heroLabel = `hero${heroCount !== 1 ? 'es' : ''}`;

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      participants: newParticipants,
      partyVictories: 0,
    },
    derived,
    log: [
      {
        kind: 'info',
        text: `Respite: refilled recoveries for ${heroCount} ${heroLabel}${xpClause}.`,
        intentId: intent.id,
      },
      ...warningLogs,
      ...wyrmplateLogs,
    ],
  };
}
