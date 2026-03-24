<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# OpenClaw Control Center

Sidecar dashboard for OpenClaw. Next.js 16 + Tailwind + shadcn/ui + SQLite. API-first — browser never talks to OpenClaw directly.

## Structure

```
src/
├── app/
│   ├── api/
│   │   ├── status/                     # GET — gateway online/version via WebSocket RPC
│   │   ├── models/                     # GET — available models from gateway
│   │   ├── settings/                   # GET | PATCH — global task settings (timeout/retries/concurrency)
│   │   ├── tasks/                      # GET — all tasks across all agents
│   │   ├── server/                     # GET — live server stats (CPU, memory, disk)
│   │   ├── doctor/                     # GET — diagnostics | POST — fix issues
│   │   ├── gateway/restart/            # POST — restart OpenClaw gateway
│   │   ├── hooks/task/                 # POST — agent callback (task.complete/fail/update/create)
│   │   ├── agents/
│   │   │   ├── route.ts                # GET — agent list (browser-safe, no server paths)
│   │   │   ├── hierarchy/              # GET — agent tree | PUT — reparent | PATCH — description
│   │   │   └── [id]/
│   │   │       ├── route.ts            # GET — agent detail | PATCH — update model/subagents/peers
│   │   │       ├── files/              # GET — list dir
│   │   │       │   ├── read/           # GET — read | PUT — write | DELETE — delete file
│   │   │       │   └── raw/            # GET — serve binary files (images) with correct Content-Type
│   │   │       ├── tasks/              # GET — list | POST — create+dispatch
│   │   │       │   └── [taskId]/       # GET — detail | POST — retry/complete/check-in | DELETE — cancel
│   │   │       │       ├── events/     # GET — audit log
│   │   │       │       └── chat/       # GET — conversation history from OpenClaw gateway session
│   │   │       └── task-settings/      # GET | PATCH — per-agent timeout/retry/concurrency overrides
│   ├── dashboard/
│   │   ├── page.tsx                    # Default view = hierarchy (org chart, drag-and-drop)
│   │   ├── hierarchy/page.tsx          # Same component (kept in sync with page.tsx)
│   │   ├── agents/page.tsx             # Agent list view (detail rows)
│   │   ├── tasks/page.tsx              # Global task board — all agents, color-coded, filterable
│   │   ├── server/page.tsx             # Live server stats (CPU, memory, disk, uptime)
│   │   ├── settings/page.tsx           # Global task settings (timeout, retries, concurrency)
│   │   ├── doctor/page.tsx             # System diagnostics with fix buttons
│   │   ├── layout.tsx                  # Sidebar nav, gateway status, theme toggle, restart button
│   │   └── [agentId]/
│   │       ├── layout.tsx              # Agent tabs (Overview | Tasks | Files | Settings)
│   │       ├── page.tsx                # Overview — description, channels, permissions, config, model selector
│   │       ├── tasks/page.tsx          # Kanban board (To-Do | Running | Done | Failed)
│   │       │   └── [taskId]/page.tsx   # Task detail — audit log, conversation, retry/complete/check-in
│   │       ├── files/page.tsx          # File browser with CodeMirror editor, image preview
│   │       └── settings/page.tsx       # Per-agent task setting overrides
├── lib/
│   ├── openclaw.ts                     # Server-only: reads ~/.openclaw/openclaw.json, filesystem ops, chat history
│   ├── openclaw-ws.ts                  # Server-only: WebSocket client (challenge-response auth, cli mode)
│   ├── api-transforms.ts              # Internal types → browser-safe DTOs (strips paths)
│   ├── types.ts                        # Browser-safe API types ONLY
│   ├── task-dispatcher.ts             # Per-agent task queue, timeout/retry, dispatches via chat.send
│   ├── mc-tools.ts                     # Tool manifest sync — appends to agent TOOLS.md with version markers
│   ├── doctor.ts                       # System diagnostics — checks gateway, hooks, exec approvals, tools sync
│   ├── db/
│   │   ├── schema.ts                  # Drizzle schema (agent_hierarchy, agent_tasks, agent_task_events, agent_task_settings, global_settings)
│   │   ├── index.ts                   # SQLite singleton, auto-creates tables on first access
│   │   └── seed.ts                    # Auto-sync: adds new agents, prunes removed, syncs tool manifests, recovers orphaned tasks
│   └── utils.ts                       # shadcn cn() helper
├── components/
│   ├── agents-tabs.tsx                # Shared Hierarchy | List sub-tabs for agents pages
│   ├── code-editor.tsx                # CodeMirror 6 wrapper — read-only and edit modes, dark/light themes
│   ├── theme-provider.tsx             # next-themes provider
│   ├── theme-toggle.tsx               # Light/dark/system toggle
│   └── ui/                            # shadcn components (do not edit directly)
```

## Architecture Rules

**API-first**: All data flows through `/api/*` routes. The browser never sees the OpenClaw URL, token, or filesystem paths.

**Type boundary**: `src/lib/types.ts` = browser-safe DTOs. Internal types (`InternalAgent`, etc.) are defined inline in `openclaw.ts` and never exported. `api-transforms.ts` bridges the two.

**No server paths in responses**: API responses never contain `workspacePath`, `agentDir`, `workspace`, or absolute filesystem paths. File paths are always relative to the agent's workspace root. Exception: `workspaceLabel` shows the tilde-based config path (e.g. `~/.openclaw/workspace/mimir`).

**Sidecar pattern**: OpenClaw's `openclaw.json` is the source of truth for agents, models, channels, and bindings. Control Center reads and writes back to it — no separate agent registry.

## OpenClaw Integration

Gateway: WebSocket at `ws://{host}:{port}/ws` with challenge-response auth.

Connect params that work:
- `client.id`: `"openclaw-control-ui"`
- `client.mode`: `"cli"` (NOT `"webchat"` — webchat blocks exec, which agents need for task callbacks)
- `scopes`: `["operator.admin"]`
- `auth`: `{ token: "..." }`
- Origin header MUST use `127.0.0.1` (not `localhost`)

RPC methods used: `status`, `models.list`, `chat.send`, `chat.history`

Config file: `~/.openclaw/openclaw.json` — parsed server-side for agent list, workspace paths, routing bindings, tools config, channel settings, hooks config.

## Database

SQLite via Drizzle ORM + better-sqlite3 at `data/control-center.db`. Auto-created on first request. WAL mode.

Tables:
- `agent_hierarchy` — parent-child relationships, descriptions, positions
- `agent_tasks` — task queue (id, agentId, title, description, status, sessionKey, response, retryCount, timestamps)
- `agent_task_events` — audit log (created, dispatched, progress, timeout_retry, completed, failed, cancelled, resumed, retried, check_in)
- `agent_task_settings` — per-agent overrides for timeout, max retries, max concurrent (nullable — falls back to global)
- `global_settings` — key-value store for global defaults (task_timeout_minutes, task_max_retries, task_max_concurrent)

On every `GET /api/agents/hierarchy`:
- New agents in OpenClaw config → auto-added (name-prefix inference for sub-agents)
- Removed agents → pruned, orphaned children reparented to root
- Tool manifests synced to each agent's TOOLS.md
- Hooks auth token ensured at `~/.openclaw/credentials/mc-hooks-token`
- Orphaned running tasks recovered (check-in on existing session, not re-queued)

## Task System

Dispatcher (`task-dispatcher.ts`) manages per-agent queues:
- Configurable concurrent tasks per agent (default 1, set via global or per-agent settings)
- Concurrency checked against DB (survives server restarts)
- Dispatches via `chat.send` through the WebSocket gateway
- Timeout timer starts on dispatch, resets on `task.update` calls
- On timeout → sends check-in on same session → retries → fails after max retries
- On complete/fail → auto-dispatches next queued task
- On server restart → recovers orphaned running tasks by checking in on existing sessions (preserves agent context)

Agents report back via `exec` + `curl` to `POST /api/hooks/task`:
- `task.complete` — marks done, includes result summary
- `task.fail` — marks failed with reason
- `task.update` — reports progress, resets timeout
- `task.create` — assigns task to another agent (respects a2a peer permissions)

Tool definitions are appended to each agent's `TOOLS.md` between `<!-- BEGIN:MC_TOOLS -->` / `<!-- END:MC_TOOLS -->` markers. Content-hashed for automatic updates.

Auth token auto-generated at `~/.openclaw/credentials/mc-hooks-token` (mode 600). Agents read it at curl time via `$(cat ~/.openclaw/credentials/mc-hooks-token)`.

## Commands

```bash
npm run dev          # Dev server on :3000
npm run build        # Production build (Turbopack)
```

## Anti-Patterns

- Never import from `openclaw.ts`, `openclaw-ws.ts`, `task-dispatcher.ts`, `mc-tools.ts`, or `doctor.ts` in client components
- Never expose `workspacePath` or absolute paths in API responses
- Never suppress types: no `as any`, `@ts-ignore`, `@ts-expect-error`
- `dashboard/page.tsx` and `dashboard/hierarchy/page.tsx` must stay identical (one is the default route)
- Task concurrency must be checked against the DB, not in-memory state

## Next.js 16 Gotchas

- Route handler `params` is a Promise — must `await params` in API routes
- Client components use `use(params)` from React, not `await`
- `ws` and `better-sqlite3` must be in `serverExternalPackages` (next.config.ts)
- Turbopack warns about filesystem ops in API routes — expected, safe to ignore

## Environment

```
OPENCLAW_URL=http://localhost:18789    # Gateway URL (server-side only)
OPENCLAW_TOKEN=...                     # Gateway auth token (server-side only)
MC_INTERNAL_URL=http://localhost:3000  # URL agents curl to report task status (optional)
```

`.env.local` for local dev, `.env.example` as template. `MC_HOOKS_TOKEN` is auto-generated at `~/.openclaw/credentials/mc-hooks-token` — not configured manually.
