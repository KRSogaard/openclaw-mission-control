import { desc } from "drizzle-orm";
import { getDb } from "@/lib/db/index";
import { agentTasks } from "@/lib/db/schema";
import { getAgents } from "@/lib/openclaw";
import { formatModelName } from "@/lib/api-transforms";
import { isVisibleAgent } from "@/lib/constants";
import type { ApiResponse } from "@/lib/types";

export type GlobalTask = {
  id: string;
  agentId: string;
  agentName: string;
  agentModel: string;
  title: string;
  description: string | null;
  status: string;
  response: string | null;
  statusMessage: string | null;
  retryCount: number;
  createdBy: string | null;
  createdAt: number;
  updatedAt: number;
};

export async function GET(): Promise<Response> {
  try {
    const db = getDb();
    const [tasks, agents] = await Promise.all([
      db.select().from(agentTasks).orderBy(desc(agentTasks.createdAt)).all(),
      getAgents(),
    ]);

    const agentMap = new Map(
      (agents ?? [])
        .filter((a) => isVisibleAgent(a.id))
        .map((a) => [a.id, { name: a.name, model: formatModelName(a.model) }])
    );

    const global: GlobalTask[] = tasks.map((t) => {
      const agent = agentMap.get(t.agentId);
      return {
        id: t.id,
        agentId: t.agentId,
        agentName: agent?.name ?? t.agentId,
        agentModel: agent?.model ?? "unknown",
        title: t.title,
        description: t.description,
        status: t.status,
        response: t.response,
        statusMessage: t.statusMessage,
        retryCount: t.retryCount,
        createdBy: t.createdBy,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      };
    });

    return Response.json({ data: global } satisfies ApiResponse<GlobalTask[]>);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json(
      { error: { code: "TASKS_ERROR", message } } satisfies ApiResponse<GlobalTask[]>,
      { status: 500 }
    );
  }
}
