# OpenClaw Mission Control

A lightweight sidecar dashboard for [OpenClaw](https://github.com/openclaw/openclaw). Visualize your agent hierarchy, browse workspaces, manage permissions, and dispatch tasks — without replacing anything.

## Philosophy

Mission Control is a **decorator, not a replacement**. OpenClaw owns your agents, config, and runtime. Mission Control just gives you a window into it.

**OpenClaw is the source of truth.** Mission Control reads `~/.openclaw/openclaw.json` directly. It doesn't maintain its own copy of your agent definitions, channel bindings, or model assignments. When you change a model through the dashboard, it writes back to `openclaw.json` — the same file the gateway reads. There's no sync to get out of date, no migration to run, no import step.

**Agents created outside Mission Control just appear.** Add an agent via the CLI, edit the config by hand, or let another tool manage it — Mission Control picks it up on the next page load. It doesn't need to know how agents got there.

**The database is optional context, not required state.** Mission Control uses a local SQLite file for things OpenClaw doesn't track: hierarchy ordering, task queues, agent descriptions, audit logs. If you delete it, you lose your drag-and-drop arrangement and task history — but every agent, model, channel, and permission is still in `openclaw.json` exactly where you left it.

**Single process, zero infrastructure.** One `npm run dev` and you're running. No Docker compose, no external database, no backend service to maintain. The SQLite file creates itself on first request.

### Why this approach

Most dashboards want to become the control plane — they introduce their own database, their own agent model, their own workflow engine. You end up with two sources of truth that inevitably drift apart.

Mission Control takes the opposite approach. It's a lens, not a ledger. The benefits:

- **Nothing to migrate.** Point it at your existing OpenClaw instance and it works. Your config doesn't change.
- **Nothing to break.** Remove Mission Control and OpenClaw keeps running exactly as before. It never depended on us.
- **Nothing to sync.** Agent data comes from one place (`openclaw.json`), read at request time. There's no eventual consistency problem because there's no second copy.
- **Safe to experiment.** Try it on a running system. If you don't like it, stop the process. Zero cleanup.

## Features

- **Agent Hierarchy** — Org-chart view with drag-and-drop reordering. Auto-infers parent-child relationships from agent naming conventions.
- **Agent Dashboard** — Per-agent overview with model selection, channel bindings, sub-agent access, agent-to-agent peer management, and mention patterns.
- **Workspace File Browser** — Browse, view, edit, create, and delete files in agent workspaces. URL-synced navigation for browser back/forward.
- **Task System** — Kanban board (To-Do / Running / Done / Failed) for dispatching work to agents via the OpenClaw gateway. Per-agent queues, configurable timeouts, automatic retries, and full audit logs.
- **Tool Sync** — Appends Mission Control tool definitions to each agent's `TOOLS.md` with versioned markers. Agents can report task progress and completion back. Updates automatically when tools change.

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- A running [OpenClaw](https://github.com/openclaw/openclaw) gateway instance
- The OpenClaw gateway token

## Quick Start

```bash
git clone https://github.com/KRSogaard/openclaw-mission-control.git
cd openclaw-mission-control
npm install

cp .env.example .env.local
# Edit .env.local with your gateway URL and token

npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENCLAW_URL` | Yes | — | OpenClaw gateway URL (e.g. `http://localhost:18789`) |
| `OPENCLAW_TOKEN` | Yes | — | Gateway auth token |
| `MC_INTERNAL_URL` | No | `http://localhost:3000` | URL agents use to call back to Mission Control for task reporting |

## Architecture

```
Browser  →  Next.js API routes  →  OpenClaw gateway (WebSocket)
                                →  ~/.openclaw/openclaw.json (read/write)
                                →  Agent workspaces (filesystem)
                                →  data/mission-control.db (SQLite)
```

**API-first.** The browser talks only to the Next.js backend. The OpenClaw gateway URL, token, and filesystem paths never reach the client.

**What lives where:**

| Data | Source of truth | Mission Control's role |
|------|----------------|----------------------|
| Agents, models, channels, bindings | `openclaw.json` | Reads and writes back to it |
| Agent workspace files | Filesystem | Direct read/write |
| Gateway status, available models | OpenClaw gateway (WebSocket) | Queries via `status` and `models.list` RPC |
| Hierarchy ordering, descriptions | SQLite | Owns this (decorative layer) |
| Task queue, audit log, settings | SQLite | Owns this (operational layer) |

### Task System

Tasks dispatch to agents via `chat.send` through the gateway WebSocket. Each agent has its own queue — one task at a time.

1. Operator creates task → queued in SQLite → dispatched via `chat.send`
2. Agent works → calls `task.complete` or `task.update` via exec/curl back to Mission Control
3. On completion → next queued task auto-dispatches
4. On timeout → retry with check-in → fail after max retries

Tool definitions are appended to each agent's `TOOLS.md` between `<!-- BEGIN:MC_TOOLS -->` / `<!-- END:MC_TOOLS -->` markers. A hooks auth token is auto-generated at `~/.openclaw/credentials/mc-hooks-token` on first startup.

## API Reference

All responses use the envelope `{ data: T }` or `{ error: { code, message } }`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/status` | Gateway online/version |
| GET | `/api/models` | Available models from gateway |
| GET | `/api/agents` | List all agents |
| GET | `/api/agents/:id` | Agent detail with config |
| PATCH | `/api/agents/:id` | Update model, sub-agents, or peers |
| GET | `/api/agents/:id/files?path=` | List directory |
| GET | `/api/agents/:id/files/read?path=` | Read file |
| PUT | `/api/agents/:id/files/read?path=` | Create/update file |
| DELETE | `/api/agents/:id/files/read?path=` | Delete file |
| GET | `/api/agents/hierarchy` | Agent tree |
| PUT | `/api/agents/hierarchy` | Reparent/reorder |
| PATCH | `/api/agents/hierarchy` | Update description |
| GET | `/api/agents/:id/tasks` | List tasks |
| POST | `/api/agents/:id/tasks` | Create and dispatch task |
| DELETE | `/api/agents/:id/tasks/:taskId` | Cancel task |
| GET | `/api/agents/:id/tasks/:taskId/events` | Task audit log |
| GET | `/api/agents/:id/task-settings` | Timeout/retry config |
| PATCH | `/api/agents/:id/task-settings` | Update settings |
| POST | `/api/hooks/task` | Agent callback endpoint |

## License

MIT
