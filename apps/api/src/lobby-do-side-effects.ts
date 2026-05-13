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
import { CharacterSchema, type RespitePayload, RespitePayloadSchema } from '@ironyard/shared';
import type { Intent, Participant } from '@ironyard/shared';
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
      case 'EquipItem':
        await sideEffectEquipItem(intent, env);
        break;
      case 'UnequipItem':
        await sideEffectUnequipItem(intent, env);
        break;
      case 'UseConsumable':
        await sideEffectUseConsumable(intent, env);
        break;
      case 'PushItem':
        await sideEffectPushItem(intent, env);
        break;
      case 'EndEncounter':
        if (stateBefore !== undefined) {
          await sideEffectEndEncounter(intent, stateBefore, env);
        }
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

// Slice 1 (Epic 2C): flip the targeted inventory entry's `equipped`
// flag to true on the character blob. Safe to dispatch twice (idempotent
// — equipping an already-equipped entry is a no-op write). Uses
// CharacterSchema.parse to keep the blob shape canonical (e.g. fills in
// any missing defaults) — mirrors sideEffectSwapKit.
async function sideEffectEquipItem(
  intent: Intent & { timestamp: number },
  env: Bindings,
): Promise<void> {
  const payload = intent.payload as MutablePayload;
  const characterId = payload.characterId;
  const inventoryEntryId = payload.inventoryEntryId;
  if (typeof characterId !== 'string' || typeof inventoryEntryId !== 'string') return;

  const conn = db(env.DB);
  const row = await conn
    .select({ data: characters.data })
    .from(characters)
    .where(eq(characters.id, characterId))
    .get();
  if (!row) return;

  let data: ReturnType<typeof CharacterSchema.parse>;
  try {
    data = CharacterSchema.parse(JSON.parse(row.data));
  } catch {
    // Invalid blob — skip silently rather than throwing.
    return;
  }

  data.inventory = data.inventory.map((e) =>
    e.id === inventoryEntryId ? { ...e, equipped: true } : e,
  );

  await conn
    .update(characters)
    .set({ data: JSON.stringify(data), updatedAt: intent.timestamp })
    .where(eq(characters.id, characterId));
}

// Slice 1 (Epic 2C): opposite of sideEffectEquipItem — flips the
// targeted inventory entry's `equipped` flag to false on the character
// blob. Safe to dispatch twice (idempotent — unequipping an already-
// unequipped entry is a no-op write).
async function sideEffectUnequipItem(
  intent: Intent & { timestamp: number },
  env: Bindings,
): Promise<void> {
  const payload = intent.payload as MutablePayload;
  const characterId = payload.characterId;
  const inventoryEntryId = payload.inventoryEntryId;
  if (typeof characterId !== 'string' || typeof inventoryEntryId !== 'string') return;

  const conn = db(env.DB);
  const row = await conn
    .select({ data: characters.data })
    .from(characters)
    .where(eq(characters.id, characterId))
    .get();
  if (!row) return;

  let data: ReturnType<typeof CharacterSchema.parse>;
  try {
    data = CharacterSchema.parse(JSON.parse(row.data));
  } catch {
    // Invalid blob — skip silently rather than throwing.
    return;
  }

  data.inventory = data.inventory.map((e) =>
    e.id === inventoryEntryId ? { ...e, equipped: false } : e,
  );

  await conn
    .update(characters)
    .set({ data: JSON.stringify(data), updatedAt: intent.timestamp })
    .where(eq(characters.id, characterId));
}

// Slice 2 (Epic 2C): decrement the targeted inventory entry's quantity by 1.
// When the resulting quantity reaches 0 the entry is removed entirely. Mirrors
// sideEffectEquipItem's CharacterSchema.parse → mutate → persist pattern;
// uses immutable `flatMap` so the inventory stays canonically shaped.
//
// Not strictly idempotent — re-dispatching this side-effect would over-decrement
// — but the DO never re-dispatches a successfully-reduced intent. If quantity
// is already at 0 (e.g. due to a stale entry), the entry is removed instead of
// going negative.
async function sideEffectUseConsumable(
  intent: Intent & { timestamp: number },
  env: Bindings,
): Promise<void> {
  const payload = intent.payload as MutablePayload;
  const characterId = payload.characterId;
  const inventoryEntryId = payload.inventoryEntryId;
  if (typeof characterId !== 'string' || typeof inventoryEntryId !== 'string') return;

  const conn = db(env.DB);
  const row = await conn
    .select({ data: characters.data })
    .from(characters)
    .where(eq(characters.id, characterId))
    .get();
  if (!row) return;

  let data: ReturnType<typeof CharacterSchema.parse>;
  try {
    data = CharacterSchema.parse(JSON.parse(row.data));
  } catch {
    return;
  }

  data.inventory = data.inventory.flatMap((e) => {
    if (e.id !== inventoryEntryId) return [e];
    const newQty = e.quantity - 1;
    if (newQty <= 0) return [];
    return [{ ...e, quantity: newQty }];
  });

  await conn
    .update(characters)
    .set({ data: JSON.stringify(data), updatedAt: intent.timestamp })
    .where(eq(characters.id, characterId));
}

// Slice 3 (Epic 2C): director pushes an item into a player's inventory.
// Stacks the quantity onto an existing inventory entry with the same itemId
// (preserving its id + equipped flag) or appends a new entry. Equipped is
// always set to false on a newly created entry — the player chooses when to
// equip via EquipItem. Uses CharacterSchema.parse → mutate → persist, mirror
// of sideEffectEquipItem.
async function sideEffectPushItem(
  intent: Intent & { timestamp: number },
  env: Bindings,
): Promise<void> {
  const payload = intent.payload as MutablePayload;
  const targetCharacterId = payload.targetCharacterId;
  const itemId = payload.itemId;
  const quantity = payload.quantity;
  if (
    typeof targetCharacterId !== 'string' ||
    typeof itemId !== 'string' ||
    typeof quantity !== 'number'
  ) {
    return;
  }

  const conn = db(env.DB);
  const row = await conn
    .select({ data: characters.data })
    .from(characters)
    .where(eq(characters.id, targetCharacterId))
    .get();
  if (!row) return;

  let data: ReturnType<typeof CharacterSchema.parse>;
  try {
    data = CharacterSchema.parse(JSON.parse(row.data));
  } catch {
    return;
  }

  const existingIdx = data.inventory.findIndex((e) => e.itemId === itemId);
  data.inventory =
    existingIdx >= 0
      ? data.inventory.map((e, i) =>
          i === existingIdx ? { ...e, quantity: e.quantity + quantity } : e,
        )
      : [...data.inventory, { id: crypto.randomUUID(), itemId, quantity, equipped: false }];

  await conn
    .update(characters)
    .set({ data: JSON.stringify(data), updatedAt: intent.timestamp })
    .where(eq(characters.id, targetCharacterId));
}

// Writes each PC's encounter-final currentStamina and recoveriesUsed back to
// the character blob so the next encounter starts with the correct persisted
// values. Uses stateBefore (the pre-reducer state) — EndEncounter does not
// touch stamina or recoveries, so pre- and post-reducer values are identical.
async function sideEffectEndEncounter(
  intent: Intent & { timestamp: number },
  stateBefore: CampaignState,
  env: Bindings,
): Promise<void> {
  const pcParticipants = stateBefore.participants.filter(
    (p): p is Participant & { characterId: string } =>
      p.kind === 'pc' && p.characterId !== null,
  );

  if (pcParticipants.length === 0) return;

  const conn = db(env.DB);
  const charIds = pcParticipants.map((p) => p.characterId);

  const rows = await conn
    .select({ id: characters.id, data: characters.data })
    .from(characters)
    .where(inArray(characters.id, charIds))
    .all();
  const rowById = new Map(rows.map((r) => [r.id, r.data]));

  await Promise.all(
    pcParticipants.map(async (participant) => {
      const raw = rowById.get(participant.characterId);
      if (!raw) return;

      let data: ReturnType<typeof CharacterSchema.parse>;
      try {
        data = CharacterSchema.parse(JSON.parse(raw));
      } catch {
        console.error(
          `[side-effect] EndEncounter: skipping character ${participant.characterId} — invalid blob`,
        );
        return;
      }

      data.currentStamina = participant.currentStamina;
      data.recoveriesUsed = participant.recoveries.max - participant.recoveries.current;

      await conn
        .update(characters)
        .set({ data: JSON.stringify(data), updatedAt: intent.timestamp })
        .where(eq(characters.id, participant.characterId));
    }),
  );
}

// Hybrid side-effect: writes per-character XP increments to D1 using the
// partyVictories count that existed BEFORE the reducer drained it to 0.
// Also processes Slice 4 (Epic 2C) extensions: per-character Wyrmplate
// damage-type changes (Dragon Knight ancestry). The two writes are
// folded into one UPDATE per affected character to keep D1 round-trips
// bounded.
async function sideEffectRespite(
  intent: Intent & { timestamp: number },
  stateBefore: CampaignState,
  env: Bindings,
): Promise<void> {
  // Validate payload (should always pass — reducer already accepted the intent).
  const parsed = RespitePayloadSchema.safeParse(intent.payload);
  if (!parsed.success) return;

  const xpAwarded = stateBefore.partyVictories;
  const wyrmplateChoices = parsed.data.wyrmplateChoices;

  const pcCharIds = stateBefore.participants
    .filter(
      (p): p is Participant & { characterId: string } =>
        p.kind === 'pc' && p.characterId !== null,
    )
    .map((p) => p.characterId);
  const pcCharIdSet = new Set(pcCharIds);

  // Union of (a) characters in the lobby that gain XP and (b)
  // characters with a Wyrmplate damage-type pick. The pick can target a
  // character that isn't in the lobby roster (it's a respite-time
  // bookkeeping change, not an encounter action).
  const affectedCharIds = [...new Set<string>([...pcCharIds, ...Object.keys(wyrmplateChoices)])];

  if (affectedCharIds.length === 0) return;
  // Skip entirely when there's nothing to write — no XP and no picks.
  if (xpAwarded === 0 && Object.keys(wyrmplateChoices).length === 0) return;

  const conn = db(env.DB);

  const rows = await conn
    .select({ id: characters.id, data: characters.data })
    .from(characters)
    .where(inArray(characters.id, affectedCharIds))
    .all();
  const rowById = new Map(rows.map((r) => [r.id, r.data]));

  await Promise.all(
    affectedCharIds.map(async (charId) => {
      const raw = rowById.get(charId);
      if (!raw) return;

      let data: ReturnType<typeof CharacterSchema.parse>;
      try {
        data = CharacterSchema.parse(JSON.parse(raw));
      } catch {
        // Corrupt blob — skip this character rather than failing the whole batch.
        console.error(`[side-effect] Respite: skipping character ${charId} — invalid blob`);
        return;
      }

      let mutated = false;
      const inLobby = pcCharIdSet.has(charId);

      // XP increment — only for PCs that were in the lobby roster.
      if (xpAwarded > 0 && inLobby) {
        data.xp = (data.xp ?? 0) + xpAwarded;
        mutated = true;
      }

      // Respite resets stamina and recoveries to default (null → re-derived at
      // next StartEncounter; 0 recoveries used → full pool restored).
      if (inLobby) {
        data.currentStamina = null;
        data.recoveriesUsed = 0;
        mutated = true;
      }

      // Wyrmplate damage-type change — only applies to Dragon Knights.
      // Non-Dragon-Knight characters are silently skipped so a stale or
      // mistargeted pick can't corrupt another ancestry's blob.
      const newType = wyrmplateChoices[charId];
      if (typeof newType === 'string' && data.ancestryId === 'dragon-knight') {
        data.ancestryChoices = {
          ...data.ancestryChoices,
          wyrmplateType: newType,
        };
        mutated = true;
      }

      if (!mutated) return;

      await conn
        .update(characters)
        .set({ data: JSON.stringify(data), updatedAt: intent.timestamp })
        .where(eq(characters.id, charId));
    }),
  );
}

// Re-export RespitePayload type for consumers that need to reference it.
export type { RespitePayload };
