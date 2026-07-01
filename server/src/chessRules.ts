import { Chess } from 'chess.js';

export interface MoveInput {
  from: string;
  to: string;
  promotion?: string;
}

export type ResultReason =
  | 'checkmate'
  | 'stalemate'
  | 'insufficient-material'
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

export function createGame(): Chess {
  return new Chess();
}

export function applyMove(chess: Chess, move: MoveInput): MoveResult {
  try {
    const result = chess.move({ from: move.from, to: move.to, promotion: move.promotion ?? 'q' });
    if (!result) {
      return { ok: false, error: 'illegal move', gameOver: false };
    }
    const over = checkGameOver(chess);
    return { ok: true, san: result.san, ...over };
  } catch {
    return { ok: false, error: 'illegal move', gameOver: false };
  }
}

export function checkGameOver(chess: Chess): GameOverResult {
  if (!chess.isGameOver()) return { gameOver: false };
  if (chess.isCheckmate()) {
    const winner = chess.turn() === 'w' ? '0-1' : '1-0';
    return { gameOver: true, result: winner, resultReason: 'checkmate' };
  }
  if (chess.isStalemate()) return { gameOver: true, result: '1/2-1/2', resultReason: 'stalemate' };
  if (chess.isThreefoldRepetition()) {
    return { gameOver: true, result: '1/2-1/2', resultReason: 'threefold-repetition' };
  }
  if (chess.isInsufficientMaterial()) {
    return { gameOver: true, result: '1/2-1/2', resultReason: 'insufficient-material' };
  }
  return { gameOver: true, result: '1/2-1/2', resultReason: 'fifty-move' };
}
