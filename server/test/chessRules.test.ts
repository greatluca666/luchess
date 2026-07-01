import { describe, it, expect } from 'vitest';
import { createGame, applyMove, checkGameOver } from '../src/chessRules.js';

describe('chessRules', () => {
  it('applies a legal opening move', () => {
    const chess = createGame();
    const result = applyMove(chess, { from: 'e2', to: 'e4' });
    expect(result.ok).toBe(true);
    expect(result.san).toBe('e4');
    expect(result.gameOver).toBe(false);
  });

  it('rejects an illegal move', () => {
    const chess = createGame();
    const result = applyMove(chess, { from: 'e2', to: 'e5' });
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('detects checkmate (fools mate)', () => {
    const chess = createGame();
    expect(applyMove(chess, { from: 'f2', to: 'f3' }).ok).toBe(true);
    expect(applyMove(chess, { from: 'e7', to: 'e5' }).ok).toBe(true);
    expect(applyMove(chess, { from: 'g2', to: 'g4' }).ok).toBe(true);
    const final = applyMove(chess, { from: 'd8', to: 'h4' });
    expect(final.ok).toBe(true);
    expect(final.gameOver).toBe(true);
    expect(final.result).toBe('0-1');
    expect(final.resultReason).toBe('checkmate');
  });

  it('detects stalemate as a draw', () => {
    const chess = createGame();
    chess.load('1R6/8/8/8/8/8/7R/k6K b - - 0 1');
    const result = checkGameOver(chess);
    expect(result.gameOver).toBe(true);
    expect(result.result).toBe('1/2-1/2');
    expect(result.resultReason).toBe('stalemate');
  });
});
