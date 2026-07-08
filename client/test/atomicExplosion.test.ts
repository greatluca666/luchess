import { describe, it, expect } from 'vitest';
import { explodedSquares } from '../src/atomicExplosion.js';

describe('explodedSquares', () => {
  it('reports nothing for a plain move (origin excluded, destination newly occupied is not an explosion)', () => {
    const prev = '8/8/8/8/8/8/8/R7';
    const next = '8/8/8/8/8/8/8/1R6';
    expect(explodedSquares(prev, next, 'a1')).toEqual([]);
  });

  it('flags the destination square when the capturing piece itself is also destroyed', () => {
    const prev = '8/8/8/8/8/8/8/R6n';
    const next = '8/8/8/8/8/8/8/8';
    expect(explodedSquares(prev, next, 'a1')).toEqual(['h1']);
  });

  it('flags every square that lost a piece, not just one', () => {
    const prev = '8/8/8/8/8/8/8/RNB5';
    const next = '8/8/8/8/8/8/8/8';
    expect(explodedSquares(prev, next, 'a1').sort()).toEqual(['b1', 'c1']);
  });
});
