import type { NextRequest } from "next/server";
import { completeTask, failTask, updateTaskStatus, createTask } from "@/lib/task-dispatcher";
import { getHooksToken } from "@/lib/bc-tools";

type HookPayload =
  | { action: "task.complete"; taskId: string; result?: string }
  | { action: "task.fail"; taskId: string; reason?: string }
  | { action: "task.update"; taskId: string; status: string }
  | { action: "task.create"; agentId: string; title: string; description?: string; createdBy?: string };

export async function POST(request: NextRequest): Promise<Response> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  const expected = await getHooksToken();

  if (!expected || token !== expected) {
    return Response.json(
      { error: { code: "UNAUTHORIZED", message: "Invalid hooks token" } },
      { status: 401 }
    );
  }

  try {
    const body = (await request.json()) as HookPayload;

    switch (body.action) {
      case "task.complete": {
        await completeTask(body.taskId, body.result ?? null);
        return Response.json({ data: { ok: true } });
      }

      case "task.fail": {
        await failTask(body.taskId, body.reason ?? null);
        return Response.json({ data: { ok: true } });
      }

      case "task.update": {
        await updateTaskStatus(body.taskId, body.status);
        return Response.json({ data: { ok: true } });
      }

      case "task.create": {
        const id = await createTask(
          body.agentId,
          body.title,
          body.description ?? null,
          body.createdBy ?? null
        );
        return Response.json({ data: { taskId: id } });
      }

      default: {
        return Response.json(
          { error: { code: "INVALID_ACTION", message: `Unknown action` } },
          { status: 400 }
        );
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json(
      { error: { code: "HOOK_ERROR", message } },
      { status: 500 }
    );
  }
}
