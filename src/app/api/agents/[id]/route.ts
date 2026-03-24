import { getAgent, updateAgentModel, updateAgentSubagents, updateAgentToAgent } from "@/lib/openclaw";
import { toAgentView } from "@/lib/api-transforms";
import { getHierarchy } from "@/lib/db/seed";
import type { AgentView, ApiResponse } from "@/lib/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;

  try {
    const [agent, rows] = await Promise.all([getAgent(id), getHierarchy()]);
    if (!agent) {
      return Response.json(
        { error: { code: "NOT_FOUND", message: `Agent "${id}" not found` } } satisfies ApiResponse<AgentView>,
        { status: 404 }
      );
    }
    const row = rows.find((r) => r.agentId === id);
    return Response.json({
      data: toAgentView(agent, row?.description),
    } satisfies ApiResponse<AgentView>);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json(
      { error: { code: "AGENT_ERROR", message } } satisfies ApiResponse<AgentView>,
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;

  try {
    const body = (await request.json()) as {
      model?: string;
      allowedSubagents?: string[];
      agentToAgentPeers?: string[];
    };

    if (body.model) {
      await updateAgentModel(id, body.model);
    }
    if (body.allowedSubagents) {
      await updateAgentSubagents(id, body.allowedSubagents);
    }
    if (body.agentToAgentPeers !== undefined) {
      await updateAgentToAgent(id, body.agentToAgentPeers);
    }

    return Response.json({ data: { ok: true } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json(
      { error: { code: "UPDATE_ERROR", message } },
      { status: 500 }
    );
  }
}
