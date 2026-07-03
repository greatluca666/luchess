import { describe, it, expect } from 'vitest';
import { computeCapturedPieces } from '../src/capturedPieces.js';

describe('computeCapturedPieces', () => {
  it('reports no captures for the starting position', () => {
    const result = computeCapturedPieces('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    expect(result.capturedByWhite).toEqual([]);
    expect(result.capturedByBlack).toEqual([]);
  });

  it('attributes a missing black pawn to captures made by white', () => {
    // Position after 1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6 4.Qxf7# (Scholar's mate) —
    // black is missing the f7 pawn, captured by white's queen (now on f7).
    const result = computeCapturedPieces('r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4');
    expect(result.capturedByWhite).toEqual(['pawn']);
    expect(result.capturedByBlack).toEqual([]);
  });

  it('attributes missing white pawns and a missing black rook independently', () => {
    // Black's h8 rook and white's a2/h2 pawns are missing; every other piece
    // stays on its original square (a constructed test position, not a real game).
    const fen = 'rnbqkbn1/pppppppp/8/8/8/8/1PPPPPP1/RNBQKBNR w KQq - 0 1';
    const result = computeCapturedPieces(fen);
    expect(result.capturedByBlack.sort()).toEqual(['pawn', 'pawn'].sort());
    expect(result.capturedByWhite).toEqual(['rook']);
  });
});
