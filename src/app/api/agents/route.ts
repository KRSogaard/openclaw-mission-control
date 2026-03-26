import { exec } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import os from "node:os";
import { getAgents, agentExists, invalidateConfigCache, updateAgentSubagents, updateAgentToAgent, ensureHooksAccess, cleanBootstrapFiles, copyUserMdFromDefault, addAgentToSpawnList, getSubagentInfoForParent } from "@/lib/openclaw";
import { toAgentSummary } from "@/lib/api-transforms";
import { getHierarchy, addAgentToHierarchy } from "@/lib/agent-sync";
import { syncToolsToWorkspace } from "@/lib/bc-tools";
import { syncParentSubagentDocs } from "@/lib/bridge-commander";
import { isVisibleAgent } from "@/lib/constants";
import type { AgentSummary, AgentCreateRequest, AgentCreateResponse, ApiResponse } from "@/lib/types";

const execAsync = promisify(exec);
const OPENCLAW_HOME = path.join(os.homedir(), ".openclaw");

const AGENT_ID_RE = /^[a-z][a-z0-9-]*$/;
const MAX_ID_LENGTH = 64;

function normalizeToId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_ID_LENGTH);
}

export async function GET(): Promise<Response> {
  try {
    const [agents, rows] = await Promise.all([getAgents(), getHierarchy()]);
    const descMap = new Map(rows.map((r) => [r.agentId, r.description]));
    const summaries = (agents ?? [])
      .filter((a) => isVisibleAgent(a.id))
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

export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as AgentCreateRequest;

    if (!body.name || typeof body.name !== "string" || body.name.trim().length === 0) {
      return Response.json(
        { error: { code: "VALIDATION_ERROR", message: "name is required" } },
        { status: 400 },
      );
    }

    const agentId = body.id?.trim() || normalizeToId(body.name);

    if (!AGENT_ID_RE.test(agentId) || agentId.length > MAX_ID_LENGTH) {
      return Response.json(
        { error: { code: "VALIDATION_ERROR", message: `Invalid agent ID "${agentId}". Must be lowercase alphanumeric with hyphens, starting with a letter, max ${MAX_ID_LENGTH} chars.` } },
        { status: 400 },
      );
    }

    if (agentId === "main") {
      return Response.json(
        { error: { code: "VALIDATION_ERROR", message: '"main" is a reserved agent ID' } },
        { status: 400 },
      );
    }

    if (await agentExists(agentId)) {
      return Response.json(
        { error: { code: "CONFLICT", message: `Agent "${agentId}" already exists` } },
        { status: 409 },
      );
    }

    const workspace = body.workspace?.trim() ||
      path.join(OPENCLAW_HOME, "workspace", agentId);

    const modelFlag = body.model ? ` --model "${body.model}"` : "";

    const { stdout } = await execAsync(
      `openclaw agents add "${body.name.trim()}" --workspace "${workspace}"${modelFlag} --json`,
      { timeout: 30_000 },
    );

    let cliResult: { agentId?: string; model?: string };
    try {
      cliResult = JSON.parse(stdout) as { agentId?: string; model?: string };
    } catch {
      cliResult = { agentId };
    }

    invalidateConfigCache();

    const resolvedWorkspace = workspace.startsWith("~/")
      ? path.join(os.homedir(), workspace.slice(2))
      : path.resolve(workspace);

    const isSubagent = body.addToParentSpawnList === true;

    await cleanBootstrapFiles(resolvedWorkspace);
    if (!isSubagent) {
      await copyUserMdFromDefault(resolvedWorkspace);
    }
    await syncToolsToWorkspace(resolvedWorkspace);

    const rootAgentId = body.parentId ?? null;
    await addAgentToHierarchy(agentId, rootAgentId, body.description ?? null);

    if (body.peers && body.peers.length > 0) {
      await updateAgentToAgent(agentId, body.peers);
    }

    if (body.subagents && body.subagents.length > 0) {
      await updateAgentSubagents(agentId, body.subagents);
    }

    if (body.enableHooks !== false) {
      await ensureHooksAccess(agentId);
    }

    if (isSubagent && body.parentId) {
      await addAgentToSpawnList(body.parentId, agentId);
      syncParentSubagentDocs(body.parentId, await getSubagentInfoForParent(body.parentId)).catch(() => {});
    }

    invalidateConfigCache();

    const agents = await getAgents();
    const created = agents?.find((a) => a.id === agentId);
    const model = created?.model ?? cliResult.model ?? body.model ?? "unknown";

    const response: AgentCreateResponse = {
      agentId,
      name: body.name.trim(),
      workspace,
      model,
    };

    return Response.json({ data: response } satisfies ApiResponse<AgentCreateResponse>, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create agent";
    return Response.json(
      { error: { code: "CREATE_ERROR", message } },
      { status: 500 },
    );
  }
}
