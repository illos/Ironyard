// SteelCompendium ingest pipeline lives here.
// build.ts pulls the SDK + data-md pin and emits typed JSON to apps/web/public/data/.
// Phase 0 ships monsters.json; abilities/classes/etc. follow in Phase 1+.

export const PACKAGE = '@ironyard/data' as const;

// ── Hand-authored override re-exports ─────────────────────────────────────
//
// The override constants live in `packages/data/overrides/` (outside `src/`
// so they're excluded from the data-package typecheck and bundled only via
// build.ts). They're re-exported here so consumers (`@ironyard/rules`) can
// import them as `@ironyard/data` without reaching across package roots.

export { ITEM_OVERRIDES } from '../overrides/items';
export { KIT_OVERRIDES } from '../overrides/kits';
export { ABILITY_OVERRIDES } from '../overrides/abilities';
export { TITLE_OVERRIDES } from '../overrides/titles';
export type {
  ItemOverride,
  KitOverride,
  AbilityOverride,
  TitleOverride,
} from '../overrides/_types';
