import { describe, it, expect } from 'vitest';
import { rulesFor } from '../src/variantRules.js';

describe('rulesFor', () => {
  it('maps the flag-style variants onto plain chess rules', () => {
    expect(rulesFor('chess960')).toBe('chess');
    expect(rulesFor('fogofwar')).toBe('chess');
  });

  it('passes real chessops rules through', () => {
    expect(rulesFor('crazyhouse')).toBe('crazyhouse');
    expect(rulesFor('atomic')).toBe('atomic');
  });
});
