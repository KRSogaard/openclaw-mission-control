import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/index";
import { agentTasks } from "@/lib/db/schema";
import { getChatHistory } from "@/lib/openclaw";
import type { ChatMessage } from "@/lib/openclaw";
import type { ApiResponse } from "@/lib/types";

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
        { error: { code: "NOT_FOUND", message: "Task not found" } },
        { status: 404 }
      );
    }

    if (!task.sessionKey) {
      return Response.json({ data: [] } satisfies ApiResponse<ChatMessage[]>);
    }

    const messages = await getChatHistory(task.sessionKey);
    return Response.json({ data: messages } satisfies ApiResponse<ChatMessage[]>);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json(
      { error: { code: "CHAT_ERROR", message } },
      { status: 500 }
    );
  }
}
