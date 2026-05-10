import { describe, expect, it } from 'vitest';
import { PACKAGE } from '../src/index';

describe('@ironyard/rules', () => {
  it('exports the package marker', () => {
    expect(PACKAGE).toBe('@ironyard/rules');
  });
});
