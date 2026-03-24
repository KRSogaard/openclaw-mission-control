import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/index";
import { agentTaskSettings } from "@/lib/db/schema";
import type { AgentTaskSettings, ApiResponse } from "@/lib/types";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;

  try {
    const db = getDb();
    const row = db.select().from(agentTaskSettings).where(eq(agentTaskSettings.agentId, id)).get();

    const settings: AgentTaskSettings = {
      timeoutMinutes: row?.timeoutMinutes ?? 30,
      maxRetries: row?.maxRetries ?? 3,
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
        })
        .where(eq(agentTaskSettings.agentId, id))
        .run();
    } else {
      db.insert(agentTaskSettings)
        .values({
          agentId: id,
          timeoutMinutes: body.timeoutMinutes ?? 30,
          maxRetries: body.maxRetries ?? 3,
        })
        .run();
    }

    return Response.json({ data: { ok: true } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json(
      { error: { code: "SETTINGS_ERROR", message } },
      { status: 500 }
    );
  }
}
