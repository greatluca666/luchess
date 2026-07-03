// server/src/db.ts
import Database from 'better-sqlite3';

export const STANDARD_START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export interface GameRecord {
  id: string;
  pgn: string;
  result: string;
  resultReason: string;
  whiteTimeMs: number;
  blackTimeMs: number;
  timeControlMs: number;
  finishedAt: number;
  variant: string;
  startFen: string;
}

export function openDb(path: string): Database.Database {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS games (
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
  migrateVariantColumns(db);
  return db;
}

function migrateVariantColumns(db: Database.Database): void {
  const columns = db.prepare(`PRAGMA table_info(games)`).all() as Array<{ name: string }>;
  const columnNames = new Set(columns.map((c) => c.name));
  if (!columnNames.has('variant')) {
    db.exec(`ALTER TABLE games ADD COLUMN variant TEXT NOT NULL DEFAULT 'chess'`);
  }
  if (!columnNames.has('start_fen')) {
    db.exec(`ALTER TABLE games ADD COLUMN start_fen TEXT NOT NULL DEFAULT '${STANDARD_START_FEN}'`);
  }
}

export function saveGame(db: Database.Database, game: GameRecord): void {
  db.prepare(`
    INSERT INTO games (id, pgn, result, result_reason, white_time_ms, black_time_ms, time_control_ms, finished_at, variant, start_fen)
    VALUES (@id, @pgn, @result, @resultReason, @whiteTimeMs, @blackTimeMs, @timeControlMs, @finishedAt, @variant, @startFen)
  `).run(game);
}

export function listGames(db: Database.Database): GameRecord[] {
  const rows = db.prepare(`SELECT * FROM games ORDER BY finished_at DESC`).all() as Record<string, unknown>[];
  return rows.map(rowToGameRecord);
}

export function getGame(db: Database.Database, id: string): GameRecord | undefined {
  const row = db.prepare(`SELECT * FROM games WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  return row ? rowToGameRecord(row) : undefined;
}

function rowToGameRecord(row: Record<string, unknown>): GameRecord {
  return {
    id: row.id as string,
    pgn: row.pgn as string,
    result: row.result as string,
    resultReason: row.result_reason as string,
    whiteTimeMs: row.white_time_ms as number,
    blackTimeMs: row.black_time_ms as number,
    timeControlMs: row.time_control_ms as number,
    finishedAt: row.finished_at as number,
    variant: row.variant as string,
    startFen: row.start_fen as string,
  };
}
