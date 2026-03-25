import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import * as schema from "./schema";

const DB_PATH = path.join(process.cwd(), "data", "bridge-command.db");

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (!_db) {
    mkdirSync(path.dirname(DB_PATH), { recursive: true });
    const sqlite = new Database(DB_PATH);
    sqlite.pragma("journal_mode = WAL");
    migrate(sqlite);
    sqlite.pragma("foreign_keys = ON");
    _db = drizzle(sqlite, { schema });
  }
  return _db;
}

function migrate(sqlite: InstanceType<typeof Database>) {
  const version = sqlite.pragma("user_version", { simple: true }) as number;

  if (version < 1) {
    migrateToV1(sqlite);
  }
  if (version < 2) {
    migrateToV2(sqlite);
  }
}

function tableExists(sqlite: InstanceType<typeof Database>, name: string): boolean {
  const row = sqlite.prepare(
    "SELECT count(*) as c FROM sqlite_master WHERE type='table' AND name=?"
  ).get(name) as { c: number };
  return row.c > 0;
}

function migrateToV1(sqlite: InstanceType<typeof Database>) {
  sqlite.pragma("foreign_keys = OFF");

  const isUpgrade = tableExists(sqlite, "agent_hierarchy");

  sqlite.transaction(() => {
    if (isUpgrade) {
      sqlite.exec("DROP INDEX IF EXISTS idx_tasks_agent_status");
      sqlite.exec("DROP INDEX IF EXISTS idx_task_events_task");
      sqlite.exec("ALTER TABLE agent_task_events RENAME TO _old_agent_task_events");
      sqlite.exec("ALTER TABLE agent_tasks RENAME TO _old_agent_tasks");
      sqlite.exec("ALTER TABLE agent_task_settings RENAME TO _old_agent_task_settings");
      sqlite.exec("ALTER TABLE agent_hierarchy RENAME TO _old_agent_hierarchy");
    }

    sqlite.exec(`
      CREATE TABLE agent_hierarchy (
        agent_id TEXT PRIMARY KEY,
        parent_id TEXT REFERENCES agent_hierarchy(agent_id) ON DELETE SET NULL,
        position INTEGER NOT NULL DEFAULT 0,
        description TEXT
      )
    `);

    sqlite.exec(`
      CREATE TABLE agent_tasks (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL REFERENCES agent_hierarchy(agent_id) ON DELETE CASCADE,
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

    sqlite.exec(`
      CREATE TABLE agent_task_events (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
        event TEXT NOT NULL,
        message TEXT,
        actor TEXT,
        timestamp INTEGER NOT NULL
      )
    `);

    sqlite.exec(`
      CREATE TABLE agent_task_settings (
        agent_id TEXT PRIMARY KEY REFERENCES agent_hierarchy(agent_id) ON DELETE CASCADE,
        timeout_minutes INTEGER,
        max_retries INTEGER,
        max_concurrent INTEGER
      )
    `);

    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS global_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    if (isUpgrade) {
      sqlite.exec("INSERT INTO agent_hierarchy SELECT * FROM _old_agent_hierarchy");
      sqlite.exec(`
        INSERT INTO agent_tasks SELECT * FROM _old_agent_tasks
        WHERE agent_id IN (SELECT agent_id FROM agent_hierarchy)
      `);
      sqlite.exec(`
        INSERT INTO agent_task_events SELECT * FROM _old_agent_task_events
        WHERE task_id IN (SELECT id FROM agent_tasks)
      `);
      sqlite.exec(`
        INSERT INTO agent_task_settings SELECT * FROM _old_agent_task_settings
        WHERE agent_id IN (SELECT agent_id FROM agent_hierarchy)
      `);

      sqlite.exec("DROP TABLE _old_agent_task_events");
      sqlite.exec("DROP TABLE _old_agent_tasks");
      sqlite.exec("DROP TABLE _old_agent_task_settings");
      sqlite.exec("DROP TABLE _old_agent_hierarchy");
    }

    sqlite.exec("CREATE INDEX idx_tasks_agent_status ON agent_tasks(agent_id, status)");
    sqlite.exec("CREATE INDEX idx_task_events_task ON agent_task_events(task_id, timestamp)");
  })();

  sqlite.pragma("user_version = 1");
}

function migrateToV2(sqlite: InstanceType<typeof Database>) {
  sqlite.exec("ALTER TABLE agent_tasks ADD COLUMN last_contact_at INTEGER");
  sqlite.exec("UPDATE agent_tasks SET last_contact_at = updated_at WHERE status = 'running'");
  sqlite.pragma("user_version = 2");
}
