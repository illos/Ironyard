import type {
  ConditionInstance,
  DamageType,
  Participant,
  ParticipantStateOverride,
  StaminaState,
} from '@ironyard/shared';

// Canon §2.7 winded value derives from base stamina max (not effective max).
// Q7 confirmed.
export function windedValue(p: Participant): number {
  return Math.floor(p.maxStamina / 2);
}

// Canon §2.10 recovery value. Used by KO-recovery, ApplyHeal default amount
// for recovery spends, and rubble/inert auto-revive at 12h.
export function recoveryValue(p: Participant): number {
  return p.recoveryValue || Math.floor(p.maxStamina / 3);
}

// True if applying `proposedNewStamina` to currentStamina would put the participant
// past their death threshold under normal stamina derivation. Used by KO
// interception (caller checks before applying damage).
export function wouldHitDead(p: Participant, proposedNewStamina: number): boolean {
  if (p.kind === 'pc') return proposedNewStamina <= -windedValue(p);
  return proposedNewStamina <= 0;
}

// Returns the new state given current stamina, max, and override. Pure
// derivation; no side effects, no logging. Caller decides whether to emit
// StaminaTransitioned based on the `transitioned` flag.
export function recomputeStaminaState(p: Participant): {
  newState: StaminaState;
  transitioned: boolean;
} {
  const derived = deriveStaminaState(p);
  return { newState: derived, transitioned: derived !== p.staminaState };
}

function deriveStaminaState(p: Participant): StaminaState {
  // Override-driven branches first.
  if (p.staminaOverride !== null) {
    return deriveOverrideState(p, p.staminaOverride);
  }
  return deriveNaturalState(p);
}

function deriveOverrideState(p: Participant, override: ParticipantStateOverride): StaminaState {
  switch (override.kind) {
    case 'inert':
      // Holds at 'inert' while currentStamina ≤ 0. Healed above → override
      // releases and natural derivation runs.
      return p.currentStamina <= 0 ? 'inert' : deriveNaturalState({ ...p, staminaOverride: null });
    case 'rubble':
      // Holds at 'rubble' while currentStamina ≤ -windedValue. Above that,
      // the override releases (returns to dying-or-better).
      return p.currentStamina <= -windedValue(p)
        ? 'rubble'
        : deriveNaturalState({ ...p, staminaOverride: null });
    case 'doomed': {
      // Title Doomed has a staminaMax death threshold; Hakaan has 'none'.
      if (override.staminaDeathThreshold === 'staminaMax' && p.currentStamina <= -p.maxStamina) {
        return 'dead';
      }
      return 'doomed';
    }
    case 'extra-dying-trigger': {
      // CoP — recoveries-exhausted predicate forces dying regardless of
      // stamina. When predicate de-asserts, natural derivation runs.
      if (override.predicate === 'recoveries-exhausted' && p.recoveries.current === 0) {
        // Forced into dying unless natural derivation would already be dead.
        const natural = deriveNaturalState({ ...p, staminaOverride: null });
        return natural === 'dead' ? 'dead' : 'dying';
      }
      return deriveNaturalState({ ...p, staminaOverride: null });
    }
  }
}

function deriveNaturalState(p: Participant): StaminaState {
  if (p.kind === 'pc') {
    if (p.currentStamina <= -windedValue(p)) return 'dead';
    if (p.currentStamina <= 0) return 'dying';
    if (p.currentStamina <= windedValue(p)) return 'winded';
    return 'healthy';
  }
  // Director creatures: no dying state.
  if (p.currentStamina <= 0) return 'dead';
  if (p.currentStamina <= windedValue(p)) return 'winded';
  return 'healthy';
}

// Clamps a proposed damage delivery against the doomed override's stamina-
// death-threshold rule. Hakaan doomed = 'none' → no clamp (stamina goes
// arbitrarily negative). Title doomed = 'staminaMax' → caller still applies
// damage; only deriveOverrideState's check above decides whether to flip to
// dead. Returns the damage to actually apply (which is delivered as-is in
// slice 1 — clamping is purely a state-derivation concern).
export function clampForDoomed(_p: Participant, delivered: number): number {
  return delivered;
}

// Applies the KO interception: stamina unchanged, Unconscious + Prone
// conditions added, state set to 'unconscious'. Caller responsibility to
// dispatch this only when wouldHitDead and the attacker opted intent='knock-out'.
//
// ConditionInstance shape: source is { kind: 'effect', id: string } per
// packages/shared/src/condition.ts. Duration uses 'manual' (slice-1 addition)
// for conditions that have no automatic expiry. appliedAtSeq=0 here; the
// reducer stamps the real seq when wrapping.
export function applyKnockOut(p: Participant): Participant {
  const unconsciousCond: ConditionInstance = {
    type: 'Unconscious',
    duration: { kind: 'manual' },
    source: { kind: 'effect', id: 'ko-interception' },
    removable: true,
    appliedAtSeq: 0,
  };
  const proneCond: ConditionInstance = {
    type: 'Prone',
    duration: { kind: 'manual' },
    source: { kind: 'effect', id: 'ko-interception' },
    removable: true,
    appliedAtSeq: 0,
  };
  // Idempotent — don't double-stack.
  const conditions = [
    ...p.conditions.filter((c) => c.type !== 'Unconscious' && c.type !== 'Prone'),
    unconsciousCond,
    proneCond,
  ];
  return { ...p, staminaState: 'unconscious', conditions };
}

// Applies the side-effects that fire on a state transition. Called by the
// reducer after recomputeStaminaState returns transitioned=true.
//
// ConditionInstance shape: source is { kind: 'effect', id: string } per
// packages/shared/src/condition.ts. The dying-Bleeding source id is
// 'dying-state'. Filtering uses the structured id for matching.
export function applyTransitionSideEffects(
  p: Participant,
  from: StaminaState,
  to: StaminaState,
): Participant {
  let result = { ...p, staminaState: to };

  // Hero → dying: apply non-removable Bleeding (canon §2.8).
  if (to === 'dying' && p.kind === 'pc') {
    const hasDyingBleed = result.conditions.some(
      (c) => c.type === 'Bleeding' && c.source.id === 'dying-state',
    );
    if (!hasDyingBleed) {
      const bleedCond: ConditionInstance = {
        type: 'Bleeding',
        duration: { kind: 'manual' },
        source: { kind: 'effect', id: 'dying-state' },
        removable: false,
        appliedAtSeq: 0,
      };
      result = { ...result, conditions: [...result.conditions, bleedCond] };
    }
  }

  // → healthy / → winded from dying or unconscious: clear non-removable dying Bleeding.
  if ((to === 'healthy' || to === 'winded') && (from === 'dying' || from === 'unconscious')) {
    result = {
      ...result,
      conditions: result.conditions.filter(
        (c) => !(c.type === 'Bleeding' && c.source.id === 'dying-state'),
      ),
    };
  }

  // → dead: clear all conditions.
  if (to === 'dead') {
    result = { ...result, conditions: [] };
  }

  // → inert / → rubble: clear all conditions.
  if (to === 'inert' || to === 'rubble') {
    result = { ...result, conditions: [] };
  }

  return result;
}

// Type-only re-export so callers can `import { StaminaState } from '../stamina'`
// without going to shared.
export type { StaminaState };

// Returns the damage to actually apply, intercepting the inert-fire instant-
// death rule (Revenant). When intercepted, returns the special marker
// 'instant-death' so the caller skips the normal damage clamp and transitions
// directly to dead.
export function checkInertFireInstantDeath(
  target: Participant,
  damageType: DamageType,
  delivered: number,
): 'instant-death' | null {
  if (
    target.staminaOverride?.kind === 'inert' &&
    target.staminaOverride.instantDeathDamageTypes.includes(damageType) &&
    delivered > 0
  ) {
    return 'instant-death';
  }
  return null;
}
