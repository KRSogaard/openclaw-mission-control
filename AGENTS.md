<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# OpenClaw Mission Control

Sidecar dashboard for OpenClaw. Next.js 16 + Tailwind + shadcn/ui + SQLite. API-first — browser never talks to OpenClaw directly.

## Structure

```
src/
├── app/
│   ├── api/
│   │   ├── status/                     # GET — gateway online/version via WebSocket RPC
│   │   ├── models/                     # GET — available models from gateway
│   │   ├── hooks/task/                 # POST — agent callback endpoint (task.complete/update/create)
│   │   ├── agents/
│   │   │   ├── route.ts                # GET — agent list (browser-safe, no server paths)
│   │   │   ├── hierarchy/              # GET — agent tree | PUT — reparent | PATCH — description
│   │   │   └── [id]/
│   │   │       ├── route.ts            # GET — agent detail | PATCH — update model/subagents/peers
│   │   │       ├── files/              # GET — list dir
│   │   │       │   └── read/           # GET — read | PUT — write | DELETE — delete file
│   │   │       ├── tasks/              # GET — list | POST — create+dispatch
│   │   │       │   └── [taskId]/       # GET — detail | DELETE — cancel
│   │   │       │       └── events/     # GET — audit log
│   │   │       └── task-settings/      # GET | PATCH — timeout/retry config per agent
│   ├── dashboard/
│   │   ├── page.tsx                    # Default view = hierarchy (org chart, drag-and-drop)
│   │   ├── hierarchy/page.tsx          # Same component (kept in sync with page.tsx)
│   │   ├── agents/page.tsx             # Card grid view
│   │   ├── layout.tsx                  # Dark shell, nav tabs, gateway status indicator
│   │   └── [agentId]/
│   │       ├── layout.tsx              # Agent tabs (Overview | Tasks | Files)
│   │       ├── page.tsx                # Overview — description, channels, permissions, config
│   │       ├── tasks/page.tsx          # Kanban board (To-Do | Running | Done | Failed)
│   │       └── files/page.tsx          # File browser with edit/create/delete
├── lib/
│   ├── openclaw.ts                     # Server-only: reads ~/.openclaw/openclaw.json, filesystem ops
│   ├── openclaw-ws.ts                  # Server-only: WebSocket client (challenge-response auth)
│   ├── api-transforms.ts              # Internal types → browser-safe DTOs (strips paths)
│   ├── types.ts                        # Browser-safe API types ONLY
│   ├── task-dispatcher.ts             # Per-agent task queue, timeout/retry, dispatches via chat.send
│   ├── mc-tools.ts                     # Tool manifest sync — appends to agent TOOLS.md with version markers
│   ├── db/
│   │   ├── schema.ts                  # Drizzle schema (agent_hierarchy, agent_tasks, agent_task_events, agent_task_settings)
│   │   ├── index.ts                   # SQLite singleton, auto-creates tables on first access
│   │   └── seed.ts                    # Auto-sync: adds new agents, prunes removed, syncs tool manifests
│   └── utils.ts                       # shadcn cn() helper
├── components/ui/                     # shadcn components (do not edit directly)
```

## Architecture Rules

**API-first**: All data flows through `/api/*` routes. The browser never sees the OpenClaw URL, token, or filesystem paths.

**Type boundary**: `src/lib/types.ts` = browser-safe DTOs. Internal types (`InternalAgent`, etc.) are defined inline in `openclaw.ts` and never exported. `api-transforms.ts` bridges the two.

**No server paths in responses**: API responses never contain `workspacePath`, `agentDir`, `workspace`, or absolute filesystem paths. File paths are always relative to the agent's workspace root.

**Sidecar pattern**: OpenClaw's `openclaw.json` is the source of truth for agents, models, channels, and bindings. Mission Control reads and writes back to it — no separate agent registry.

## OpenClaw Integration

Gateway: WebSocket at `ws://{host}:{port}/ws` with challenge-response auth.

Connect params that work:
- `client.id`: `"openclaw-control-ui"`
- `client.mode`: `"webchat"`
- `scopes`: `["operator.admin"]`
- `auth`: `{ token: "..." }`
- Origin header MUST use `127.0.0.1` (not `localhost`)

RPC methods used: `status`, `models.list`, `chat.send`

Config file: `~/.openclaw/openclaw.json` — parsed server-side for agent list, workspace paths, routing bindings, tools config.

## Database

SQLite via Drizzle ORM + better-sqlite3 at `data/mission-control.db`. Auto-created on first request. WAL mode.

Tables:
- `agent_hierarchy` — parent-child relationships, descriptions, positions
- `agent_tasks` — task queue (id, agentId, title, description, status, sessionKey, response, retryCount, timestamps)
- `agent_task_events` — audit log (every state transition: created, dispatched, progress, timeout, completed, failed, cancelled)
- `agent_task_settings` — per-agent timeout (default 30min) and max retries (default 3)

On every `GET /api/agents/hierarchy`:
- New agents in OpenClaw config → auto-added (name-prefix inference for sub-agents)
- Removed agents → pruned, orphaned children reparented to root
- Tool manifests synced to each agent's TOOLS.md
- Hooks auth token ensured at `~/.openclaw/credentials/mc-hooks-token`

## Task System

Dispatcher (`task-dispatcher.ts`) manages per-agent queues:
- One running task per agent at a time
- Dispatches via `chat.send` through the WebSocket gateway
- Timeout timer starts on dispatch, resets on `task.update` calls
- On timeout → sends check-in message → retries → fails after max retries
- On complete/fail → auto-dispatches next queued task

Agents report back via `exec` + `curl` to `POST /api/hooks/task`:
- `task.complete` — marks done, includes result summary
- `task.update` — reports progress, resets timeout
- `task.create` — assigns task to another agent

Tool definitions are appended to each agent's `TOOLS.md` between `<!-- BEGIN:MC_TOOLS -->` / `<!-- END:MC_TOOLS -->` markers. Content-hashed for automatic updates.

Auth token auto-generated at `~/.openclaw/credentials/mc-hooks-token` (mode 600). Agents read it at curl time via `$(cat ~/.openclaw/credentials/mc-hooks-token)`.

## Commands

```bash
npm run dev          # Dev server on :3000
npm run build        # Production build (Turbopack)
```

## Anti-Patterns

- Never import from `openclaw.ts`, `openclaw-ws.ts`, `task-dispatcher.ts`, or `mc-tools.ts` in client components
- Never expose `workspacePath` or absolute paths in API responses
- Never suppress types: no `as any`, `@ts-ignore`, `@ts-expect-error`
- `dashboard/page.tsx` and `dashboard/hierarchy/page.tsx` must stay identical (one is the default route)

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

`.env.local` for local dev, `.env.example` as template. `MC_HOOKS_TOKEN` is auto-generated — not configured manually.
