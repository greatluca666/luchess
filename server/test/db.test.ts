import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { openDb, saveGame, listGames, getGame } from '../src/db.js';

describe('db', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDb(':memory:');
  });

  it('saves and retrieves a game by id', () => {
    saveGame(db, {
      id: 'abc123',
      pgn: '1. e4 e5 *',
      result: '1-0',
      resultReason: 'checkmate',
      whiteTimeMs: 12000,
      blackTimeMs: 5000,
      timeControlMs: 60000,
      finishedAt: 1700000000000,
    });
    const game = getGame(db, 'abc123');
    expect(game?.pgn).toBe('1. e4 e5 *');
    expect(game?.result).toBe('1-0');
  });

  it('lists games most recently finished first', () => {
    saveGame(db, { id: 'g1', pgn: '*', result: '1-0', resultReason: 'checkmate', whiteTimeMs: 0, blackTimeMs: 0, timeControlMs: 0, finishedAt: 100 });
    saveGame(db, { id: 'g2', pgn: '*', result: '0-1', resultReason: 'resignation', whiteTimeMs: 0, blackTimeMs: 0, timeControlMs: 0, finishedAt: 200 });
    const games = listGames(db);
    expect(games.map((g) => g.id)).toEqual(['g2', 'g1']);
  });

  it('returns undefined for an unknown id', () => {
    expect(getGame(db, 'missing')).toBeUndefined();
  });
});
