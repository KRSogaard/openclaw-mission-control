import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { getAgents, getAgent } from "./openclaw";
import { getWsClient } from "./openclaw-ws";

const OPENCLAW_HOME = path.join(os.homedir(), ".openclaw");
const TOKEN_FILE = path.join(OPENCLAW_HOME, "credentials", "mc-hooks-token");
const EXEC_APPROVALS_FILE = path.join(OPENCLAW_HOME, "exec-approvals.json");

export type CheckStatus = "pass" | "warn" | "fail";

export type DiagnosticCheck = {
  id: string;
  category: string;
  label: string;
  status: CheckStatus;
  message: string;
  agentId?: string;
};

export type DiagnosticResult = {
  checks: DiagnosticCheck[];
  summary: { pass: number; warn: number; fail: number };
  timestamp: number;
};

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readJsonSafe<T>(p: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(p, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function runDiagnostics(): Promise<DiagnosticResult> {
  const checks: DiagnosticCheck[] = [];

  // Gateway connectivity
  try {
    const ws = getWsClient();
    await ws.rpc("status", {});
    checks.push({
      id: "gateway-online",
      category: "Gateway",
      label: "Gateway connection",
      status: "pass",
      message: "Connected via WebSocket",
    });
  } catch (err) {
    checks.push({
      id: "gateway-online",
      category: "Gateway",
      label: "Gateway connection",
      status: "fail",
      message: `Cannot connect: ${err instanceof Error ? err.message : "unknown error"}`,
    });
  }

  // Hooks token file
  const tokenExists = await fileExists(TOKEN_FILE);
  if (tokenExists) {
    const token = (await fs.readFile(TOKEN_FILE, "utf-8")).trim();
    const stat = await fs.stat(TOKEN_FILE);
    const mode = (stat.mode & 0o777).toString(8);

    checks.push({
      id: "hooks-token-exists",
      category: "Hooks",
      label: "Hooks token file",
      status: "pass",
      message: `Exists at ${TOKEN_FILE}`,
    });

    checks.push({
      id: "hooks-token-permissions",
      category: "Hooks",
      label: "Token file permissions",
      status: mode === "600" ? "pass" : "warn",
      message: mode === "600" ? "Permissions 600 (owner-only)" : `Permissions ${mode} — should be 600`,
    });

    checks.push({
      id: "hooks-token-nonempty",
      category: "Hooks",
      label: "Token not empty",
      status: token.length > 0 ? "pass" : "fail",
      message: token.length > 0 ? `Token is ${token.length} chars` : "Token file is empty",
    });
  } else {
    checks.push({
      id: "hooks-token-exists",
      category: "Hooks",
      label: "Hooks token file",
      status: "fail",
      message: `Missing at ${TOKEN_FILE} — will be created on next sync`,
    });
  }

  // Exec approvals
  type ExecApprovals = {
    defaults?: { policy?: string; ask?: string };
    agents?: Record<string, { policy?: string; ask?: string }>;
  };
  const approvals = await readJsonSafe<ExecApprovals>(EXEC_APPROVALS_FILE);

  if (!approvals) {
    checks.push({
      id: "exec-approvals-file",
      category: "Exec",
      label: "Exec approvals file",
      status: "warn",
      message: `Not found at ${EXEC_APPROVALS_FILE} — agents will be prompted for every exec`,
    });
  } else {
    const defaultPolicy = approvals.defaults?.policy;
    const defaultAsk = approvals.defaults?.ask;

    checks.push({
      id: "exec-default-policy",
      category: "Exec",
      label: "Default exec policy",
      status: defaultPolicy === "allow" && defaultAsk === "never" ? "pass" : "warn",
      message: defaultPolicy === "allow"
        ? "Default policy: allow (auto-approve)"
        : `Default policy: ${defaultPolicy ?? "not set"} — agents may be prompted for exec`,
    });
  }

  // Per-agent checks
  const agents = await getAgents();
  const visibleAgents = agents.filter((a) => !a.id.startsWith("mc-gateway-"));

  for (const agent of visibleAgents) {
    const detail = await getAgent(agent.id);
    if (!detail) continue;

    // Workspace exists
    const wsExists = await fileExists(agent.workspacePath);
    checks.push({
      id: `workspace-${agent.id}`,
      category: "Agents",
      label: `Workspace directory`,
      status: wsExists ? "pass" : "fail",
      message: wsExists ? `Exists at ${agent.workspace}` : `Missing: ${agent.workspace}`,
      agentId: agent.id,
    });

    // TOOLS.md exists and has MC section
    const toolsPath = path.join(agent.workspacePath, "TOOLS.md");
    const toolsExists = await fileExists(toolsPath);

    if (toolsExists) {
      const toolsContent = await fs.readFile(toolsPath, "utf-8");
      const hasMcTools = toolsContent.includes("<!-- BEGIN:MC_TOOLS -->");

      checks.push({
        id: `tools-mc-${agent.id}`,
        category: "Agents",
        label: `MC tools in TOOLS.md`,
        status: hasMcTools ? "pass" : "warn",
        message: hasMcTools ? "Mission Control tools section present" : "MC tools section missing — will be added on next sync",
        agentId: agent.id,
      });
    } else {
      checks.push({
        id: `tools-mc-${agent.id}`,
        category: "Agents",
        label: `TOOLS.md`,
        status: "warn",
        message: "TOOLS.md not found — will be created on next sync",
        agentId: agent.id,
      });
    }

    // Exec approval for this agent
    if (approvals) {
      const agentApproval = approvals.agents?.[agent.id];
      const hasApproval = agentApproval?.policy === "allow" || approvals.defaults?.policy === "allow";

      checks.push({
        id: `exec-${agent.id}`,
        category: "Agents",
        label: `Exec auto-approve`,
        status: hasApproval ? "pass" : "warn",
        message: hasApproval
          ? "Exec allowed — task callbacks will work"
          : "Exec not auto-approved — task callbacks may hang waiting for manual approval",
        agentId: agent.id,
      });
    }

    // Channel bindings
    if (agent.routing.length === 0) {
      checks.push({
        id: `channels-${agent.id}`,
        category: "Agents",
        label: `Channel bindings`,
        status: "warn",
        message: "No channel bindings — agent won't receive external messages",
        agentId: agent.id,
      });
    }
  }

  const summary = {
    pass: checks.filter((c) => c.status === "pass").length,
    warn: checks.filter((c) => c.status === "warn").length,
    fail: checks.filter((c) => c.status === "fail").length,
  };

  return { checks, summary, timestamp: Date.now() };
}
