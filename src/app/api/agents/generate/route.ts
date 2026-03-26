import { exec } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { agentExists, invalidateConfigCache, updateAgentSubagents, updateAgentToAgent, ensureHooksAccess, cleanBootstrapFiles, copyUserMdFromDefault, addAgentToSpawnList, getSubagentInfoForParent } from "@/lib/openclaw";
import { addAgentToHierarchy } from "@/lib/agent-sync";
import { syncToolsToWorkspace } from "@/lib/bc-tools";
import { generateAgentFiles, syncParentSubagentDocs } from "@/lib/bridge-commander";
import type { AgentGenerateRequest, AgentCreateResponse, ApiResponse } from "@/lib/types";

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

export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as AgentGenerateRequest;

    if (!body.name || typeof body.name !== "string" || body.name.trim().length === 0) {
      return Response.json(
        { error: { code: "VALIDATION_ERROR", message: "name is required" } },
        { status: 400 },
      );
    }
    if (!body.purpose || typeof body.purpose !== "string" || body.purpose.trim().length === 0) {
      return Response.json(
        { error: { code: "VALIDATION_ERROR", message: "purpose is required for AI-generated agents" } },
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

    await execAsync(
      `openclaw agents add "${body.name.trim()}" --workspace "${workspace}"${modelFlag} --json`,
      { timeout: 30_000 },
    );

    invalidateConfigCache();

    const resolvedWorkspace = workspace.startsWith("~/")
      ? path.join(os.homedir(), workspace.slice(2))
      : path.resolve(workspace);

    const isSubagent = body.addToParentSpawnList === true;

    await cleanBootstrapFiles(resolvedWorkspace);

    const files = await generateAgentFiles({
      name: body.name.trim(),
      purpose: body.purpose.trim(),
      personality: body.personality,
      peers: body.peers,
      parentId: body.parentId,
      model: body.model,
    });

    if (isSubagent) {
      await fs.writeFile(path.join(resolvedWorkspace, "AGENTS.md"), files.agents, "utf-8");
    } else {
      await Promise.all([
        fs.writeFile(path.join(resolvedWorkspace, "SOUL.md"), files.soul, "utf-8"),
        fs.writeFile(path.join(resolvedWorkspace, "IDENTITY.md"), files.identity, "utf-8"),
        fs.writeFile(path.join(resolvedWorkspace, "AGENTS.md"), files.agents, "utf-8"),
        fs.writeFile(path.join(resolvedWorkspace, "MEMORY.md"), files.memory, "utf-8"),
        fs.writeFile(path.join(resolvedWorkspace, "HEARTBEAT.md"), files.heartbeat, "utf-8"),
        copyUserMdFromDefault(resolvedWorkspace),
      ]);
    }

    await syncToolsToWorkspace(resolvedWorkspace);

    await addAgentToHierarchy(agentId, body.parentId ?? null, body.description ?? null);

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

    const response: AgentCreateResponse = {
      agentId,
      name: body.name.trim(),
      workspace,
      model: body.model ?? "default",
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


