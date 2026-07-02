import { defaultPosition, setupPosition } from 'chessops/variant';
import type { Rules } from 'chessops/types';
import type { Position } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { parseSquare } from 'chessops/util';
import { makeSan } from 'chessops/san';

export type Role = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';

export interface MoveInput {
  from: string;
  to: string;
  promotion?: string;
}

export interface ChessopsMove {
  from: number;
  to: number;
  promotion?: Role;
}

export type ResultReason =
  | 'checkmate'
  | 'stalemate'
  | 'insufficient-material'
  | 'variant-end'
  | 'threefold-repetition'
  | 'fifty-move';

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

function promotionRole(letter: string | undefined): Role {
  return PROMOTION_ROLES[letter ?? 'q'] ?? 'queen';
}

export function createGame(rules: Rules = 'chess', fen?: string): Position {
  if (!fen) return defaultPosition(rules) as Position;
  const setup = parseFen(fen).unwrap();
  return setupPosition(rules, setup).unwrap();
}

export function toChessopsMove(move: MoveInput): ChessopsMove | undefined {
  const from = parseSquare(move.from);
  const to = parseSquare(move.to);
  if (from === undefined || to === undefined) return undefined;
  // Only attach a promotion role when the caller actually specified one.
  // chessops treats `promotion` as semantically significant for isLegal/play:
  // a move carrying a promotion role is only legal if it's actually a pawn
  // move to the last rank, so defaulting it to 'queen' unconditionally would
  // make ordinary non-promotion moves (e.g. e2-e4) illegal.
  if (move.promotion === undefined) return { from, to };
  return { from, to, promotion: promotionRole(move.promotion) };
}

export function applyMove(pos: Position, move: MoveInput): MoveResult {
  const chessMove = toChessopsMove(move);
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
