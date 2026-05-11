// Post-reducer D1 side-effect writes for intents that mutate campaign_characters
// and campaign_memberships. These run AFTER applyAndBroadcast inside the same
// serialized op. On failure the in-memory state has already advanced, so we log
// and continue rather than hard-failing.
//
// Idempotency: each write is designed to be safe if dispatched twice (INSERT OR
// IGNORE / ON CONFLICT DO NOTHING, or conditional UPDATE/DELETE).

import { CharacterSchema } from '@ironyard/shared';
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
 */
export async function handleSideEffect(
  intent: Intent & { timestamp: number },
  campaignId: string,
  env: Bindings,
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
