import crypto from "node:crypto";
import { eq, and, asc, sql } from "drizzle-orm";
import { getDb } from "./db/index";
import { agentTasks, agentTaskSettings, agentTaskEvents, globalSettings } from "./db/schema";
import { getWsClient } from "./openclaw-ws";

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

let _recovered = false;

export function recoverOrphanedTasks(): void {
  if (_recovered) return;
  _recovered = true;

  const db = getDb();
  const orphaned = db
    .select()
    .from(agentTasks)
    .where(eq(agentTasks.status, "running"))
    .all();

  for (const task of orphaned) {
    if (!task.sessionKey) {
      db.update(agentTasks)
        .set({ status: "queued", retryCount: task.retryCount + 1, updatedAt: Date.now() })
        .where(eq(agentTasks.id, task.id))
        .run();
      logEvent(task.id, "resumed", "No session — re-queued after restart", "system");
      continue;
    }

    const settings = getSettings(task.agentId);
    const timeoutMs = settings.timeoutMinutes * 60 * 1000;

    const timeoutTimer = setTimeout(
      () => handleTimeout(task.id, task.agentId),
      timeoutMs
    );

    runningTimers.set(task.id, timeoutTimer);

    db.update(agentTasks)
      .set({ updatedAt: Date.now() })
      .where(eq(agentTasks.id, task.id))
      .run();

    logEvent(task.id, "resumed", "Server restarted — checking in with agent", "system");

    sendCheckIn(task.id, task.agentId, task.sessionKey, task.title);
  }

  const queued = db
    .select()
    .from(agentTasks)
    .where(eq(agentTasks.status, "queued"))
    .all();

  const agentsWithQueued = [...new Set(queued.map((t) => t.agentId))];
  for (const agentId of agentsWithQueued) {
    dispatchNext(agentId);
  }
}

async function sendCheckIn(taskId: string, agentId: string, sessionKey: string, title: string): Promise<void> {
  try {
    const ws = getWsClient();
    await ws.rpc("chat.send", {
      sessionKey,
      message: `[CONTROL CENTER — CHECK-IN] Task "${title}" (ID: ${taskId}). Control Center restarted. If you already completed this task, please call task.complete again. If still working, call task.update. If you cannot complete it, call task.fail.`,
      idempotencyKey: crypto.randomUUID(),
      deliver: false,
    });
  } catch {
    logEvent(taskId, "resumed", "Check-in failed — will rely on timeout", "system");
  }
}

export async function checkInTask(taskId: string): Promise<void> {
  const db = getDb();
  const task = db.select().from(agentTasks).where(eq(agentTasks.id, taskId)).get();
  if (!task || task.status !== "running" || !task.sessionKey) return;

  logEvent(taskId, "check_in", "Manual check-in triggered by operator", "operator");
  await sendCheckIn(taskId, task.agentId, task.sessionKey, task.title);
}


const runningTimers = new Map<string, ReturnType<typeof setTimeout>>();

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
  const settings = getSettings(agentId);
  const running = countRunningTasks(agentId);

  if (running >= settings.maxConcurrent) return;

  const slotsAvailable = settings.maxConcurrent - running;
  const db = getDb();
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
  const settings = getSettings(agentId);

  const prompt = buildTaskPrompt(task.title, task.description, task.id);

  try {
    const ws = getWsClient();
    const payload = await ws.rpc("chat.send", {
      sessionKey,
      message: prompt,
      idempotencyKey: crypto.randomUUID(),
      deliver: false,
    });

    const runId = (payload.runId as string) ?? "";

    db.update(agentTasks)
      .set({
        status: "running",
        sessionKey,
        updatedAt: Date.now(),
      })
      .where(eq(agentTasks.id, taskId))
      .run();

    logEvent(taskId, "dispatched", `Sent to agent via session ${sessionKey}`, "system");

    const timeoutTimer = setTimeout(
      () => handleTimeout(taskId, agentId),
      settings.timeoutMinutes * 60 * 1000
    );

    runningTimers.set(taskId, timeoutTimer);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Dispatch failed";
    db.update(agentTasks)
      .set({
        status: "failed",
        statusMessage: errMsg,
        updatedAt: Date.now(),
      })
      .where(eq(agentTasks.id, taskId))
      .run();

    logEvent(taskId, "failed", `Dispatch failed: ${errMsg}`, "system");
    await dispatchNext(agentId);
  }
}

async function handleTimeout(taskId: string, agentId: string): Promise<void> {
  const db = getDb();
  const task = db.select().from(agentTasks).where(eq(agentTasks.id, taskId)).get();
  if (!task || task.status !== "running") return;

  const settings = getSettings(agentId);
  const newRetryCount = task.retryCount + 1;

  if (newRetryCount > settings.maxRetries) {
    clearTimer(taskId);
    db.update(agentTasks)
      .set({
        status: "failed",
        statusMessage: `Timed out after ${settings.maxRetries} retries`,
        retryCount: newRetryCount,
        updatedAt: Date.now(),
      })
      .where(eq(agentTasks.id, taskId))
      .run();
    logEvent(taskId, "failed", `Timed out after ${settings.maxRetries} retries`, "system");
    await dispatchNext(agentId);
    return;
  }

  db.update(agentTasks)
    .set({ retryCount: newRetryCount, updatedAt: Date.now() })
    .where(eq(agentTasks.id, taskId))
    .run();

  logEvent(taskId, "timeout_retry", `Retry ${newRetryCount}/${settings.maxRetries} — sending check-in`, "system");

  if (!task.sessionKey) return;

  try {
    const ws = getWsClient();
    await ws.rpc("chat.send", {
      sessionKey: task.sessionKey,
      message: `[CONTROL CENTER] Checking in on task "${task.title}" (ID: ${task.id}). Has this been completed? If so, please use the task.complete tool. If still working, use task.update to report progress. Retry ${newRetryCount}/${settings.maxRetries}.`,
      idempotencyKey: crypto.randomUUID(),
      deliver: false,
    });

    const timeoutTimer = setTimeout(
      () => handleTimeout(taskId, agentId),
      settings.timeoutMinutes * 60 * 1000
    );
    runningTimers.set(taskId, timeoutTimer);
  } catch {
    clearTimer(taskId);
    db.update(agentTasks)
      .set({
        status: "failed",
        statusMessage: "Failed to send retry check-in",
        updatedAt: Date.now(),
      })
      .where(eq(agentTasks.id, taskId))
      .run();
    logEvent(taskId, "failed", "Failed to send retry check-in", "system");
    await dispatchNext(agentId);
  }
}

function clearTimer(taskId: string): void {
  const timer = runningTimers.get(taskId);
  if (timer) {
    clearTimeout(timer);
    runningTimers.delete(taskId);
  }
}

export async function completeTask(
  taskId: string,
  result: string | null
): Promise<void> {
  const db = getDb();
  const task = db.select().from(agentTasks).where(eq(agentTasks.id, taskId)).get();
  if (!task) return;

  clearTimer(task.id);

  db.update(agentTasks)
    .set({
      status: "completed",
      response: result,
      updatedAt: Date.now(),
    })
    .where(eq(agentTasks.id, taskId))
    .run();

  logEvent(taskId, "completed", result, "agent");
  await dispatchNext(task.agentId);
}

export async function failTask(
  taskId: string,
  reason: string | null
): Promise<void> {
  const db = getDb();
  const task = db.select().from(agentTasks).where(eq(agentTasks.id, taskId)).get();
  if (!task) return;

  clearTimer(task.id);

  db.update(agentTasks)
    .set({
      status: "failed",
      statusMessage: reason,
      updatedAt: Date.now(),
    })
    .where(eq(agentTasks.id, taskId))
    .run();

  logEvent(taskId, "failed", reason, "agent");
  await dispatchNext(task.agentId);
}

export async function updateTaskStatus(
  taskId: string,
  statusMessage: string
): Promise<void> {
  const db = getDb();
  const task = db.select().from(agentTasks).where(eq(agentTasks.id, taskId)).get();
  if (!task) return;

  db.update(agentTasks)
    .set({ statusMessage, updatedAt: Date.now() })
    .where(eq(agentTasks.id, taskId))
    .run();

  logEvent(taskId, "progress", statusMessage, "agent");

  clearTimer(taskId);
  const settings = getSettings(task.agentId);
  runningTimers.set(taskId, setTimeout(
    () => handleTimeout(taskId, task.agentId),
    settings.timeoutMinutes * 60 * 1000
  ));
}

export async function cancelTask(taskId: string): Promise<void> {
  const db = getDb();
  const task = db.select().from(agentTasks).where(eq(agentTasks.id, taskId)).get();
  if (!task) return;

  if (task.status === "running") {
    clearTimer(task.id);
  }

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

  if (task.status === "running") {
    clearTimer(task.id);
  }

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
  createdBy: string | null
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
    `[CONTROL CENTER — NEW TASK]`,
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
