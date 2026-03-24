# OpenClaw Mission Control

Dashboard for managing [OpenClaw](https://github.com/openclaw/openclaw) agent instances. Browse agent hierarchies, manage workspace files, configure models and permissions, and dispatch tasks to agents.

## Features

- **Agent Hierarchy** — Org-chart view of your agents with drag-and-drop reordering
- **Agent Dashboard** — Per-agent overview with model selection, channel bindings, sub-agent access, and agent-to-agent peer management
- **Workspace File Browser** — Browse, view, edit, create, and delete files in agent workspaces
- **Task System** — Kanban board for dispatching tasks to agents via the OpenClaw gateway, with timeout/retry logic and full audit logs
- **Tool Sync** — Automatically writes Mission Control tool definitions to each agent's `TOOLS.md` so agents can report task status

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- A running [OpenClaw](https://github.com/openclaw/openclaw) gateway instance
- The OpenClaw gateway token (from the dashboard URL hash)

## Quick Start

```bash
# Clone
git clone https://github.com/KRSogaard/openclaw-mission-control.git
cd openclaw-mission-control

# Install dependencies
npm install

# Configure
cp .env.example .env.local
# Edit .env.local with your OpenClaw gateway URL and token
```

Edit `.env.local`:

```env
OPENCLAW_URL=http://localhost:18789
OPENCLAW_TOKEN=your-openclaw-gateway-token

# URL that agents use to reach Mission Control (for task callbacks)
MC_INTERNAL_URL=http://localhost:3000
```

```bash
# Start
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENCLAW_URL` | Yes | OpenClaw gateway HTTP URL (e.g. `http://localhost:18789`) |
| `OPENCLAW_TOKEN` | Yes | Gateway auth token |
| `MC_INTERNAL_URL` | No | URL agents use to call back to Mission Control. Default: `http://localhost:3000` |

## Architecture

Mission Control is **API-first**. The browser talks only to the Next.js backend — never directly to OpenClaw.

```
Browser  →  Next.js API routes  →  OpenClaw gateway (WebSocket)
                                →  Filesystem (agent workspaces)
                                →  SQLite (hierarchy, tasks, settings)
```

### OpenClaw Gateway Connection

Connects via WebSocket at `ws://{host}:{port}/ws` with challenge-response authentication. The connection uses `openclaw-control-ui` client mode with `operator.admin` scope.

### Database

SQLite (via Drizzle ORM + better-sqlite3) at `data/mission-control.db`. Auto-created on first request. Tables:

- `agent_hierarchy` — Parent-child relationships and descriptions
- `agent_tasks` — Task queue with status tracking
- `agent_task_events` — Audit log for every task state change
- `agent_task_settings` — Per-agent timeout and retry configuration

### Task System

Tasks are dispatched to agents via `chat.send` through the OpenClaw gateway WebSocket. Each agent has its own queue — one task runs at a time per agent.

**Flow:**
1. Operator creates task → queued in SQLite → dispatched via `chat.send`
2. Agent works → calls `task.update` or `task.complete` via exec/curl to Mission Control's hook endpoint
3. On completion → next queued task auto-dispatches
4. On timeout → retry with check-in message → fail after max retries

**Tool registration:** On startup, Mission Control appends tool definitions to each agent's `TOOLS.md` with versioned markers (`<!-- BEGIN:MC_TOOLS -->` / `<!-- END:MC_TOOLS -->`). A hooks token is auto-generated at `~/.openclaw/credentials/mc-hooks-token`.

## API Reference

All responses use the envelope `{ data: T }` or `{ error: { code, message } }`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/status` | Gateway online/version |
| GET | `/api/models` | Available models from gateway |
| GET | `/api/agents` | List all agents |
| GET | `/api/agents/:id` | Agent detail with config |
| PATCH | `/api/agents/:id` | Update agent model, sub-agents, or peers |
| GET | `/api/agents/:id/files?path=` | List directory |
| GET | `/api/agents/:id/files/read?path=` | Read file |
| PUT | `/api/agents/:id/files/read?path=` | Create/update file |
| DELETE | `/api/agents/:id/files/read?path=` | Delete file |
| GET | `/api/agents/hierarchy` | Agent tree |
| PUT | `/api/agents/hierarchy` | Reparent/reorder agent |
| PATCH | `/api/agents/hierarchy` | Update agent description |
| GET | `/api/agents/:id/tasks` | List tasks |
| POST | `/api/agents/:id/tasks` | Create and dispatch task |
| DELETE | `/api/agents/:id/tasks/:taskId` | Cancel task |
| GET | `/api/agents/:id/tasks/:taskId/events` | Task audit log |
| GET | `/api/agents/:id/task-settings` | Task timeout/retry config |
| PATCH | `/api/agents/:id/task-settings` | Update task settings |
| POST | `/api/hooks/task` | Agent callback (task.complete, task.update, task.create) |

## License

MIT
