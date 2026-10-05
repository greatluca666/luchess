import { describe, it, expect } from 'vitest';
import { buildMoveRows, formatFogMove } from '../src/moveList.js';

describe('buildMoveRows', () => {
  it('returns no rows for an empty history', () => {
    expect(buildMoveRows([])).toEqual([]);
  });

  it('pairs white and black plies into one row per full move', () => {
    const rows = buildMoveRows(['e4', 'e5', 'Nf3', 'Nc6']);
    expect(rows).toEqual([
      { num: 1, white: 'e4', black: 'e5' },
      { num: 2, white: 'Nf3', black: 'Nc6' },
    ]);
  });

  it('leaves black blank when white just moved and black has not replied yet', () => {
    const rows = buildMoveRows(['e4', 'e5', 'Nf3']);
    expect(rows).toEqual([
      { num: 1, white: 'e4', black: 'e5' },
      { num: 2, white: 'Nf3', black: '' },
    ]);
  });
});

describe('formatFogMove', () => {
  it('renders UCI as from-to, with promotions', () => {
    expect(formatFogMove('e2e4')).toBe('e2-e4');
    expect(formatFogMove('e7e8q')).toBe('e7-e8=Q');
  });

  it('leaves hidden moves and anything else untouched', () => {
    expect(formatFogMove('?')).toBe('?');
    expect(formatFogMove('Nf3')).toBe('Nf3');
  });
});
