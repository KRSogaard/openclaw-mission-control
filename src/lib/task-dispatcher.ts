import crypto from "node:crypto";
import { eq, and, asc, sql } from "drizzle-orm";
import { getDb } from "./db/index";
import { agentTasks, agentTaskSettings, agentTaskEvents, globalSettings } from "./db/schema";
import { getWsClient } from "./openclaw-ws";

const LOOP_INTERVAL = 60 * 1000;
let _loopStarted = false;

export function startTaskLoop(): void {
  if (_loopStarted) return;
  _loopStarted = true;
  runLoop().catch(() => {});
  setInterval(() => { runLoop().catch(() => {}); }, LOOP_INTERVAL);
}

async function runLoop(): Promise<void> {
  try {
    await dispatchAllQueued();
    await checkTimeouts();
  } catch (err) {
    console.warn("[task-loop]", err instanceof Error ? err.message : String(err));
  }
}

async function dispatchAllQueued(): Promise<void> {
  const db = getDb();
  const agentIds = db
    .selectDistinct({ agentId: agentTasks.agentId })
    .from(agentTasks)
    .where(eq(agentTasks.status, "queued"))
    .all()
    .map((r) => r.agentId);

  for (const agentId of agentIds) {
    await dispatchNext(agentId);
  }
}

async function checkTimeouts(): Promise<void> {
  const db = getDb();
  const running = db
    .select()
    .from(agentTasks)
    .where(eq(agentTasks.status, "running"))
    .all();

  const now = Date.now();

  for (const task of running) {
    const contactTime = task.lastContactAt ?? task.updatedAt;
    const settings = getSettings(task.agentId);
    const timeoutMs = settings.timeoutMinutes * 60 * 1000;
    const elapsed = now - contactTime;

    if (elapsed < timeoutMs) continue;

    const newRetryCount = task.retryCount + 1;

    if (newRetryCount > settings.maxRetries) {
      db.update(agentTasks)
        .set({
          status: "failed",
          statusMessage: `Timed out after ${settings.maxRetries} retries`,
          retryCount: newRetryCount,
          updatedAt: now,
        })
        .where(eq(agentTasks.id, task.id))
        .run();
      logEvent(task.id, "failed", `Timed out after ${settings.maxRetries} retries`, "system");
      await dispatchNext(task.agentId);
      continue;
    }

    db.update(agentTasks)
      .set({ retryCount: newRetryCount, lastContactAt: now })
      .where(eq(agentTasks.id, task.id))
      .run();

    logEvent(task.id, "timeout_retry", `Retry ${newRetryCount}/${settings.maxRetries} — sending check-in`, "system");

    if (task.sessionKey) {
      await sendCheckIn(task.id, task.agentId, task.sessionKey, task.title);
    }
  }
}

function logEvent(taskId: string, event: string, message: string | null, actor: string | null): void {
  const db = getDb();
  db.insert(agentTaskEvents)
    .values({
      id: crypto.randomUUID(),
      taskId,
      event,
      message,
      actor,
      timestamp: Date.now(),
    })
    .run();
}

function getGlobalDefaults(): { timeoutMinutes: number; maxRetries: number; maxConcurrent: number } {
  const db = getDb();
  const rows = db.select().from(globalSettings).all();
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    timeoutMinutes: parseInt(map.get("task_timeout_minutes") ?? "30") || 30,
    maxRetries: parseInt(map.get("task_max_retries") ?? "3") || 3,
    maxConcurrent: parseInt(map.get("task_max_concurrent") ?? "1") || 1,
  };
}

function getSettings(agentId: string): { timeoutMinutes: number; maxRetries: number; maxConcurrent: number } {
  const db = getDb();
  const defaults = getGlobalDefaults();
  const row = db.select().from(agentTaskSettings).where(eq(agentTaskSettings.agentId, agentId)).get();
  return {
    timeoutMinutes: row?.timeoutMinutes ?? defaults.timeoutMinutes,
    maxRetries: row?.maxRetries ?? defaults.maxRetries,
    maxConcurrent: row?.maxConcurrent ?? defaults.maxConcurrent,
  };
}

function countRunningTasks(agentId: string): number {
  const db = getDb();
  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(agentTasks)
    .where(and(eq(agentTasks.agentId, agentId), eq(agentTasks.status, "running")))
    .get();
  return result?.count ?? 0;
}

export async function dispatchNext(agentId: string): Promise<void> {
  const db = getDb();
  const settings = getSettings(agentId);
  const running = countRunningTasks(agentId);

  if (running >= settings.maxConcurrent) return;

  const slotsAvailable = settings.maxConcurrent - running;
  const queued = db
    .select()
    .from(agentTasks)
    .where(and(eq(agentTasks.agentId, agentId), eq(agentTasks.status, "queued")))
    .orderBy(asc(agentTasks.createdAt))
    .limit(slotsAvailable)
    .all();

  for (const task of queued) {
    await dispatchTask(task.id, agentId);
  }
}

async function dispatchTask(taskId: string, agentId: string): Promise<void> {
  const db = getDb();
  const task = db.select().from(agentTasks).where(eq(agentTasks.id, taskId)).get();
  if (!task) return;

  const sessionKey = task.sessionKey ?? `agent:${agentId}:dashboard:mc-${crypto.randomUUID().slice(0, 8)}`;
  const prompt = buildTaskPrompt(task.title, task.description, task.id);

  try {
    const ws = getWsClient();
    await ws.rpc("chat.send", {
      sessionKey,
      message: prompt,
      idempotencyKey: crypto.randomUUID(),
      deliver: false,
    });

    const now = Date.now();
    db.update(agentTasks)
      .set({ status: "running", sessionKey, updatedAt: now, lastContactAt: now })
      .where(eq(agentTasks.id, taskId))
      .run();

    logEvent(taskId, "dispatched", `Sent to agent via session ${sessionKey}`, "system");
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Dispatch failed";
    db.update(agentTasks)
      .set({ status: "failed", statusMessage: errMsg, updatedAt: Date.now() })
      .where(eq(agentTasks.id, taskId))
      .run();

    logEvent(taskId, "failed", `Dispatch failed: ${errMsg}`, "system");
  }
}

async function sendCheckIn(taskId: string, agentId: string, sessionKey: string, title: string): Promise<void> {
  try {
    const ws = getWsClient();
    await ws.rpc("chat.send", {
      sessionKey,
      message: `[BRIDGE COMMAND — CHECK-IN] Checking in on task "${title}" (ID: ${taskId}). If you already completed this task, please call task.complete. If still working, call task.update to report progress. If you cannot complete it, call task.fail.`,
      idempotencyKey: crypto.randomUUID(),
      deliver: false,
    });
  } catch {
    logEvent(taskId, "check_in", "Check-in message failed to send", "system");
  }
}

export async function checkInAllRunning(): Promise<void> {
  const db = getDb();
  const running = db
    .select()
    .from(agentTasks)
    .where(eq(agentTasks.status, "running"))
    .all();

  for (const task of running) {
    if (!task.sessionKey) continue;

    db.update(agentTasks)
      .set({ lastContactAt: Date.now() })
      .where(eq(agentTasks.id, task.id))
      .run();

    logEvent(task.id, "check_in", "Gateway restarted — checking in with agent", "system");
    await sendCheckIn(task.id, task.agentId, task.sessionKey, task.title);
  }
}

export async function checkInTask(taskId: string): Promise<void> {
  const db = getDb();
  const task = db.select().from(agentTasks).where(eq(agentTasks.id, taskId)).get();
  if (!task || task.status !== "running" || !task.sessionKey) return;

  logEvent(taskId, "check_in", "Manual check-in triggered by operator", "operator");
  await sendCheckIn(taskId, task.agentId, task.sessionKey, task.title);
}

export async function completeTask(taskId: string, result: string | null): Promise<void> {
  const db = getDb();
  const task = db.select().from(agentTasks).where(eq(agentTasks.id, taskId)).get();
  if (!task) return;

  db.update(agentTasks)
    .set({ status: "completed", response: result, updatedAt: Date.now() })
    .where(eq(agentTasks.id, taskId))
    .run();

  logEvent(taskId, "completed", result, "agent");
  await dispatchNext(task.agentId);
}

export async function failTask(taskId: string, reason: string | null): Promise<void> {
  const db = getDb();
  const task = db.select().from(agentTasks).where(eq(agentTasks.id, taskId)).get();
  if (!task) return;

  db.update(agentTasks)
    .set({ status: "failed", statusMessage: reason, updatedAt: Date.now() })
    .where(eq(agentTasks.id, taskId))
    .run();

  logEvent(taskId, "failed", reason, "agent");
  await dispatchNext(task.agentId);
}

export async function updateTaskStatus(taskId: string, statusMessage: string): Promise<void> {
  const db = getDb();
  const task = db.select().from(agentTasks).where(eq(agentTasks.id, taskId)).get();
  if (!task) return;

  const now = Date.now();
  db.update(agentTasks)
    .set({ statusMessage, updatedAt: now, lastContactAt: now })
    .where(eq(agentTasks.id, taskId))
    .run();

  logEvent(taskId, "progress", statusMessage, "agent");
}

export async function cancelTask(taskId: string): Promise<void> {
  const db = getDb();
  const task = db.select().from(agentTasks).where(eq(agentTasks.id, taskId)).get();
  if (!task) return;

  db.update(agentTasks)
    .set({ status: "cancelled", updatedAt: Date.now() })
    .where(eq(agentTasks.id, taskId))
    .run();

  logEvent(taskId, "cancelled", null, "operator");

  if (task.status === "running") {
    await dispatchNext(task.agentId);
  }
}

export async function retryTask(taskId: string): Promise<void> {
  const db = getDb();
  const task = db.select().from(agentTasks).where(eq(agentTasks.id, taskId)).get();
  if (!task) return;

  db.update(agentTasks)
    .set({
      status: "queued",
      sessionKey: null,
      response: null,
      statusMessage: null,
      retryCount: 0,
      updatedAt: Date.now(),
    })
    .where(eq(agentTasks.id, taskId))
    .run();

  logEvent(taskId, "retried", "Manually retried by operator", "operator");
  await dispatchNext(task.agentId);
}

export async function createTask(
  agentId: string,
  title: string,
  description: string | null,
  createdBy: string | null,
): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = Date.now();

  db.insert(agentTasks)
    .values({
      id,
      agentId,
      title,
      description,
      status: "queued",
      retryCount: 0,
      createdBy,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  logEvent(id, "created", `Task "${title}" created`, createdBy);
  await dispatchNext(agentId);
  return id;
}

function buildTaskPrompt(title: string, description: string | null, taskId: string): string {
  const parts = [
    `[BRIDGE COMMAND — NEW TASK]`,
    `Task ID: ${taskId}`,
    `Title: ${title}`,
  ];
  if (description) {
    parts.push(`\nDescription:\n${description}`);
  }
  parts.push(
    `\nWhen you have completed this task, call: task.complete(taskId="${taskId}", result="<summary of what you did>")`,
    `If you cannot complete this task, call: task.fail(taskId="${taskId}", reason="<why it failed>")`,
    `To report progress, call: task.update(taskId="${taskId}", status="<what you're doing>")`,
    `To assign a subtask to another agent, call: task.create(agentId="<target>", title="<title>", description="<details>")`,
  );
  return parts.join("\n");
}
