import Database from 'better-sqlite3';

export interface GameRecord {
  id: string;
  pgn: string;
  result: string;
  resultReason: string;
  whiteTimeMs: number;
  blackTimeMs: number;
  timeControlMs: number;
  finishedAt: number;
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
  return db;
}

export function saveGame(db: Database.Database, game: GameRecord): void {
  db.prepare(`
    INSERT INTO games (id, pgn, result, result_reason, white_time_ms, black_time_ms, time_control_ms, finished_at)
    VALUES (@id, @pgn, @result, @resultReason, @whiteTimeMs, @blackTimeMs, @timeControlMs, @finishedAt)
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
  };
}
