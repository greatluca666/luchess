// client/src/pockets.ts
// Crazyhouse pockets: parse them out of the FEN and work out where a pocket
// piece may be dropped.
import type { Position } from 'chessops/chess';
import { SquareSet } from 'chessops/squareSet';
import { makeSquare } from 'chessops/util';
import type { Role } from './capturedPieces.js';

export type DropRole = Exclude<Role, 'king'>;
export const DROP_ROLES: DropRole[] = ['pawn', 'knight', 'bishop', 'rook', 'queen'];
export type PocketCounts = Record<DropRole, number>;
export interface Pockets {
  white: PocketCounts;
  black: PocketCounts;
}

const CHAR_TO_ROLE: Record<string, DropRole> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen' };

function emptyCounts(): PocketCounts {
  return { pawn: 0, knight: 0, bishop: 0, rook: 0, queen: 0 };
}

// chessops writes pockets after the board part, lichess-style:
// "rnbqkbnr/.../RNBQKBNR[NPp] w KQkq - 0 1" (uppercase = white's pocket).
export function parsePockets(fen: string): Pockets {
  const pockets: Pockets = { white: emptyCounts(), black: emptyCounts() };
  const match = fen.split(' ')[0].match(/\[([^\]]*)\]/);
  if (!match) return pockets;
  for (const ch of match[1]) {
    const role = CHAR_TO_ROLE[ch.toLowerCase()];
    if (!role) continue;
    pockets[ch === ch.toLowerCase() ? 'black' : 'white'][role] += 1;
  }
  return pockets;
}

// chessops' dropDests() is per side, not per piece: with any non-pawn in the
// pocket it includes the back ranks, which pawns may never be dropped on.
export function dropDestKeys(pos: Position, role: DropRole): string[] {
  let squares = pos.dropDests(pos.ctx());
  if (role === 'pawn') squares = squares.diff(SquareSet.backranks());
  return Array.from(squares, (square) => makeSquare(square));
}
