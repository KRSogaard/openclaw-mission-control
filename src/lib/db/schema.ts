import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const agentHierarchy = sqliteTable("agent_hierarchy", {
  agentId: text("agent_id").primaryKey(),
  parentId: text("parent_id").references((): ReturnType<typeof text> => agentHierarchy.agentId, { onDelete: "set null" }),
  position: integer("position").notNull().default(0),
  description: text("description"),
});

export const agentTasks = sqliteTable("agent_tasks", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull().references(() => agentHierarchy.agentId, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("queued"),
  sessionKey: text("session_key"),
  response: text("response"),
  statusMessage: text("status_message"),
  retryCount: integer("retry_count").notNull().default(0),
  createdBy: text("created_by"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  lastContactAt: integer("last_contact_at"),
});

export const agentTaskEvents = sqliteTable("agent_task_events", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull().references(() => agentTasks.id, { onDelete: "cascade" }),
  event: text("event").notNull(),
  message: text("message"),
  actor: text("actor"),
  timestamp: integer("timestamp").notNull(),
});

export const agentTaskSettings = sqliteTable("agent_task_settings", {
  agentId: text("agent_id").primaryKey().references(() => agentHierarchy.agentId, { onDelete: "cascade" }),
  timeoutMinutes: integer("timeout_minutes"),
  maxRetries: integer("max_retries"),
  maxConcurrent: integer("max_concurrent"),
});

export const globalSettings = sqliteTable("global_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
