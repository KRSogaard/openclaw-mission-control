# Bridge Command — Sync Architecture

## Overview

Bridge Command runs two independent background loops plus event-driven syncs that keep everything in sync between OpenClaw's config, the SQLite database, and agent workspace files.

```
┌─────────────────────────────────────────────────────────────────┐
│                     openclaw.json                                │
│              (source of truth for agents)                        │
└──────────┬──────────────────────────────────────┬───────────────┘
           │ read                                  │ read/write
           ▼                                       ▼
┌─────────────────────┐              ┌──────────────────────────┐
│   Agent Sync Loop   │              │    Agent Creation API     │
│   (every 10 min)    │              │  POST /api/agents[/gen]   │
└─────────┬───────────┘              └────────────┬─────────────┘
          │                                        │
          ├─► Add new agents to DB                 ├─► openclaw agents add (CLI)
          ├─► Prune removed agents                 ├─► Write workspace files
          ├─► Reparent orphaned children           ├─► Update hierarchy DB
          └─► Sync TOOLS.md to all workspaces      ├─► Sync TOOLS.md
                                                   ├─► Configure relationships
                                                   └─► Sync parent AGENTS.md
```

## Background Loops

### 1. Agent Sync Loop (every 10 min)

**File**: `src/lib/db/seed.ts`
**Trigger**: Lazily started on first `GET /api/agents/hierarchy`
**Guard**: Recursive `setTimeout` + `_syncRunning` flag (no overlap)

```mermaid
flowchart TD
    A[Read openclaw.json] --> B[Get visible agents]
    B --> C{New agents?}
    C -->|Yes| D[Infer parent from name prefix]
    D --> E[Insert into hierarchy DB]
    C -->|No| F{Removed agents?}
    E --> F
    F -->|Yes| G[Delete from hierarchy DB]
    G --> H[Reparent orphaned children to root]
    F -->|No| I[Sync TOOLS.md to all workspaces]
    H --> I
    I --> J[Start task loop if not running]
    J --> K[Refresh hierarchy cache]
```

**What it syncs**:
- `agent_hierarchy` table ← `openclaw.json` agents list
- `TOOLS.md` in each agent's workspace ← `bc-tools.ts` generated section

**Filtering**: `isVisibleAgent()` excludes `mc-gateway-*` (OpenClaw internal) and `bridge-commander` (Bridge Command internal).

### 2. Task Loop (every 60s)

**File**: `src/lib/task-dispatcher.ts`
**Trigger**: Started by agent sync loop after first sync
**Guard**: Recursive `setTimeout` + `_loopRunning` flag (no overlap)

```mermaid
flowchart TD
    A[dispatchAllQueued] --> B[Find agents with queued tasks]
    B --> C[For each agent: check concurrency]
    C --> D{Slots available?}
    D -->|Yes| E[CAS: SET status=running WHERE status=queued]
    E --> F[Send via chat.send WebSocket RPC]
    F --> G{WS send OK?}
    G -->|No| H[Revert to queued - transient error]
    G -->|Yes| I[Task is running]
    D -->|No| J[Skip - at capacity]

    K[checkTimeouts] --> L[Find running tasks past timeout]
    L --> M{retryCount < maxRetries?}
    M -->|Yes| N[CAS: SET status=queued, retryCount++]
    N --> O[Log timeout_retry event]
    M -->|No| P[CAS: SET status=failed]
    P --> Q[Log failed event]
```

**CAS Guards**: Every state mutation uses `WHERE status = <expected>` + checks `result.changes`. Three-way CAS on retry: `WHERE id=? AND retryCount=? AND lastContactAt < cutoff`.

## Event-Driven Syncs

### 3. TOOLS.md Sync

**File**: `src/lib/bc-tools.ts`
**Markers**: `<!-- BEGIN:BC_TOOLS -->` / `<!-- END:BC_TOOLS -->`

```mermaid
flowchart TD
    A[Generate section content] --> B[Hash content]
    B --> C[Read existing TOOLS.md]
    C --> D{Version hash matches?}
    D -->|Yes| E[Skip - already current]
    D -->|No| F{Has BC_TOOLS markers?}
    F -->|Yes| G[Replace between markers]
    F -->|No| H[Append to end of file]
    G --> I[Write file]
    H --> I
```

**Triggered by**:
- Agent sync loop (all agents, every 10 min)
- Agent creation (`POST /api/agents` and `POST /api/agents/generate`)

**Content**: Bridge Command task callback tools (`task.complete`, `task.update`, `task.fail`, `task.create`) with curl examples pointing to `BC_INTERNAL_URL`.

### 4. Parent Subagent Docs Sync

**File**: `src/lib/bridge-commander.ts` → `syncParentSubagentDocs()`
**Markers**: `<!-- BEGIN:BC_SUBAGENTS -->` / `<!-- END:BC_SUBAGENTS -->`

```mermaid
flowchart TD
    A[Get parent's spawn list] --> B{Has subagents?}
    B -->|No| C[Remove BC_SUBAGENTS section if exists]
    B -->|Yes| D[Build prompt with subagent names + descriptions]
    D --> E[ask BridgeCommander]
    E --> F{Response OK?}
    F -->|Yes| G[Write generated section to AGENTS.md]
    F -->|No| H[Write fallback bullet list]
    G --> I{Has existing markers?}
    H --> I
    I -->|Yes| J[Replace between markers]
    I -->|No| K[Append to end of file]
```

**Triggered by**:
- Agent creation as subagent (`addToParentSpawnList: true`)
- Spawn list changes via `PATCH /api/agents/{id}` (allowedSubagents)

**Uses BridgeCommander** to generate contextual descriptions of when/why to use each sub-agent. Falls back to a plain list if BridgeCommander is unavailable.

### 5. BridgeCommander Lazy Bootstrap

**File**: `src/lib/bridge-commander.ts` → `ensureBridgeCommander()`

```mermaid
flowchart TD
    A[Any call to ask] --> B[ensureBridgeCommander]
    B --> C{_bootstrapped flag?}
    C -->|Yes| D[Return immediately]
    C -->|No| E[Check openclaw.json for bridge-commander]
    E --> F{Exists?}
    F -->|No| G["openclaw agents add (CLI)"]
    G --> H[Invalidate config cache]
    F -->|Yes| H
    H --> I[Write hardcoded SOUL.md]
    I --> J[Write hardcoded IDENTITY.md]
    J --> K[Set _bootstrapped = true]
```

**Triggered by**: First call to `ask()` — which happens on first AI-generated agent creation or first `syncParentSubagentDocs` with BridgeCommander.

## Agent Creation Flow

```mermaid
sequenceDiagram
    participant UI as Wizard UI
    participant API as POST /api/agents[/generate]
    participant CLI as openclaw CLI
    participant BC as BridgeCommander
    participant DB as SQLite
    participant FS as Filesystem

    UI->>API: Agent details + type (full/subagent)
    API->>CLI: openclaw agents add --json
    CLI->>FS: Create workspace + default files
    CLI-->>API: { agentId, workspace }

    API->>FS: Clean bootstrap files

    alt AI-generated (POST /api/agents/generate)
        alt Full agent
            API->>BC: ask(generation prompt)
            BC-->>API: { soul, identity, agents, ... }
            API->>FS: Write SOUL.md, IDENTITY.md, AGENTS.md, MEMORY.md, HEARTBEAT.md
            API->>FS: Copy USER.md from default agent
        else Subagent
            API->>BC: ask(generation prompt)
            BC-->>API: { agents, ... }
            API->>FS: Write AGENTS.md only
        end
    else Quick create (POST /api/agents)
        alt Full agent
            API->>FS: Copy USER.md from default agent
        end
    end

    API->>FS: Sync TOOLS.md (BC_TOOLS section)
    API->>DB: Insert into agent_hierarchy

    alt Full agent
        opt Communication enabled
            API->>FS: Update openclaw.json (agentToAgent allow)
        end
        opt Has spawn agents
            API->>FS: Update openclaw.json (subagents.allowAgents)
        end
    end

    alt Subagent
        API->>FS: Add to parent's subagents.allowAgents
        API->>BC: syncParentSubagentDocs(parentId)
        BC-->>API: Generated sub-agent guide
        API->>FS: Update parent's AGENTS.md (BC_SUBAGENTS section)
    end

    opt Hooks enabled (full agents only)
        API->>FS: Update openclaw.json (hooks.allowedAgentIds)
    end

    API-->>UI: { agentId, name, workspace, model }
    UI->>UI: Navigate to /dashboard/{agentId}
```

## File Marker Conventions

| Marker | File | Purpose |
|--------|------|---------|
| `<!-- BEGIN:BC_TOOLS -->` | TOOLS.md | Bridge Command task callback tools |
| `<!-- BC_TOOLS_VERSION: {hash} -->` | TOOLS.md | Content hash for skip-if-unchanged |
| `<!-- BEGIN:BC_SUBAGENTS -->` | AGENTS.md | Available sub-agents guide for parent |

All marker sections are fully managed by Bridge Command — content between markers is overwritten on each sync. Content outside markers is preserved.
