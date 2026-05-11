import {
  type Ability,
  type AbilityType,
  DAMAGE_TYPES,
  type DamageType,
  type Ev,
  type Monster,
  MonsterSchema,
  type MovementMode,
  type PowerRoll,
  type TypedResistance,
} from '@ironyard/shared';
import matter from 'gray-matter';

export type ParseResult = { ok: true; monster: Monster } | { ok: false; reason: string };

export function slugifyMonster(name: string, level: number): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${base}-l${level}`;
}

// ──────────────────────────────────────────────────────────────────────────
// Frontmatter helpers
// ──────────────────────────────────────────────────────────────────────────

function asString(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return null;
}

function asInt(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === 'string') {
    const n = Number.parseInt(v.trim(), 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  if (typeof v === 'string') return [v];
  return [];
}

function parseEv(raw: string | null): Ev | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === '-') return null;

  // "19/40" — elite split (rare in current data, supported per spec).
  const slash = /^(\d+)\s*\/\s*(\d+)$/.exec(trimmed);
  if (slash && slash[1] !== undefined && slash[2] !== undefined) {
    return { ev: Number.parseInt(slash[1], 10), eliteEv: Number.parseInt(slash[2], 10) };
  }

  // "3 for 4 minions" or "3 for four minions".
  const withNote = /^(\d+)\s+(.*)$/.exec(trimmed);
  if (withNote && withNote[1] !== undefined && withNote[2] !== undefined) {
    return { ev: Number.parseInt(withNote[1], 10), note: withNote[2].trim() };
  }

  const n = Number.parseInt(trimmed, 10);
  if (Number.isFinite(n)) return { ev: n };
  return null;
}

// ──────────────────────────────────────────────────────────────────────────
// Body table parsing — the row that holds Immunity / Movement / Weakness /
// With Captain values, and the size/speed/stamina/stability/free-strike row.
// We trust frontmatter for the numeric fields and use the body table only for
// the cells that aren't in frontmatter (immunity, weakness, movement, with-captain).
// ──────────────────────────────────────────────────────────────────────────

interface BodyCells {
  immunity?: string;
  weakness?: string;
  movement?: string;
  withCaptain?: string;
}

function parseBodyCells(body: string): BodyCells {
  // Each cell looks like `**Foo**<br/> Immunity` (or "Immunities" plural).
  // We extract by label; order in the source is fairly consistent but not
  // guaranteed, so we match each independently.
  const cell = (label: string): string | undefined => {
    const re = new RegExp(`\\*\\*([^*]*?)\\*\\*\\s*<br/>\\s*${label}\\b`, 'i');
    const m = re.exec(body);
    if (!m || m[1] === undefined) return undefined;
    const val = m[1].trim();
    if (val === '' || val === '-') return undefined;
    return val;
  };

  return {
    immunity: cell('Immunit(?:y|ies)'),
    weakness: cell('Weakness(?:es)?'),
    movement: cell('Movement'),
    withCaptain: cell('With Captain'),
  };
}

const DAMAGE_TYPE_SET: ReadonlySet<string> = new Set<string>(DAMAGE_TYPES);

interface ResistanceParse {
  list: TypedResistance[];
  note?: string;
}

// Parse strings like "Poison 2", "Corruption 4, poison 4", "Damage 3",
// "Cold, fire, or lightning" (narrative — captured in `note`).
function parseResistance(text: string | undefined): ResistanceParse {
  if (!text) return { list: [] };
  const tokens = text
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const list: TypedResistance[] = [];
  const unparsed: string[] = [];

  for (const token of tokens) {
    // Strip narrative joiners ("or lightning").
    const cleaned = token.replace(/^or\s+/i, '').trim();
    const match = /^([A-Za-z]+)\s+(\d+)$/.exec(cleaned);
    if (match && match[1] !== undefined && match[2] !== undefined) {
      const type = match[1].toLowerCase();
      const value = Number.parseInt(match[2], 10);
      if (type === 'damage') {
        // Untyped damage immunity — maps to the 'untyped' enum bucket.
        list.push({ type: 'untyped', value });
      } else if (DAMAGE_TYPE_SET.has(type)) {
        list.push({ type: type as DamageType, value });
      } else {
        unparsed.push(token);
      }
    } else {
      // Narrative token like "fire" with no number (Acid 5, fire — "fire"
      // here is "and fire"). We can't structurally represent it; preserve.
      unparsed.push(token);
    }
  }

  if (unparsed.length === 0) return { list };
  return { list, note: unparsed.join(', ') };
}

const MOVEMENT_TOKENS: Record<string, MovementMode> = {
  fly: 'fly',
  hover: 'hover',
  climb: 'climb',
  swim: 'swim',
  burrow: 'burrow',
  teleport: 'teleport',
};

function parseMovement(text: string | undefined): MovementMode[] {
  if (!text) return ['walk'];
  const modes = new Set<MovementMode>();
  for (const raw of text.split(',')) {
    const token = raw.trim().toLowerCase();
    const mapped = MOVEMENT_TOKENS[token];
    if (mapped) {
      modes.add(mapped);
    }
  }
  if (modes.size === 0) return ['walk'];
  // Most flying monsters can also walk; we don't add walk implicitly here
  // because the table cell is meant to enumerate *additional* movement. The
  // engine treats absence of "walk" in this list as "ground movement is
  // available unless the monster card says otherwise" — TODO when slice 6
  // condition gating cares.
  return Array.from(modes).sort();
}

// ──────────────────────────────────────────────────────────────────────────
// Ability block parsing
// ──────────────────────────────────────────────────────────────────────────

// Action-type label in the right column of the ability table. Authoritative
// when present; we fall back to the icon otherwise.
const ACTION_LABEL_TO_TYPE: Record<string, AbilityType> = {
  'main action': 'action',
  'main Action': 'action',
  maneuver: 'maneuver',
  'free maneuver': 'maneuver',
  'triggered action': 'triggered',
  'free triggered action': 'free-triggered',
};

const ICON_TO_TYPE: Record<string, AbilityType> = {
  '🗡': 'action',
  '🏹': 'action',
  '🔳': 'action',
  '⭐️': 'trait',
  '⭐': 'trait',
  '❗️': 'triggered',
  '❗': 'triggered',
  '☠️': 'villain',
  '☠': 'villain',
  '🌀': 'maneuver',
  '👤': 'maneuver',
};

interface AbilityHeader {
  icon: string;
  name: string;
  cost?: string;
}

// Match `> 🗡 **Spear Charge (Signature Ability)**` and similar. The icon
// glyph is variable; we capture up to the first ` **`.
function matchAbilityHeader(line: string): AbilityHeader | null {
  // Strip leading `> ` and trim.
  const inner = line.replace(/^>\s*/, '').trim();
  // Skip the "Power Roll + N:" lines that also start with `> **`.
  if (/^\*\*Power Roll/i.test(inner)) return null;
  if (/^\*\*Effect:/i.test(inner)) return null;
  if (/^\*\*Trigger:/i.test(inner)) return null;
  if (/^\*\*Special:/i.test(inner)) return null;

  // Match `[icon] **Name (cost)**` or `**Name**` (some traits have no icon).
  const withIcon = /^(\S+)\s+\*\*([^*]+)\*\*\s*$/.exec(inner);
  if (withIcon) {
    const iconText = withIcon[1] ?? '';
    const namePart = (withIcon[2] ?? '').trim();
    if (!iconText.startsWith('|')) {
      return splitNameAndCost(iconText, namePart);
    }
  }

  // No-icon variant — rare but exists. Skip table rows.
  if (inner.startsWith('|')) return null;
  const noIcon = /^\*\*([^*]+)\*\*\s*$/.exec(inner);
  if (noIcon) {
    return splitNameAndCost('', (noIcon[1] ?? '').trim());
  }
  return null;
}

function splitNameAndCost(icon: string, nameRaw: string): AbilityHeader {
  // Pattern: "Name (cost text)" — pull the parenthetical when it matches a
  // known cost-shape (Signature Ability, N Malice, Villain Action N).
  const parenMatch = /^(.+?)\s*\(([^)]+)\)\s*$/.exec(nameRaw);
  if (parenMatch) {
    const namePart = (parenMatch[1] ?? '').trim();
    const cost = (parenMatch[2] ?? '').trim();
    if (
      /Signature Ability/i.test(cost) ||
      /\bMalice\b/i.test(cost) ||
      /Villain Action/i.test(cost)
    ) {
      return { icon, name: namePart, cost };
    }
  }
  return { icon, name: nameRaw };
}

function classifyAbility(
  header: AbilityHeader,
  actionLabel: string | undefined,
  hasTable: boolean,
): AbilityType {
  // Villain action cost overrides everything.
  if (header.cost && /Villain Action/i.test(header.cost)) return 'villain';

  // Right-column label is authoritative when present.
  if (actionLabel) {
    const key = actionLabel.trim().toLowerCase();
    if (ACTION_LABEL_TO_TYPE[key]) return ACTION_LABEL_TO_TYPE[key];
  }

  // Skull icon (☠️) on a block with no table is a solo trait (e.g. Ajax's
  // top-level "Ajax" feature). With a table it's a villain action.
  if (header.icon === '☠️' || header.icon === '☠') {
    return hasTable ? 'villain' : 'trait';
  }

  // Fall back to icon.
  if (header.icon) {
    const iconType = ICON_TO_TYPE[header.icon];
    if (iconType) return iconType;
  }

  // No icon + no label + no table = trait. With table but no icon, default to action.
  return hasTable ? 'action' : 'trait';
}

interface ParsedTable {
  keywords: string[];
  actionLabel?: string;
  distance?: string;
  target?: string;
}

// Parse the small ability table:
//   | **Charge, Melee, Strike, Weapon** | **Main action** |
//   | --- | --- |
//   | **📏 Melee 1**                    | **🎯 One creature or object** |
function parseAbilityTable(blockLines: string[]): ParsedTable | null {
  // Pull just the table-shape lines (start with `> |`).
  const tableLines = blockLines
    .map((l) => l.replace(/^>\s*/, ''))
    .filter((l) => l.startsWith('|'))
    // Drop the markdown separator row (---|---).
    .filter((l) => !/^\|\s*:?-+/.test(l));

  if (tableLines.length < 2) return null;

  // Header row: keywords | action-label
  const headerRow = tableLines[0] ?? '';
  const bodyRow = tableLines[1] ?? '';
  const headerCells = splitTableRow(headerRow);
  const keywords = parseKeywords(headerCells[0]);
  const actionLabel = stripBold(headerCells[1] ?? '');

  // Body row: distance | target
  const bodyCells = splitTableRow(bodyRow);
  const distance = parseDistanceOrTarget(bodyCells[0]);
  const target = parseDistanceOrTarget(bodyCells[1]);

  return {
    keywords,
    actionLabel: actionLabel && actionLabel !== '-' ? actionLabel : undefined,
    distance,
    target,
  };
}

function splitTableRow(row: string): string[] {
  // Drop the leading/trailing pipe, then split on pipes.
  return row
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

function stripBold(cell: string): string {
  const m = /^\*\*(.+?)\*\*\s*$/.exec(cell.trim());
  if (m && m[1] !== undefined) return m[1].trim();
  return cell.trim();
}

function parseKeywords(cell: string | undefined): string[] {
  if (!cell) return [];
  const inner = stripBold(cell);
  if (!inner || inner === '-') return [];
  return inner
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
}

function parseDistanceOrTarget(cell: string | undefined): string | undefined {
  if (!cell) return undefined;
  const inner = stripBold(cell);
  if (!inner || inner === '-') return undefined;
  // Strip the leading emoji (📏 or 🎯) and any extra whitespace.
  return inner.replace(/^[^\w+0-9-]+\s*/, '').trim() || undefined;
}

function parsePowerRoll(blockLines: string[]): PowerRoll | null {
  const stripped = blockLines.map((l) => l.replace(/^>\s*/, '').trim());
  let bonus: string | null = null;
  let tier1: string | null = null;
  let tier2: string | null = null;
  let tier3: string | null = null;

  for (const line of stripped) {
    const head = /^\*\*Power Roll\s*([+\-]\s*\d+)\s*[:\s]/i.exec(line);
    if (head && head[1] !== undefined) {
      bonus = head[1].replace(/\s+/g, '');
    }
    const t1 = /^[-*]\s*\*\*(?:≤|<=)\s*11:\*\*\s*(.+)$/.exec(line);
    if (t1 && t1[1] !== undefined) tier1 = t1[1].trim();
    const t2 = /^[-*]\s*\*\*12\s*[-–]\s*16:\*\*\s*(.+)$/.exec(line);
    if (t2 && t2[1] !== undefined) tier2 = t2[1].trim();
    const t3 = /^[-*]\s*\*\*17\+:\*\*\s*(.+)$/.exec(line);
    if (t3 && t3[1] !== undefined) tier3 = t3[1].trim();
  }

  if (bonus !== null && tier1 !== null && tier2 !== null && tier3 !== null) {
    return { bonus, tier1, tier2, tier3 };
  }
  return null;
}

function parseEffect(blockLines: string[]): string | undefined {
  // First `**Effect:** ...` paragraph; collect until next bold marker.
  const stripped = blockLines.map((l) => l.replace(/^>\s*/, ''));
  for (let i = 0; i < stripped.length; i++) {
    const line = stripped[i] ?? '';
    const m = /^\*\*Effect:\*\*\s*(.*)$/.exec(line.trim());
    if (m) {
      const parts: string[] = [(m[1] ?? '').trim()];
      for (let j = i + 1; j < stripped.length; j++) {
        const nextRaw = stripped[j] ?? '';
        const next = nextRaw.trim();
        if (next === '') {
          // blank line — keep paragraph going if followed by more text
          continue;
        }
        if (/^\*\*[A-Z]/.test(next)) break;
        if (next.startsWith('|')) break;
        if (next.startsWith('-') || next.startsWith('*')) break;
        parts.push(next);
      }
      return parts.filter(Boolean).join(' ').trim() || undefined;
    }
  }
  return undefined;
}

function parseTrigger(blockLines: string[]): string | undefined {
  const stripped = blockLines.map((l) => l.replace(/^>\s*/, '').trim());
  for (const line of stripped) {
    const m = /^\*\*Trigger:\*\*\s*(.+)$/.exec(line);
    if (m && m[1] !== undefined) return m[1].trim();
  }
  return undefined;
}

function parseAbilityBlock(blockText: string): Ability | null {
  const lines = blockText.split(/\r?\n/);
  // Find the first non-empty line — that's the header.
  let headerLine: string | null = null;
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? '';
    const t = raw.trim();
    if (t === '' || t === '>') continue;
    headerLine = raw;
    headerIdx = i;
    break;
  }
  if (headerLine === null) return null;

  const header = matchAbilityHeader(headerLine);
  if (!header) return null;

  const restLines = lines.slice(headerIdx + 1);
  const tableInfo = parseAbilityTable(restLines);
  const hasTable = tableInfo !== null;
  const type = classifyAbility(header, tableInfo?.actionLabel, hasTable);
  const powerRoll = parsePowerRoll(restLines) ?? undefined;
  const effect = parseEffect(restLines);
  const trigger = parseTrigger(restLines);

  // Trait fallback: if no table and not a power-roll ability, the entire
  // body becomes the effect.
  let finalEffect = effect;
  if (!hasTable && !powerRoll && !finalEffect) {
    const bodyText = restLines
      .map((l) => l.replace(/^>\s*/, '').trim())
      .filter((l) => l !== '')
      .join(' ')
      .trim();
    if (bodyText) finalEffect = bodyText;
  }

  // Table-no-effect-no-roll fallback (e.g. many maneuvers): grab the first
  // paragraph after the table that isn't a bold marker.
  if (hasTable && !powerRoll && !finalEffect) {
    const stripped = restLines.map((l) => l.replace(/^>\s*/, ''));
    let afterTable = false;
    const parts: string[] = [];
    for (const line of stripped) {
      const t = line.trim();
      if (t.startsWith('|')) {
        afterTable = true;
        continue;
      }
      if (!afterTable) continue;
      if (t === '') {
        if (parts.length > 0) break;
        continue;
      }
      if (/^\*\*[A-Z]/.test(t)) break;
      parts.push(t);
    }
    const trailing = parts.join(' ').trim();
    if (trailing) finalEffect = trailing;
  }

  return {
    name: header.name,
    type,
    cost: header.cost,
    keywords: tableInfo?.keywords ?? [],
    distance: tableInfo?.distance,
    target: tableInfo?.target,
    powerRoll,
    effect: finalEffect,
    trigger,
    raw: blockText.trim(),
  };
}

function parseAbilities(body: string): Ability[] {
  // Split the body on `<!-- -->` separators; the first chunk is the stat
  // table (no `>` lines), subsequent chunks are ability blocks (blockquote).
  const chunks = body.split(/^<!-- -->\s*$/m);
  const abilities: Ability[] = [];
  for (const chunk of chunks) {
    const looksLikeAbility = /^>\s*\S/m.test(chunk);
    if (!looksLikeAbility) continue;
    const parsed = parseAbilityBlock(chunk);
    if (parsed) abilities.push(parsed);
  }
  return abilities;
}

// ──────────────────────────────────────────────────────────────────────────
// Main entry
// ──────────────────────────────────────────────────────────────────────────

export function parseMonsterMarkdown(content: string): ParseResult {
  let fm: Record<string, unknown>;
  let body: string;
  try {
    const parsed = matter(content);
    fm = parsed.data as Record<string, unknown>;
    body = parsed.content;
  } catch (e) {
    return { ok: false, reason: `frontmatter parse failed: ${(e as Error).message}` };
  }

  const name = asString(fm.item_name);
  const level = asInt(fm.level);
  if (!name) return { ok: false, reason: 'missing item_name' };
  if (level === null) return { ok: false, reason: 'missing level' };

  const id = slugifyMonster(name, level);

  // Frontmatter scalars
  const might = asInt(fm.might);
  const agility = asInt(fm.agility);
  const reason = asInt(fm.reason);
  const intuition = asInt(fm.intuition);
  const presence = asInt(fm.presence);
  if (
    might === null ||
    agility === null ||
    reason === null ||
    intuition === null ||
    presence === null
  ) {
    return { ok: false, reason: 'missing or invalid characteristic(s)' };
  }

  const speed = asInt(fm.speed) ?? 0;
  const stability = asInt(fm.stability) ?? 0;
  const freeStrike = asInt(fm.free_strike) ?? 0;
  const size = asString(fm.size) ?? '1M';

  const staminaInt = asInt(fm.stamina);
  if (staminaInt === null) {
    return { ok: false, reason: 'missing or invalid stamina' };
  }

  // EV can legitimately be "-" (Noncombatant template; sub-statblocks like
  // Xorannox's eyes that exist only as parts of a parent boss). Default to 0
  // in those cases so they still land in the codex.
  const evRaw = asString(fm.ev);
  const ev = parseEv(evRaw) ?? { ev: 0 };

  const roles = asStringArray(fm.roles);
  const ancestry = asStringArray(fm.ancestry);

  // Body-table scalars
  const cells = parseBodyCells(body);
  const immunityParse = parseResistance(cells.immunity);
  const weaknessParse = parseResistance(cells.weakness);
  const movement = parseMovement(cells.movement);

  // Abilities
  const abilities = parseAbilities(body);

  const candidate = {
    id,
    name,
    level,
    roles,
    ancestry,
    ev,
    stamina: { base: staminaInt },
    immunities: immunityParse.list,
    weaknesses: weaknessParse.list,
    speed,
    movement,
    size,
    stability,
    freeStrike,
    withCaptain: cells.withCaptain,
    immunityNote: immunityParse.note,
    weaknessNote: weaknessParse.note,
    characteristics: { might, agility, reason, intuition, presence },
    abilities,
  };

  const parsed = MonsterSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, reason: `schema validation: ${parsed.error.message}` };
  }
  return { ok: true, monster: parsed.data };
}
