import { getAgents } from "@/lib/openclaw";
import { toAgentSummary } from "@/lib/api-transforms";
import { getHierarchy } from "@/lib/db/seed";
import type { AgentSummary, ApiResponse } from "@/lib/types";

export async function GET(): Promise<Response> {
  try {
    const [agents, rows] = await Promise.all([getAgents(), getHierarchy()]);
    const descMap = new Map(rows.map((r) => [r.agentId, r.description]));
    const summaries = (agents ?? [])
      .filter((a) => !a.id.startsWith("mc-gateway-"))
      .map((a) => toAgentSummary(a, descMap.get(a.id)));
    return Response.json({ data: summaries } satisfies ApiResponse<AgentSummary[]>);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json(
      { error: { code: "AGENTS_ERROR", message } } satisfies ApiResponse<AgentSummary[]>,
      { status: 500 }
    );
  }
}
