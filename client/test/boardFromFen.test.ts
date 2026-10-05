import { describe, it, expect } from 'vitest';
import { boardGridFromFen } from '../src/boardFromFen.js';

describe('boardGridFromFen', () => {
  it('parses the standard starting position into an 8x8 grid, rank 8 first', () => {
    const grid = boardGridFromFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR');
    expect(grid).toHaveLength(8);
    grid.forEach((row) => expect(row).toHaveLength(8));

    expect(grid[0][0]).toEqual({ role: 'rook', color: 'black' });
    expect(grid[0][4]).toEqual({ role: 'king', color: 'black' });
    expect(grid[1][0]).toEqual({ role: 'pawn', color: 'black' });
    expect(grid[7][4]).toEqual({ role: 'king', color: 'white' });
    expect(grid[6][0]).toEqual({ role: 'pawn', color: 'white' });
  });

  it('leaves empty squares as null', () => {
    const grid = boardGridFromFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR');
    for (let r = 2; r <= 5; r++) {
      grid[r].forEach((sq) => expect(sq).toBeNull());
    }
  });

  it('handles mixed digit-and-piece ranks (Horde-style)', () => {
    const grid = boardGridFromFen('8/8/8/1PP2PP1/PPPPPPPP/PPPPPPPP/PPPPPPPP/PPPPPPPP');
    expect(grid[3][0]).toBeNull();
    expect(grid[3][1]).toEqual({ role: 'pawn', color: 'white' });
    expect(grid[3][2]).toEqual({ role: 'pawn', color: 'white' });
    expect(grid[3][3]).toBeNull();
  });

  it('ignores a crazyhouse pocket section and promoted-piece markers', () => {
    const grid = boardGridFromFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKQ~NR[Nn]');
    expect(grid).toHaveLength(8);
    grid.forEach((row) => expect(row).toHaveLength(8));
    expect(grid[7][5]).toEqual({ role: 'queen', color: 'white' });
  });
});
