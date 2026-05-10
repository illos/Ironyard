import { describe, expect, it } from 'vitest';
import { PACKAGE } from '../src/index';

describe('@ironyard/shared', () => {
  it('exports the package marker', () => {
    expect(PACKAGE).toBe('@ironyard/shared');
  });
});
