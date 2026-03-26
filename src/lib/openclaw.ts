import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { GatewayStatus, FileEntry, FileContent } from "./types";
import { getWsClient } from "./openclaw-ws";
import { isVisibleAgent } from "./constants";

const OPENCLAW_HOME = path.join(os.homedir(), ".openclaw");
const CONFIG_PATH = path.join(OPENCLAW_HOME, "openclaw.json");
const DEFAULT_WORKSPACE = path.join(OPENCLAW_HOME, "workspace");

const BOOTSTRAP_FILES = [
  "AGENTS.md",
  "SOUL.md",
  "IDENTITY.md",
  "USER.md",
  "TOOLS.md",
  "MEMORY.md",
  "HEARTBEAT.md",
];

const LANG_MAP: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "tsx",
  ".js": "javascript",
  ".jsx": "jsx",
  ".json": "json",
  ".md": "markdown",
  ".yml": "yaml",
  ".yaml": "yaml",
  ".css": "css",
  ".html": "html",
  ".sh": "bash",
  ".py": "python",
  ".rs": "rust",
  ".go": "go",
  ".sql": "sql",
  ".toml": "toml",
  ".xml": "xml",
  ".env": "bash",
  ".txt": "plaintext",
};

type InternalAgentRouting = {
  channel: string;
  accountId: string;
  peerKind: "channel" | "dm" | "catch-all";
  peer?: string;
  requireMention: boolean;
};

type InternalAgent = {
  id: string;
  name: string;
  model: string;
  isDefault: boolean;
  workspace: string;
  workspacePath: string;
  routing: InternalAgentRouting[];
};

type InternalAgentConfig = {
  mentionPatterns: string[];
  allowedSubagents: string[];
  agentToAgentPeers: string[];
  spawnableBy: Array<{ agentId: string; wildcard: boolean }>;
  hasHooksAccess: boolean;
  heartbeat: string | null;
};

type InternalAgentDetail = InternalAgent & {
  bootstrapFiles: string[];
  agentDir: string;
  config: InternalAgentConfig;
};

type OpenClawConfigAgent = {
  id?: string;
  name?: string;
  default?: boolean;
  model?: string | { primary?: string };
  workspace?: string | string[];
  agentDir?: string;
  identity?: { name?: string };
  groupChat?: { mentionPatterns?: string[] };
  subagents?: { allowAgents?: string[] };
  heartbeat?: { every?: string };
};

type OpenClawBinding = {
  agentId?: string;
  match?: {
    channel?: string;
    accountId?: string;
    peer?: { kind?: string; id?: string };
  };
};

type ChannelConfig = Record<string, { allow?: boolean; requireMention?: boolean }>;

type OpenClawConfig = {
  meta?: { lastTouchedVersion?: string };
  agents?: {
    defaults?: {
      model?: { primary?: string };
      workspace?: string;
      heartbeat?: { every?: string };
    };
    list?: OpenClawConfigAgent[];
  };
  bindings?: OpenClawBinding[];
  gateway?: { port?: number };
  hooks?: { allowedAgentIds?: string[] };
  tools?: {
    agentToAgent?: {
      enabled?: boolean;
      allow?: string[];
    };
  };
  channels?: {
    slack?: {
      channels?: ChannelConfig;
    };
  };
};

function resolveHome(p: string): string {
  if (p.startsWith("~/")) {
    return path.join(os.homedir(), p.slice(2));
  }
  return path.resolve(p);
}

const CONFIG_CACHE_TTL = 30_000;
let _configCache: { data: OpenClawConfig; expiry: number } | null = null;

async function readConfig(): Promise<OpenClawConfig | null> {
  if (_configCache && Date.now() < _configCache.expiry) {
    return _configCache.data;
  }

  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf-8");
    const data = JSON.parse(raw) as OpenClawConfig;
    _configCache = { data, expiry: Date.now() + CONFIG_CACHE_TTL };
    return data;
  } catch (err) {
    console.warn(
      "[bridge-command] Failed to read OpenClaw config:",
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

export function invalidateConfigCache(): void {
  _configCache = null;
}

function resolveModel(
  agentModel: string | { primary?: string } | undefined,
  defaultModel: string
): string {
  if (!agentModel) return defaultModel;
  if (typeof agentModel === "string") return agentModel;
  return agentModel.primary ?? defaultModel;
}

function buildRoutingForAgent(
  agentId: string,
  bindings: OpenClawBinding[],
  channelConfigs: ChannelConfig
): InternalAgentRouting[] {
  return bindings
    .filter((b) => b.agentId === agentId)
    .map((b) => {
      const peerKind = b.match?.peer?.kind === "channel"
        ? "channel" as const
        : b.match?.peer
          ? "dm" as const
          : "catch-all" as const;
      const peerId = b.match?.peer?.id;
      const requireMention = peerKind === "channel" && peerId
        ? channelConfigs[peerId]?.requireMention ?? false
        : false;
      return {
        channel: b.match?.channel ?? "unknown",
        accountId: b.match?.accountId ?? "default",
        peerKind,
        peer: peerId,
        requireMention,
      };
    });
}

export async function getModels(): Promise<Array<{ id: string; name: string; provider: string; contextWindow?: number; reasoning?: boolean }>> {
  try {
    const ws = getWsClient();
    const payload = await ws.rpc("models.list", {});
    const models = payload.models as Array<Record<string, unknown>>;
    return models.map((m) => ({
      id: String(m.id),
      name: String(m.name ?? m.id),
      provider: String(m.provider ?? "unknown"),
      contextWindow: typeof m.contextWindow === "number" ? m.contextWindow : undefined,
      reasoning: typeof m.reasoning === "boolean" ? m.reasoning : undefined,
    }));
  } catch {
    return [];
  }
}

export async function updateAgentModel(agentId: string, modelId: string): Promise<void> {
  const raw = await fs.readFile(CONFIG_PATH, "utf-8");
  const config = JSON.parse(raw) as OpenClawConfig;

  const agent = config.agents?.list?.find((a) => a.id === agentId);
  if (!agent) throw new Error(`Agent "${agentId}" not found in config`);

  agent.model = modelId;
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
  invalidateConfigCache();
}

export type ChatMessage = {
  role: "user" | "assistant" | "toolResult";
  text: string;
  toolUse?: Array<{ tool: string; input: string }>;
  toolError?: string;
  timestamp?: number;
};

export async function getChatHistory(sessionKey: string): Promise<ChatMessage[]> {
  const ws = getWsClient();
  const payload = await ws.rpc("chat.history", { sessionKey });
  const rawMessages = (payload.messages as Array<Record<string, unknown>>) ?? [];

  return rawMessages.map((m) => {
    const role = String(m.role) as ChatMessage["role"];
    const content = m.content;
    const ts = typeof m.timestamp === "number" ? m.timestamp
      : typeof m.createdAt === "number" ? m.createdAt
        : typeof m.ts === "number" ? m.ts : undefined;

    if (role === "toolResult") {
      const text = typeof content === "string" ? content : JSON.stringify(content, null, 2);
      const parsed = typeof content === "string" ? safeParse(content) : content;
      return {
        role,
        text,
        timestamp: ts,
        toolError: (parsed as Record<string, unknown>)?.status === "error"
          ? String((parsed as Record<string, unknown>).error ?? "")
          : undefined,
      };
    }

    if (Array.isArray(content)) {
      const textParts: string[] = [];
      const toolUses: Array<{ tool: string; input: string }> = [];
      for (const block of content) {
        if (block.type === "text") textParts.push(String(block.text));
        if (block.type === "tool_use") {
          toolUses.push({
            tool: String(block.name ?? "unknown"),
            input: typeof block.input === "string" ? block.input : JSON.stringify(block.input, null, 2),
          });
        }
      }
      return {
        role,
        text: textParts.join("\n"),
        toolUse: toolUses.length > 0 ? toolUses : undefined,
        timestamp: ts,
      };
    }

    return { role, text: typeof content === "string" ? content : String(content ?? ""), timestamp: ts };
  });
}

function safeParse(str: string): unknown {
  try { return JSON.parse(str); } catch { return str; }
}

export async function updateAgentSubagents(agentId: string, allowAgents: string[]): Promise<void> {
  const raw = await fs.readFile(CONFIG_PATH, "utf-8");
  const config = JSON.parse(raw) as OpenClawConfig;

  const agent = config.agents?.list?.find((a) => a.id === agentId);
  if (!agent) throw new Error(`Agent "${agentId}" not found in config`);

  if (!agent.subagents) agent.subagents = {};
  agent.subagents.allowAgents = allowAgents;
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
  invalidateConfigCache();
}

export async function addAgentToSpawnList(parentId: string, childId: string): Promise<void> {
  const raw = await fs.readFile(CONFIG_PATH, "utf-8");
  const config = JSON.parse(raw) as OpenClawConfig;

  const parent = config.agents?.list?.find((a) => a.id === parentId);
  if (!parent) throw new Error(`Agent "${parentId}" not found in config`);

  if (!parent.subagents) parent.subagents = {};
  const current = parent.subagents.allowAgents ?? [];
  if (current.includes("*") || current.includes(childId)) return;

  parent.subagents.allowAgents = [...current, childId];
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
  invalidateConfigCache();
}

export async function removeAgentFromConfig(agentId: string): Promise<void> {
  const raw = await fs.readFile(CONFIG_PATH, "utf-8");
  const config = JSON.parse(raw) as OpenClawConfig;

  if (!config.agents?.list) throw new Error("No agents in config");
  const idx = config.agents.list.findIndex((a) => a.id === agentId);
  if (idx === -1) throw new Error(`Agent "${agentId}" not found in config`);

  config.agents.list.splice(idx, 1);

  for (const other of config.agents.list) {
    const subs = other.subagents?.allowAgents;
    if (subs) {
      other.subagents!.allowAgents = subs.filter((id) => id !== agentId);
    }
  }

  const a2a = (config as Record<string, unknown>).tools as Record<string, unknown> | undefined;
  const a2aAllow = (a2a?.agentToAgent as { allow?: string[] } | undefined)?.allow;
  if (a2aAllow) {
    (a2a!.agentToAgent as { allow: string[] }).allow = a2aAllow.filter((id) => id !== agentId);
  }

  const hooks = config.hooks as { allowedAgentIds?: string[] } | undefined;
  if (hooks?.allowedAgentIds) {
    hooks.allowedAgentIds = hooks.allowedAgentIds.filter((id) => id !== agentId);
  }

  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
  invalidateConfigCache();
}

export async function getSubagentInfoForParent(parentId: string): Promise<Array<{ id: string; name: string; description: string | null }>> {
  const config = await readConfig();
  if (!config) return [];

  const parent = config.agents?.list?.find((a) => a.id === parentId);
  if (!parent) return [];

  const allowed = parent.subagents?.allowAgents ?? [];
  if (allowed.length === 0) return [];

  const allAgents = config.agents?.list ?? [];
  const { getHierarchy } = await import("./agent-sync");
  const rows = await getHierarchy();
  const descMap = new Map(rows.map((r) => [r.agentId, r.description]));

  if (allowed.includes("*")) {
    return allAgents
      .filter((a) => a.id !== parentId && isVisibleAgent(a.id ?? ""))
      .map((a) => ({ id: a.id ?? "", name: a.name ?? a.id ?? "", description: descMap.get(a.id ?? "") ?? null }));
  }

  return allowed
    .filter(isVisibleAgent)
    .map((id) => {
      const a = allAgents.find((x) => x.id === id);
      return { id, name: a?.name ?? id, description: descMap.get(id) ?? null };
    });
}

export async function ensureHooksAccess(agentId: string): Promise<void> {
  const raw = await fs.readFile(CONFIG_PATH, "utf-8");
  const config = JSON.parse(raw) as Record<string, unknown>;

  if (!config.hooks) config.hooks = {};
  const hooks = config.hooks as { allowedAgentIds?: string[] };
  if (!hooks.allowedAgentIds) hooks.allowedAgentIds = [];

  if (!hooks.allowedAgentIds.includes(agentId)) {
    hooks.allowedAgentIds.push(agentId);
    await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
    invalidateConfigCache();
  }
}

export async function updateAgentToAgent(agentId: string, peers: string[]): Promise<void> {
  const raw = await fs.readFile(CONFIG_PATH, "utf-8");
  const config = JSON.parse(raw) as Record<string, unknown>;

  if (!config.tools) config.tools = {};
  const tools = config.tools as Record<string, unknown>;
  if (!tools.agentToAgent) tools.agentToAgent = { enabled: true, allow: [] };
  const a2a = tools.agentToAgent as { enabled: boolean; allow: string[] };

  a2a.enabled = true;

  if (peers.length === 1 && peers[0] === "*") {
    a2a.allow = ["*"];
  } else {
    const otherAgents = a2a.allow.filter((id) => id !== agentId && id !== "*");
    const shouldIncludeSelf = peers.length > 0;

    const newAllow = new Set(otherAgents);
    for (const peer of peers) {
      newAllow.add(peer);
    }
    if (shouldIncludeSelf) {
      newAllow.add(agentId);
    } else {
      newAllow.delete(agentId);
    }

    a2a.allow = [...newAllow];
  }

  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
  invalidateConfigCache();
}

export async function getGatewayStatus(): Promise<GatewayStatus> {
  try {
    const ws = getWsClient();
    const payload = await ws.rpc("status", {});
    return {
      online: true,
      version: (payload.runtimeVersion as string) ?? null,
    };
  } catch {
    const config = await readConfig();
    return {
      online: false,
      version: config?.meta?.lastTouchedVersion ?? null,
    };
  }
}

export async function getAgents(): Promise<InternalAgent[] | null> {
  const config = await readConfig();
  if (!config) return null;

  const defaultModel = config.agents?.defaults?.model?.primary ?? "unknown";
  const globalWorkspace = config.agents?.defaults?.workspace ?? DEFAULT_WORKSPACE;
  const bindings = config.bindings ?? [];
  const channelConfigs = config.channels?.slack?.channels ?? {};
  const agentsList = config.agents?.list ?? [];

  if (agentsList.length === 0) {
    return [
      {
        id: "main",
        name: "Main Agent",
        model: defaultModel,
        isDefault: true,
        workspace: globalWorkspace,
        workspacePath: resolveHome(globalWorkspace),
        routing: buildRoutingForAgent("main", bindings, channelConfigs),
      },
    ];
  }

  return agentsList.map((a) => {
    const id = a.id ?? a.name ?? "unknown";
    const ws = Array.isArray(a.workspace)
      ? a.workspace[0]
      : a.workspace ?? globalWorkspace;
    return {
      id,
      name: a.identity?.name ?? a.name ?? id,
      model: resolveModel(a.model, defaultModel),
      isDefault: a.default === true,
      workspace: ws,
      workspacePath: resolveHome(ws),
      routing: buildRoutingForAgent(id, bindings, channelConfigs),
    };
  });
}

export async function cleanBootstrapFiles(workspacePath: string): Promise<void> {
  for (const file of BOOTSTRAP_FILES) {
    try {
      await fs.unlink(path.join(workspacePath, file));
    } catch {
      continue;
    }
  }
}

export async function copyUserMdFromDefault(targetWorkspacePath: string): Promise<void> {
  const agents = await getAgents();
  if (!agents) return;
  const defaultAgent = agents.find((a) => a.isDefault);
  const sourceAgent = defaultAgent ?? agents[0];
  if (!sourceAgent) return;

  const sourcePath = path.join(sourceAgent.workspacePath, "USER.md");
  const targetPath = path.join(targetWorkspacePath, "USER.md");
  try {
    const content = await fs.readFile(sourcePath, "utf-8");
    await fs.writeFile(targetPath, content, "utf-8");
  } catch {
    return;
  }
}

export async function agentExists(agentId: string): Promise<boolean> {
  const agents = await getAgents();
  return agents?.some((a) => a.id === agentId) ?? false;
}

export async function getAgent(agentId: string): Promise<InternalAgentDetail | null> {
  const config = await readConfig();
  if (!config) return null;
  const agents = await getAgents();
  if (!agents) return null;
  const agent = agents.find((a) => a.id === agentId);
  if (!agent) return null;

  const configAgent = config.agents?.list?.find((a) => a.id === agentId);

  const bootstrapFiles: string[] = [];
  for (const file of BOOTSTRAP_FILES) {
    try {
      await fs.access(path.join(agent.workspacePath, file));
      bootstrapFiles.push(file);
    } catch {
      continue;
    }
  }

  const agentDir = configAgent?.agentDir
    ?? path.join(OPENCLAW_HOME, "agents", agentId, "agent");

  const defaultHeartbeat = config.agents?.defaults?.heartbeat?.every ?? null;
  const hooksAgents = config.hooks?.allowedAgentIds ?? [];
  const a2aEnabled = config.tools?.agentToAgent?.enabled ?? false;
  const a2aAll = config.tools?.agentToAgent?.allow ?? [];
  const a2aWildcard = a2aAll.includes("*");
  const a2aPeers = a2aWildcard
    ? ["*"]
    : a2aEnabled && a2aAll.includes(agentId)
      ? a2aAll.filter((id) => id !== agentId && isVisibleAgent(id))
      : [];

  const agentsList = config.agents?.list ?? [];
  const spawnableBy: Array<{ agentId: string; wildcard: boolean }> = [];
  for (const other of agentsList) {
    const otherId = other.id ?? other.name ?? "unknown";
    if (otherId === agentId || !isVisibleAgent(otherId)) continue;
    const allowed = other.subagents?.allowAgents ?? [];
    if (allowed.includes("*")) {
      spawnableBy.push({ agentId: otherId, wildcard: true });
    } else if (allowed.includes(agentId)) {
      spawnableBy.push({ agentId: otherId, wildcard: false });
    }
  }

  const rawSubagents = configAgent?.subagents?.allowAgents ?? [];
  const filteredSubagents = rawSubagents[0] === "*" ? rawSubagents : rawSubagents.filter(isVisibleAgent);

  const agentConfig: InternalAgentConfig = {
    mentionPatterns: configAgent?.groupChat?.mentionPatterns ?? [],
    allowedSubagents: filteredSubagents,
    agentToAgentPeers: a2aPeers,
    spawnableBy,
    hasHooksAccess: hooksAgents.includes(agentId),
    heartbeat: configAgent?.heartbeat?.every ?? defaultHeartbeat,
  };

  return { ...agent, bootstrapFiles, agentDir, config: agentConfig };
}

function assertWithinWorkspace(workspacePath: string, target: string): void {
  const resolved = path.resolve(workspacePath, target);
  const normalizedWorkspace = path.resolve(workspacePath);
  if (!resolved.startsWith(normalizedWorkspace + path.sep) && resolved !== normalizedWorkspace) {
    throw new Error("Path traversal detected");
  }
}

export async function listFiles(
  workspacePath: string,
  relativePath: string
): Promise<FileEntry[]> {
  assertWithinWorkspace(workspacePath, relativePath);
  const dirPath = path.resolve(workspacePath, relativePath);

  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const results: FileEntry[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;

    const fullPath = path.join(dirPath, entry.name);
    const stat = await fs.stat(fullPath);
    const entryRelative = path.relative(workspacePath, fullPath);

    results.push({
      name: entry.name,
      path: entryRelative,
      type: entry.isDirectory() ? "directory" : "file",
      size: stat.size,
      modified: stat.mtime.toISOString(),
    });
  }

  results.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return results;
}

export async function readFile(
  workspacePath: string,
  relativePath: string
): Promise<FileContent> {
  assertWithinWorkspace(workspacePath, relativePath);
  const filePath = path.resolve(workspacePath, relativePath);

  const stat = await fs.stat(filePath);
  if (stat.isDirectory()) {
    throw new Error("Cannot read a directory as a file");
  }

  const MAX_FILE_SIZE = 1024 * 1024;
  if (stat.size > MAX_FILE_SIZE) {
    throw new Error("File too large (max 1MB)");
  }

  const content = await fs.readFile(filePath, "utf-8");
  const ext = path.extname(filePath).toLowerCase();

  return {
    path: relativePath,
    content,
    size: stat.size,
    language: LANG_MAP[ext] ?? null,
  };
}

export async function writeFile(
  workspacePath: string,
  relativePath: string,
  content: string
): Promise<void> {
  assertWithinWorkspace(workspacePath, relativePath);
  const filePath = path.resolve(workspacePath, relativePath);
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, content, "utf-8");
}

export async function deleteFile(
  workspacePath: string,
  relativePath: string
): Promise<void> {
  assertWithinWorkspace(workspacePath, relativePath);
  const filePath = path.resolve(workspacePath, relativePath);
  const stat = await fs.stat(filePath);
  if (stat.isDirectory()) {
    await fs.rm(filePath, { recursive: true });
  } else {
    await fs.unlink(filePath);
  }
}
