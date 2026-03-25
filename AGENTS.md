<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Bridge Command

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
│   │   │       │   └── [taskId]/       # GET — detail | POST — retry/complete/check-in/cancel | DELETE — hard delete
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
│   │   ├── layout.tsx                  # Sidebar nav, gateway status, theme toggle
│   │   └── [agentId]/
│   │       ├── layout.tsx              # Agent tabs (Overview | Tasks | Files | Settings)
│   │       ├── page.tsx                # Overview — description, channels, permissions, config, model selector
│   │       ├── tasks/page.tsx          # Kanban board (To-Do | Running | Done | Failed | Cancelled)
│   │       │   └── [taskId]/page.tsx   # Task detail — Captain's Log, conversation, retry/complete/check-in/delete
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
│   ├── format.ts                       # Shared date/time/byte formatting (formatDateTime, formatTimestamp, formatBytes, etc.)
│   ├── constants.ts                    # Shared constants (TASK_STATUS_BADGE, TASK_STATUS_LABEL, EVENT_DOT)
│   ├── db/
│   │   ├── schema.ts                  # Drizzle schema (agent_hierarchy, agent_tasks, agent_task_events, agent_task_settings, global_settings)
│   │   ├── index.ts                   # SQLite singleton, auto-creates tables on first access, versioned migrations
│   │   └── seed.ts                    # Auto-sync: adds new agents, prunes removed, syncs tool manifests
│   └── utils.ts                       # shadcn cn() helper, toStardate(), getAgentColor()
├── components/
│   ├── task-card.tsx                  # Shared task card (used by both kanban boards)
│   ├── task-detail-panel.tsx          # Shared right sidebar (task detail, actions, Captain's Log)
│   ├── confirm-dialog.tsx             # useConfirmDialog + usePromptDialog hooks (modal replacements)
│   ├── icons.tsx                      # Shared SVG icons (IconX, IconPlus, IconGear, IconBoard)
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

**Sidecar pattern**: OpenClaw's `openclaw.json` is the source of truth for agents, models, channels, and bindings. Bridge Command reads and writes back to it — no separate agent registry.

## React & Component Rules

**Shared components first**: Before creating inline components, check `src/components/` for existing shared ones. Common UI elements must be extracted — no duplicate implementations across pages.

**Shared components**:
- `TaskCard` — used by both global and per-agent task boards. Pass `agentName` to show agent link (global), omit for single-agent view.
- `TaskDetailPanel` — right sidebar for task detail, actions, and Captain's Log. Used by both task boards. Pass `agentName` for global view.
- `useConfirmDialog` / `usePromptDialog` — modal dialog hooks. Use these instead of `window.confirm` / `window.prompt` everywhere.
- `IconX`, `IconPlus`, `IconGear`, `IconBoard` from `icons.tsx` — use these instead of inline SVGs.

**Shared utilities**:
- `src/lib/format.ts` — all date/time/byte formatting. Never define `formatTime`, `fmtDate`, `formatBytes`, etc. inline — import from here.
- `src/lib/constants.ts` — `TASK_STATUS_BADGE`, `TASK_STATUS_LABEL`, `EVENT_DOT`. Never redefine status badge classes inline.
- `src/lib/utils.ts` — `getAgentColor(agentId)` returns deterministic color for any agent. Use consistently across all views.

**No `window.confirm` / `window.prompt` / `window.alert`**: Always use `useConfirmDialog` or `usePromptDialog` from `src/components/confirm-dialog.tsx`. These render proper modal dialogs via shadcn AlertDialog.

**React hooks**:
- `useCallback` on functions passed as props to child components or to `DndContext`, `setInterval`, event listeners.
- `useMemo` for expensive computed values derived from state (e.g., grouped task maps, filtered lists).
- Polling effects: split initial fetch and polling into separate `useEffect` calls. Never put `tasks.length` or similar changing values in polling deps — use a ref if you need to check state inside the effect.
- Stale closures: when a `useEffect` needs to compare against current state without re-triggering, use a ref (`currentPathRef.current = currentPath`) and include only stable callbacks in the dependency array.
- Never exceed 5+ `useState` calls without considering `useReducer` for related state groups.

**Per-agent colors**: Every agent gets a deterministic color via `getAgentColor(agentId)` from `src/lib/utils.ts`. Apply consistently: hierarchy cards (left accent bar), agent list (colored dot), agent detail (header accent line + dot), task cards (left accent bar), global tasks (filter dots).

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

SQLite via Drizzle ORM + better-sqlite3 at `data/bridge-command.db`. Auto-created on first request. WAL mode. Versioned migrations (currently V3).

Tables:
- `agent_hierarchy` — parent-child relationships, descriptions, positions
- `agent_tasks` — task queue (id, agentId, title, description, status, sessionKey, response, retryCount, lastContactAt, timestamps)
- `agent_task_events` — audit log (created, dispatched, progress, timeout_retry, completed, failed, cancelled, resumed, retried, check_in, dispatch_retry)
- `agent_task_settings` — per-agent overrides for timeout, max retries, max concurrent (nullable — falls back to global)
- `global_settings` — key-value store for global defaults (task_timeout_minutes, task_max_retries, task_max_concurrent)

Indexes:
- `idx_tasks_agent_status` — composite on (agent_id, status) for per-agent queries
- `idx_tasks_status` — standalone on (status) for the timeout loop
- `idx_task_events_task` — composite on (task_id, timestamp) for event ordering

On every `GET /api/agents/hierarchy`:
- New agents in OpenClaw config → auto-added (name-prefix inference for sub-agents)
- Removed agents → pruned, orphaned children reparented to root
- Tool manifests synced to each agent's TOOLS.md
- Hooks auth token ensured at `~/.openclaw/credentials/mc-hooks-token`

## Task System

### State Machine

Valid transitions — every write enforces `WHERE status IN (expected_states)`:

```
queued    → running (dispatch), cancelled (operator), completed (operator)
running   → completed (agent/operator), failed (agent/timeout), cancelled (operator)
completed → queued (retry)
failed    → queued (retry)
cancelled → queued (retry)
```

All state mutations use compare-and-swap (CAS): `UPDATE ... WHERE status = <expected>`, check `result.changes`, skip side effects if 0. This prevents races between the timeout loop, webhook callbacks, and operator actions.

### Dispatcher

`task-dispatcher.ts` manages per-agent queues:
- Configurable concurrent tasks per agent (default 1, set via global or per-agent settings)
- Concurrency checked against DB (survives server restarts)
- `dispatchTask` claims with CAS (`WHERE status='queued'`) before sending WS message
- On WS send failure → reverts to `queued` (transient errors don't permanently fail tasks)
- On complete/fail/cancel → auto-dispatches next queued task
- `lastContactAt` tracks agent communication (dispatch, check-in, task.update) — NOT updated by UI changes

### Timeout Loop

Background loop runs every 60s via recursive `setTimeout` (not `setInterval` — prevents overlap):
- `dispatchAllQueued()` — finds agents with queued tasks, calls `dispatchNext` for each
- `checkTimeouts()` — scans running tasks, compares `lastContactAt + timeoutMs` against now
- Three-way CAS guard on retry: `WHERE id=? AND retryCount=? AND lastContactAt < cutoff`
- After max retries → marks failed, dispatches next

### Agent Callbacks

Agents report back via `exec` + `curl` to `POST /api/hooks/task`:
- `task.complete` — marks done (only from queued/running), includes result summary
- `task.fail` — marks failed (only from queued/running) with reason
- `task.update` — reports progress, resets `lastContactAt` (only from running)
- `task.create` — assigns task to another agent

Callbacks on terminal-state tasks are silently ignored (idempotent).

Tool definitions are appended to each agent's `TOOLS.md` between `<!-- BEGIN:MC_TOOLS -->` / `<!-- END:MC_TOOLS -->` markers. Content-hashed for automatic updates.

Auth token auto-generated at `~/.openclaw/credentials/mc-hooks-token` (mode 600). Agents read it at curl time via `$(cat ~/.openclaw/credentials/mc-hooks-token)`.

### Background Loops

Two independent non-overlapping loops, both using recursive `setTimeout` + running guards:
- **Sync loop** (10 min) — syncs agents from OpenClaw config, prunes removed, syncs TOOLS.md
- **Task loop** (60s) — dispatches queued tasks, checks timeouts

Both started lazily on first `GET /api/agents/hierarchy`.

## Commands

```bash
npm run dev          # Dev server on :3000
npm run build        # Production build (Turbopack)
```

## Anti-Patterns

### General
- Never import from `openclaw.ts`, `openclaw-ws.ts`, `task-dispatcher.ts`, `mc-tools.ts`, or `doctor.ts` in client components
- Never expose `workspacePath` or absolute paths in API responses
- Never suppress types: no `as any`, `@ts-ignore`, `@ts-expect-error`
- `dashboard/page.tsx` and `dashboard/hierarchy/page.tsx` must stay identical (always `cp` after edits)

### Frontend
- Never use `window.confirm`, `window.prompt`, or `window.alert` — use `useConfirmDialog` / `usePromptDialog`
- Never define date/time/byte formatters inline — import from `src/lib/format.ts`
- Never redefine `STATUS_BADGE`, `STATUS_LABEL`, or `EVENT_DOT` inline — import from `src/lib/constants.ts`
- Never define inline SVG icon components — add to `src/components/icons.tsx` or use lucide-react
- Never duplicate component logic across pages — extract to `src/components/`
- Never put changing array lengths (e.g., `tasks.length`) in polling `useEffect` dependency arrays
- Never pass un-memoized callbacks as props to child components that accept them

### Backend
- Never mutate task status without a CAS guard (`WHERE status IN (...)` + check `result.changes`)
- Never use `setInterval` for background loops — use recursive `setTimeout` with a running guard
- Never permanently fail a task on transient errors (WS disconnect) — revert to queued
- Task concurrency must be checked against the DB, not in-memory state
- `lastContactAt` must only be set on actual agent communication — never on UI/metadata changes

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
