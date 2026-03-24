import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/index";
import { globalSettings } from "@/lib/db/schema";
import type { GlobalTaskSettings, ApiResponse } from "@/lib/types";

const DEFAULTS: GlobalTaskSettings = { timeoutMinutes: 30, maxRetries: 3, maxConcurrent: 1 };

function getGlobal(): GlobalTaskSettings {
  const db = getDb();
  const rows = db.select().from(globalSettings).all();
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    timeoutMinutes: parseInt(map.get("task_timeout_minutes") ?? "") || DEFAULTS.timeoutMinutes,
    maxRetries: parseInt(map.get("task_max_retries") ?? "") || DEFAULTS.maxRetries,
    maxConcurrent: parseInt(map.get("task_max_concurrent") ?? "") || DEFAULTS.maxConcurrent,
  };
}

function setKey(key: string, value: string): void {
  const db = getDb();
  const existing = db.select().from(globalSettings).where(eq(globalSettings.key, key)).get();
  if (existing) {
    db.update(globalSettings).set({ value }).where(eq(globalSettings.key, key)).run();
  } else {
    db.insert(globalSettings).values({ key, value }).run();
  }
}

export async function GET(): Promise<Response> {
  return Response.json({ data: getGlobal() } satisfies ApiResponse<GlobalTaskSettings>);
}

export async function PATCH(request: NextRequest): Promise<Response> {
  try {
    const body = (await request.json()) as Partial<GlobalTaskSettings>;
    if (body.timeoutMinutes !== undefined) setKey("task_timeout_minutes", String(body.timeoutMinutes));
    if (body.maxRetries !== undefined) setKey("task_max_retries", String(body.maxRetries));
    if (body.maxConcurrent !== undefined) setKey("task_max_concurrent", String(body.maxConcurrent));
    return Response.json({ data: getGlobal() } satisfies ApiResponse<GlobalTaskSettings>);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json(
      { error: { code: "SETTINGS_ERROR", message } },
      { status: 500 }
    );
  }
}
