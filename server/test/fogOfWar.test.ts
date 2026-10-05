import { describe, it, expect } from 'vitest';
import { Castles, Chess, type Position } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { makeUci, parseSquare, parseUci } from 'chessops/util';
import { fogMoves, fogDests, visibleSquares, maskedFen, fogOutcome } from '../src/fogOfWar.js';

function position(fen: string): Position {
  return Chess.fromSetup(parseFen(fen).unwrap()).unwrap();
}

function ucis(pos: Position): string[] {
  return fogMoves(pos).map(makeUci);
}

function sq(name: string): number {
  return parseSquare(name)!;
}

describe('fogMoves', () => {
  it('lets the king step onto attacked squares', () => {
    const moves = ucis(position('4k3/8/8/8/8/8/3r4/4K3 w - - 0 1'));
    expect(moves).toEqual(expect.arrayContaining(['e1d1', 'e1e2', 'e1f2', 'e1d2']));
  });

  it('lets a pinned piece leave the pin line', () => {
    expect(ucis(position('4k3/4r3/8/8/8/8/4B3/4K3 w - - 0 1'))).toContain('e2d3');
  });

  it('allows castling out of and through attacked squares', () => {
    const moves = ucis(position('4r1k1/8/8/8/8/8/8/R3K2R w KQ - 0 1'));
    expect(moves).toEqual(expect.arrayContaining(['e1h1', 'e1a1']));
  });

  it('does not castle through pieces', () => {
    const moves = ucis(position('r3k2r/8/8/8/8/8/8/RN2K1NR w KQkq - 0 1'));
    expect(moves).not.toContain('e1h1');
    expect(moves).not.toContain('e1a1');
  });

  it('includes en passant', () => {
    expect(ucis(position('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2'))).toContain('e5d6');
  });

  it('expands promotions into all four pieces', () => {
    const moves = ucis(position('4k3/P7/8/8/8/8/8/4K3 w - - 0 1'));
    expect(moves).toEqual(expect.arrayContaining(['a7a8q', 'a7a8r', 'a7a8b', 'a7a8n']));
    expect(moves).not.toContain('a7a8');
  });
});

describe('fogDests', () => {
  it('offers castling on both the rook square and the king\'s two-square target', () => {
    expect(fogDests(position('4k3/8/8/8/8/8/8/4K2R w K - 0 1')).e1).toEqual(expect.arrayContaining(['h1', 'g1']));
  });
});

describe('visibleSquares', () => {
  it('shows own pieces plus every square they can reach — 32 at the start, for either side', () => {
    const pos = Chess.default();
    const white = visibleSquares(pos, 'white');
    expect(white.size()).toBe(32);
    expect(white.has(sq('e4'))).toBe(true);
    expect(white.has(sq('e7'))).toBe(false);
    const black = visibleSquares(pos, 'black');
    expect(black.size()).toBe(32);
    expect(black.has(sq('e5'))).toBe(true);
    expect(black.has(sq('e2'))).toBe(false);
  });

  it('reveals an enemy piece only when it can be captured', () => {
    const visible = visibleSquares(position('4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1'), 'white');
    expect(visible.has(sq('d5'))).toBe(true);
    expect(visible.has(sq('e8'))).toBe(false);
  });
});

describe('maskedFen', () => {
  it('removes enemy pieces the viewer cannot see', () => {
    expect(maskedFen(position('4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1'), 'white')).toBe('8/8/8/3p4/4P3/8/8/4K3 w - - 0 1');
  });

  it('keeps only the viewer\'s own castling rights and no en passant square', () => {
    expect(maskedFen(Chess.default(), 'white')).toBe('8/8/8/8/8/8/PPPPPPPP/RNBQKBNR w KQ - 0 1');
    expect(
      maskedFen(position('rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3'), 'black').split(' ').slice(2, 4)
    ).toEqual(['kq', '-']);
  });
});

describe('fogOutcome', () => {
  it('awards the game to whoever captures the king', () => {
    const pos = Chess.default();
    for (const uci of ['e2e3', 'f7f6', 'd1h5', 'a7a6', 'h5e8']) pos.play(parseUci(uci)!);
    expect(fogOutcome(pos, 'white')).toEqual({ gameOver: true, result: '1-0', resultReason: 'king-captured' });
  });

  it('calls it a draw when the side to move has no moves at all', () => {
    // A boxed-in black king and three black pawns that can neither push nor
    // capture — not reachable in a real game (pawns on the first rank), so
    // the board is set directly instead of going through validated setup.
    const pos = Chess.default();
    pos.board = parseFen('7K/8/8/8/8/8/pp6/kp6 w - - 0 1').unwrap().board;
    pos.castles = Castles.empty();
    pos.turn = 'black';
    expect(fogMoves(pos)).toEqual([]);
    expect(fogOutcome(pos, 'white')).toEqual({ gameOver: true, result: '1/2-1/2', resultReason: 'stalemate' });
  });

  it('keeps playing otherwise', () => {
    expect(fogOutcome(Chess.default(), 'black')).toEqual({ gameOver: false });
  });
});
