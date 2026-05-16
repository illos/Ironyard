/**
 * Pass 3 Slice 2b — ParticipantRow targeting-relation chips
 *
 * Tests for the inbound and outbound chip affordances added to ParticipantRow.
 *
 * Inbound chips (P4): visible to ALL viewers — "Judged by Aldric",
 *   "Marked by Korva", "In Null Field of Vex".
 * Outbound chips (P2): visible only to the source owner or active director —
 *   a toggle button per (source, kind) pair where source.id !== thisRow's id.
 */

import type { Participant } from '@ironyard/shared';
import { defaultTargetingRelations } from '@ironyard/shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ParticipantRow } from './ParticipantRow';

afterEach(cleanup);

// ── Minimal participant factory ───────────────────────────────────────────────

function makeParticipant(
  overrides: Partial<Participant> & { id: string; name: string },
): Participant {
  // Provide required fields with defaults; callers supply only what's under test.
  // Cast to Participant at the end — the Zod schema may add additional optional
  // fields (psionFlags, perEncounterFlags, etc.) that we let default to undefined
  // here, which is fine for presentation-layer tests.
  return {
    kind: 'pc',
    ownerId: null,
    characterId: null,
    level: 1,
    currentStamina: 20,
    maxStamina: 20,
    characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
    immunities: [],
    weaknesses: [],
    conditions: [],
    heroicResources: [],
    extras: [],
    surprised: false,
    victories: 0,
    targetingRelations: defaultTargetingRelations(),
    className: null,
    // Named required fields + all caller-supplied overrides on top
    ...overrides,
  } as unknown as Participant;
}

// ── Base props shared across tests ────────────────────────────────────────────

const GOBLIN_ID = 'goblin-a';
const ALDRIC_ID = 'aldric';
const KORVA_ID = 'korva';
const VEX_ID = 'vex';

/** The goblin row participant — the one rendered by ParticipantRow. */
const goblin = makeParticipant({
  id: GOBLIN_ID,
  name: 'Goblin A',
  kind: 'monster',
  ownerId: null,
  className: null,
  targetingRelations: defaultTargetingRelations(),
});

/** Aldric — Censor. Judges goblin-a. */
const aldricJudging = makeParticipant({
  id: ALDRIC_ID,
  name: 'Aldric',
  kind: 'pc',
  ownerId: 'user-aldric',
  className: 'Censor',
  targetingRelations: { judged: [GOBLIN_ID], marked: [], nullField: [] },
});

/** Korva — Tactician. Marks goblin-a. */
const korvaMarking = makeParticipant({
  id: KORVA_ID,
  name: 'Korva',
  kind: 'pc',
  ownerId: 'user-korva',
  className: 'Tactician',
  targetingRelations: { judged: [], marked: [GOBLIN_ID], nullField: [] },
});

/** Vex — Null. Null-fields goblin-a. */
const vexNullField = makeParticipant({
  id: VEX_ID,
  name: 'Vex',
  kind: 'pc',
  ownerId: 'user-vex',
  className: 'Null',
  targetingRelations: { judged: [], marked: [], nullField: [GOBLIN_ID] },
});

/** Minimal BASE props for ParticipantRow rendering the goblin. */
const BASE = {
  sigil: 'GA',
  name: 'Goblin A',
  staminaCurrent: 20,
  staminaMax: 20,
  thisParticipantId: GOBLIN_ID,
} as const;

// ── describe block ─────────────────────────────────────────────────────────────

describe('ParticipantRow — targeting relation chips (slice 2b)', () => {
  // ── Inbound chips ──────────────────────────────────────────────────────────

  it('renders inbound chips for ALL viewers (non-owner, non-director)', () => {
    render(
      <ParticipantRow
        {...BASE}
        allParticipants={[aldricJudging, korvaMarking, goblin]}
        viewerUserId="user-random"
        isActingAsDirector={false}
      />,
    );
    expect(screen.getByText('Judged by Aldric')).toBeTruthy();
    expect(screen.getByText('Marked by Korva')).toBeTruthy();
  });

  it('renders inbound nullField chip for ALL viewers', () => {
    render(
      <ParticipantRow
        {...BASE}
        allParticipants={[vexNullField, goblin]}
        viewerUserId="user-random"
        isActingAsDirector={false}
      />,
    );
    expect(screen.getByText('In Null Field of Vex')).toBeTruthy();
  });

  it('renders no inbound chips when no participant has this row in their relations', () => {
    const aldricNotJudging = makeParticipant({
      id: ALDRIC_ID,
      name: 'Aldric',
      kind: 'pc',
      ownerId: 'user-aldric',
      className: 'Censor',
      targetingRelations: { judged: ['some-other-goblin'], marked: [], nullField: [] },
    });
    render(
      <ParticipantRow
        {...BASE}
        allParticipants={[aldricNotJudging, goblin]}
        viewerUserId="user-random"
        isActingAsDirector={false}
      />,
    );
    expect(screen.queryByText(/Judged by/)).toBeNull();
  });

  it('renders multiple inbound chips stacked when multiple sources target this row', () => {
    render(
      <ParticipantRow
        {...BASE}
        allParticipants={[aldricJudging, korvaMarking, vexNullField, goblin]}
        viewerUserId="user-random"
        isActingAsDirector={false}
      />,
    );
    expect(screen.getByText('Judged by Aldric')).toBeTruthy();
    expect(screen.getByText('Marked by Korva')).toBeTruthy();
    expect(screen.getByText('In Null Field of Vex')).toBeTruthy();
  });

  // ── Outbound chips ─────────────────────────────────────────────────────────

  it('does NOT render outbound chips for a non-owner, non-director viewer', () => {
    render(
      <ParticipantRow
        {...BASE}
        allParticipants={[aldricJudging, goblin]}
        viewerUserId="user-random"
        isActingAsDirector={false}
      />,
    );
    expect(screen.queryByLabelText(/toggle (judged|marked|nullField)/i)).toBeNull();
  });

  it('renders an outbound toggle chip for the source owner (Censor judging)', () => {
    // Aldric's owner views goblin's row; aldric is a censor not yet judging goblin
    const aldricNotJudging = makeParticipant({
      id: ALDRIC_ID,
      name: 'Aldric',
      kind: 'pc',
      ownerId: 'user-aldric',
      className: 'Censor',
      targetingRelations: defaultTargetingRelations(),
    });
    render(
      <ParticipantRow
        {...BASE}
        allParticipants={[aldricNotJudging, goblin]}
        viewerUserId="user-aldric"
        isActingAsDirector={false}
      />,
    );
    expect(screen.getByLabelText('toggle judged from Aldric')).toBeTruthy();
  });

  it('renders outbound toggle chip for the active director (not the source owner)', () => {
    const aldricNotJudging = makeParticipant({
      id: ALDRIC_ID,
      name: 'Aldric',
      kind: 'pc',
      ownerId: 'user-aldric',
      className: 'Censor',
      targetingRelations: defaultTargetingRelations(),
    });
    // director is someone else (user-director), not user-aldric
    render(
      <ParticipantRow
        {...BASE}
        allParticipants={[aldricNotJudging, goblin]}
        viewerUserId="user-director"
        isActingAsDirector={true}
      />,
    );
    expect(screen.getByLabelText('toggle judged from Aldric')).toBeTruthy();
  });

  it('outbound chip is visually active (aria-pressed=true) when relation is already set', () => {
    render(
      <ParticipantRow
        {...BASE}
        allParticipants={[aldricJudging, goblin]}
        viewerUserId="user-aldric"
        isActingAsDirector={false}
      />,
    );
    const btn = screen.getByLabelText('toggle judged from Aldric');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('outbound chip aria-pressed=false when relation is not set', () => {
    const aldricNotJudging = makeParticipant({
      id: ALDRIC_ID,
      name: 'Aldric',
      kind: 'pc',
      ownerId: 'user-aldric',
      className: 'Censor',
      targetingRelations: defaultTargetingRelations(),
    });
    render(
      <ParticipantRow
        {...BASE}
        allParticipants={[aldricNotJudging, goblin]}
        viewerUserId="user-aldric"
        isActingAsDirector={false}
      />,
    );
    const btn = screen.getByLabelText('toggle judged from Aldric');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });

  it('outbound chip dispatches onToggleRelation when tapped (adding)', () => {
    const onToggle = vi.fn();
    const aldricNotJudging = makeParticipant({
      id: ALDRIC_ID,
      name: 'Aldric',
      kind: 'pc',
      ownerId: 'user-aldric',
      className: 'Censor',
      targetingRelations: defaultTargetingRelations(),
    });
    render(
      <ParticipantRow
        {...BASE}
        allParticipants={[aldricNotJudging, goblin]}
        viewerUserId="user-aldric"
        isActingAsDirector={false}
        onToggleRelation={onToggle}
      />,
    );
    const btn = screen.getByLabelText('toggle judged from Aldric');
    fireEvent.click(btn);
    expect(onToggle).toHaveBeenCalledWith(ALDRIC_ID, 'judged', GOBLIN_ID, true);
  });

  it('outbound chip dispatches onToggleRelation when tapped (removing)', () => {
    const onToggle = vi.fn();
    render(
      <ParticipantRow
        {...BASE}
        allParticipants={[aldricJudging, goblin]}
        viewerUserId="user-aldric"
        isActingAsDirector={false}
        onToggleRelation={onToggle}
      />,
    );
    const btn = screen.getByLabelText('toggle judged from Aldric');
    fireEvent.click(btn);
    expect(onToggle).toHaveBeenCalledWith(ALDRIC_ID, 'judged', GOBLIN_ID, false);
  });

  it('does NOT render an outbound chip for the row participant itself', () => {
    // If the viewer owns a Censor participant AND that participant IS this row,
    // no outbound chip should appear (source !== target is required).
    const censorSelf = makeParticipant({
      id: GOBLIN_ID, // same as the row's participant
      name: 'Goblin A',
      kind: 'pc',
      ownerId: 'user-self',
      className: 'Censor',
      targetingRelations: defaultTargetingRelations(),
    });
    render(
      <ParticipantRow
        {...BASE}
        allParticipants={[censorSelf]}
        viewerUserId="user-self"
        isActingAsDirector={false}
      />,
    );
    expect(screen.queryByLabelText(/toggle judged/i)).toBeNull();
  });

  it('renders no chips at all when allParticipants is undefined', () => {
    // Backward compat: existing callers that don't pass allParticipants should
    // get no chips (no crash).
    render(<ParticipantRow {...BASE} />);
    expect(screen.queryByText(/Judged by/)).toBeNull();
    expect(screen.queryByLabelText(/toggle judged/i)).toBeNull();
  });
});

// ── Tweak 3: reticle radio/additive behavior ──────────────────────────────────

describe('ParticipantRow — Tweak 3: reticle toggle opts', () => {
  const RETICLE_BASE = {
    sigil: 'GA',
    name: 'Goblin A',
    staminaCurrent: 20,
    staminaMax: 20,
  };

  it('plain click calls onToggle with additive:false', () => {
    const onToggle = vi.fn();
    render(
      <ParticipantRow
        {...RETICLE_BASE}
        target={{ index: null, onToggle }}
      />,
    );
    const reticle = screen.getByRole('button', { name: /target this creature/i });
    fireEvent.click(reticle);
    expect(onToggle).toHaveBeenCalledWith({ additive: false });
  });

  it('ctrl+click calls onToggle with additive:true', () => {
    const onToggle = vi.fn();
    render(
      <ParticipantRow
        {...RETICLE_BASE}
        target={{ index: null, onToggle }}
      />,
    );
    const reticle = screen.getByRole('button', { name: /target this creature/i });
    fireEvent.click(reticle, { ctrlKey: true });
    expect(onToggle).toHaveBeenCalledWith({ additive: true });
  });

  it('meta+click calls onToggle with additive:true', () => {
    const onToggle = vi.fn();
    render(
      <ParticipantRow
        {...RETICLE_BASE}
        target={{ index: null, onToggle }}
      />,
    );
    const reticle = screen.getByRole('button', { name: /target this creature/i });
    fireEvent.click(reticle, { metaKey: true });
    expect(onToggle).toHaveBeenCalledWith({ additive: true });
  });

  it('renders reticle with active targeting index when targeted', () => {
    render(
      <ParticipantRow
        {...RETICLE_BASE}
        target={{ index: 1, onToggle: vi.fn() }}
      />,
    );
    // aria-label changes when targeted
    expect(screen.getByRole('button', { name: /untarget/i })).toBeTruthy();
  });
});

// ── Tweak 3: handleToggleTarget reducer logic ─────────────────────────────────
// Pure unit tests of the radio/additive branching logic, extracted inline.

describe('handleToggleTarget reducer logic', () => {
  // Mirrors the logic in DirectorCombat.handleToggleTarget
  function toggleTarget(
    prev: string[],
    id: string,
    opts?: { additive?: boolean },
  ): string[] {
    const additive = opts?.additive ?? false;
    if (!additive && prev.length <= 1) {
      if (prev.length === 1 && prev[0] === id) return prev;
      return [id];
    }
    return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
  }

  it('radio: click on new id when empty → [id]', () => {
    expect(toggleTarget([], 'a', { additive: false })).toEqual(['a']);
  });

  it('radio: click on new id when 1 other selected → [id] (replaces)', () => {
    expect(toggleTarget(['b'], 'a', { additive: false })).toEqual(['a']);
  });

  it('radio: click on already-selected sole id → no-op (same array ref)', () => {
    const prev = ['a'];
    expect(toggleTarget(prev, 'a', { additive: false })).toBe(prev);
  });

  it('additive: click on new id when 1 selected → adds to array', () => {
    expect(toggleTarget(['b'], 'a', { additive: true })).toEqual(['b', 'a']);
  });

  it('additive: click on already-targeted id removes it (toggle)', () => {
    expect(toggleTarget(['a', 'b'], 'a', { additive: true })).toEqual(['b']);
  });

  it('when prev.length >= 2, plain click (no additive) still adds/toggles', () => {
    // Once multi-select is active, checkbox behavior takes over regardless of modifier
    expect(toggleTarget(['a', 'b'], 'c', { additive: false })).toEqual(['a', 'b', 'c']);
    expect(toggleTarget(['a', 'b', 'c'], 'b', { additive: false })).toEqual(['a', 'c']);
  });
});
