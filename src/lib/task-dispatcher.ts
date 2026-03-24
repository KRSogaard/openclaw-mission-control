import crypto from "node:crypto";
import { eq, and, asc } from "drizzle-orm";
import { getDb } from "./db/index";
import { agentTasks, agentTaskSettings, agentTaskEvents } from "./db/schema";
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

type RunningTask = {
  taskId: string;
  agentId: string;
  sessionKey: string;
  runId: string;
  timeoutTimer: ReturnType<typeof setTimeout>;
};

const runningTasks = new Map<string, RunningTask>();

function getSettings(agentId: string): { timeoutMinutes: number; maxRetries: number } {
  const db = getDb();
  const row = db.select().from(agentTaskSettings).where(eq(agentTaskSettings.agentId, agentId)).get();
  return {
    timeoutMinutes: row?.timeoutMinutes ?? 30,
    maxRetries: row?.maxRetries ?? 3,
  };
}

export function getRunningTaskForAgent(agentId: string): RunningTask | undefined {
  return runningTasks.get(agentId);
}

export async function dispatchNext(agentId: string): Promise<void> {
  if (runningTasks.has(agentId)) return;

  const db = getDb();
  const next = db
    .select()
    .from(agentTasks)
    .where(and(eq(agentTasks.agentId, agentId), eq(agentTasks.status, "queued")))
    .orderBy(asc(agentTasks.createdAt))
    .limit(1)
    .get();

  if (!next) return;

  await dispatchTask(next.id, agentId);
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

    runningTasks.set(agentId, { taskId, agentId, sessionKey, runId, timeoutTimer });
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
    clearRunning(agentId);
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

  const running = runningTasks.get(agentId);
  if (!running) return;

  try {
    const ws = getWsClient();
    await ws.rpc("chat.send", {
      sessionKey: running.sessionKey,
      message: `[MISSION CONTROL] Checking in on task "${task.title}" (ID: ${task.id}). Has this been completed? If so, please use the task.complete tool. If still working, use task.update to report progress. Retry ${newRetryCount}/${settings.maxRetries}.`,
      idempotencyKey: crypto.randomUUID(),
      deliver: false,
    });

    const timeoutTimer = setTimeout(
      () => handleTimeout(taskId, agentId),
      settings.timeoutMinutes * 60 * 1000
    );
    running.timeoutTimer = timeoutTimer;
  } catch {
    clearRunning(agentId);
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

function clearRunning(agentId: string): void {
  const running = runningTasks.get(agentId);
  if (running) {
    clearTimeout(running.timeoutTimer);
    runningTasks.delete(agentId);
  }
}

export async function completeTask(
  taskId: string,
  result: string | null
): Promise<void> {
  const db = getDb();
  const task = db.select().from(agentTasks).where(eq(agentTasks.id, taskId)).get();
  if (!task) return;

  clearRunning(task.agentId);

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

  const running = runningTasks.get(task.agentId);
  if (running && running.taskId === taskId) {
    const settings = getSettings(task.agentId);
    clearTimeout(running.timeoutTimer);
    running.timeoutTimer = setTimeout(
      () => handleTimeout(taskId, task.agentId),
      settings.timeoutMinutes * 60 * 1000
    );
  }
}

export async function cancelTask(taskId: string): Promise<void> {
  const db = getDb();
  const task = db.select().from(agentTasks).where(eq(agentTasks.id, taskId)).get();
  if (!task) return;

  if (task.status === "running") {
    clearRunning(task.agentId);
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
    `[MISSION CONTROL — NEW TASK]`,
    `Task ID: ${taskId}`,
    `Title: ${title}`,
  ];
  if (description) {
    parts.push(`\nDescription:\n${description}`);
  }
  parts.push(
    `\nWhen you have completed this task, call: task.complete(taskId="${taskId}", result="<summary of what you did>")`,
    `To report progress, call: task.update(taskId="${taskId}", status="<what you're doing>")`,
    `To assign a subtask to another agent, call: task.create(agentId="<target>", title="<title>", description="<details>")`,
  );
  return parts.join("\n");
}
