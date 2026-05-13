// Hand-authored heal amounts for `instant` consumables — looked up by
// stampUseConsumable in the LobbyDO and stamped onto the intent payload so
// the reducer can derive an ApplyHeal.
//
// 2C Slice 5 sweep result: ships EMPTY.
//
// After surveying every v1 consumable in
// .reference/data-md/Rules/Treasures/Consumables/, NO entry heals a flat
// number of Stamina. The healing-potion family ("Stamina equal to your
// recovery value") is recovery-value-based, not flat — the UseConsumable
// reducer's recovery-value heal path handles those without needing data
// here. Variable / damage-derived heals (Blood Essence Vial) need a
// separate effect shape. Growth Potion (size change) is a stat-replace
// and is not a heal at all.
//
// The map is kept as a structural placeholder for:
//   - homebrew flat-heal consumables
//   - post-1.0 expansion content
//   - test fixtures
//
// Keys are the canonical item id (matching `items.json` `id` field).
// Values are the flat HP restored on use. Any item id absent from this
// map is treated as "manual / unknown heal amount" — the reducer logs the
// use but does not auto-fire an ApplyHeal derived intent.

export const CONSUMABLE_HEAL_AMOUNTS: Record<string, number> = {
  // (intentionally empty in v1 — see header)
};
