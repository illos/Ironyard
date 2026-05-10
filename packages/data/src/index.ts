// SteelCompendium ingest pipeline lives here.
// build.ts pulls the SDK + data-md pin and emits typed JSON to apps/web/public/data/.
// Phase 0 ships monsters.json; abilities/classes/etc. follow in Phase 1+.

export const PACKAGE = '@ironyard/data' as const;
