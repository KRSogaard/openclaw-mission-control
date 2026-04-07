import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const BEGIN_MARKER = "<!-- BEGIN:BC_TOOLS -->";
const END_MARKER = "<!-- END:BC_TOOLS -->";
const MC_BEGIN_MARKER = "<!-- BEGIN:MC_TOOLS -->";
const MC_END_MARKER = "<!-- END:MC_TOOLS -->";
const BC_BLOCK_RE = new RegExp(String.raw`${BEGIN_MARKER}[\s\S]*?${END_MARKER}`, "g");
const MC_BLOCK_RE = new RegExp(String.raw`${MC_BEGIN_MARKER}[\s\S]*?${MC_END_MARKER}`, "g");
const BC_URL = process.env.BC_INTERNAL_URL ?? process.env.MC_INTERNAL_URL ?? "http://localhost:3000";
const TOKEN_FILE_PATH = path.join(os.homedir(), ".openclaw", "credentials", "bc-hooks-token");

let _cachedToken: string | null = null;

export async function getHooksToken(): Promise<string> {
  if (_cachedToken) return _cachedToken;

  try {
    const existing = await fs.readFile(TOKEN_FILE_PATH, "utf-8");
    const token = existing.trim();
    if (token) {
      _cachedToken = token;
      return token;
    }
  } catch {
    void 0;
  }

  const token = crypto.randomBytes(32).toString("hex");
  await fs.mkdir(path.dirname(TOKEN_FILE_PATH), { recursive: true });
  await fs.writeFile(TOKEN_FILE_PATH, token, { mode: 0o600 });
  _cachedToken = token;
  return token;
}

function generateSection(): string {
  return `${BEGIN_MARKER}
<!-- BC_TOOLS_VERSION: {{HASH}} -->

---

## Bridge Command Tools

> Auto-managed by Bridge Command. Do not edit this section manually.
> When assigned a task by Bridge Command, use these tools to report status via \`exec\`.

### task.complete

Report that an assigned task is done. Call this when you have finished the work.

\`\`\`bash
curl -s -X POST ${BC_URL}/api/hooks/task \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $(cat ~/.openclaw/credentials/bc-hooks-token)" \\
  -d '{"action":"task.complete","taskId":"<TASK_ID>","result":"<summary of what you did>"}'
\`\`\`

### task.update

Report progress on a running task. Call this periodically for long-running work so Bridge Command knows you're still active.

\`\`\`bash
curl -s -X POST ${BC_URL}/api/hooks/task \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $(cat ~/.openclaw/credentials/bc-hooks-token)" \\
  -d '{"action":"task.update","taskId":"<TASK_ID>","status":"<what you are currently doing>"}'
\`\`\`

### task.fail

Report that a task cannot be completed. Call this when the task is impossible, blocked, or you've been asked to fail it.

\`\`\`bash
curl -s -X POST ${BC_URL}/api/hooks/task \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $(cat ~/.openclaw/credentials/bc-hooks-token)" \\
  -d '{"action":"task.fail","taskId":"<TASK_ID>","reason":"<why the task failed>"}'
\`\`\`

### task.create

Assign a task to another agent. Only use for agents you are allowed to communicate with.

\`\`\`bash
curl -s -X POST ${BC_URL}/api/hooks/task \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $(cat ~/.openclaw/credentials/bc-hooks-token)" \\
  -d '{"action":"task.create","agentId":"<target_agent_id>","title":"<task title>","description":"<detailed instructions>","createdBy":"<your_agent_id>"}'
\`\`\`

### Rules

- Always call \`task.complete\` when you finish a task, or \`task.fail\` if you cannot complete it.
- If you don't report status, Bridge Command will check in and eventually mark the task as failed.
- Use \`task.update\` for tasks that take more than a few minutes — it resets the timeout.
- Tasks arrive via messages prefixed with \`[BRIDGE COMMAND — NEW TASK]\`. The task ID is in the message.

${END_MARKER}`;
}

function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 12);
}

function extractVersion(content: string): string | null {
  const match = content.match(/<!-- BC_TOOLS_VERSION: (\w+) -->/);
  return match?.[1] ?? null;
}

export async function syncToolsToWorkspace(workspacePath: string): Promise<boolean> {
  await getHooksToken();
  const toolsPath = path.join(workspacePath, "TOOLS.md");
  const rawSection = generateSection();
  const sectionHash = hashContent(rawSection);
  const section = rawSection.replace("{{HASH}}", sectionHash);

  let existing = "";
  try {
    existing = await fs.readFile(toolsPath, "utf-8");
  } catch {
    await fs.writeFile(toolsPath, section, "utf-8");
    return true;
  }

  const bcCount = (existing.match(/<!-- BEGIN:BC_TOOLS -->/g) || []).length;
  const mcCount = (existing.match(/<!-- BEGIN:MC_TOOLS -->/g) || []).length;
  const existingHash = extractVersion(existing);
  if (bcCount === 1 && mcCount === 0 && existingHash === sectionHash) return false;

  BC_BLOCK_RE.lastIndex = 0;
  MC_BLOCK_RE.lastIndex = 0;
  let stripped = existing.replace(BC_BLOCK_RE, "").replace(MC_BLOCK_RE, "");
  stripped = stripped.replace(/\n{3,}/g, "\n\n").trimEnd();
  const updated = stripped ? stripped + "\n\n" + section + "\n" : section;

  await fs.writeFile(toolsPath, updated, "utf-8");
  return true;
}
