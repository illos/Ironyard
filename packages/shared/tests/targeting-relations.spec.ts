import { describe, expect, it } from 'vitest';
import {
  TargetingRelationKindSchema,
  TargetingRelationsSchema,
  defaultTargetingRelations,
} from '../src/targeting-relations';

describe('TargetingRelationKindSchema', () => {
  it('accepts the three known kinds', () => {
    expect(TargetingRelationKindSchema.parse('judged')).toBe('judged');
    expect(TargetingRelationKindSchema.parse('marked')).toBe('marked');
    expect(TargetingRelationKindSchema.parse('nullField')).toBe('nullField');
  });
  it('rejects unknown kinds', () => {
    expect(() => TargetingRelationKindSchema.parse('taunted')).toThrow();
    expect(() => TargetingRelationKindSchema.parse('')).toThrow();
  });
});

describe('TargetingRelationsSchema', () => {
  it('parses empty object via defaults', () => {
    const parsed = TargetingRelationsSchema.parse({});
    expect(parsed).toEqual({ judged: [], marked: [], nullField: [] });
  });
  it('round-trips populated arrays', () => {
    const input = { judged: ['p1', 'p2'], marked: ['p3'], nullField: ['p4', 'p5'] };
    expect(TargetingRelationsSchema.parse(input)).toEqual(input);
  });
  it('accepts duplicate ids at the schema layer (reducer enforces uniqueness)', () => {
    const input = { judged: ['p1', 'p1'], marked: [], nullField: [] };
    expect(TargetingRelationsSchema.parse(input).judged).toEqual(['p1', 'p1']);
  });
  it('rejects non-string entries', () => {
    expect(() =>
      TargetingRelationsSchema.parse({ judged: [123], marked: [], nullField: [] }),
    ).toThrow();
  });
  it('rejects empty-string ids', () => {
    expect(() =>
      TargetingRelationsSchema.parse({ judged: [''], marked: [], nullField: [] }),
    ).toThrow();
  });
});

describe('defaultTargetingRelations', () => {
  it('returns three empty arrays', () => {
    expect(defaultTargetingRelations()).toEqual({ judged: [], marked: [], nullField: [] });
  });
  it('returns fresh references each call', () => {
    const a = defaultTargetingRelations();
    const b = defaultTargetingRelations();
    expect(a).not.toBe(b);
    expect(a.judged).not.toBe(b.judged);
  });
});
