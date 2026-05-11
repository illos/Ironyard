# Data pipeline (`packages/data`) and D1 schema

## SteelCompendium ingestion

The static reference data — rules, monsters, abilities, classes, ancestries, careers, complications, conditions — comes from [SteelCompendium](https://github.com/SteelCompendium). We never edit it; we ingest it.

### Sources

| Source | What's in it | How we use it |
|---|---|---|
| `steel-compendium-sdk` (npm) | TypeScript classes for `Statblock`, `Feature`, `Effect`, etc. | Primary source for monsters and abilities |
| `data-md` (GitHub releases) | Markdown for the Heroes Book and Bestiary | Source for class/ancestry/career/complication/treasure/title data the SDK doesn't yet model |

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
4. Download the pinned `data-md` release tarball; parse markdown front-matter and headings into our normalized schemas → emit `classes.json`, `ancestries.json`, `careers.json`, `complications.json`, `conditions.json`, `rules.json`, `items.json`, `titles.json`
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

D1 stores user-owned and campaign-owned data. Schema lives in `apps/api/src/db/schema.ts` (Drizzle).

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

-- auth cookies
CREATE TABLE auth_sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  expires_at  INTEGER NOT NULL,
  user_agent  TEXT,
  created_at  INTEGER NOT NULL
);

-- a long-lived campaign; owned by a single user
CREATE TABLE campaigns (
  id          TEXT PRIMARY KEY,            -- ULID
  name        TEXT NOT NULL,
  owner_id    TEXT NOT NULL REFERENCES users(id),  -- permanent owner (not mutable in v1)
  invite_code TEXT NOT NULL UNIQUE,        -- 6-char human-friendly
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- campaign membership; is_director = 1 means the member can jump behind the screen
CREATE TABLE campaign_memberships (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id),
  is_director INTEGER NOT NULL DEFAULT 0,  -- 1 = has director permission; owner implicitly has it
  joined_at   INTEGER NOT NULL,
  PRIMARY KEY (campaign_id, user_id)
);

CREATE INDEX idx_campaign_memberships_user ON campaign_memberships(user_id);

-- player characters (owned by a user, no campaign FK)
CREATE TABLE characters (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL REFERENCES users(id),
  name       TEXT NOT NULL,
  data       TEXT NOT NULL,                -- JSON blob, schema in shared/CharacterSchema
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_characters_owner ON characters(owner_id);

-- per-campaign character roster; active-director-approved before playable
CREATE TABLE campaign_characters (
  campaign_id  TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  status       TEXT NOT NULL CHECK (status IN ('pending', 'approved')),
  submitted_at INTEGER NOT NULL,
  decided_at   INTEGER,
  decided_by   TEXT REFERENCES users(id),  -- director who approved; null while pending
  PRIMARY KEY (campaign_id, character_id)
);

CREATE INDEX idx_campaign_characters_campaign ON campaign_characters(campaign_id);

-- saved monster lineups; additive when loaded into the lobby
CREATE TABLE encounter_templates (
  id          TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  data        TEXT NOT NULL,               -- JSON blob; EncounterTemplateDataSchema in shared
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE INDEX idx_encounter_templates_campaign ON encounter_templates(campaign_id);

-- canonical LobbyDO state snapshot, written by the DO
CREATE TABLE campaign_snapshots (
  campaign_id TEXT PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
  state       TEXT NOT NULL,               -- JSON blob of CampaignState
  seq         INTEGER NOT NULL,            -- last applied intent seq
  saved_at    INTEGER NOT NULL
);

-- intent log; primary use is replay-on-restart and audit
CREATE TABLE intents (
  id          TEXT PRIMARY KEY,            -- ULID
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  seq         INTEGER NOT NULL,
  actor_id    TEXT NOT NULL REFERENCES users(id),
  payload     TEXT NOT NULL,               -- full Intent JSON
  voided      INTEGER NOT NULL DEFAULT 0,  -- 1 if undone
  created_at  INTEGER NOT NULL,
  UNIQUE (campaign_id, seq)
);

CREATE INDEX idx_intents_campaign_seq ON intents(campaign_id, seq);
```

### `EncounterTemplateDataSchema`

The `data` column of `encounter_templates` is a JSON blob validated by `EncounterTemplateDataSchema` in `packages/shared`:

```ts
EncounterTemplateDataSchema = z.object({
  monsters: z.array(z.object({
    monsterId:    z.string(),            // matches a SteelCompendium monster id
    quantity:     z.number().int().min(1).max(50),
    nameOverride: z.string().optional(), // applied as suffix on each instance if quantity > 1
  })),
  notes: z.string().optional(),          // free-form director notes / terrain prose
});
```

Templates are **monsters only** — heroes are added separately via `BringCharacterIntoEncounter`. Loading a template mid-combat is additive (new monsters land at the end of the turn order for the next round).

### Why JSON blobs for character / snapshot / intent?

D1 query patterns for these are always "load one record by id, write one record by id." The schema-inside-the-blob is large (full character sheet, full campaign state) and changes as features evolve. Putting it in columns means a migration for every class feature toggle. JSON blobs validated by Zod on read/write give us schema flexibility without sacrificing type safety.

The trade-off is no SQL-side filtering of inner fields. We don't need it — the queries we run are by id, by owner, by campaign.

## Treasure and title ingest

Treasure and title data comes entirely from `data-md` — the SDK has no models for these yet.

**Structure in the source files.** Front-matter carries only identity fields (`item_id`, `item_name`, `treasure_type`, `type`, `echelon`, SCC/SCDC paths). **Effect text lives in the markdown body as prose** — there are no structured effect fields in the YAML. This applies to all treasure subtypes (leveled weapon/armor/other, artifacts, consumables, trinkets) and to titles.

Practical consequence: the ingest pipeline can emit display-ready `items.json` and `titles.json` immediately (name, type, echelon, description, raw body text). But for the `CharacterAttachment` engine to auto-apply a treasure's effect — stat mods, ability grants, passive conditions — that effect must be hand-authored in `packages/data/overrides/<item_id>.json`. Coverage is incremental; unstructured items fall back to manual override in the UI.

Leveled treasures have three tiers of effects in the body (1st / 5th / 9th level). Overrides must represent each tier separately:

```json
// packages/data/overrides/blade-of-quintessence.json
{
  "attachment_effects": {
    "1": [
      { "kind": "stat_mod", "stat": "weapon_damage_bonus", "op": "add", "value": 1 },
      { "kind": "ability_mod", "mod": "damage_type_choosable", "types": ["cold","fire","lightning","sonic"] }
    ],
    "5": [ ... ],
    "9": [ ... ]
  }
}
```

Titles in the source have a single `Effect` section (prose) with bullet-point options. Structured overrides follow the same pattern but without tiers (`"attachment_effects": { "any": [...] }`).

The `CharacterAttachment` schema in `packages/rules` is the authoritative type for these overrides. See `docs/rules-engine.md § CharacterAttachment`.

## Migrations

Drizzle's migration generator writes SQL files to `apps/api/drizzle/`. Migrations are applied in CI before deploy via `wrangler d1 migrations apply`.

For local dev, `pnpm db:reset` drops and re-creates the local D1 instance with the latest schema and a small fixture set.
