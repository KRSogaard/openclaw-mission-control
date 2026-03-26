import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { getAgents, getAgent } from "./openclaw";
import { getWsClient } from "./openclaw-ws";
import { syncToolsToWorkspace, getHooksToken } from "./bc-tools";
import { isBridgeCommanderReady, setupBridgeCommander } from "./bridge-commander";
import { isVisibleAgent } from "./constants";

const OPENCLAW_HOME = path.join(os.homedir(), ".openclaw");
const TOKEN_FILE = path.join(OPENCLAW_HOME, "credentials", "bc-hooks-token");
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

  // Tools.exec config in openclaw.json
  type OpenClawConfig = {
    tools?: { allow?: string[]; exec?: { security?: string; ask?: string } };
  };
  const openclawConfig = await readJsonSafe<OpenClawConfig>(
    path.join(OPENCLAW_HOME, "openclaw.json"),
  );
  if (openclawConfig) {
    const execInAllow = openclawConfig.tools?.allow?.includes("exec") ?? false;
    checks.push({
      id: "tools-exec-allowed",
      category: "Exec",
      label: "Exec in tools.allow",
      status: execInAllow ? "pass" : "fail",
      message: execInAllow
        ? "exec is in tools.allow list"
        : "exec missing from tools.allow — agents cannot use exec at all",
    });

    const execSecurity = openclawConfig.tools?.exec?.security;
    const execAsk = openclawConfig.tools?.exec?.ask;
    const toolExecOk = execSecurity === "full" && execAsk === "off";
    checks.push({
      id: "tools-exec-settings",
      category: "Exec",
      label: "tools.exec security settings",
      status: toolExecOk ? "pass" : "fail",
      message: toolExecOk
        ? "tools.exec.security=full, ask=off"
        : `security: ${execSecurity ?? "not set (defaults to allowlist)"}, ask: ${execAsk ?? "not set (defaults to on-miss)"} — set security=full and ask=off for headless exec`,
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
    defaults?: { policy?: string; ask?: string; security?: string; askFallback?: string };
    agents?: Record<string, { policy?: string; ask?: string; allowlist?: unknown[] }>;
  };
  const approvals = await readJsonSafe<ExecApprovals>(EXEC_APPROVALS_FILE);

  if (!approvals) {
    checks.push({
      id: "exec-approvals-file",
      category: "Exec",
      label: "Exec approvals file",
      status: "fail",
      message: `Not found at ${EXEC_APPROVALS_FILE} — agents cannot exec without this file`,
    });
  } else {
    const defaultPolicy = approvals.defaults?.policy;
    const defaultAsk = approvals.defaults?.ask;
    const defaultSecurity = approvals.defaults?.security;
    const defaultAskFallback = approvals.defaults?.askFallback;

    const policyOk = defaultPolicy === "allow" && defaultAsk === "never";
    checks.push({
      id: "exec-default-policy",
      category: "Exec",
      label: "Default exec policy",
      status: policyOk ? "pass" : "fail",
      message: policyOk
        ? "Default policy: allow, ask: never"
        : `policy: ${defaultPolicy ?? "not set"}, ask: ${defaultAsk ?? "not set"} — need policy=allow and ask=never`,
    });

    const securityOk = defaultSecurity === "full";
    checks.push({
      id: "exec-default-security",
      category: "Exec",
      label: "Default exec security mode",
      status: securityOk ? "pass" : "fail",
      message: securityOk
        ? "Security: full (no allowlist restrictions)"
        : `security: ${defaultSecurity ?? "not set"} — defaults to allowlist mode which blocks most commands. Set to "full"`,
    });

    const fallbackOk = defaultAskFallback === "full";
    checks.push({
      id: "exec-default-fallback",
      category: "Exec",
      label: "Exec askFallback (headless)",
      status: fallbackOk ? "pass" : "fail",
      message: fallbackOk
        ? "askFallback: full (exec works without approval UI)"
        : `askFallback: ${defaultAskFallback ?? "not set"} — defaults to deny when no approval UI is connected. Agents cannot exec headlessly. Set to "full"`,
    });
  }

  const bcReady = await isBridgeCommanderReady();
  checks.push({
    id: "bc-internal",
    category: "Bridge Command",
    label: "BridgeCommander agent",
    status: bcReady ? "pass" : "warn",
    message: bcReady
      ? "BridgeCommander is configured — AI agent creation available"
      : "BridgeCommander not found — AI-generated agent creation will auto-setup on first use, or fix now",
  });

  const agents = await getAgents();
  const visibleAgents = (agents ?? []).filter((a) => isVisibleAgent(a.id));

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
      const hasBcTools = toolsContent.includes("<!-- BEGIN:BC_TOOLS -->");

      checks.push({
        id: `tools-mc-${agent.id}`,
        category: "Agents",
        label: `MC tools in TOOLS.md`,
        status: hasBcTools ? "pass" : "warn",
        message: hasBcTools ? "Bridge Command tools section present" : "MC tools section missing — will be added on next sync",
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

export type FixResult = {
  checkId: string;
  fixed: boolean;
  message: string;
};

const FIXABLE_PREFIXES = [
  "bc-internal",
  "hooks-token-",
  "exec-default-policy",
  "exec-default-security",
  "exec-default-fallback",
  "exec-",
  "tools-exec-settings",
  "tools-mc-",
];

export function isFixable(checkId: string, status: CheckStatus): boolean {
  if (status === "pass") return false;
  return FIXABLE_PREFIXES.some((p) => checkId.startsWith(p));
}

export async function fixCheck(checkId: string): Promise<FixResult> {
  if (checkId === "bc-internal") {
    await setupBridgeCommander();
    return { checkId, fixed: true, message: "BridgeCommander agent created and configured" };
  }

  if (checkId === "hooks-token-exists" || checkId === "hooks-token-nonempty") {
    await getHooksToken();
    return { checkId, fixed: true, message: "Token generated" };
  }

  if (checkId === "hooks-token-permissions") {
    await fs.chmod(TOKEN_FILE, 0o600);
    return { checkId, fixed: true, message: "Permissions set to 600" };
  }

  if (checkId === "exec-default-policy" || checkId === "exec-default-security" || checkId === "exec-default-fallback") {
    await setExecApproval("defaults");
    return { checkId, fixed: true, message: "Exec approvals defaults fixed: policy=allow, ask=never, security=full, askFallback=full" };
  }

  if (checkId === "tools-exec-settings") {
    await fixToolsExec();
    return { checkId, fixed: true, message: "Set tools.exec.security=full, ask=off in openclaw.json" };
  }

  if (checkId.startsWith("exec-")) {
    const agentId = checkId.replace("exec-", "");
    await setExecApproval(agentId);
    return { checkId, fixed: true, message: `Exec auto-approved for ${agentId}` };
  }

  if (checkId.startsWith("tools-mc-")) {
    const agentId = checkId.replace("tools-mc-", "");
    const agents = await getAgents();
    const agent = agents?.find((a) => a.id === agentId);
    if (!agent) return { checkId, fixed: false, message: `Agent ${agentId} not found` };
    await syncToolsToWorkspace(agent.workspacePath);
    return { checkId, fixed: true, message: "MC tools synced to TOOLS.md" };
  }

  return { checkId, fixed: false, message: "Not auto-fixable" };
}

export async function fixAll(checks: DiagnosticCheck[]): Promise<FixResult[]> {
  const results: FixResult[] = [];
  for (const check of checks) {
    if (!isFixable(check.id, check.status)) continue;
    const result = await fixCheck(check.id);
    results.push(result);
  }
  return results;
}

type ExecApprovals = {
  version?: number;
  socket?: unknown;
  defaults?: { policy?: string; ask?: string; security?: string; askFallback?: string };
  agents?: Record<string, { policy?: string; ask?: string; allowlist?: unknown[] }>;
};

async function setExecApproval(target: string): Promise<void> {
  let data: ExecApprovals;
  try {
    const raw = await fs.readFile(EXEC_APPROVALS_FILE, "utf-8");
    data = JSON.parse(raw) as ExecApprovals;
  } catch {
    data = { version: 1, defaults: {}, agents: {} };
  }

  if (target === "defaults") {
    data.defaults = {
      ...data.defaults,
      policy: "allow",
      ask: "never",
      security: "full",
      askFallback: "full",
    };
  } else {
    if (!data.agents) data.agents = {};
    if (!data.agents[target]) data.agents[target] = {};
    data.agents[target].policy = "allow";
    data.agents[target].ask = "never";
  }

  await fs.writeFile(EXEC_APPROVALS_FILE, JSON.stringify(data, null, 2), "utf-8");
}

const OPENCLAW_CONFIG_FILE = path.join(OPENCLAW_HOME, "openclaw.json");

async function fixToolsExec(): Promise<void> {
  type ToolsConfig = { tools?: { exec?: Record<string, string> } };
  let data: ToolsConfig;
  try {
    const raw = await fs.readFile(OPENCLAW_CONFIG_FILE, "utf-8");
    data = JSON.parse(raw) as ToolsConfig;
  } catch {
    return;
  }

  if (!data.tools) data.tools = {};
  if (!data.tools.exec) data.tools.exec = {};
  data.tools.exec.security = "full";
  data.tools.exec.ask = "off";

  await fs.writeFile(OPENCLAW_CONFIG_FILE, JSON.stringify(data, null, 2), "utf-8");
}
