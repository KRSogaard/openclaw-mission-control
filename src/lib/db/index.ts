import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import * as schema from "./schema";

const DB_PATH = path.join(process.cwd(), "data", "mission-control.db");

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (!_db) {
    const sqlite = new Database(DB_PATH);
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    _db = drizzle(sqlite, { schema });
    migrate(_db);
  }
  return _db;
}

function migrate(db: ReturnType<typeof drizzle<typeof schema>>) {
  db.run(`
    CREATE TABLE IF NOT EXISTS agent_hierarchy (
      agent_id TEXT PRIMARY KEY,
      parent_id TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      description TEXT
    )
  `);
  addColumnIfMissing(db, "agent_hierarchy", "description", "TEXT");

  db.run(`
    CREATE TABLE IF NOT EXISTS agent_tasks (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      session_key TEXT,
      response TEXT,
      status_message TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS agent_task_settings (
      agent_id TEXT PRIMARY KEY,
      timeout_minutes INTEGER NOT NULL DEFAULT 30,
      max_retries INTEGER NOT NULL DEFAULT 3
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_agent_status ON agent_tasks(agent_id, status)`);

  db.run(`
    CREATE TABLE IF NOT EXISTS agent_task_events (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      event TEXT NOT NULL,
      message TEXT,
      actor TEXT,
      timestamp INTEGER NOT NULL
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_task_events_task ON agent_task_events(task_id, timestamp)`);
}

function addColumnIfMissing(
  db: ReturnType<typeof drizzle<typeof schema>>,
  table: string,
  column: string,
  type: string
) {
  try {
    db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  } catch {
    return;
  }
}
