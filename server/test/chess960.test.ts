import { describe, it, expect } from 'vitest';
import { generateChess960Fen } from '../src/chess960.js';
import { parseFen } from 'chessops/fen';
import { setupPosition } from 'chessops/variant';

function backRank(fen: string): string {
  return fen.split(' ')[0].split('/')[7];
}

describe('generateChess960Fen', () => {
  it('produces a FEN chessops accepts as a legal starting position', () => {
    const fen = generateChess960Fen();
    const setup = parseFen(fen).unwrap();
    const result = setupPosition('chess', setup);
    expect(result.isOk).toBe(true);
  });

  it('places the king between the two rooks', () => {
    const fen = generateChess960Fen();
    const rank = backRank(fen);
    const rookFiles = [...rank].reduce<number[]>((acc, ch, i) => (ch === 'R' ? [...acc, i] : acc), []);
    const kingFile = [...rank].indexOf('K');
    expect(rookFiles).toHaveLength(2);
    expect(kingFile).toBeGreaterThan(rookFiles[0]);
    expect(kingFile).toBeLessThan(rookFiles[1]);
  });

  it('places the two bishops on opposite-colored squares', () => {
    const fen = generateChess960Fen();
    const rank = backRank(fen);
    const bishopFiles = [...rank].reduce<number[]>((acc, ch, i) => (ch === 'B' ? [...acc, i] : acc), []);
    expect(bishopFiles).toHaveLength(2);
    expect(bishopFiles[0] % 2).not.toBe(bishopFiles[1] % 2);
  });

  it('mirrors the same back rank for both colors and keeps standard pawn rows', () => {
    const fen = generateChess960Fen();
    const [rank8, rank7, , , , , rank2, rank1] = fen.split(' ')[0].split('/');
    expect(rank8).toBe(rank1.toLowerCase());
    expect(rank7).toBe('pppppppp');
    expect(rank2).toBe('PPPPPPPP');
  });

  it('produces varied results across many calls', () => {
    const ranks = new Set(Array.from({ length: 50 }, () => backRank(generateChess960Fen())));
    expect(ranks.size).toBeGreaterThan(1);
  });
});
