<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Revoco Mission Control

Dashboard for managing OpenClaw agent instances. Next.js 16 + Tailwind + shadcn/ui + SQLite.

## Structure

```
src/
├── app/
│   ├── api/                    # REST API (API-first — browser NEVER talks to OpenClaw directly)
│   │   ├── status/             # GET — gateway online/version via WebSocket
│   │   ├── agents/             # GET — agent list (browser-safe, no server paths)
│   │   │   ├── [id]/           # GET — agent detail + bootstrap files
│   │   │   │   └── files/      # GET — list dir | files/read — read file content
│   │   │   └── hierarchy/      # GET — agent tree | PUT — reparent/reorder
│   ├── dashboard/
│   │   ├── page.tsx            # Default view = hierarchy (org chart with drag-and-drop)
│   │   ├── hierarchy/page.tsx  # Same component (kept in sync)
│   │   ├── agents/page.tsx     # Card grid view of agents
│   │   ├── [agentId]/page.tsx  # Workspace file browser (two-panel)
│   │   └── layout.tsx          # Dark shell, nav tabs, gateway status indicator
├── lib/
│   ├── openclaw.ts             # Server-only: reads ~/.openclaw/openclaw.json, filesystem ops
│   ├── openclaw-ws.ts          # Server-only: WebSocket client (challenge-response auth)
│   ├── api-transforms.ts       # Internal types → browser-safe DTOs (strips paths, formats model names)
│   ├── types.ts                # Browser-safe API types ONLY (no server paths leak here)
│   ├── db/
│   │   ├── schema.ts           # Drizzle schema (agent_hierarchy table)
│   │   ├── index.ts            # SQLite singleton, auto-creates table on first access
│   │   └── seed.ts             # Auto-sync: adds new agents, prunes removed, infers parent from name prefix
│   └── utils.ts                # shadcn cn() helper
├── components/ui/              # shadcn components (do not edit directly)
```

## Architecture Rules

**API-first**: All data flows through `/api/*` routes. The browser fetches `/api/agents`, never `ws://localhost:18789`. OpenClaw URL and token exist only in `.env.local` and server-side code.

**Type boundary**: `src/lib/types.ts` = browser-safe DTOs. Internal types (`InternalAgent`, etc.) are defined inline in `openclaw.ts` and never exported. `api-transforms.ts` bridges the two.

**No server paths in responses**: API responses never contain `workspacePath`, `agentDir`, `workspace`, or absolute filesystem paths. File paths are always relative to the agent's workspace root.

## OpenClaw Integration

Gateway: WebSocket at `ws://{host}:{port}/ws` with challenge-response auth.

Connect params that work:
- `client.id`: `"openclaw-control-ui"`
- `client.mode`: `"webchat"`
- `scopes`: `["operator.admin"]`
- `auth`: `{ token: "..." }`
- Origin header MUST use `127.0.0.1` (not `localhost`)

Config file: `~/.openclaw/openclaw.json` — parsed server-side for agent list, workspace paths, routing bindings.

## Database

SQLite via Drizzle ORM + better-sqlite3 at `data/mission-control.db`. Auto-created on first request. WAL mode.

`agent_hierarchy` table stores parent-child relationships. On every `GET /api/agents/hierarchy`:
- New agents in OpenClaw config → auto-added (name-prefix inference for sub-agents like `volundr` → `volundr-eye`)
- Removed agents → pruned, orphaned children reparented to root
- Manual drag-and-drop arrangements preserved

## Commands

```bash
npm run dev          # Dev server on :3000
npm run build        # Production build (Turbopack)
```

## Anti-Patterns

- Never import from `openclaw.ts` or `openclaw-ws.ts` in client components
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
OPENCLAW_URL=http://localhost:18789    # Gateway HTTP endpoint (server-side only)
OPENCLAW_TOKEN=...                     # Auth token (server-side only)
```

`.env.local` for local dev, `.env.example` as template.
