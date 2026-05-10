// D1 schema for dynamic session data. Mirrors docs/data-pipeline.md verbatim.
// JSON blob columns (characters.data, encounters.data, session_snapshots.state,
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

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  directorId: text('director_id')
    .notNull()
    .references(() => users.id),
  inviteCode: text('invite_code').notNull().unique(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const memberships = sqliteTable(
  'memberships',
  {
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    role: text('role', { enum: ['director', 'player'] }).notNull(),
    joinedAt: integer('joined_at').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.sessionId, table.userId] }),
    userIdx: index('idx_memberships_user').on(table.userId),
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

export const encounters = sqliteTable('encounters', {
  id: text('id').primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  data: text('data').notNull(), // JSON; monster instances + terrain
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const sessionSnapshots = sqliteTable('session_snapshots', {
  sessionId: text('session_id')
    .primaryKey()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  state: text('state').notNull(), // JSON SessionState (Phase 1)
  seq: integer('seq').notNull(),
  savedAt: integer('saved_at').notNull(),
});

export const intents = sqliteTable(
  'intents',
  {
    id: text('id').primaryKey(), // ULID
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    actorId: text('actor_id')
      .notNull()
      .references(() => users.id),
    payload: text('payload').notNull(), // JSON Intent (validated by IntentSchema)
    voided: integer('voided').notNull().default(0),
    createdAt: integer('created_at').notNull(),
  },
  (table) => ({
    sessionSeqUnique: unique('intents_session_seq_unique').on(table.sessionId, table.seq),
    sessionSeqIdx: index('idx_intents_session_seq').on(table.sessionId, table.seq),
  }),
);
