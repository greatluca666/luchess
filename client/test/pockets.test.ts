import { describe, it, expect } from 'vitest';
import { setupPosition } from 'chessops/variant';
import { parseFen } from 'chessops/fen';
import { parsePockets, dropDestKeys } from '../src/pockets.js';

describe('parsePockets', () => {
  it('counts each side\'s pocket pieces from the bracketed FEN section', () => {
    const pockets = parsePockets('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[NPPq] w KQkq - 0 1');
    expect(pockets.white).toEqual({ pawn: 2, knight: 1, bishop: 0, rook: 0, queen: 0 });
    expect(pockets.black).toEqual({ pawn: 0, knight: 0, bishop: 0, rook: 0, queen: 1 });
  });

  it('returns empty pockets for an empty bracket or a FEN without pockets', () => {
    const empty = { pawn: 0, knight: 0, bishop: 0, rook: 0, queen: 0 };
    expect(parsePockets('8/8/8/8/8/8/8/8[] w - - 0 1')).toEqual({ white: empty, black: empty });
    expect(parsePockets('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toEqual({ white: empty, black: empty });
  });
});

describe('dropDestKeys', () => {
  const pos = setupPosition('crazyhouse', parseFen('4k3/8/8/8/8/8/8/4K3[PN] w - - 0 1').unwrap()).unwrap();

  it('allows a piece on every empty square', () => {
    const keys = dropDestKeys(pos, 'knight');
    expect(keys).toHaveLength(62);
    expect(keys).toContain('a1');
  });

  it('keeps pawns off the first and last ranks', () => {
    const keys = dropDestKeys(pos, 'pawn');
    expect(keys).toHaveLength(48);
    expect(keys).not.toContain('a1');
    expect(keys).not.toContain('h8');
    expect(keys).toContain('a2');
  });
});
