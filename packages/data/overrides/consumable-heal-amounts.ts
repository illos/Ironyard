// Hand-authored heal amounts for `instant` consumables — looked up by
// stampUseConsumable in the LobbyDO and stamped onto the intent payload so
// the reducer can derive an ApplyHeal.
//
// Coverage policy (Phase 2 Epic 2C, Slice 2): empty for now. Slice 5 (item +
// title override sweep) populates this table from the SteelCompendium
// consumable text. Any item id absent from this map is treated as
// "manual / unknown heal amount" — the reducer logs the use but does not
// auto-fire an ApplyHeal derived intent.
//
// Keys are the canonical item id (matching `items.json` `id` field, e.g.
// `healing-potion-1`). Values are the flat HP restored on use.

export const CONSUMABLE_HEAL_AMOUNTS: Record<string, number> = {
  // Slice 5 fills this in.
};
