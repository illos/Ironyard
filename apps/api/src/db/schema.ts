// D1 schema for dynamic campaign data. Mirrors docs/data-pipeline.md verbatim.
// JSON blob columns (characters.data, campaign_snapshots.state,
// intents.payload) are typed text here and validated against Zod schemas in
// @ironyard/shared at the application boundary — Phase 1 adds those helpers.

import { index, integer, primaryKey, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(), // ULID
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  createdAt: integer('created_at').notNull(), // ms since epoch
  updatedAt: integer('updated_at').notNull(),
});

export const authTokens = sqliteTable('auth_tokens', {
  token: text('token').primaryKey(), // random 32B hex
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  expiresAt: integer('expires_at').notNull(),
  consumedAt: integer('consumed_at'),
});

export const authSessions = sqliteTable('auth_sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  expiresAt: integer('expires_at').notNull(),
  userAgent: text('user_agent'),
  createdAt: integer('created_at').notNull(),
});

export const campaigns = sqliteTable('campaigns', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  ownerId: text('owner_id')
    .notNull()
    .references(() => users.id),
  inviteCode: text('invite_code').notNull().unique(),
  campaignSettings: text('campaign_settings'), // opaque, nullable, deferred-content
  currentSessionId: text('current_session_id'), // FK to sessions(id), nullable
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    startedAt: integer('started_at').notNull(),
    endedAt: integer('ended_at'),
    attendingCharacterIds: text('attending_character_ids').notNull(), // JSON-encoded string[]
    heroTokensStart: integer('hero_tokens_start').notNull(),
    heroTokensEnd: integer('hero_tokens_end'),
  },
  (table) => ({
    campaignIdx: index('idx_sessions_campaign').on(table.campaignId, table.startedAt),
  }),
);

export const campaignMemberships = sqliteTable(
  'campaign_memberships',
  {
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    isDirector: integer('is_director').notNull().default(0),
    joinedAt: integer('joined_at').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.campaignId, table.userId] }),
    userIdx: index('idx_campaign_memberships_user').on(table.userId),
  }),
);

export const characters = sqliteTable(
  'characters',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id),
    name: text('name').notNull(),
    data: text('data').notNull(), // JSON, CharacterSchema in @ironyard/shared (Phase 2)
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    ownerIdx: index('idx_characters_owner').on(table.ownerId),
  }),
);

export const campaignCharacters = sqliteTable(
  'campaign_characters',
  {
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    characterId: text('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['pending', 'approved'] }).notNull(),
    submittedAt: integer('submitted_at').notNull(),
    decidedAt: integer('decided_at'),
    decidedBy: text('decided_by').references(() => users.id),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.campaignId, table.characterId] }),
    campaignIdx: index('idx_campaign_characters_campaign').on(table.campaignId),
  }),
);

export const encounterTemplates = sqliteTable(
  'encounter_templates',
  {
    id: text('id').primaryKey(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    data: text('data').notNull(), // JSON, validated by EncounterTemplateDataSchema at the app boundary
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    campaignIdx: index('idx_encounter_templates_campaign').on(table.campaignId),
  }),
);

export const campaignSnapshots = sqliteTable('campaign_snapshots', {
  campaignId: text('campaign_id')
    .primaryKey()
    .references(() => campaigns.id, { onDelete: 'cascade' }),
  state: text('state').notNull(), // JSON CampaignState (Phase 1)
  seq: integer('seq').notNull(),
  savedAt: integer('saved_at').notNull(),
});

export const intents = sqliteTable(
  'intents',
  {
    id: text('id').primaryKey(), // ULID
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    actorId: text('actor_id')
      .notNull()
      .references(() => users.id),
    payload: text('payload').notNull(), // JSON Intent (validated by IntentSchema)
    voided: integer('voided').notNull().default(0),
    createdAt: integer('created_at').notNull(),
  },
  (table) => ({
    campaignSeqUnique: unique('intents_campaign_seq_unique').on(table.campaignId, table.seq),
    campaignSeqIdx: index('idx_intents_campaign_seq').on(table.campaignId, table.seq),
  }),
);
