import type { NextRequest } from "next/server";
import { eq, asc } from "drizzle-orm";
import { getDb } from "@/lib/db/index";
import { agentTaskEvents } from "@/lib/db/schema";
import type { TaskEvent, ApiResponse } from "@/lib/types";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
): Promise<Response> {
  const { taskId } = await params;

  try {
    const db = getDb();
    const events = db
      .select()
      .from(agentTaskEvents)
      .where(eq(agentTaskEvents.taskId, taskId))
      .orderBy(asc(agentTaskEvents.timestamp))
      .all();

    const mapped: TaskEvent[] = events.map((e) => ({
      id: e.id,
      event: e.event,
      message: e.message,
      actor: e.actor,
      timestamp: e.timestamp,
    }));

    return Response.json({ data: mapped } satisfies ApiResponse<TaskEvent[]>);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json(
      { error: { code: "EVENTS_ERROR", message } } satisfies ApiResponse<TaskEvent[]>,
      { status: 500 }
    );
  }
}
