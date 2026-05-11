// Post-reducer D1 side-effect writes for intents that mutate campaign_characters
// and campaign_memberships. These run AFTER applyAndBroadcast inside the same
// serialized op. On failure the in-memory state has already advanced, so we log
// and continue rather than hard-failing.
//
// Idempotency: each write is designed to be safe if dispatched twice (INSERT OR
// IGNORE / ON CONFLICT DO NOTHING, or conditional UPDATE/DELETE).
//
// Hybrid intents (state mutation AND D1 side-effect):
// Some intents mutate CampaignState in the reducer AND need to read pre-reducer
// state in the side-effect handler. For these, the DO passes `stateBefore` (the
// state captured before calling applyIntent). The first such intent is Respite,
// which reads `stateBefore.partyVictories` to know how much XP to award before
// the reducer drained it to 0. Non-hybrid intents leave `stateBefore` undefined.

import type { CampaignState } from '@ironyard/rules';
import { isParticipant } from '@ironyard/rules';
import { CharacterSchema, type RespitePayload, RespitePayloadSchema } from '@ironyard/shared';
import type { Intent } from '@ironyard/shared';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from './db';
import { campaignCharacters, campaignMemberships, characters } from './db/schema';
import type { Bindings } from './types';

type MutablePayload = { [key: string]: unknown };

/**
 * Run the appropriate D1 side-effect for the given intent after the reducer
 * has accepted it. Safe to call for every intent — non-side-effect types
 * are no-ops.
 *
 * `stateBefore` is required for hybrid intents (Respite) that need the
 * pre-reducer state to compute their side-effect. For all other intents it
 * is unused.
 */
export async function handleSideEffect(
  intent: Intent & { timestamp: number },
  campaignId: string,
  env: Bindings,
  stateBefore?: CampaignState,
): Promise<void> {
  try {
    switch (intent.type) {
      case 'SubmitCharacter':
        await sideEffectSubmitCharacter(intent, campaignId, env);
        break;
      case 'ApproveCharacter':
        await sideEffectApproveCharacter(intent, campaignId, env);
        break;
      case 'DenyCharacter':
        await sideEffectDenyCharacter(intent, campaignId, env);
        break;
      case 'RemoveApprovedCharacter':
        await sideEffectRemoveApprovedCharacter(intent, campaignId, env);
        break;
      case 'KickPlayer':
        await sideEffectKickPlayer(intent, campaignId, env);
        break;
      case 'SwapKit':
        await sideEffectSwapKit(intent, env);
        break;
      case 'Respite':
        if (stateBefore !== undefined) {
          await sideEffectRespite(intent, stateBefore, env);
        }
        break;
      default:
        break;
    }
  } catch (err) {
    // Log but do not re-throw. In-memory state has already advanced; a failed
    // D1 write is recoverable by re-dispatching the intent.
    console.error(`[side-effect] ${intent.type} failed:`, err);
  }
}

async function sideEffectSubmitCharacter(
  intent: Intent & { timestamp: number },
  campaignId: string,
  env: Bindings,
): Promise<void> {
  const payload = intent.payload as MutablePayload;
  const characterId = payload.characterId;
  if (typeof characterId !== 'string') return;

  const conn = db(env.DB);
  // INSERT OR IGNORE — if the row already exists (duplicate dispatch), do nothing.
  await conn
    .insert(campaignCharacters)
    .values({
      campaignId,
      characterId,
      status: 'pending',
      submittedAt: intent.timestamp,
    })
    .onConflictDoNothing();
}

async function sideEffectApproveCharacter(
  intent: Intent & { timestamp: number },
  campaignId: string,
  env: Bindings,
): Promise<void> {
  const payload = intent.payload as MutablePayload;
  const characterId = payload.characterId;
  if (typeof characterId !== 'string') return;

  const conn = db(env.DB);
  await conn
    .update(campaignCharacters)
    .set({
      status: 'approved',
      decidedAt: intent.timestamp,
      decidedBy: intent.actor.userId,
    })
    .where(
      and(
        eq(campaignCharacters.campaignId, campaignId),
        eq(campaignCharacters.characterId, characterId),
      ),
    );
}

async function sideEffectDenyCharacter(
  intent: Intent & { timestamp: number },
  campaignId: string,
  env: Bindings,
): Promise<void> {
  const payload = intent.payload as MutablePayload;
  const characterId = payload.characterId;
  if (typeof characterId !== 'string') return;

  const conn = db(env.DB);
  await conn
    .delete(campaignCharacters)
    .where(
      and(
        eq(campaignCharacters.campaignId, campaignId),
        eq(campaignCharacters.characterId, characterId),
      ),
    );
}

async function sideEffectRemoveApprovedCharacter(
  intent: Intent & { timestamp: number },
  campaignId: string,
  env: Bindings,
): Promise<void> {
  // Same as DenyCharacter at the D1 level — delete the row.
  const payload = intent.payload as MutablePayload;
  const characterId = payload.characterId;
  if (typeof characterId !== 'string') return;

  const conn = db(env.DB);
  await conn
    .delete(campaignCharacters)
    .where(
      and(
        eq(campaignCharacters.campaignId, campaignId),
        eq(campaignCharacters.characterId, characterId),
      ),
    );
}

async function sideEffectKickPlayer(
  intent: Intent & { timestamp: number },
  campaignId: string,
  env: Bindings,
): Promise<void> {
  const payload = intent.payload as MutablePayload;
  const userId = payload.userId;
  if (typeof userId !== 'string') return;

  const conn = db(env.DB);

  // Delete the membership row.
  await conn
    .delete(campaignMemberships)
    .where(
      and(eq(campaignMemberships.campaignId, campaignId), eq(campaignMemberships.userId, userId)),
    );

  // Find all characters owned by the kicked user, then delete their campaign_characters rows.
  const ownedChars = await conn
    .select({ id: characters.id })
    .from(characters)
    .where(eq(characters.ownerId, userId))
    .all();

  if (ownedChars.length > 0) {
    const ids = ownedChars.map((c) => c.id);
    await conn
      .delete(campaignCharacters)
      .where(
        and(
          eq(campaignCharacters.campaignId, campaignId),
          inArray(campaignCharacters.characterId, ids),
        ),
      );
  }
}

async function sideEffectSwapKit(
  intent: Intent & { timestamp: number },
  env: Bindings,
): Promise<void> {
  const payload = intent.payload as MutablePayload;
  const characterId = payload.characterId;
  const newKitId = payload.newKitId;
  if (typeof characterId !== 'string' || typeof newKitId !== 'string') return;

  const conn = db(env.DB);

  // Load the current character blob.
  const row = await conn
    .select({ data: characters.data })
    .from(characters)
    .where(eq(characters.id, characterId))
    .get();
  if (!row) return;

  // Parse, update kitId, and persist.
  let data: ReturnType<typeof CharacterSchema.parse>;
  try {
    data = CharacterSchema.parse(JSON.parse(row.data));
  } catch {
    // Invalid blob — skip silently, same pattern as stampStartEncounter.
    return;
  }
  data.kitId = newKitId;

  await conn
    .update(characters)
    .set({ data: JSON.stringify(data), updatedAt: intent.timestamp })
    .where(eq(characters.id, characterId));
}

// Hybrid side-effect: writes per-character XP increments to D1 using the
// partyVictories count that existed BEFORE the reducer drained it to 0.
// Skips the write entirely when xpAwarded === 0 (no D1 round-trips needed).
//
// PC participant ids in the roster follow the convention `pc:<characterId>`.
// We strip the prefix to get the D1 `characters` primary key.
async function sideEffectRespite(
  intent: Intent & { timestamp: number },
  stateBefore: CampaignState,
  env: Bindings,
): Promise<void> {
  // Validate payload (should always pass — reducer already accepted the intent).
  const parsed = RespitePayloadSchema.safeParse(intent.payload);
  if (!parsed.success) return;

  const xpAwarded = stateBefore.partyVictories;
  // Nothing to write when there are no victories to award.
  if (xpAwarded === 0) return;

  // Collect character ids for every PC participant that was in the roster
  // before the respite. Participant ids are `pc:<characterId>`.
  // We filter with isParticipant first to narrow from RosterEntry to Participant,
  // then keep only kind === 'pc' (excluding monsters).
  const pcCharIds = stateBefore.participants
    .filter(isParticipant)
    .filter((p) => p.kind === 'pc')
    .map((p) => p.id.replace(/^pc:/, ''));

  if (pcCharIds.length === 0) return;

  const conn = db(env.DB);

  for (const charId of pcCharIds) {
    const row = await conn
      .select({ data: characters.data })
      .from(characters)
      .where(eq(characters.id, charId))
      .get();
    if (!row) continue;

    let data: ReturnType<typeof CharacterSchema.parse>;
    try {
      data = CharacterSchema.parse(JSON.parse(row.data));
    } catch {
      // Corrupt blob — skip this character rather than failing the whole batch.
      console.error(`[side-effect] Respite: skipping character ${charId} — invalid blob`);
      continue;
    }

    data.xp = (data.xp ?? 0) + xpAwarded;

    await conn
      .update(characters)
      .set({ data: JSON.stringify(data), updatedAt: intent.timestamp })
      .where(eq(characters.id, charId));
  }
}

// Re-export RespitePayload type for consumers that need to reference it.
export type { RespitePayload };
