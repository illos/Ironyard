import { type CanonSlug, canonStatus } from './canon-status.generated';

// Engine gate. The reducer wraps every auto-application branch in this check.
// Returns true iff the slug is ✅ in docs/rules-canon.md.
// CanonSlug is constrained to the generated keys, so the compiler catches typos.
export function requireCanon(slug: CanonSlug): boolean {
  return canonStatus[slug] === 'verified';
}
