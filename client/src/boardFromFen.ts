import type { Role } from './capturedPieces.js';

export interface BoardSquare {
  role: Role;
  color: 'white' | 'black';
}

const FEN_CHAR_TO_ROLE: Record<string, Role> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

// Parses a FEN board part ("rnbqkbnr/pppppppp/8/.../RNBQKBNR") into an 8x8
// grid, row 0 = rank 8 (top/black side) through row 7 = rank 1, matching the
// order FEN itself lists ranks in — so it lines up directly with a
// top-to-bottom, white-at-the-bottom board rendering.
export function boardGridFromFen(fenBoardPart: string): (BoardSquare | null)[][] {
  return fenBoardPart.split('/').map((rankStr) => {
    const row: (BoardSquare | null)[] = [];
    for (const ch of rankStr) {
      if (/[1-8]/.test(ch)) {
        row.push(...Array(Number(ch)).fill(null));
      } else {
        row.push({ role: FEN_CHAR_TO_ROLE[ch.toLowerCase()], color: ch === ch.toLowerCase() ? 'black' : 'white' });
      }
    }
    return row;
  });
}
