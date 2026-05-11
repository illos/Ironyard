// Stamping pipeline for LobbyDO. Each stamper runs BEFORE applyAndBroadcast.
// A stamper either mutates the intent payload (stamping in server-derived data)
// or returns a rejection reason (string) that the caller sends to the socket.
//
// Stampers that cannot reject (JumpBehindScreen, SubmitCharacter, KickPlayer)
// still return null on success — the reducer performs the authority check.

import type { CampaignState } from '@ironyard/rules';
import {
  EncounterTemplateDataSchema,
  type Intent,
  type LoadEncounterTemplatePayload,
} from '@ironyard/shared';
import { and, eq } from 'drizzle-orm';
import { loadMonsterById } from './data/index';
import { db } from './db';
import {
  campaignCharacters,
  campaignMemberships,
  characters,
  encounterTemplates,
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
 * KickPlayer — find the campaign_characters rows for the kicked user whose
 * characterIds match participants currently on the roster. Stamp
 * participantIdsToRemove. Does NOT reject — the reducer handles it.
 *
 * Strategy: query campaign_characters joined with characters to get all
 * character IDs owned by the kicked user in this campaign, then intersect
 * with participant IDs already in state (participants.id === characterId
 * by convention for hero participants added via BringCharacterIntoEncounter).
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

  // Intersect with current roster participants.
  // Hero participants have `kind === 'pc'`; their id is the character id by convention.
  const participantIdsToRemove = campaignState.participants
    .filter((p) => p.kind === 'pc' && ownedCharacterIds.has(p.id))
    .map((p) => p.id);

  payload.participantIdsToRemove = participantIdsToRemove;
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
    case 'LoadEncounterTemplate':
      return stampLoadEncounterTemplate(intent, campaignState, env);
    case 'JumpBehindScreen':
      return stampJumpBehindScreen(intent, campaignState, env);
    case 'SubmitCharacter':
      return stampSubmitCharacter(intent, campaignState, env);
    case 'KickPlayer':
      return stampKickPlayer(intent, campaignState, env);
    // No stamping needed for these — they carry all required data or rely
    // solely on reducer authority checks.
    default:
      return null;
  }
}
