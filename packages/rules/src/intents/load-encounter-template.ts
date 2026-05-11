import { LoadEncounterTemplatePayloadSchema } from '@ironyard/shared';
import type { CampaignState, DerivedIntent, IntentResult, StampedIntent } from '../types';

export function applyLoadEncounterTemplate(
  state: CampaignState,
  intent: StampedIntent,
): IntentResult {
  if (intent.actor.userId !== state.activeDirectorId) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: 'LoadEncounterTemplate requires active director',
          intentId: intent.id,
        },
      ],
      errors: [
        {
          code: 'not_active_director',
          message: 'only the active director may load encounter templates',
        },
      ],
    };
  }

  const parsed = LoadEncounterTemplatePayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `LoadEncounterTemplate rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }

  const { templateId, entries } = parsed.data;

  // Fan out one derived AddMonster intent per template entry. The DO re-feeds
  // them; each one advances seq and appends participants independently.
  const derived: DerivedIntent[] = entries.map((entry) => ({
    type: 'AddMonster',
    campaignId: state.campaignId,
    actor: intent.actor,
    source: intent.source,
    causedBy: intent.id,
    payload: {
      monsterId: entry.monsterId,
      quantity: entry.quantity,
      nameOverride: entry.nameOverride,
      monster: entry.monster,
    },
  }));

  return {
    state, // unchanged at this level; derived intents do the work
    derived,
    log: [
      {
        kind: 'info',
        text: `loaded template ${templateId} — ${entries.length} group(s)`,
        intentId: intent.id,
      },
    ],
  };
}
