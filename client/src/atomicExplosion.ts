import { boardGridFromFen } from './boardFromFen.js';

// Diffs two FEN board parts to find squares that lost a piece — the
// signature of an atomic explosion (the capturing piece and every non-pawn
// piece in the blast radius vanish along with the captured piece). Excludes
// originKey since the moving piece's start square always empties on any
// move, atomic or not — that's not an explosion, just a move.
export function explodedSquares(prevBoardFen: string, nextBoardFen: string, originKey: string): string[] {
  const prevGrid = boardGridFromFen(prevBoardFen);
  const nextGrid = boardGridFromFen(nextBoardFen);
  const keys: string[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const key = String.fromCharCode(97 + c) + (8 - r);
      if (key === originKey) continue;
      if (prevGrid[r][c] && !nextGrid[r][c]) keys.push(key);
    }
  }
  return keys;
}
