import { describe, it, expect } from 'vitest';
import { buildMoveRows } from '../src/moveList.js';

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
