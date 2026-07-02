import { describe, it, expect } from 'vitest';
import { extractSanMoves } from '../src/pgnReplay.js';

describe('extractSanMoves', () => {
  it('strips move numbers and an unfinished-game result marker', () => {
    expect(extractSanMoves('1. e4 e5 2. Nf3 Nc6 *')).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
  });

  it('strips a decisive result marker', () => {
    expect(extractSanMoves('1. f3 e5 2. g4 Qh4# 0-1')).toEqual(['f3', 'e5', 'g4', 'Qh4#']);
  });

  it('strips a draw result marker', () => {
    expect(extractSanMoves('1. Nf3 Nf6 2. Ng1 Ng8 1/2-1/2')).toEqual(['Nf3', 'Nf6', 'Ng1', 'Ng8']);
  });

  it('returns an empty array for an empty movetext', () => {
    expect(extractSanMoves('*')).toEqual([]);
  });
});
