// Stamping pipeline for LobbyDO. Each stamper runs BEFORE applyAndBroadcast.
// A stamper either mutates the intent payload (stamping in server-derived data)
// or returns a rejection reason (string) that the caller sends to the socket.
//
// Stampers that cannot reject (JumpBehindScreen, SubmitCharacter, KickPlayer)
// still return null on success — the reducer performs the authority check.

import { CONSUMABLE_HEAL_AMOUNTS } from '@ironyard/rules';
import type { CampaignState } from '@ironyard/rules';
import {
  CharacterSchema,
  EncounterTemplateDataSchema,
  type Intent,
  type LoadEncounterTemplatePayload,
  type SafelyCarryWarning,
  type StartEncounterStampedMonster,
  type StartEncounterStampedPc,
  type SwapKitPayload,
} from '@ironyard/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { loadItemById, loadMonsterById } from './data/index';
import { db } from './db';
import {
  campaignCharacters,
  campaignMemberships,
  characters,
  encounterTemplates,
  sessions,
} from './db/schema';
import type { Bindings } from './types';

// Return type: null = stamped ok, string = rejection reason.
type StampResult = null | string;

// Payload cast helper — used to stamp server-derived fields onto an intent's
// payload (which arrives as `unknown` from the client).
type MutablePayload = { [key: string]: unknown };

/**
 * AddMonster — look up monster stat block by monsterId; stamp onto payload.
 * Rejects if the monster is not found in the static data.
 */
export async function stampAddMonster(
  intent: Intent & { timestamp: number },
  _campaignState: CampaignState,
  _env: Bindings,
): Promise<StampResult> {
  const payload = intent.payload as MutablePayload;
  const monsterId = payload.monsterId;
  if (typeof monsterId !== 'string') return 'invalid_payload: monsterId required';

  const monster = loadMonsterById(monsterId);
  if (!monster) return `monster_not_found: ${monsterId}`;

  // Stamp the full stat block onto the payload in-place.
  payload.monster = monster;
  return null;
}

/**
 * LoadEncounterTemplate — resolve template from D1, then resolve each
 * monster entry. Stamps `entries` onto the payload.
 * Rejects if template not found, data invalid, or any monster not found.
 */
export async function stampLoadEncounterTemplate(
  intent: Intent & { timestamp: number },
  _campaignState: CampaignState,
  env: Bindings,
): Promise<StampResult> {
  const payload = intent.payload as MutablePayload;
  const templateId = payload.templateId;
  if (typeof templateId !== 'string' || !templateId) return 'invalid_payload: templateId required';

  const conn = db(env.DB);
  const row = await conn
    .select()
    .from(encounterTemplates)
    .where(eq(encounterTemplates.id, templateId))
    .get();
  if (!row) return `template_not_found: ${templateId}`;

  // Validate the data JSON against the schema.
  let templateData: {
    monsters: Array<{ monsterId: string; quantity: number; nameOverride?: string }>;
  };
  try {
    const parsed = EncounterTemplateDataSchema.safeParse(JSON.parse(row.data));
    if (!parsed.success) return `template_data_invalid: ${parsed.error.message}`;
    templateData = parsed.data;
  } catch {
    return 'template_data_invalid: JSON parse error';
  }

  // Resolve each monster entry.
  const entries: LoadEncounterTemplatePayload['entries'] = [];
  for (const entry of templateData.monsters) {
    const monster = loadMonsterById(entry.monsterId);
    if (!monster) return `monster_not_found: ${entry.monsterId}`;
    entries.push({
      monsterId: entry.monsterId,
      quantity: entry.quantity,
      ...(entry.nameOverride !== undefined ? { nameOverride: entry.nameOverride } : {}),
      monster,
    });
  }

  if (entries.length === 0) return 'template_empty: no monster entries';

  // Stamp resolved entries in-place.
  payload.entries = entries;
  return null;
}

/**
 * JumpBehindScreen — look up the actor's is_director flag in D1.
 * Owner always gets permitted=true regardless of the DB row.
 * Does NOT reject — the reducer handles owner-bypass logic.
 */
export async function stampJumpBehindScreen(
  intent: Intent & { timestamp: number },
  campaignState: CampaignState,
  env: Bindings,
): Promise<StampResult> {
  const payload = intent.payload as MutablePayload;
  const actorId = intent.actor.userId;

  // Owner always has director permission — short-circuit the D1 read.
  if (actorId === campaignState.ownerId) {
    payload.permitted = true;
    return null;
  }

  const conn = db(env.DB);
  const membership = await conn
    .select({ isDirector: campaignMemberships.isDirector })
    .from(campaignMemberships)
    .where(
      and(
        eq(campaignMemberships.campaignId, campaignState.campaignId),
        eq(campaignMemberships.userId, actorId),
      ),
    )
    .get();

  payload.permitted = membership?.isDirector === 1;
  return null;
}

/**
 * SubmitCharacter — verify the actor owns the character and is a campaign member.
 * Stamps ownsCharacter and isCampaignMember. Does NOT reject — the reducer decides.
 */
export async function stampSubmitCharacter(
  intent: Intent & { timestamp: number },
  campaignState: CampaignState,
  env: Bindings,
): Promise<StampResult> {
  const payload = intent.payload as MutablePayload;
  const characterId = payload.characterId;
  if (typeof characterId !== 'string') return 'invalid_payload: characterId required';

  const actorId = intent.actor.userId;
  const conn = db(env.DB);

  // Check character ownership.
  const character = await conn
    .select({ ownerId: characters.ownerId })
    .from(characters)
    .where(eq(characters.id, characterId))
    .get();
  payload.ownsCharacter = character?.ownerId === actorId;

  // Check campaign membership.
  const membership = await conn
    .select({ userId: campaignMemberships.userId })
    .from(campaignMemberships)
    .where(
      and(
        eq(campaignMemberships.campaignId, campaignState.campaignId),
        eq(campaignMemberships.userId, actorId),
      ),
    )
    .get();
  payload.isCampaignMember = membership !== undefined && membership !== null;

  return null;
}

/**
 * EquipItem — verify the actor owns the character, then look up the
 * inventory entry on the character blob. Stamps `ownsCharacter` and
 * `inventoryEntryExists`. Does NOT reject — the reducer is the authority.
 *
 * Mirrors stampSubmitCharacter for ownership; in addition parses the
 * characters.data JSON to confirm the inventory entry id exists. The
 * actual D1 write (flipping `equipped` to true) happens in the
 * post-reducer side-effect handler.
 */
export async function stampEquipItem(
  intent: Intent & { timestamp: number },
  _campaignState: CampaignState,
  env: Bindings,
): Promise<StampResult> {
  const payload = intent.payload as MutablePayload;
  const characterId = payload.characterId;
  const inventoryEntryId = payload.inventoryEntryId;
  if (typeof characterId !== 'string' || typeof inventoryEntryId !== 'string') {
    return 'invalid_payload: characterId and inventoryEntryId required';
  }

  const actorId = intent.actor.userId;
  const conn = db(env.DB);

  const character = await conn
    .select({ ownerId: characters.ownerId, data: characters.data })
    .from(characters)
    .where(eq(characters.id, characterId))
    .get();

  payload.ownsCharacter = character?.ownerId === actorId;

  // Parse the character.data JSON to find the inventory entry by id.
  let entryExists = false;
  if (character?.data) {
    try {
      const parsed = JSON.parse(character.data);
      entryExists =
        Array.isArray(parsed.inventory) &&
        parsed.inventory.some((e: { id?: string }) => e.id === inventoryEntryId);
    } catch {
      entryExists = false;
    }
  }
  payload.inventoryEntryExists = entryExists;

  return null;
}

/**
 * UnequipItem — verify the actor owns the character, then look up the
 * inventory entry on the character blob. Stamps `ownsCharacter` and
 * `inventoryEntryExists`. Does NOT reject — the reducer is the authority.
 *
 * Logic identical to stampEquipItem (the dispatch switch routes to the
 * right stamper); the post-reducer side-effect handler flips `equipped`
 * to false instead of true.
 */
export async function stampUnequipItem(
  intent: Intent & { timestamp: number },
  _campaignState: CampaignState,
  env: Bindings,
): Promise<StampResult> {
  const payload = intent.payload as MutablePayload;
  const characterId = payload.characterId;
  const inventoryEntryId = payload.inventoryEntryId;
  if (typeof characterId !== 'string' || typeof inventoryEntryId !== 'string') {
    return 'invalid_payload: characterId and inventoryEntryId required';
  }

  const actorId = intent.actor.userId;
  const conn = db(env.DB);

  const character = await conn
    .select({ ownerId: characters.ownerId, data: characters.data })
    .from(characters)
    .where(eq(characters.id, characterId))
    .get();

  payload.ownsCharacter = character?.ownerId === actorId;

  // Parse the character.data JSON to find the inventory entry by id.
  let entryExists = false;
  if (character?.data) {
    try {
      const parsed = JSON.parse(character.data);
      entryExists =
        Array.isArray(parsed.inventory) &&
        parsed.inventory.some((e: { id?: string }) => e.id === inventoryEntryId);
    } catch {
      entryExists = false;
    }
  }
  payload.inventoryEntryExists = entryExists;

  return null;
}

/**
 * UseConsumable — verify the actor owns the character, locate the inventory
 * entry, and look up the item's category + `effectKind` in the static items
 * catalog. Stamps `ownsCharacter`, `inventoryEntryExists`, `itemIsConsumable`,
 * `effectKind`, and `healAmount`. Does NOT reject — the reducer is the
 * authority.
 *
 * `healAmount` is sourced from the hand-authored
 * `CONSUMABLE_HEAL_AMOUNTS` override table (populated in Slice 5). Items not
 * yet listed there stamp 0 — the reducer's `instant` branch falls through to
 * the manual-log path when healAmount is 0, so the slice is non-functional
 * until Slice 5 wires up the table.
 */
export async function stampUseConsumable(
  intent: Intent & { timestamp: number },
  _campaignState: CampaignState,
  env: Bindings,
): Promise<StampResult> {
  const payload = intent.payload as MutablePayload;
  const characterId = payload.characterId;
  const inventoryEntryId = payload.inventoryEntryId;
  if (typeof characterId !== 'string' || typeof inventoryEntryId !== 'string') {
    return 'invalid_payload: characterId and inventoryEntryId required';
  }

  const actorId = intent.actor.userId;
  const conn = db(env.DB);

  const character = await conn
    .select({ ownerId: characters.ownerId, data: characters.data })
    .from(characters)
    .where(eq(characters.id, characterId))
    .get();

  payload.ownsCharacter = character?.ownerId === actorId;

  // Find the inventory entry on the character blob to recover its itemId.
  let entry: { id: string; itemId: string } | null = null;
  if (character?.data) {
    try {
      const parsed = JSON.parse(character.data);
      if (Array.isArray(parsed.inventory)) {
        const match = parsed.inventory.find(
          (e: { id?: string; itemId?: string }) => e.id === inventoryEntryId,
        );
        if (match && typeof match.itemId === 'string') {
          entry = { id: match.id, itemId: match.itemId };
        }
      }
    } catch {
      // entry stays null
    }
  }
  payload.inventoryEntryExists = entry !== null;

  // Look up the item in the static catalog to confirm category +
  // resolve effectKind. Heal amount comes from the hand-authored
  // override table (empty until Slice 5).
  let itemIsConsumable = false;
  let effectKind: 'instant' | 'duration' | 'two-phase' | 'attack' | 'area' | 'unknown' = 'unknown';
  let healAmount = 0;
  if (entry) {
    const item = loadItemById(entry.itemId);
    if (item && item.category === 'consumable') {
      itemIsConsumable = true;
      effectKind = item.effectKind ?? 'unknown';
      healAmount = CONSUMABLE_HEAL_AMOUNTS[item.id] ?? 0;
    }
  }
  payload.itemIsConsumable = itemIsConsumable;
  payload.effectKind = effectKind;
  payload.healAmount = healAmount;

  return null;
}

/**
 * PushItem — director pushes an item into a player's inventory. Stamps:
 *   - `isDirectorPermitted` from campaign_memberships.is_director (owner is
 *     always permitted — short-circuit before the D1 read).
 *   - `targetCharacterExists` from the characters row.
 *   - `itemExists` from the static items catalog.
 * Does NOT reject — the reducer is the authority on all three flags.
 */
export async function stampPushItem(
  intent: Intent & { timestamp: number },
  campaignState: CampaignState,
  env: Bindings,
): Promise<StampResult> {
  const payload = intent.payload as MutablePayload;
  const targetCharacterId = payload.targetCharacterId;
  const itemId = payload.itemId;
  if (typeof targetCharacterId !== 'string' || typeof itemId !== 'string') {
    return 'invalid_payload: targetCharacterId and itemId required';
  }

  const actorId = intent.actor.userId;
  const conn = db(env.DB);

  // Director permission: owner is always permitted; otherwise read the
  // campaign_memberships row's is_director flag. Mirrors stampJumpBehindScreen.
  if (actorId === campaignState.ownerId) {
    payload.isDirectorPermitted = true;
  } else {
    const membership = await conn
      .select({ isDirector: campaignMemberships.isDirector })
      .from(campaignMemberships)
      .where(
        and(
          eq(campaignMemberships.campaignId, campaignState.campaignId),
          eq(campaignMemberships.userId, actorId),
        ),
      )
      .get();
    payload.isDirectorPermitted = membership?.isDirector === 1;
  }

  // Target character existence — does a row exist for this id?
  const character = await conn
    .select({ id: characters.id })
    .from(characters)
    .where(eq(characters.id, targetCharacterId))
    .get();
  payload.targetCharacterExists = character !== undefined;

  // Item exists in the static catalog?
  payload.itemExists = loadItemById(itemId) !== null;

  return null;
}

/**
 * KickPlayer — find the campaign_characters rows for the kicked user whose
 * characterIds match participants currently on the roster. Stamp
 * participantIdsToRemove. Does NOT reject — the reducer handles it.
 *
 * Strategy: query campaign_characters joined with characters to get all
 * character IDs owned by the kicked user in this campaign, then intersect
 * with PC participants currently in state by matching `Participant.characterId`.
 */
export async function stampKickPlayer(
  intent: Intent & { timestamp: number },
  campaignState: CampaignState,
  env: Bindings,
): Promise<StampResult> {
  const payload = intent.payload as MutablePayload;
  const userId = payload.userId;
  if (typeof userId !== 'string') return 'invalid_payload: userId required';

  const conn = db(env.DB);

  // Find all character IDs owned by the kicked user that are registered with this campaign.
  const rows = await conn
    .select({ characterId: campaignCharacters.characterId })
    .from(campaignCharacters)
    .innerJoin(characters, eq(campaignCharacters.characterId, characters.id))
    .where(
      and(
        eq(campaignCharacters.campaignId, campaignState.campaignId),
        eq(characters.ownerId, userId),
      ),
    )
    .all();

  const ownedCharacterIds = new Set(rows.map((r) => r.characterId));

  const participantIdsToRemove = campaignState.participants
    .filter(
      (p): p is import('@ironyard/shared').Participant =>
        p.kind === 'pc' && p.characterId !== null && ownedCharacterIds.has(p.characterId),
    )
    .map((p) => p.id);

  payload.participantIdsToRemove = participantIdsToRemove;
  return null;
}

/**
 * StartEncounter — resolve character blobs from D1 for each characterId in
 * payload.characterIds, and resolve monster stat blocks from static data for
 * each entry in payload.monsters. Stamps stampedPcs and stampedMonsters onto
 * the payload. Does NOT reject — missing or invalid rows/monsters are silently
 * skipped (the reducer operates only on what was successfully resolved).
 */
export async function stampStartEncounter(
  intent: Intent & { timestamp: number },
  _campaignState: CampaignState,
  env: Bindings,
): Promise<StampResult> {
  const payload = intent.payload as MutablePayload;

  // Extract characterIds from payload (filter to non-empty strings).
  const rawCharacterIds = Array.isArray(payload.characterIds) ? payload.characterIds : [];
  const characterIds = rawCharacterIds.filter(
    (id): id is string => typeof id === 'string' && id.length > 0,
  );

  // Extract monster entries from payload.
  const rawMonsters = Array.isArray(payload.monsters) ? payload.monsters : [];

  // ── Resolve PCs from D1 ───────────────────────────────────────────────────
  const stampedPcs: StartEncounterStampedPc[] = [];

  if (characterIds.length > 0) {
    const conn = db(env.DB);
    const rows = await conn
      .select({
        id: characters.id,
        ownerId: characters.ownerId,
        name: characters.name,
        data: characters.data,
      })
      .from(characters)
      .where(inArray(characters.id, characterIds))
      .all();

    for (const row of rows) {
      try {
        const parsed = CharacterSchema.safeParse(JSON.parse(row.data));
        if (!parsed.success) {
          console.error(`stampStartEncounter: invalid character blob for ${row.id}`, parsed.error);
          continue;
        }
        stampedPcs.push({
          characterId: row.id,
          ownerId: row.ownerId,
          name: row.name,
          character: parsed.data,
        });
      } catch (err) {
        console.error(`stampStartEncounter: JSON.parse failed for character ${row.id}`, err);
        // Skip this row silently.
      }
    }
  }

  // ── Resolve monsters from static data ────────────────────────────────────
  const stampedMonsters: StartEncounterStampedMonster[] = [];

  for (const entry of rawMonsters) {
    if (typeof entry !== 'object' || entry === null) continue;
    const e = entry as { monsterId?: unknown; quantity?: unknown; nameOverride?: unknown };
    if (typeof e.monsterId !== 'string' || !e.monsterId) continue;
    if (typeof e.quantity !== 'number') continue;

    const monster = loadMonsterById(e.monsterId);
    if (!monster) {
      console.error(`stampStartEncounter: monster not found: ${e.monsterId}`);
      continue;
    }

    stampedMonsters.push({
      monsterId: e.monsterId,
      quantity: e.quantity,
      ...(typeof e.nameOverride === 'string' && e.nameOverride.length > 0
        ? { nameOverride: e.nameOverride }
        : {}),
      monster,
    });
  }

  payload.stampedPcs = stampedPcs;
  payload.stampedMonsters = stampedMonsters;
  return null;
}

/**
 * SwapKit — look up characters.owner_id for the given characterId in D1 and
 * stamp ownerId onto the payload. Rejects if the character row does not exist
 * (prevents a client from claiming any ownerId).
 */
export async function stampSwapKit(
  intent: Intent & { timestamp: number },
  _campaignState: CampaignState,
  env: Bindings,
): Promise<StampResult> {
  const payload = intent.payload as MutablePayload;
  const characterId = payload.characterId;
  if (typeof characterId !== 'string' || !characterId) {
    return 'invalid_payload: characterId required';
  }

  const conn = db(env.DB);
  const row = await conn
    .select({ ownerId: characters.ownerId })
    .from(characters)
    .where(eq(characters.id, characterId))
    .get();

  if (!row) return `character_not_found: ${characterId}`;

  // Stamp the server-derived ownerId, discarding whatever the client sent.
  const stamped: SwapKitPayload = {
    characterId,
    newKitId: typeof payload.newKitId === 'string' ? payload.newKitId : '',
    ownerId: row.ownerId,
  };
  Object.assign(payload, stamped);
  return null;
}

/**
 * Respite — Slice 4 (Epic 2C). Scans every approved character in the
 * campaign and computes per-character "safely-carry" warnings per
 * canon § 10.17 (a hero carrying > 3 equipped leveled treasures
 * triggers a Presence power roll at respite). The reducer consumes
 * the stamped `safelyCarryWarnings` array and logs each entry — the
 * roll + consequences are dispatched separately.
 *
 * Does NOT reject — an empty warnings array is a normal outcome.
 * `wyrmplateChoices` passes through untouched; the reducer validates
 * it and the side-effect handler writes Dragon Knight character blobs.
 */
export async function stampRespite(
  intent: Intent & { timestamp: number },
  campaignState: CampaignState,
  env: Bindings,
): Promise<StampResult> {
  const payload = intent.payload as MutablePayload;

  const conn = db(env.DB);

  // Pull every approved character in this campaign — that's the cohort
  // who can be carrying treasures during a respite. Pending submissions
  // are excluded.
  const rows = await conn
    .select({ id: characters.id, name: characters.name, data: characters.data })
    .from(characters)
    .innerJoin(campaignCharacters, eq(campaignCharacters.characterId, characters.id))
    .where(
      and(
        eq(campaignCharacters.campaignId, campaignState.campaignId),
        eq(campaignCharacters.status, 'approved'),
      ),
    )
    .all();

  const warnings: SafelyCarryWarning[] = [];
  for (const row of rows) {
    let parsed: ReturnType<typeof CharacterSchema.parse>;
    try {
      parsed = CharacterSchema.parse(JSON.parse(row.data));
    } catch {
      // Invalid blob — skip silently (the character was authored before
      // the current schema version, or the row is corrupt).
      continue;
    }

    // Count equipped inventory entries that resolve to a leveled
    // treasure in the static catalog. Owned-but-unequipped items are
    // explicitly allowed by canon § 10.17.
    const equippedTreasureItemIds: string[] = [];
    for (const entry of parsed.inventory) {
      if (!entry.equipped) continue;
      const item = loadItemById(entry.itemId);
      if (!item) continue;
      if (item.category === 'leveled-treasure') {
        equippedTreasureItemIds.push(item.id);
      }
    }

    if (equippedTreasureItemIds.length > 3) {
      warnings.push({
        characterId: row.id,
        characterName: row.name,
        count: equippedTreasureItemIds.length,
        items: equippedTreasureItemIds,
      });
    }
  }

  payload.safelyCarryWarnings = warnings;

  // Pass wyrmplateChoices through unchanged (default to {} so the
  // reducer's payload parse always succeeds even if the client omits it).
  if (payload.wyrmplateChoices === undefined) {
    payload.wyrmplateChoices = {};
  }

  return null;
}

/**
 * StartSession — validates that every attendingCharacterId references a
 * campaign-approved character (queries campaign_characters), assigns a
 * default 'Session N' name when omitted, and stamps both onto the payload.
 * Hero tokens default is computed by the reducer, not stamped here.
 */
export async function stampStartSession(
  intent: Intent & { timestamp: number },
  campaignState: CampaignState,
  env: Bindings,
): Promise<StampResult> {
  const payload = intent.payload as MutablePayload;
  const requested = Array.isArray(payload.attendingCharacterIds)
    ? payload.attendingCharacterIds.filter(
        (id): id is string => typeof id === 'string' && id.length > 0,
      )
    : [];
  if (requested.length === 0) return 'invalid_payload: attendingCharacterIds required';

  const conn = db(env.DB);

  // Validate every id is approved on this campaign.
  const approvedRows = await conn
    .select({ characterId: campaignCharacters.characterId })
    .from(campaignCharacters)
    .where(
      and(
        eq(campaignCharacters.campaignId, campaignState.campaignId),
        eq(campaignCharacters.status, 'approved'),
      ),
    )
    .all();
  const approvedSet = new Set(approvedRows.map((r) => r.characterId));
  for (const id of requested) {
    if (!approvedSet.has(id)) return `unknown_character: ${id}`;
  }

  // Default name: 'Session N' where N = sessions count for this campaign + 1.
  if (typeof payload.name !== 'string' || payload.name.trim().length === 0) {
    const countRow = await conn
      .select({ count: sql<number>`count(*)` })
      .from(sessions)
      .where(eq(sessions.campaignId, campaignState.campaignId))
      .get();
    const n = (countRow?.count ?? 0) + 1;
    payload.name = `Session ${n}`;
  }
  payload.attendingCharacterIds = requested;
  return null;
}

/**
 * Dispatch table — called by LobbyDO.handleDispatch before applyAndBroadcast.
 * Returns null (proceed) or a rejection reason (send rejected envelope).
 */
export async function stampIntent(
  intent: Intent & { timestamp: number },
  campaignState: CampaignState,
  env: Bindings,
): Promise<StampResult> {
  switch (intent.type) {
    case 'AddMonster':
      return stampAddMonster(intent, campaignState, env);
    case 'EquipItem':
      return stampEquipItem(intent, campaignState, env);
    case 'LoadEncounterTemplate':
      return stampLoadEncounterTemplate(intent, campaignState, env);
    case 'JumpBehindScreen':
      return stampJumpBehindScreen(intent, campaignState, env);
    case 'StartEncounter':
      return stampStartEncounter(intent, campaignState, env);
    case 'SubmitCharacter':
      return stampSubmitCharacter(intent, campaignState, env);
    case 'KickPlayer':
      return stampKickPlayer(intent, campaignState, env);
    case 'PushItem':
      return stampPushItem(intent, campaignState, env);
    case 'Respite':
      return stampRespite(intent, campaignState, env);
    case 'StartSession':
      return stampStartSession(intent, campaignState, env);
    case 'SwapKit':
      return stampSwapKit(intent, campaignState, env);
    case 'UnequipItem':
      return stampUnequipItem(intent, campaignState, env);
    case 'UseConsumable':
      return stampUseConsumable(intent, campaignState, env);
    // No stamping needed for these — they carry all required data or rely
    // solely on reducer authority checks.
    default:
      return null;
  }
}
