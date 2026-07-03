import { describe, it, expect } from 'vitest';
import { computeCapturedPieces } from '../src/capturedPieces.js';

const STANDARD_START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('computeCapturedPieces', () => {
  it('reports no captures for the starting position', () => {
    const result = computeCapturedPieces(STANDARD_START, STANDARD_START);
    expect(result.capturedByWhite).toEqual([]);
    expect(result.capturedByBlack).toEqual([]);
  });

  it('attributes a missing black pawn to captures made by white', () => {
    // Position after 1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6 4.Qxf7# (Scholar's mate) —
    // black is missing the f7 pawn, captured by white's queen (now on f7).
    const result = computeCapturedPieces(
      'r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4',
      STANDARD_START
    );
    expect(result.capturedByWhite).toEqual(['pawn']);
    expect(result.capturedByBlack).toEqual([]);
  });

  it('attributes missing white pawns and a missing black rook independently', () => {
    // Black's h8 rook and white's a2/h2 pawns are missing; every other piece
    // stays on its original square (a constructed test position, not a real game).
    const fen = 'rnbqkbn1/pppppppp/8/8/8/8/1PPPPPP1/RNBQKBNR w KQq - 0 1';
    const result = computeCapturedPieces(fen, STANDARD_START);
    expect(result.capturedByBlack.sort()).toEqual(['pawn', 'pawn'].sort());
    expect(result.capturedByWhite).toEqual(['rook']);
  });

  it('uses the actual starting position as the baseline, not a hardcoded standard count', () => {
    // A constructed "horde-like" starting position: white has 24 pawns and no
    // other pieces, black has the standard army. This is NOT chessops' real
    // Horde starting FEN (which has a specific, non-uniform pawn arrangement) —
    // it's a synthetic-but-well-formed fixture purely to prove the function
    // computes its baseline from `startFen`, not from a hardcoded 8-pawn
    // assumption (which would silently show zero captured pawns here, since
    // 24 present pawns is already more than a hardcoded baseline of 8).
    const hordeLikeStart = 'rnbqkbnr/pppppppp/8/8/PPPPPPPP/PPPPPPPP/PPPPPPPP/8 w - - 0 1';
    const afterSomeCaptures = 'r1bqkbnr/pppppppp/8/8/1PPPPPP1/PPPPPPPP/PPPPPPPP/8 w - - 0 1';
    const result = computeCapturedPieces(afterSomeCaptures, hordeLikeStart);
    expect(result.capturedByBlack.sort()).toEqual(['pawn', 'pawn'].sort());
    expect(result.capturedByWhite).toEqual(['knight']);
  });
});
