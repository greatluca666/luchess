// server/src/fogOfWar.ts
// Fog of War (chess.com rules): there is no check — a king may walk into
// attack, stay in it, and castle out of or through it — and the game is won
// by capturing the king. Each side only sees its own pieces plus the
// squares those pieces could move to.
import type { Context, Position } from 'chessops/chess';
import type { Color, NormalMove } from 'chessops/types';
import { SquareSet } from 'chessops/squareSet';
import { makeFen } from 'chessops/fen';
import { kingCastlesTo, makeSquare, opposite } from 'chessops/util';
import type { GameOverResult } from './chessRules.js';

const PROMOTION_ROLES = ['queen', 'rook', 'bishop', 'knight'] as const;

// chessops' dests() only filters for check and pins when the context names a
// king — leaving it undefined yields plain pseudo-legal moves (castling is
// skipped too, so fogMoves() adds it back itself).
const NO_CHECK_CONTEXT: Context = {
  king: undefined,
  blockers: SquareSet.empty(),
  checkers: SquareSet.empty(),
  variantEnd: false,
  mustCapture: false,
};

// Every move for the side to move. Castling is encoded the chessops way:
// king moves onto its own rook's square.
export function fogMoves(pos: Position): NormalMove[] {
  const moves: NormalMove[] = [];
  for (const from of pos.board[pos.turn]) {
    const isPawn = pos.board.pawn.has(from);
    for (const to of pos.dests(from, NO_CHECK_CONTEXT)) {
      if (isPawn && SquareSet.backranks().has(to)) {
        for (const promotion of PROMOTION_ROLES) moves.push({ from, to, promotion });
      } else {
        moves.push({ from, to });
      }
    }
  }
  const king = pos.board.kingOf(pos.turn);
  if (king !== undefined) {
    for (const side of ['a', 'h'] as const) {
      const rook = pos.castles.rook[pos.turn][side];
      if (rook === undefined) continue;
      if (pos.castles.path[pos.turn][side].intersects(pos.board.occupied)) continue;
      moves.push({ from: king, to: rook });
    }
  }
  return moves;
}

// The side to move's dests for chessground. Players drag the king two
// squares to castle, so that target is offered alongside the rook square.
export function fogDests(pos: Position): Record<string, string[]> {
  const dests: Record<string, string[]> = {};
  const add = (from: string, to: string) => {
    const list = (dests[from] ??= []);
    if (!list.includes(to)) list.push(to);
  };
  for (const move of fogMoves(pos)) {
    add(makeSquare(move.from), makeSquare(move.to));
    if (pos.board.king.has(move.from) && pos.board[pos.turn].has(move.to)) {
      add(makeSquare(move.from), makeSquare(kingCastlesTo(pos.turn, move.to < move.from ? 'a' : 'h')));
    }
  }
  return dests;
}

export function visibleSquares(pos: Position, color: Color): SquareSet {
  // Vision is the same whether or not it is `color`'s turn — evaluate the
  // position as if it were. An en passant square is only ever the current
  // mover's right, so it does not carry over to the other side.
  const view = pos.clone();
  if (view.turn !== color) {
    view.turn = color;
    view.epSquare = undefined;
  }
  let visible = pos.board[color];
  for (const move of fogMoves(view)) visible = visible.with(move.to);
  return visible;
}

// The position as `color` is allowed to know it: unseen enemy pieces
// removed, only `color`'s own castling rights, and no en passant square (the
// client gets its legal moves from fogDests(), so it needs neither, and both
// would leak what the opponent has done).
export function maskedFen(pos: Position, color: Color): string {
  const setup = pos.toSetup();
  const hidden = setup.board[opposite(color)].diff(visibleSquares(pos, color));
  for (const square of hidden) setup.board.take(square);
  return makeFen({
    ...setup,
    castlingRights: setup.castlingRights.intersect(SquareSet.backrank(color)),
    epSquare: undefined,
  });
}

// Call after `mover` has played.
export function fogOutcome(pos: Position, mover: Color): GameOverResult {
  if (pos.board.kingOf(opposite(mover)) === undefined) {
    return { gameOver: true, result: mover === 'white' ? '1-0' : '0-1', resultReason: 'king-captured' };
  }
  if (fogMoves(pos).length === 0) return { gameOver: true, result: '1/2-1/2', resultReason: 'stalemate' };
  return { gameOver: false };
}
