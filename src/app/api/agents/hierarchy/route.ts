import type { NextRequest } from "next/server";
import { getHierarchy, updateParent, updateDescription } from "@/lib/agent-sync";
import { getAgents } from "@/lib/openclaw";
import { toAgentSummary } from "@/lib/api-transforms";
import { isVisibleAgent } from "@/lib/constants";
import type { ApiResponse, AgentHierarchyNode, HierarchyUpdate } from "@/lib/types";

type HierarchyRow = { agentId: string; parentId: string | null; position: number; description: string | null };

function buildTree(
  agents: Map<string, ReturnType<typeof toAgentSummary>>,
  rows: HierarchyRow[]
): AgentHierarchyNode[] {
  const childrenMap = new Map<string | null, HierarchyRow[]>();

  for (const row of rows) {
    const key = row.parentId;
    if (!childrenMap.has(key)) childrenMap.set(key, []);
    childrenMap.get(key)!.push(row);
  }

  function build(parentId: string | null): AgentHierarchyNode[] {
    const children = childrenMap.get(parentId) ?? [];
    children.sort((a, b) => a.position - b.position);

    return children
      .filter((row) => agents.has(row.agentId))
      .map((row) => ({
        agent: { ...agents.get(row.agentId)!, description: row.description },
        children: build(row.agentId),
      }));
  }

  return build(null);
}

export async function GET(): Promise<Response> {
  try {
    const [rows, internalAgents] = await Promise.all([
      getHierarchy(),
      getAgents(),
    ]);

    const agentMap = new Map(
      (internalAgents ?? [])
        .filter((a) => isVisibleAgent(a.id))
        .map((a) => [a.id, toAgentSummary(a)])
    );

    const tree = buildTree(agentMap, rows);

    return Response.json({ data: tree } satisfies ApiResponse<AgentHierarchyNode[]>);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json(
      { error: { code: "HIERARCHY_ERROR", message } } satisfies ApiResponse<AgentHierarchyNode[]>,
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest): Promise<Response> {
  try {
    const body = (await request.json()) as { agentId: string; description: string | null };

    if (!body.agentId) {
      return Response.json(
        { error: { code: "INVALID_REQUEST", message: "agentId is required" } },
        { status: 400 }
      );
    }

    await updateDescription(body.agentId, body.description ?? null);

    return Response.json({ data: { ok: true } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json(
      { error: { code: "HIERARCHY_ERROR", message } },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest): Promise<Response> {
  try {
    const body = (await request.json()) as HierarchyUpdate;

    if (!body.agentId || typeof body.position !== "number") {
      return Response.json(
        { error: { code: "INVALID_REQUEST", message: "agentId and position are required" } },
        { status: 400 }
      );
    }

    await updateParent(body.agentId, body.parentId ?? null, body.position);

    return Response.json({ data: { ok: true } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json(
      { error: { code: "HIERARCHY_ERROR", message } },
      { status: 500 }
    );
  }
}
