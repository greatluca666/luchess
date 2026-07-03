// server/test/db.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import RawDatabase from 'better-sqlite3';
import { openDb, saveGame, listGames, getGame, STANDARD_START_FEN } from '../src/db.js';

describe('db', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDb(':memory:');
  });

  it('saves and retrieves a game by id, including variant and startFen', () => {
    saveGame(db, {
      id: 'abc123',
      pgn: '1. e4 e5 *',
      result: '1-0',
      resultReason: 'checkmate',
      whiteTimeMs: 12000,
      blackTimeMs: 5000,
      timeControlMs: 60000,
      finishedAt: 1700000000000,
      variant: 'kingofthehill',
      startFen: STANDARD_START_FEN,
    });
    const game = getGame(db, 'abc123');
    expect(game?.pgn).toBe('1. e4 e5 *');
    expect(game?.result).toBe('1-0');
    expect(game?.variant).toBe('kingofthehill');
    expect(game?.startFen).toBe(STANDARD_START_FEN);
  });

  it('lists games most recently finished first', () => {
    saveGame(db, {
      id: 'g1',
      pgn: '*',
      result: '1-0',
      resultReason: 'checkmate',
      whiteTimeMs: 0,
      blackTimeMs: 0,
      timeControlMs: 0,
      finishedAt: 100,
      variant: 'chess',
      startFen: STANDARD_START_FEN,
    });
    saveGame(db, {
      id: 'g2',
      pgn: '*',
      result: '0-1',
      resultReason: 'resignation',
      whiteTimeMs: 0,
      blackTimeMs: 0,
      timeControlMs: 0,
      finishedAt: 200,
      variant: 'chess',
      startFen: STANDARD_START_FEN,
    });
    const games = listGames(db);
    expect(games.map((g) => g.id)).toEqual(['g2', 'g1']);
  });

  it('returns undefined for an unknown id', () => {
    expect(getGame(db, 'missing')).toBeUndefined();
  });

  it('migrates an existing pre-variant database file without losing data, defaulting old rows to standard chess', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'luchess-db-test-'));
    const dbPath = path.join(dir, 'legacy.sqlite');

    // Build a file on disk shaped like the schema that existed before this plan (no
    // variant/start_fen columns), with one real row in it — this is what the already-deployed
    // production database looks like today.
    const legacyDb = new RawDatabase(dbPath);
    legacyDb.exec(`
      CREATE TABLE games (
        id TEXT PRIMARY KEY,
        pgn TEXT NOT NULL,
        result TEXT NOT NULL,
        result_reason TEXT NOT NULL,
        white_time_ms INTEGER NOT NULL,
        black_time_ms INTEGER NOT NULL,
        time_control_ms INTEGER NOT NULL,
        finished_at INTEGER NOT NULL
      )
    `);
    legacyDb
      .prepare(
        `INSERT INTO games (id, pgn, result, result_reason, white_time_ms, black_time_ms, time_control_ms, finished_at)
         VALUES ('legacy1', '1. e4 e5 *', '1-0', 'resignation', 1000, 2000, 60000, 1600000000000)`
      )
      .run();
    legacyDb.close();

    // This calls the REAL openDb() against the real file — exercising the actual migration
    // path, not a simulated/duplicated copy of it.
    const migratedDb = openDb(dbPath);
    const legacyGame = getGame(migratedDb, 'legacy1');
    expect(legacyGame?.variant).toBe('chess');
    expect(legacyGame?.startFen).toBe(STANDARD_START_FEN);

    // Calling openDb() again on the now-migrated file must be idempotent (no "duplicate
    // column" error) — this is exactly what happens every time the server process restarts.
    migratedDb.close();
    expect(() => openDb(dbPath)).not.toThrow();

    rmSync(dir, { recursive: true, force: true });
  });
});
