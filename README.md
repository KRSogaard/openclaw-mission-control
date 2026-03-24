# OpenClaw Mission Control

A lightweight sidecar dashboard for [OpenClaw](https://github.com/openclaw/openclaw). Manage your agents, dispatch tasks, browse workspaces — without replacing anything.

`npm install` → `npm run dev` → done. No Docker, no external database, no migration.

<!-- Screenshot placeholder: replace with actual screenshot
![Mission Control Dashboard](docs/screenshot.png)
-->

## What it does

**See your agents.** Org-chart view of your entire agent hierarchy. Drag-and-drop to rearrange. Click any agent to see its model, channels, permissions, and workspace files.

**Give agents work.** Kanban task board — create a task, Mission Control sends it to the agent through the OpenClaw gateway. The agent works, reports progress, and marks it done. Tasks queue up one at a time per agent. If an agent goes quiet, Mission Control checks in and retries. Agents can even assign tasks to each other.

**Browse and edit workspaces.** Full file browser for every agent's workspace. View, edit, create, delete files. URL tracks your location so browser back/forward works.

**Configure from one place.** Change models, manage sub-agent access, edit agent-to-agent peers, view channel bindings — all writing back to `openclaw.json` directly. No sync layer.

## Quick Start

```bash
git clone https://github.com/KRSogaard/openclaw-mission-control.git
cd openclaw-mission-control
npm install
cp .env.example .env.local
```

Add your OpenClaw gateway URL and token to `.env.local`:

```env
OPENCLAW_URL=http://localhost:18789
OPENCLAW_TOKEN=your-token
```

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Your agents appear automatically.

## How the task system works

You give an agent a task from the dashboard. Mission Control sends it as a message through the OpenClaw gateway — the same way any conversation reaches an agent.

The agent does the work. When it's done, it calls `task.complete` (a tool that Mission Control appends to each agent's `TOOLS.md`). Mission Control marks the task done and dispatches the next one in the queue.

If the agent goes quiet — no progress update, no completion — Mission Control sends a check-in: *"Are you done with this?"* If there's still no response after a few retries, the task fails. Timeouts and retry counts are configurable per agent.

Agents can also create tasks for other agents. If your orchestrator agent decides a research agent needs to investigate something, it assigns the task through Mission Control. The research agent picks it up from its own queue.

Every state change is logged — created, dispatched, progress updates, retries, completions, failures. Click any task card on the Kanban board to see the full audit trail.

### Task system requirements

For agents to report task status back, they need to be able to run `curl` commands via the `exec` tool. Two things to check in your OpenClaw config:

**1. The `exec` tool must be enabled.** In `~/.openclaw/openclaw.json`, make sure `exec` is in the allowed tools list:

```json
{
  "tools": {
    "allow": ["exec", "read", "write", ...]
  }
}
```

**2. Exec commands must be auto-approved.** By default, OpenClaw prompts for approval on every shell command. For task callbacks to work without manual intervention, set auto-approve in `~/.openclaw/exec-approvals.json`:

```json
{
  "defaults": {
    "policy": "allow",
    "ask": "never"
  }
}
```

To auto-approve only specific agents:

```json
{
  "agents": {
    "your-agent-id": {
      "policy": "allow",
      "ask": "never"
    }
  }
}
```

Restart the OpenClaw gateway after changing exec approvals.

Without this, agents will receive tasks but won't be able to call back to Mission Control — every `curl` will hang waiting for manual approval in the OpenClaw terminal.

## Design philosophy

Mission Control is a **decorator, not a replacement**. OpenClaw owns your agents, config, and runtime. We just give you a window into it.

**OpenClaw is the source of truth.** We read `~/.openclaw/openclaw.json` directly. When you change a model through the dashboard, it writes back to the same file the gateway reads. No sync, no migration, no import.

**Agents created outside Mission Control just appear.** Add an agent via the CLI, edit the config by hand — it shows up on the next page load.

**The database is disposable.** Mission Control uses a local SQLite file for things OpenClaw doesn't track: hierarchy ordering, task queues, descriptions, audit logs. Delete it and you lose your arrangement and task history — but every agent, model, channel, and permission is still in `openclaw.json` exactly where you left it.

### Why this matters

Most dashboards want to become the control plane. They introduce their own database, agent model, and workflow engine. You end up with two sources of truth that drift apart.

Mission Control is a lens, not a ledger:

- **Nothing to migrate.** Point it at an existing OpenClaw instance. Your config doesn't change.
- **Nothing to break.** Remove Mission Control and OpenClaw keeps running. It never depended on us.
- **Nothing to sync.** Agent data is read from `openclaw.json` at request time. No second copy, no consistency problem.
- **Safe to experiment.** Try it on a running system. Don't like it? Stop the process. Zero cleanup.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENCLAW_URL` | Yes | — | OpenClaw gateway URL |
| `OPENCLAW_TOKEN` | Yes | — | Gateway auth token |
| `MC_INTERNAL_URL` | No | `http://localhost:3000` | URL agents use to report task status back |

## Architecture

```
Browser  →  Next.js API routes  →  OpenClaw gateway (WebSocket)
                                →  ~/.openclaw/openclaw.json (read/write)
                                →  Agent workspaces (filesystem)
                                →  data/mission-control.db (SQLite)
```

API-first — the browser never talks to OpenClaw directly. Gateway URL, token, and filesystem paths stay server-side.

| Data | Source of truth | Mission Control's role |
|------|----------------|----------------------|
| Agents, models, channels | `openclaw.json` | Reads and writes back |
| Workspace files | Filesystem | Direct read/write |
| Gateway status, models | OpenClaw gateway | WebSocket RPC |
| Hierarchy, descriptions | SQLite | Owns (decorative) |
| Tasks, audit logs | SQLite | Owns (operational) |

## API

All responses: `{ data: T }` or `{ error: { code, message } }`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/status` | Gateway status |
| GET | `/api/models` | Available models |
| GET | `/api/agents` | List agents |
| GET | `/api/agents/:id` | Agent detail |
| PATCH | `/api/agents/:id` | Update model, sub-agents, peers |
| GET | `/api/agents/:id/files?path=` | List directory |
| GET | `/api/agents/:id/files/read?path=` | Read file |
| PUT | `/api/agents/:id/files/read?path=` | Write file |
| DELETE | `/api/agents/:id/files/read?path=` | Delete file |
| GET | `/api/agents/hierarchy` | Agent tree |
| PUT | `/api/agents/hierarchy` | Reparent/reorder |
| PATCH | `/api/agents/hierarchy` | Update description |
| POST | `/api/agents/:id/tasks` | Create task |
| GET | `/api/agents/:id/tasks` | List tasks |
| DELETE | `/api/agents/:id/tasks/:taskId` | Cancel task |
| GET | `/api/agents/:id/tasks/:taskId/events` | Audit log |
| PATCH | `/api/agents/:id/task-settings` | Timeout/retry config |
| POST | `/api/hooks/task` | Agent callback |

## License

MIT
