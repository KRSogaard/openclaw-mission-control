import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/index";
import { agentTasks } from "@/lib/db/schema";
import { cancelTask, retryTask, completeTask, checkInTask } from "@/lib/task-dispatcher";
import type { AgentTask, ApiResponse } from "@/lib/types";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
): Promise<Response> {
  const { taskId } = await params;

  try {
    const db = getDb();
    const task = db.select().from(agentTasks).where(eq(agentTasks.id, taskId)).get();

    if (!task) {
      return Response.json(
        { error: { code: "NOT_FOUND", message: "Task not found" } } satisfies ApiResponse<AgentTask>,
        { status: 404 }
      );
    }

    return Response.json({
      data: {
        id: task.id,
        agentId: task.agentId,
        title: task.title,
        description: task.description,
        status: task.status as AgentTask["status"],
        response: task.response,
        statusMessage: task.statusMessage,
        retryCount: task.retryCount,
        createdBy: task.createdBy,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      },
    } satisfies ApiResponse<AgentTask>);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json(
      { error: { code: "TASK_ERROR", message } } satisfies ApiResponse<AgentTask>,
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
): Promise<Response> {
  const { taskId } = await params;

  try {
    const body = (await request.json()) as { action: "retry" | "complete" | "check-in"; result?: string };

    if (body.action === "check-in") {
      await checkInTask(taskId);
      return Response.json({ data: { ok: true } });
    }

    if (body.action === "retry") {
      await retryTask(taskId);
      return Response.json({ data: { ok: true } });
    }

    if (body.action === "complete") {
      await completeTask(taskId, body.result ?? "Manually completed by operator");
      return Response.json({ data: { ok: true } });
    }

    return Response.json(
      { error: { code: "INVALID_ACTION", message: "action must be 'retry' or 'complete'" } },
      { status: 400 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json(
      { error: { code: "TASK_ERROR", message } },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
): Promise<Response> {
  const { taskId } = await params;

  try {
    await cancelTask(taskId);
    return Response.json({ data: { ok: true } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json(
      { error: { code: "TASK_ERROR", message } },
      { status: 500 }
    );
  }
}
