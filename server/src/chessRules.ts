import { defaultPosition, setupPosition } from 'chessops/variant';
import type { Move, Role, Rules } from 'chessops/types';
import type { Position } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { parseSquare, squareRank } from 'chessops/util';
import { makeSan } from 'chessops/san';

export interface NormalMoveInput {
  from: string;
  to: string;
  promotion?: string;
}

// Crazyhouse: place a piece from the mover's pocket onto an empty square.
export interface DropMoveInput {
  drop: string;
  to: string;
}

export type MoveInput = NormalMoveInput | DropMoveInput;

export type ResultReason =
  | 'checkmate'
  | 'stalemate'
  | 'insufficient-material'
  | 'variant-end'
  | 'threefold-repetition'
  | 'fifty-move'
  | 'king-captured';

export interface GameOverResult {
  gameOver: boolean;
  result?: '1-0' | '0-1' | '1/2-1/2';
  resultReason?: ResultReason;
}

export interface MoveResult extends GameOverResult {
  ok: boolean;
  error?: string;
  san?: string;
}

const PROMOTION_ROLES: Record<string, Role> = {
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
};

const DROP_ROLES = new Set<string>(['pawn', 'knight', 'bishop', 'rook', 'queen']);

function promotionRole(letter: string | undefined): Role {
  // hasOwnProperty, not a plain lookup: `letter` comes off the websocket and
  // '__proto__' would otherwise resolve to Object.prototype.
  return letter !== undefined && Object.prototype.hasOwnProperty.call(PROMOTION_ROLES, letter)
    ? PROMOTION_ROLES[letter]
    : 'queen';
}

export function createGame(rules: Rules = 'chess', fen?: string): Position {
  if (!fen) return defaultPosition(rules) as Position;
  const setup = parseFen(fen).unwrap();
  return setupPosition(rules, setup).unwrap();
}

// Determines whether from -> to is an actual pawn-to-last-rank promotion,
// by checking the board position rather than trusting caller-supplied input.
// chessops' isLegal/play reject any move carrying a `promotion` role unless
// it truly is a pawn reaching the back rank, so this must reflect the real
// board state.
export function isPromotionMove(pos: Position, from: number, to: number): boolean {
  const piece = pos.board.get(from);
  if (!piece || piece.role !== 'pawn') return false;
  const rank = squareRank(to);
  return rank === 0 || rank === 7;
}

export function toChessopsMove(pos: Position, move: MoveInput): Move | undefined {
  // Inputs come straight off the websocket, so their shape can't be trusted
  // — parseSquare() throws on anything that isn't a string.
  if (typeof move.to !== 'string') return undefined;
  const to = parseSquare(move.to);
  if (to === undefined) return undefined;
  if ('drop' in move) {
    return DROP_ROLES.has(move.drop) ? { role: move.drop as Role, to } : undefined;
  }
  if (typeof move.from !== 'string') return undefined;
  const from = parseSquare(move.from);
  if (from === undefined) return undefined;
  // Only attach a promotion role when the move is actually a pawn reaching
  // the last rank. The real client always sends `promotion: 'q'` on every
  // move (even ordinary ones like e2-e4), so we cannot rely on the caller's
  // input to decide this — it must be derived from the position itself.
  if (isPromotionMove(pos, from, to)) {
    return { from, to, promotion: promotionRole(move.promotion) };
  }
  return { from, to };
}

export function applyMove(pos: Position, move: MoveInput): MoveResult {
  const chessMove = toChessopsMove(pos, move);
  if (!chessMove || !pos.isLegal(chessMove)) {
    return { ok: false, error: 'illegal move', gameOver: false };
  }
  const san = makeSan(pos, chessMove);
  pos.play(chessMove);
  return { ok: true, san, ...checkGameOver(pos) };
}

export function checkGameOver(pos: Position): GameOverResult {
  const outcome = pos.outcome();
  if (!outcome) return { gameOver: false };
  const result: '1-0' | '0-1' | '1/2-1/2' =
    outcome.winner === 'white' ? '1-0' : outcome.winner === 'black' ? '0-1' : '1/2-1/2';
  let resultReason: ResultReason;
  if (pos.isCheckmate()) resultReason = 'checkmate';
  else if (pos.isStalemate()) resultReason = 'stalemate';
  else if (pos.isInsufficientMaterial()) resultReason = 'insufficient-material';
  else resultReason = 'variant-end';
  return { gameOver: true, result, resultReason };
}
