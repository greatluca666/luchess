import { describe, it, expect } from 'vitest';
import { createGame, applyMove, checkGameOver } from '../src/chessRules.js';

describe('chessRules', () => {
  it('applies a legal opening move', () => {
    const pos = createGame();
    const result = applyMove(pos, { from: 'e2', to: 'e4' });
    expect(result.ok).toBe(true);
    expect(result.san).toBe('e4');
    expect(result.gameOver).toBe(false);
  });

  it('rejects an illegal move', () => {
    const pos = createGame();
    const result = applyMove(pos, { from: 'e2', to: 'e5' });
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('detects checkmate (fools mate)', () => {
    const pos = createGame();
    expect(applyMove(pos, { from: 'f2', to: 'f3' }).ok).toBe(true);
    expect(applyMove(pos, { from: 'e7', to: 'e5' }).ok).toBe(true);
    expect(applyMove(pos, { from: 'g2', to: 'g4' }).ok).toBe(true);
    const final = applyMove(pos, { from: 'd8', to: 'h4' });
    expect(final.ok).toBe(true);
    expect(final.gameOver).toBe(true);
    expect(final.result).toBe('0-1');
    expect(final.resultReason).toBe('checkmate');
  });

  it('detects stalemate as a draw', () => {
    const pos = createGame('chess', '1R6/8/8/8/8/8/7R/k6K b - - 0 1');
    const result = checkGameOver(pos);
    expect(result.gameOver).toBe(true);
    expect(result.result).toBe('1/2-1/2');
    expect(result.resultReason).toBe('stalemate');
  });

  it('detects insufficient material as a draw', () => {
    // King and bishop vs lone king — no combination of moves can force checkmate.
    const pos = createGame('chess', '8/8/8/4k3/8/8/4KB2/8 w - - 0 1');
    const result = checkGameOver(pos);
    expect(result.gameOver).toBe(true);
    expect(result.result).toBe('1/2-1/2');
    expect(result.resultReason).toBe('insufficient-material');
  });
});
