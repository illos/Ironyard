import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCanonDoc, renderRegistry } from './canon-parse';

const here = dirname(fileURLToPath(import.meta.url));
const docPath = resolve(here, '../../../docs/rules-canon.md');
const outPath = resolve(here, '../src/canon-status.generated.ts');

const md = readFileSync(docPath, 'utf-8');
const entries = parseCanonDoc(md);
const ts = renderRegistry(entries);
writeFileSync(outPath, ts);

const counts = entries.reduce(
  (acc, e) => {
    acc[e.status]++;
    return acc;
  },
  { verified: 0, drafted: 0, tbd: 0 },
);

console.log(
  `canon:gen — wrote ${entries.length} slugs to packages/rules/src/canon-status.generated.ts ` +
    `(${counts.verified} verified, ${counts.drafted} drafted, ${counts.tbd} tbd)`,
);
