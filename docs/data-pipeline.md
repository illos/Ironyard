# Data pipeline (`packages/data`) and D1 schema

## SteelCompendium ingestion

The static reference data — rules, monsters, abilities, classes, ancestries, careers, complications, conditions — comes from [SteelCompendium](https://github.com/SteelCompendium). We never edit it; we ingest it.

### Sources

| Source | What's in it | How we use it |
|---|---|---|
| `steel-compendium-sdk` (npm) | TypeScript classes for `Statblock`, `Feature`, `Effect`, etc. | Primary source for monsters and abilities |
| `data-md` (GitHub releases) | Markdown for the Heroes Book and Bestiary | Source for class/ancestry/career/complication data the SDK doesn't yet model |

### Pinning

`packages/data/sources.json` records exact versions:

```json
{
  "sdk": "steel-compendium-sdk@2.2.0",
  "data-md": "main.20260219164429"
}
```

Bumping these is a deliberate PR. The version string flows into `apps/web/public/data/_meta.json` so the UI can surface "Rules version: 2026.02.19" in a footer.

### The build

`pnpm build:data` runs `packages/data/build.ts`:

1. Read the pinned SDK version from `package.json`
2. Walk SDK exports for `Statblock` instances → emit `monsters.json`
3. Walk SDK exports for ability `Feature` instances → emit `abilities.json`
4. Download the pinned `data-md` release tarball; parse markdown front-matter and headings into our normalized schemas → emit `classes.json`, `ancestries.json`, `careers.json`, `complications.json`, `conditions.json`, `rules.json`
5. Validate each output against its Zod schema in `packages/shared/src/schemas/`
6. Write to `apps/web/public/data/` (gitignored; CI rebuilds on every deploy)

### Normalization

The SDK's `Statblock` has stringly-typed fields. Examples and how we handle them:

| SDK field | Type | Example | Normalized to |
|---|---|---|---|
| `stamina` | `string` | `"50"` or `"30 (50 with captain)"` | `{ base: 50, withCaptain?: 50 }` |
| `ev` | `string` | `"19"` or `"19/40"` | `{ ev: 19, eliteEv?: 40 }` |
| `speed` | `number` | `5` | unchanged |
| `movement` | `string` | `"walk, fly"` | `MovementMode[]` enum |
| `Effect.tier1` | `string` | `"5 fire damage; push 2"` | `EffectClause[]` (parsed) |

Effect text parsing is the trickiest piece. Strategy:

1. **First pass:** keep the raw string AND attempt structured parsing. UI shows the raw string (always correct); engine uses the structured parse where available.
2. **Coverage tracking:** the parser logs every effect string it can't fully parse. CI builds report coverage % so we can drive it up over time.
3. **Damage-type validation:** the damage-type enum (`fire | cold | holy | corruption | psychic | lightning | poison | acid | sonic | untyped`) is closed. If the parser produces a structured clause referencing a type outside the enum, the build fails. Adding a damage type is therefore an explicit code change, not a silent ingest result — protecting downstream code that switches on the enum.
4. **Manual overrides:** `packages/data/overrides/<id>.json` lets us hand-correct specific abilities when the parser is wrong. Overrides are committed.

### Output schema (excerpt)

```ts
// packages/shared/src/schemas/monster.ts
export const MonsterSchema = z.object({
  id: z.string(),                      // slugified name + level for stability
  name: z.string(),
  level: z.number().int().min(1).max(10),
  roles: z.array(z.enum([...])),
  ancestry: z.array(z.string()),
  ev: z.object({ ev: z.number(), eliteEv: z.number().optional() }),
  stamina: z.object({ base: z.number(), withCaptain: z.number().optional() }),
  immunities: z.array(DamageTypeSchema).default([]),
  weaknesses: z.array(DamageTypeSchema).default([]),
  speed: z.number(),
  movement: z.array(MovementModeSchema),
  size: z.string(),
  stability: z.number(),
  freeStrike: z.number(),
  meleeDistance: z.number().optional(),
  rangedDistance: z.number().optional(),
  withCaptain: z.string().optional(),
  characteristics: CharacteristicsSchema,
  features: z.array(FeatureSchema),
  source: z.object({ book: z.string(), page: z.number().optional() }),
});
```

## D1 schema (dynamic data)

D1 stores user-owned and session-owned data. Schema lives in `apps/api/src/db/schema.ts` (Drizzle).

### Tables

```sql
-- users
CREATE TABLE users (
  id           TEXT PRIMARY KEY,           -- ULID
  email        TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  created_at   INTEGER NOT NULL,           -- ms epoch
  updated_at   INTEGER NOT NULL
);

-- magic-link tokens
CREATE TABLE auth_tokens (
  token       TEXT PRIMARY KEY,            -- random 32B hex
  user_id     TEXT NOT NULL REFERENCES users(id),
  expires_at  INTEGER NOT NULL,
  consumed_at INTEGER
);

-- session cookies
CREATE TABLE auth_sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  expires_at  INTEGER NOT NULL,
  user_agent  TEXT,
  created_at  INTEGER NOT NULL
);

-- a "Game" / campaign session
CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  director_id TEXT NOT NULL REFERENCES users(id),
  invite_code TEXT NOT NULL UNIQUE,        -- 6-char human-friendly
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE memberships (
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id),
  role        TEXT NOT NULL CHECK (role IN ('director', 'player')),
  joined_at   INTEGER NOT NULL,
  PRIMARY KEY (session_id, user_id)
);

-- player characters (owned by a user, can be brought into many sessions over time)
CREATE TABLE characters (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL REFERENCES users(id),
  name       TEXT NOT NULL,
  data       TEXT NOT NULL,                -- JSON blob, schema in shared/CharacterSchema
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- encounters live inside a session
CREATE TABLE encounters (
  id         TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  data       TEXT NOT NULL,                -- JSON blob; monster instances + terrain
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- the canonical state snapshot for a session, written by the DO
CREATE TABLE session_snapshots (
  session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  state      TEXT NOT NULL,                -- JSON blob of SessionState
  seq        INTEGER NOT NULL,             -- last applied intent seq
  saved_at   INTEGER NOT NULL
);

-- intent log; primary use is replay-on-restart and audit
CREATE TABLE intents (
  id         TEXT PRIMARY KEY,             -- ULID
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  seq        INTEGER NOT NULL,
  actor_id   TEXT NOT NULL REFERENCES users(id),
  payload    TEXT NOT NULL,                -- full Intent JSON
  voided     INTEGER NOT NULL DEFAULT 0,   -- 1 if undone
  created_at INTEGER NOT NULL,
  UNIQUE (session_id, seq)
);

CREATE INDEX idx_intents_session_seq ON intents(session_id, seq);
CREATE INDEX idx_characters_owner ON characters(owner_id);
CREATE INDEX idx_memberships_user ON memberships(user_id);
```

### Why JSON blobs for character / encounter / state?

D1 query patterns for these are always "load one record by id, write one record by id." The schema-inside-the-blob is huge (full character sheet) and changes as we evolve features. Putting it in columns means a migration every time we add a class feature toggle. JSON blobs validated by Zod on read/write give us schema flexibility without sacrificing type safety.

The trade-off is no SQL-side filtering of inner fields. We don't need it — the queries we run are by id, by owner, by session.

## Migrations

Drizzle's migration generator writes SQL files to `apps/api/drizzle/`. Migrations are applied in CI before deploy via `wrangler d1 migrations apply`.

For local dev, `pnpm db:reset` drops and re-creates the local D1 instance with the latest schema and a small fixture set.
