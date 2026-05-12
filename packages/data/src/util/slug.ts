// Shared slug helper for parser-derived ids.
//
// Lowercases, collapses runs of non-alphanumeric characters into a single
// dash, and trims leading/trailing dashes. Used to derive stable ids for
// PC abilities, monster abilities, and any future content where a
// human-authored name needs a deterministic id.
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
