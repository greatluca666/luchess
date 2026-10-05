import { describe, it, expect } from 'vitest';
import { createGame, applyMove, checkGameOver, toChessopsMove } from '../src/chessRules.js';

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

  it('accepts an ordinary move even when the caller always sends a default promotion letter (matching real client behavior)', () => {
    const pos = createGame();
    const result = applyMove(pos, { from: 'e2', to: 'e4', promotion: 'q' });
    expect(result.ok).toBe(true);
    expect(result.san).toBe('e4');
  });

  it('applies an actual pawn promotion using the requested role', () => {
    const pos = createGame('chess', '8/4P3/8/3k4/8/8/8/4K3 w - - 0 1');
    const result = applyMove(pos, { from: 'e7', to: 'e8', promotion: 'q' });
    expect(result.ok).toBe(true);
    expect(result.san).toBe('e8=Q');
  });
});

describe('toChessopsMove input hardening', () => {
  it('rejects non-string squares instead of throwing', () => {
    const pos = createGame();
    expect(toChessopsMove(pos, { from: 5 as unknown as string, to: 'e4' })).toBeUndefined();
    expect(toChessopsMove(pos, { from: 'e2', to: undefined as unknown as string })).toBeUndefined();
  });

  it('ignores prototype keys as a promotion or drop role', () => {
    const pos = createGame('chess', '4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    expect(toChessopsMove(pos, { from: 'a7', to: 'a8', promotion: '__proto__' })).toEqual({ from: 48, to: 56, promotion: 'queen' });
    expect(toChessopsMove(pos, { drop: '__proto__', to: 'e4' })).toBeUndefined();
  });
});
