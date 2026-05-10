import { canonStatus } from '../src/canon-status.generated';

const STATUS_GLYPH: Record<string, string> = {
  verified: '✅',
  drafted: '🚧',
  tbd: '⛔',
};

const entries = Object.entries(canonStatus);
const longestSlug = entries.reduce((n, [slug]) => Math.max(n, slug.length), 0);

console.log('');
console.log('rules-canon status');
console.log('─'.repeat(longestSlug + 14));
for (const [slug, status] of entries) {
  const glyph = STATUS_GLYPH[status] ?? '?';
  console.log(`${slug.padEnd(longestSlug + 2)} ${glyph}  ${status}`);
}

const counts = entries.reduce<Record<string, number>>((acc, [, status]) => {
  acc[status] = (acc[status] ?? 0) + 1;
  return acc;
}, {});

console.log('─'.repeat(longestSlug + 14));
console.log(
  `total ${entries.length} · verified ${counts.verified ?? 0} · ` +
    `drafted ${counts.drafted ?? 0} · tbd ${counts.tbd ?? 0}`,
);
console.log('');
