import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { syncToolsToWorkspace } from "./bc-tools";

const createdDirs: string[] = [];

beforeAll(() => {
  process.env.BC_INTERNAL_URL = "http://localhost:3000";
});

afterEach(() => {
  while (createdDirs.length > 0) {
    const dir = createdDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

function countOccurrences(content: string, marker: string): number {
  return (content.match(new RegExp(marker.replace(/[<>!-]/g, "\\$&"), "g")) || []).length;
}

function makeMcBlock(): string {
  return `<!-- BEGIN:MC_TOOLS -->
<!-- MC_TOOLS_VERSION: abc123def456 -->

---

## Bridge Command Tools

> Auto-managed by Bridge Command. Do not edit this section manually.

### task.complete

\`\`\`bash
curl -s -X POST http://localhost:3000/api/hooks/task \\
  -H "Authorization: Bearer $(cat ~/.openclaw/credentials/mc-hooks-token)" \\
  -d '{"action":"task.complete","taskId":"<TASK_ID>","result":"done"}'
\`\`\`

<!-- END:MC_TOOLS -->`;
}

function makeBcBlock(version: string): string {
  return `<!-- BEGIN:BC_TOOLS -->
<!-- BC_TOOLS_VERSION: ${version} -->

---

## Bridge Command Tools

> Auto-managed by Bridge Command. Do not edit this section manually.
> When assigned a task by Bridge Command, use these tools to report status via \`exec\`.

### task.complete

Report that an assigned task is done. Call this when you have finished the work.

\`\`\`bash
curl -s -X POST http://localhost:3000/api/hooks/task \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $(cat ~/.openclaw/credentials/bc-hooks-token)" \\
  -d '{"action":"task.complete","taskId":"<TASK_ID>","result":"<summary of what you did>"}'
\`\`\`

### task.update

Report progress on a running task. Call this periodically for long-running work so Bridge Command knows you're still active.

\`\`\`bash
curl -s -X POST http://localhost:3000/api/hooks/task \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $(cat ~/.openclaw/credentials/bc-hooks-token)" \\
  -d '{"action":"task.update","taskId":"<TASK_ID>","status":"<what you are currently doing>"}'
\`\`\`

### task.fail

Report that a task cannot be completed. Call this when the task is impossible, blocked, or you've been asked to fail it.

\`\`\`bash
curl -s -X POST http://localhost:3000/api/hooks/task \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $(cat ~/.openclaw/credentials/bc-hooks-token)" \\
  -d '{"action":"task.fail","taskId":"<TASK_ID>","reason":"<why the task failed>"}'
\`\`\`

### task.create

Assign a task to another agent. Only use for agents you are allowed to communicate with.

\`\`\`bash
curl -s -X POST http://localhost:3000/api/hooks/task \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $(cat ~/.openclaw/credentials/bc-hooks-token)" \\
  -d '{"action":"task.create","agentId":"<target_agent_id>","title":"<task title>","description":"<detailed instructions>","createdBy":"<your_agent_id>"}'
\`\`\`

### Rules

- Always call \`task.complete\` when you finish a task, or \`task.fail\` if you cannot complete it.
- If you don't report status, Bridge Command will check in and eventually mark the task as failed.
- Use \`task.update\` for tasks that take more than a few minutes — it resets the timeout.
- Tasks arrive via messages prefixed with \`[BRIDGE COMMAND — NEW TASK]\`. The task ID is in the message.

<!-- END:BC_TOOLS -->`;
}

function makeStaleBcBlock(): string {
  return makeBcBlock("deadbeef0000");
}

function createWorkspace(initialToolsMd?: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bc-tools-test-"));
  createdDirs.push(dir);
  if (initialToolsMd !== undefined) {
    fs.writeFileSync(path.join(dir, "TOOLS.md"), initialToolsMd, "utf-8");
  }
  return dir;
}

function readToolsFile(workspacePath: string): string {
  return fs.readFileSync(path.join(workspacePath, "TOOLS.md"), "utf-8");
}

describe("syncToolsToWorkspace", () => {
  it("creates file when none exists", async () => {
    const workspace = createWorkspace();

    const result = await syncToolsToWorkspace(workspace);
    const content = readToolsFile(workspace);

    expect(result).toBe(true);
    expect(countOccurrences(content, "<!-- BEGIN:BC_TOOLS -->")).toBe(1);
  });

  it("appends to file with no markers", async () => {
    const workspace = createWorkspace("# My Tools\nsome content");

    const result = await syncToolsToWorkspace(workspace);
    const content = readToolsFile(workspace);

    expect(result).toBe(true);
    expect(content).toContain("# My Tools");
    expect(content).toContain("some content");
    expect(countOccurrences(content, "<!-- BEGIN:BC_TOOLS -->")).toBe(1);
  });

  it("skips when one correct BC block exists", async () => {
    const workspace = createWorkspace();

    const firstResult = await syncToolsToWorkspace(workspace);
    const before = readToolsFile(workspace);
    const secondResult = await syncToolsToWorkspace(workspace);
    const after = readToolsFile(workspace);

    expect(firstResult).toBe(true);
    expect(secondResult).toBe(false);
    expect(after).toBe(before);
  });

  it("replaces stale BC block", async () => {
    const workspace = createWorkspace(makeStaleBcBlock());

    const result = await syncToolsToWorkspace(workspace);
    const content = readToolsFile(workspace);

    expect(result).toBe(true);
    expect(countOccurrences(content, "<!-- BEGIN:BC_TOOLS -->")).toBe(1);
    expect(content).toContain("<!-- BC_TOOLS_VERSION:");
  });

  it("deduplicates two BC blocks", async () => {
    const workspace = createWorkspace();

    const firstSync = await syncToolsToWorkspace(workspace);
    expect(firstSync).toBe(true);

    const current = readToolsFile(workspace);
    const stalePlusCurrent = `${makeStaleBcBlock()}\n\n${current}`;
    fs.writeFileSync(path.join(workspace, "TOOLS.md"), stalePlusCurrent, "utf-8");

    const result = await syncToolsToWorkspace(workspace);
    const content = readToolsFile(workspace);

    expect(result).toBe(true);
    expect(countOccurrences(content, "<!-- BEGIN:BC_TOOLS -->")).toBe(1);
  });

  it("strips MC block and adds BC block", async () => {
    const workspace = createWorkspace(makeMcBlock());

    const result = await syncToolsToWorkspace(workspace);
    const content = readToolsFile(workspace);

    expect(result).toBe(true);
    expect(countOccurrences(content, "<!-- BEGIN:MC_TOOLS -->")).toBe(0);
    expect(countOccurrences(content, "<!-- BEGIN:BC_TOOLS -->")).toBe(1);
  });

  it("strips MC block alongside BC block", async () => {
    const workspace = createWorkspace(`${makeStaleBcBlock()}\n\n${makeMcBlock()}`);

    const result = await syncToolsToWorkspace(workspace);
    const content = readToolsFile(workspace);

    expect(result).toBe(true);
    expect(countOccurrences(content, "<!-- BEGIN:MC_TOOLS -->")).toBe(0);
    expect(countOccurrences(content, "<!-- BEGIN:BC_TOOLS -->")).toBe(1);
  });

  it("handles the mimir case (3 BC + 1 MC)", async () => {
    const workspace = createWorkspace();

    const firstSync = await syncToolsToWorkspace(workspace);
    expect(firstSync).toBe(true);

    const current = readToolsFile(workspace);
    const combined = `${makeStaleBcBlock()}\n\n${makeBcBlock("111111111111")}\n\n${makeBcBlock("222222222222")}\n\n${makeMcBlock()}\n\n${current}`;
    fs.writeFileSync(path.join(workspace, "TOOLS.md"), combined, "utf-8");

    const result = await syncToolsToWorkspace(workspace);
    const content = readToolsFile(workspace);

    expect(result).toBe(true);
    expect(countOccurrences(content, "<!-- BEGIN:MC_TOOLS -->")).toBe(0);
    expect(countOccurrences(content, "<!-- BEGIN:BC_TOOLS -->")).toBe(1);
  });

  it("fast path does not skip when MC block present", async () => {
    const workspace = createWorkspace();

    const firstResult = await syncToolsToWorkspace(workspace);
    expect(firstResult).toBe(true);

    fs.appendFileSync(path.join(workspace, "TOOLS.md"), `\n\n${makeMcBlock()}`, "utf-8");

    const secondResult = await syncToolsToWorkspace(workspace);
    const content = readToolsFile(workspace);

    expect(secondResult).toBe(true);
    expect(countOccurrences(content, "<!-- BEGIN:MC_TOOLS -->")).toBe(0);
  });

  it("preserves user content around blocks", async () => {
    const workspace = createWorkspace(`# Header\n\nSome user content\n\n${makeStaleBcBlock()}\n\nMore user content`);

    const result = await syncToolsToWorkspace(workspace);
    const content = readToolsFile(workspace);

    expect(result).toBe(true);
    expect(content).toContain("# Header");
    expect(content).toContain("Some user content");
    expect(content).toContain("More user content");
    expect(countOccurrences(content, "<!-- BEGIN:BC_TOOLS -->")).toBe(1);
    expect(content).not.toMatch(/\n{3,}/);
  });

  it("idempotency — second run is no-op", async () => {
    const workspace = createWorkspace();

    const firstResult = await syncToolsToWorkspace(workspace);
    const afterFirst = readToolsFile(workspace);
    const secondResult = await syncToolsToWorkspace(workspace);
    const afterSecond = readToolsFile(workspace);

    expect(firstResult).toBe(true);
    expect(secondResult).toBe(false);
    expect(afterSecond).toBe(afterFirst);
  });
});
