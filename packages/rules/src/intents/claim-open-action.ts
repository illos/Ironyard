import {
  ClaimOpenActionChoiceSchema,
  ClaimOpenActionPayloadSchema,
  IntentTypes,
} from '@ironyard/shared';
import type { CampaignState, DerivedIntent, IntentResult, LogEntry, StampedIntent } from '../types';
import { isParticipant } from '../types';

export function applyClaimOpenAction(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = ClaimOpenActionPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `ClaimOpenAction rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }

  const oa = state.openActions.find((o) => o.id === parsed.data.openActionId);
  if (!oa) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `ClaimOpenAction: ${parsed.data.openActionId} not found`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'not_found', message: `openAction ${parsed.data.openActionId} not found` }],
    };
  }

  // Authorization: targeted participant's owner OR active director.
  const target = state.participants.find((p) => isParticipant(p) && p.id === oa.participantId);
  const targetParticipant = target && isParticipant(target) ? target : null;
  const targetOwnerId = targetParticipant ? targetParticipant.ownerId : null;
  const actorId = intent.actor.userId;
  const isOwner = targetOwnerId !== null && actorId === targetOwnerId;
  const isDirector = actorId === state.activeDirectorId;
  if (!isOwner && !isDirector) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `ClaimOpenAction: ${actorId} not authorized for ${oa.id}`,
          intentId: intent.id,
        },
      ],
      errors: [
        {
          code: 'not_authorized',
          message: `actor ${actorId} is neither owner of ${oa.participantId} nor active director`,
        },
      ],
    };
  }

  // Per-kind resolution. Each branch may emit derived intents and/or log lines;
  // errors short-circuit and the OA is left in place. The OA is only removed on
  // a successful resolution path.
  const derived: DerivedIntent[] = [];
  const log: LogEntry[] = [];

  // Decorate every derived intent with the standard envelope fields. The
  // reducer cascades each one as a fresh dispatch, so the actor / source /
  // causedBy chain must mirror Task 21–25's pattern.
  const decorate = (type: string, payload: Record<string, unknown>): DerivedIntent => ({
    actor: intent.actor,
    source: 'server' as const,
    type,
    causedBy: intent.id,
    payload,
  });

  switch (oa.kind) {
    case 'title-doomed-opt-in': {
      // Phase 2b 2b.15 — Doomed.md:22: claim applies the Title Doomed override
      // so the PC auto-rolls tier 3 on ability rolls, can't regain Stamina,
      // dies at -staminaMax, and dies at the end of the encounter.
      derived.push(
        decorate(IntentTypes.ApplyParticipantOverride, {
          participantId: oa.participantId,
          override: {
            kind: 'doomed',
            source: 'title-doomed',
            canRegainStamina: false,
            autoTier3OnPowerRolls: true,
            staminaDeathThreshold: 'staminaMax',
            dieAtEncounterEnd: true,
          },
        }),
      );
      break;
    }

    case 'spatial-trigger-elementalist-essence': {
      // Phase 2b 2b.13 — Font of Essence (4th-level Elementalist):
      // "The first time each combat round that you or a creature within 10
      // squares takes damage that isn't untyped or holy damage, you gain 2
      // essence instead of 1."
      const essenceAmount = (targetParticipant?.level ?? 1) >= 4 ? 2 : 1;
      derived.push(
        decorate(IntentTypes.GainResource, {
          participantId: oa.participantId,
          name: 'essence',
          amount: essenceAmount,
        }),
      );
      derived.push(
        decorate(IntentTypes.SetParticipantPerRoundFlag, {
          participantId: oa.participantId,
          key: 'elementalistDamageWithin10Triggered',
          value: true,
        }),
      );
      break;
    }

    case 'spatial-trigger-tactician-ally-heroic': {
      derived.push(
        decorate(IntentTypes.GainResource, {
          participantId: oa.participantId,
          name: 'focus',
          amount: 1,
        }),
      );
      derived.push(
        decorate(IntentTypes.SetParticipantPerRoundFlag, {
          participantId: oa.participantId,
          key: 'allyHeroicWithin10Triggered',
          value: true,
        }),
      );
      break;
    }

    case 'spatial-trigger-null-field': {
      derived.push(
        decorate(IntentTypes.GainResource, {
          participantId: oa.participantId,
          name: 'discipline',
          amount: 1,
        }),
      );
      derived.push(
        decorate(IntentTypes.SetParticipantPerRoundFlag, {
          participantId: oa.participantId,
          key: 'nullFieldEnemyMainTriggered',
          value: true,
        }),
      );
      break;
    }

    case 'spatial-trigger-troubadour-line-of-effect': {
      // No per-round latch — every nat 19/20 LoE event fires fresh per canon.
      derived.push(
        decorate(IntentTypes.GainResource, {
          participantId: oa.participantId,
          name: 'drama',
          amount: 3,
        }),
      );
      break;
    }

    case 'pray-to-the-gods': {
      // The pray claim carries a structured `choice` — narrow it via Zod so we
      // surface a typed prayD3 / prayDamage. (`choice` may be a free-form
      // string for other kinds; only the object form is meaningful here.)
      const choice =
        typeof parsed.data.choice === 'object' && parsed.data.choice !== null
          ? ClaimOpenActionChoiceSchema.safeParse(parsed.data.choice)
          : null;
      const prayD3 = choice && choice.success ? choice.data.prayD3 : undefined;
      const prayDamage = choice && choice.success ? choice.data.prayDamage : undefined;

      if (prayD3 === undefined) {
        return {
          state,
          derived: [],
          log: [
            {
              kind: 'error',
              text: `ClaimOpenAction(pray-to-the-gods): missing choice.prayD3`,
              intentId: intent.id,
            },
          ],
          errors: [
            {
              code: 'missing_pray_d3',
              message: 'pray-to-the-gods claim requires choice.prayD3 (1|2|3)',
            },
          ],
        };
      }

      // TODO(slice 2c): the standard d3 piety gain already applied at StartTurn
      // (turn.ts §heroic-resource gain) — canon says the pray result is
      // "instead of" the standard gain. We emit the pray-table outcome here as
      // an additive gain; the over-count is +1..+3 piety per pray claim. A
      // proper fix requires either (a) persisting the StartTurn d3 outcome so
      // this branch can subtract it, or (b) deferring the standard gain until
      // the pray OA expires unclaimed. Both are out of scope for slice 2a.
      if (prayD3 === 1) {
        if (!prayDamage) {
          return {
            state,
            derived: [],
            log: [
              {
                kind: 'error',
                text: `ClaimOpenAction(pray-to-the-gods, prayD3=1): missing choice.prayDamage`,
                intentId: intent.id,
              },
            ],
            errors: [
              {
                code: 'missing_pray_damage',
                message: 'pray-to-the-gods claim with prayD3=1 requires choice.prayDamage.d6',
              },
            ],
          };
        }
        // Conduit level: stamped on the participant at StartEncounter. Default
        // to 1 if 0/null (defensive — should never happen in practice).
        const conduitLevel =
          targetParticipant?.level && targetParticipant.level > 0 ? targetParticipant.level : 1;
        derived.push(
          decorate(IntentTypes.GainResource, {
            participantId: oa.participantId,
            name: 'piety',
            amount: 1,
          }),
        );
        derived.push(
          decorate(IntentTypes.ApplyDamage, {
            targetId: oa.participantId,
            amount: prayDamage.d6 + conduitLevel,
            damageType: 'psychic',
            sourceIntentId: intent.id,
            bypassDamageReduction: true,
          }),
        );
      } else if (prayD3 === 2) {
        derived.push(
          decorate(IntentTypes.GainResource, {
            participantId: oa.participantId,
            name: 'piety',
            amount: 1,
          }),
        );
      } else {
        // prayD3 === 3 — +2 piety, plus a domain effect (deferred per Q18).
        derived.push(
          decorate(IntentTypes.GainResource, {
            participantId: oa.participantId,
            name: 'piety',
            amount: 2,
          }),
        );
        log.push({
          kind: 'info',
          text: `pray-to-the-gods (prayD3=3) — domain effect deferred per Q18; +2 piety applied`,
          intentId: intent.id,
        });
      }
      break;
    }

    case 'troubadour-auto-revive': {
      derived.push(
        decorate(IntentTypes.TroubadourAutoRevive, {
          participantId: oa.participantId,
        }),
      );
      break;
    }

    default: {
      // Compile-time exhaustiveness — adding a new OpenActionKind without a
      // branch here surfaces as a TS error rather than a silent no-op.
      const _exhaustive: never = oa.kind;
      void _exhaustive;
      break;
    }
  }

  // Remove the OA only on a successful resolution.
  const nextOpenActions = state.openActions.filter((o) => o.id !== oa.id);

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      openActions: nextOpenActions,
    },
    derived,
    log: [
      {
        kind: 'info',
        text: `OpenAction ${oa.id} (${oa.kind}) claimed by ${actorId}`,
        intentId: intent.id,
      },
      ...log,
    ],
  };
}
