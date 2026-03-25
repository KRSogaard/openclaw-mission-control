import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/index";
import { agentTaskSettings, globalSettings } from "@/lib/db/schema";
import { dispatchNext } from "@/lib/task-dispatcher";
import type { AgentTaskSettings, ApiResponse } from "@/lib/types";

function getDefaults(): AgentTaskSettings {
  const db = getDb();
  const rows = db.select().from(globalSettings).all();
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    timeoutMinutes: parseInt(map.get("task_timeout_minutes") ?? "") || 30,
    maxRetries: parseInt(map.get("task_max_retries") ?? "") || 3,
    maxConcurrent: parseInt(map.get("task_max_concurrent") ?? "") || 1,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;

  try {
    const db = getDb();
    const defaults = getDefaults();
    const row = db.select().from(agentTaskSettings).where(eq(agentTaskSettings.agentId, id)).get();

    const settings: AgentTaskSettings = {
      timeoutMinutes: row?.timeoutMinutes ?? defaults.timeoutMinutes,
      maxRetries: row?.maxRetries ?? defaults.maxRetries,
      maxConcurrent: row?.maxConcurrent ?? defaults.maxConcurrent,
    };

    return Response.json({ data: settings } satisfies ApiResponse<AgentTaskSettings>);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json(
      { error: { code: "SETTINGS_ERROR", message } } satisfies ApiResponse<AgentTaskSettings>,
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;

  try {
    const body = (await request.json()) as Partial<AgentTaskSettings>;
    const db = getDb();

    const existing = db.select().from(agentTaskSettings).where(eq(agentTaskSettings.agentId, id)).get();

    if (existing) {
      db.update(agentTaskSettings)
        .set({
          timeoutMinutes: body.timeoutMinutes ?? existing.timeoutMinutes,
          maxRetries: body.maxRetries ?? existing.maxRetries,
          maxConcurrent: body.maxConcurrent ?? existing.maxConcurrent,
        })
        .where(eq(agentTaskSettings.agentId, id))
        .run();
    } else {
      db.insert(agentTaskSettings)
        .values({
          agentId: id,
          timeoutMinutes: body.timeoutMinutes,
          maxRetries: body.maxRetries,
          maxConcurrent: body.maxConcurrent,
        })
        .run();
    }

    dispatchNext(id).catch(() => {});

    return Response.json({ data: { ok: true } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json(
      { error: { code: "SETTINGS_ERROR", message } },
      { status: 500 }
    );
  }
}
