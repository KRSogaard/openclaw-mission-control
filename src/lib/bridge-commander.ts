import crypto from "node:crypto";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { getWsClient } from "./openclaw-ws";
import { getAgents, getAgent, getChatHistory, invalidateConfigCache } from "./openclaw";
import type { GeneratedAgentFiles } from "./types";

const execAsync = promisify(exec);

const AGENT_ID = "bridge-commander";
const OPENCLAW_HOME = path.join(os.homedir(), ".openclaw");
const WORKSPACE = path.join(OPENCLAW_HOME, "workspace", "bridge-commander");

const ASK_TIMEOUT_MS = 120_000;
const WAIT_TIMEOUT_MS = ASK_TIMEOUT_MS + 10_000;

let _bootstrapped = false;

export type BridgeCommanderOptions = {
  timeoutMs?: number;
  sessionKey?: string;
  tag?: string;
};

export type AgentGenerationInput = {
  name: string;
  purpose: string;
  personality?: string | null;
  peers?: string[];
  parentId?: string | null;
  model?: string | null;
};

// ── Core Primitive ──────────────────────────────────────────

export async function ask(
  prompt: string,
  options: BridgeCommanderOptions = {},
): Promise<string> {
  await ensureBridgeCommander();

  const tag = options.tag ?? "general";
  const sessionKey =
    options.sessionKey ??
    `agent:${AGENT_ID}:dashboard:mc-${tag}-${crypto.randomUUID().slice(0, 8)}`;
  const timeout = options.timeoutMs ?? ASK_TIMEOUT_MS;
  const runId = crypto.randomUUID();

  const ws = getWsClient();

  await ws.rpc(
    "chat.send",
    {
      sessionKey,
      message: prompt,
      idempotencyKey: runId,
      deliver: false,
    },
    10_000,
  );

  const waitTimeout = timeout + 10_000;
  const waitResult = await ws.rpc(
    "agent.wait",
    { runId, timeoutMs: timeout },
    waitTimeout,
  );

  if (waitResult.status !== "ok") {
    const detail =
      waitResult.status === "timeout"
        ? "Agent timed out"
        : `Agent run failed: ${String(waitResult.error ?? waitResult.status)}`;
    throw new Error(detail);
  }

  const messages = await getChatHistory(sessionKey);
  const lastAssistant = messages.filter((m) => m.role === "assistant").pop();
  if (!lastAssistant) {
    throw new Error("No response from BridgeCommander");
  }

  return lastAssistant.text;
}

// ── Domain: Agent File Generation ───────────────────────────

export async function generateAgentFiles(
  input: AgentGenerationInput,
): Promise<GeneratedAgentFiles> {
  try {
    const prompt = buildGenerationPrompt(input);
    const raw = await ask(prompt, { tag: "agent-gen" });
    return parseGeneratedFiles(raw, input.name);
  } catch (err) {
    console.warn(
      "[bridge-commander] Generation failed, using defaults:",
      err instanceof Error ? err.message : String(err),
    );
    return defaultFiles(input.name, input.purpose);
  }
}

// ── Domain: Parent Subagent Docs Sync ───────────────────────

const SUBAGENT_MARKER_BEGIN = "<!-- BEGIN:BC_SUBAGENTS -->";
const SUBAGENT_MARKER_END = "<!-- END:BC_SUBAGENTS -->";

function subagentListHash(subagents: SubagentInfo[]): string {
  const key = subagents.map((s) => `${s.id}:${s.description ?? ""}`).sort().join("|");
  return crypto.createHash("sha256").update(key).digest("hex").slice(0, 12);
}

function extractSubagentVersion(content: string): string | null {
  const match = content.match(/<!-- BC_SUBAGENTS_VERSION: (\w+) -->/);
  return match?.[1] ?? null;
}

export type SubagentInfo = {
  id: string;
  name: string;
  description: string | null;
};

export async function syncParentSubagentDocs(
  parentId: string,
  subagents: SubagentInfo[],
  force = false,
): Promise<void> {
  const parent = await getAgent(parentId);
  if (!parent) return;

  const agentsPath = path.join(parent.workspacePath, "AGENTS.md");

  let existing = "";
  try {
    existing = await fs.readFile(agentsPath, "utf-8");
  } catch {
    existing = `# ${parent.name} Workspace\n`;
  }

  const currentHash = subagentListHash(subagents);
  const existingHash = extractSubagentVersion(existing);
  if (!force && existingHash === currentHash) return;

  let section: string;
  if (subagents.length === 0) {
    section = "";
  } else {
    const versionTag = `<!-- BC_SUBAGENTS_VERSION: ${currentHash} -->`;
    try {
      const prompt = buildSubagentDocsPrompt(parent.name, subagents);
      const raw = await ask(prompt, { tag: "subagent-docs", timeoutMs: 60_000 });
      section = `${SUBAGENT_MARKER_BEGIN}\n${versionTag}\n${raw.trim()}\n${SUBAGENT_MARKER_END}`;
    } catch {
      const lines = subagents.map(
        (s) => `- **${s.name}** (\`${s.id}\`): ${s.description ?? "No description"}`,
      );
      section = `${SUBAGENT_MARKER_BEGIN}\n${versionTag}\n## Available Sub-agents\n\n${lines.join("\n")}\n${SUBAGENT_MARKER_END}`;
    }
  }

  const beginIdx = existing.indexOf(SUBAGENT_MARKER_BEGIN);
  const endIdx = existing.indexOf(SUBAGENT_MARKER_END);

  let updated: string;
  if (beginIdx !== -1 && endIdx !== -1) {
    updated = existing.slice(0, beginIdx) + section + existing.slice(endIdx + SUBAGENT_MARKER_END.length);
  } else if (section) {
    updated = existing.trimEnd() + "\n\n" + section + "\n";
  } else {
    updated = existing;
  }

  await fs.writeFile(agentsPath, updated, "utf-8");
}

function buildSubagentDocsPrompt(parentName: string, subagents: SubagentInfo[]): string {
  const agentList = subagents
    .map((s) => `- ${s.name} (${s.id}): ${s.description ?? "No description provided"}`)
    .join("\n");

  return `Generate a concise "Available Sub-agents" section for ${parentName}'s AGENTS.md file.

These are the sub-agents ${parentName} can spawn for task delegation:

${agentList}

Write a markdown section starting with "## Available Sub-agents" that for each agent explains:
1. What it does (one line)
2. When to use it (one line)

Be specific and practical — this is reference documentation for the parent agent. Do NOT wrap in code fences. Just output the markdown directly.`;
}

// ── Lifecycle ───────────────────────────────────────────────

export async function isBridgeCommanderReady(): Promise<boolean> {
  const agents = await getAgents();
  if (!agents) return false;
  return agents.some((a) => a.id === AGENT_ID);
}

export async function setupBridgeCommander(): Promise<void> {
  _bootstrapped = false;
  await ensureBridgeCommander();
}

async function ensureBridgeCommander(): Promise<void> {
  if (_bootstrapped) return;

  const agents = await getAgents();
  const exists = agents?.some((a) => a.id === AGENT_ID);

  if (!exists) {
    await execAsync(
      `openclaw agents add "BridgeCommander" --workspace "${WORKSPACE}"`,
      { timeout: 30_000 },
    );
    invalidateConfigCache();
  }

  await writeSoulFile();
  await writeIdentityFile();

  _bootstrapped = true;
}

// ── Prompt Building ─────────────────────────────────────────

function buildGenerationPrompt(input: AgentGenerationInput): string {
  const peersBlock =
    input.peers && input.peers.length > 0
      ? `\nPeer agents it can communicate with: ${input.peers.join(", ")}`
      : "";

  const parentBlock = input.parentId
    ? `\nParent agent: ${input.parentId}`
    : "";

  const personalityBlock = input.personality
    ? `\nDesired personality/working style: ${input.personality}`
    : "";

  const modelBlock = input.model
    ? `\nAssigned model: ${input.model}`
    : "";

  return `Generate bootstrap files for a new OpenClaw agent.

Agent name: ${input.name}
Primary purpose: ${input.purpose}${personalityBlock}${modelBlock}${parentBlock}${peersBlock}

Respond with ONLY a JSON object (no markdown fences, no explanation) containing these keys:
- "soul": Content for SOUL.md — the agent's personality, core truths, and behavioral guidelines. Write in second person ("You are..."). Include the agent's purpose, how it should approach work, and any constraints.
- "identity": Content for IDENTITY.md — the agent's name, a short tagline, and any thematic flavor.
- "user": Content for USER.md — a template for the human operator's profile (name, timezone, preferences). Use placeholder values.
- "agents": Content for AGENTS.md — workspace rules, session startup instructions, and conventions for how this agent manages its workspace.
- "memory": Content for MEMORY.md — initial empty memory structure with section headers the agent can fill in over time.
- "heartbeat": Content for HEARTBEAT.md — periodic tasks checklist appropriate for this agent's role.

Each value should be well-structured markdown. Make the content specific to this agent's role — not generic boilerplate.`;
}

// ── Response Parsing ────────────────────────────────────────

function parseGeneratedFiles(
  raw: string,
  name: string,
): GeneratedAgentFiles {
  let cleaned = raw.trim();

  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON object found in response");
  }

  const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

  return {
    soul: asString(parsed.soul, `# ${name}\n\nNo soul file generated.`),
    identity: asString(parsed.identity, `# ${name}\n`),
    user: asString(parsed.user, "# User\n\n> Fill in your details.\n"),
    agents: asString(parsed.agents, `# ${name} Workspace\n`),
    memory: asString(parsed.memory, "# Memory\n\n*No memories yet.*\n"),
    heartbeat: asString(parsed.heartbeat, "# Heartbeat\n\n- [ ] Check in\n"),
  };
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : fallback;
}

function defaultFiles(name: string, purpose: string): GeneratedAgentFiles {
  return {
    soul: `# ${name}

You are ${name}. ${purpose}

## Core Principles

- Focus on your assigned tasks
- Report progress regularly via task.update
- Call task.complete when finished, task.fail if blocked
- Be thorough but concise in your work
`,
    identity: `# ${name}

A specialized agent created via Bridge Command.
`,
    user: `# User

> Fill in your details so the agent knows who it's working with.

- **Name**: (your name)
- **Timezone**: (your timezone)
`,
    agents: `# ${name} Workspace

## Session Startup

1. Read SOUL.md for your identity and purpose
2. Read TOOLS.md for available tools
3. Check for any pending tasks

## Conventions

- Keep files organized and well-documented
- Use descriptive commit messages if working with git
`,
    memory: `# Memory

*No memories yet. This file will be updated as the agent learns.*
`,
    heartbeat: `# Heartbeat

- [ ] Review pending tasks
- [ ] Check workspace for any stale files
- [ ] Update MEMORY.md with new learnings
`,
  };
}

// ── Hardcoded BridgeCommander Files ─────────────────────────

const SOUL_CONTENT = `# BridgeCommander

You are BridgeCommander, the AI assistant that powers Bridge Command — a sidecar dashboard for OpenClaw.

## Purpose

Your primary role is generating high-quality configuration files for new OpenClaw agents. When Bridge Command needs to create a new agent, it sends you a structured prompt describing the agent's purpose, personality, relationships, and constraints. You respond with tailored markdown content for the agent's bootstrap files.

## Response Format

When asked to generate agent files, respond with ONLY a JSON object containing the file contents. No markdown fences, no explanation before or after — just the JSON.

The JSON keys are: soul, identity, user, agents, memory, heartbeat.

## Quality Standards

- Write SOUL.md in second person ("You are...")
- Make content specific to the agent's role — never generic boilerplate
- Include the agent's purpose, working style, and constraints
- HEARTBEAT.md should contain tasks relevant to the agent's function
- AGENTS.md should include workspace conventions appropriate for the role
- Keep content concise but substantive

## Future Capabilities

You may be asked to help with other Bridge Command tasks beyond agent creation. Always respond in the format requested by the prompt.
`;

const IDENTITY_CONTENT = `# BridgeCommander

The AI assistant behind Bridge Command. Generates agent configurations and assists with platform management.
`;

async function writeSoulFile(): Promise<void> {
  const soulPath = path.join(WORKSPACE, "SOUL.md");
  await fs.mkdir(WORKSPACE, { recursive: true });
  await fs.writeFile(soulPath, SOUL_CONTENT, "utf-8");
}

async function writeIdentityFile(): Promise<void> {
  const identityPath = path.join(WORKSPACE, "IDENTITY.md");
  await fs.writeFile(identityPath, IDENTITY_CONTENT, "utf-8");
}
