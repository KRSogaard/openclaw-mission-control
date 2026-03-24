import type { NextRequest } from "next/server";
import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db/index";
import { agentTasks } from "@/lib/db/schema";
import { createTask } from "@/lib/task-dispatcher";
import type { AgentTask, ApiResponse } from "@/lib/types";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;

  try {
    const db = getDb();
    const tasks = db
      .select()
      .from(agentTasks)
      .where(eq(agentTasks.agentId, id))
      .orderBy(desc(agentTasks.createdAt))
      .all();

    const mapped: AgentTask[] = tasks.map((t) => ({
      id: t.id,
      agentId: t.agentId,
      title: t.title,
      description: t.description,
      status: t.status as AgentTask["status"],
      response: t.response,
      statusMessage: t.statusMessage,
      retryCount: t.retryCount,
      createdBy: t.createdBy,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));

    return Response.json({ data: mapped } satisfies ApiResponse<AgentTask[]>);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json(
      { error: { code: "TASKS_ERROR", message } } satisfies ApiResponse<AgentTask[]>,
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;

  try {
    const body = (await request.json()) as { title: string; description?: string };

    if (!body.title?.trim()) {
      return Response.json(
        { error: { code: "INVALID_REQUEST", message: "title is required" } },
        { status: 400 }
      );
    }

    const taskId = await createTask(id, body.title.trim(), body.description ?? null, "operator");

    return Response.json({ data: { taskId } }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json(
      { error: { code: "TASK_CREATE_ERROR", message } },
      { status: 500 }
    );
  }
}
