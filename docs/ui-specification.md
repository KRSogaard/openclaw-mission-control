# Bridge Command — UI Specification

A sidecar dashboard for managing OpenClaw AI agents. Dark theme by default, with light/system options.

---

## Global Layout

Every page shares a persistent shell: sidebar + top header.

### Sidebar (Left, Collapsible)

| Element | Details |
|---------|---------|
| Logo | "Bridge Command" with blue icon. Hidden when collapsed |
| Gateway Status | Green dot + "Comms Online v{version}" or Red dot + "Comms Offline" or "Hailing…" while loading. Polls every 15s |
| Stardate | "SD {stardate}" in monospace, muted. Cosmetic — TNG-style year + fractional day |
| **Nav: Stations** | |
| Agents | Links to `/dashboard`. Active on hierarchy + agent list views |
| Tasks | Links to `/dashboard/tasks` |
| Server | Links to `/dashboard/server` |
| Settings | Links to `/dashboard/settings` |
| Doctor | Links to `/dashboard/doctor` |
| Footer | Theme toggle (light / dark / system) |

### Top Header

- Hamburger button (toggles sidebar on mobile)
- Breadcrumb: "The Bridge" → current page name

---

## Page 1: Agent Hierarchy (default view)

**URL**: `/dashboard` and `/dashboard/hierarchy` (identical)
**Purpose**: Org chart showing agent parent-child relationships. Primary way to visualize and reorganize the agent fleet.

### Toolbar
- Title: "Agent Hierarchy"
- **"New Agent" button** (blue, + icon) → navigates to creation wizard
- Status text: "Saving…" during updates, or red error message

### Canvas (Pannable, Scrollable)
- Space + drag to pan
- Agents rendered as a tree — parent at top, children below with connector lines

### Agent Card
- **Left accent bar**: deterministic color per agent (consistent everywhere)
- **Name**: clickable link → agent detail page
- **Model badge**: monospace, e.g. "anthropic/claude-sonnet-4-20250514"
- **Channel badges**: e.g. "slack → #operations"
- **Description**: inline-editable (click to edit, Ctrl+Enter to save, Esc to cancel)
- **Root badge**: green "root" label on the default agent
- **"+" button**: appears on hover below the card → navigates to creation wizard with `?parent={agentId}` pre-selected

### Drag & Drop
- Drag a card to reparent it
- Drop zones appear: "make root" at top, "drop as child" below cards, vertical slots between siblings
- Drop zones highlight sky-blue on hover

### Navigation
- Card name → `/dashboard/{agentId}`
- "+" button → `/dashboard/agents/new?parent={agentId}`
- "New Agent" → `/dashboard/agents/new`

### Sub-tabs
Shared with Agent List page — tabs at top: **Hierarchy** | **List**

---

## Page 2: Agent List

**URL**: `/dashboard/agents`
**Purpose**: Flat list view of all agents with key details at a glance.

### Sub-tabs
**Hierarchy** | **List** (List is active)

### Agent Rows (each is a link → agent detail)
- **Color dot** (left)
- **Name** (bold) + "default" badge if applicable
- **Agent ID** (small, muted)
- **Model badge** (monospace)
- **Description** (truncated)
- **Channel badges** (right side)

### Empty State
"No crew on deck"

---

## Page 3: Agent Creation Wizard

**URL**: `/dashboard/agents/new` or `/dashboard/agents/new?parent={parentId}`
**Purpose**: 4-step form to create a new agent — either a full independent agent or a spawnable sub-agent.

### Header
- Title: "Commission New Agent"
- Subtitle: "Set up a new crew member"

### Step Indicator
4 numbered circles with labels: **Identity** → **Model** → **Relationships** → **Review**
Completed steps show checkmarks. Progress line connects them.

### Step 1: Identity

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Agent Type | 2-button toggle | Yes | "Full Agent" (independent, own comms) or "Spawnable Sub-agent" (task worker, spawned by parent) |
| Agent Name | Text input | Yes | e.g. "Web Researcher" |
| Agent ID | Text input | Auto | Auto-generated from name (lowercase, hyphens). Lock/unlock button to edit manually |
| Purpose | Textarea | Yes | "What should this agent do?" |
| Personality | Textarea | No | "Personality or working style?" |

### Step 2: Model

| Field | Type | Notes |
|-------|------|-------|
| Model | Dropdown | Grouped by provider. Shows name, context window, [reasoning] badge. "Default model" option |
| Workspace Path | Text input | In collapsible "Advanced" section. Auto-generated as `~/.openclaw/workspace/{agent-id}` |

### Step 3: Relationships

**Full Agent shows:**

| Field | Type | Notes |
|-------|------|-------|
| Parent Agent | Dropdown | Optional. "No parent (top-level)" default |
| Enable messaging | Checkbox | Join the global communication pool. Default: on |
| Spawn Agents | Checkbox list | Which agents this one can spawn. Scrollable, colored dots per agent |
| Enable task hooks | Checkbox | Allow task callbacks to Bridge Command. Default: on |

**Sub-agent shows:**

| Field | Type | Notes |
|-------|------|-------|
| Parent Agent | Dropdown | **Required**. Green confirmation: "{Parent} will be able to spawn this agent" |

No messaging, spawn agents, or hooks fields — sub-agents are lightweight.

### Step 4: Review & Create
- Summary card with all choices (key-value rows with dividers)
- **"Generate files with AI"** checkbox:
  - ON: "Bridge Command will generate tailored files based on your description"
  - OFF: "Agent will be created with empty bootstrap files"
- **"Commission Agent"** button (blue, full width)
- On success: redirects to `/dashboard/{agentId}`

### Navigation
- Back / Next buttons at bottom
- Next validates required fields before advancing

---

## Page 4: Global Task Board

**URL**: `/dashboard/tasks`
**Purpose**: All tasks across all agents in one kanban view. Color-coded by agent.

### Toolbar
- Title: "All Tasks" + total count
- **"New task" button** (blue) → shows inline create form
- **Agent filter buttons** (right side): "All" + one per agent with colored dot. Toggle to filter

### Create Task Form (inline, below toolbar)
- Agent dropdown (required)
- Title input (required)
- Description textarea (optional)
- "Create & dispatch" + "Cancel" buttons

### Kanban Board — 4 columns

| Column | Color | Contains |
|--------|-------|----------|
| To-Do | zinc | Queued tasks |
| Running | sky/blue | Active tasks |
| Done | emerald/green | Completed tasks |
| Failed | red | Failed tasks |

Each column has: uppercase label, count badge, scrollable area.

### Task Card
- **Left accent bar**: agent color
- **Agent name** (linked, colored) — click navigates to agent detail
- **Task title** (bold)
- **Status message** (truncated)
- **Footer**: creator + timestamp + retry count badge (amber, if > 0)
- **Click** → opens detail panel on right side

### Detail Panel (right sidebar, 384px wide)
Slides in when a task card is clicked. Shows:
- Task title + status badge
- "View details" link → full task detail page
- Description
- Metadata grid: created by, created, updated, retries
- Response/result (if completed)
- **Action buttons**: Check In (running), Mark Complete, Cancel (red), Retry, Delete (red)
- **Captain's Log**: timeline of events with colored dots

### Empty Column
"All quiet in this sector"

---

## Page 5: Server / Engineering

**URL**: `/dashboard/server`
**Purpose**: Live server monitoring — CPU, memory, disk. Read-only, auto-refreshes every 5s.

### Header
- Title: "Engineering"
- Subtitle: "{hostname} · {platform} · {arch}"

### Stats Grid (4 cards)

| Card | Value | Color Logic | Details |
|------|-------|-------------|---------|
| CPU Load | "{pct}%" | Green <60%, amber 60-80%, red >80% | Progress bar + "{cores} cores · load averages" |
| Memory | "{pct}%" | Same thresholds | Progress bar + "{used} / {total}" |
| Uptime | "5d 3h 42m" | Always white | "Node {version}" |
| CPU | Model name | Always white | — |

### Disk Usage (full-width card)
Per mount point:
- Mount path (monospace)
- Usage percentage (colored by same thresholds)
- Progress bar
- "{used} used / {size} total · {available} free"

### Footer
"Updates every 5s · Last: {timestamp}"

---

## Page 6: Global Settings

**URL**: `/dashboard/settings`
**Purpose**: Global defaults for task execution. Per-agent overrides are on each agent's Settings tab.

### Task Defaults Card

| Field | Type | Range | Unit |
|-------|------|-------|------|
| Timeout | Number input | min 1 | minutes |
| Max retries | Number input | 0–20 | — |
| Max concurrent tasks | Number input | 1–10 | per agent |

Save / Cancel buttons appear when values change.

---

## Page 7: Sickbay (Doctor)

**URL**: `/dashboard/doctor`
**Purpose**: System diagnostics — checks gateway, exec permissions, hooks, agent workspaces, tool sync. Can auto-fix most issues.

### Header
- Title: "Sickbay"
- Subtitle: "Ship diagnostics — comms, crew permissions, tool sync, and exec approvals"
- **"Restart Gateway"** button (outline, with confirm dialog)
- **"Fix all"** button (outline, only if fixable issues exist)
- **"Run diagnostics"** / **"Re-scan"** button (blue)

### Alert Banner (after scan)
- **Red Alert**: pulsing red dot + "{n} system(s) failing"
- **Yellow Alert**: pulsing amber dot + "{n} advisory notice(s)"
- **All Systems Nominal**: solid green dot

### Summary Cards (3)
Passed (green) | Warnings (amber) | Failed (red) — each with count + icon

### Check Categories (cards)
Non-agent categories: **Gateway**, **Hooks**, **Exec**, **Bridge Command** — flat list of check rows.

### Check Row
- Status icon (✅ / ⚠️ / ❌)
- Label (bold)
- **"Fix" button** (sky blue outline, if fixable)
- Status badge (pass / warn / fail)
- Message (small, muted)

### Agent Section (collapsible)
One expandable row per agent:
- **Chevron** (right → down on expand)
- **Color dot** (agent color)
- **Agent ID**
- **"sub-agent" badge** (if applicable)
- **Worst status icon** + check count (right side)

Expanded: nested check rows with left border indent.

**Full agents are checked for**: workspace, TOOLS.md, exec approval, channels, hooks access
**Sub-agents are checked for**: workspace, TOOLS.md only (they don't need channels/hooks/exec)

### Footer
"Last run: {timestamp}"

---

## Page 8: Agent Detail — Layout

**URL**: `/dashboard/{agentId}/*`
**Purpose**: Persistent header + tabs wrapping all agent sub-pages.

### Header
- Back arrow → `/dashboard`
- Agent name with colored dot
- "default" badge (if applicable)
- Model badge (monospace)

### Tabs
**Overview** | **Tasks** | **Files** | **Settings**
Active tab: sky-blue bottom border.

### Bottom Accent Bar
Full-width 2px line in agent's color.

---

## Page 9: Agent Detail — Overview

**URL**: `/dashboard/{agentId}`
**Purpose**: Agent configuration at a glance — description, channels, relationships, model, danger zone.

### Cards (2-column grid)

**Description Card**
- Inline-editable text. Edit/Add button. Ctrl+Enter to save.

**Channels Card**
- Per-channel row: platform badge, target, mention-required badge, account ID
- Empty: "No channels bound"

**Spawn Agents Card**
- "Select all" checkbox (with green "wildcard" badge when active → hides individual checkboxes)
- Per-agent checkboxes (name, colored dot)
- Skeleton while loading

**Communication Card**
- Toggle: "Enable agent-to-agent messaging"
- When enabled: list of peer agents with colored dots, or "All agents can communicate (wildcard)"
- Skeleton while loading

**Spawnable By Card** (always visible)
- List of agents that can spawn this one
- Per row: colored dot, name, "wildcard" badge, **"Revoke" button** (appears on hover, red)
- Empty: "No agents can currently spawn this one"

**Mention Patterns Card** (only if patterns exist)
- Monospace badges

**Configuration Card**
- Model dropdown (skeleton while loading models)
- Heartbeat value or "disabled"
- Hooks access badge (yes/no)
- Default agent badge (yes/no)

**Danger Zone Card** (only for non-default agents)
- Red border, red title
- "Delete this agent" with description
- **"Delete Agent" button** (red outline) → confirm dialog → redirects to `/dashboard`

---

## Page 10: Agent Detail — Tasks (Kanban)

**URL**: `/dashboard/{agentId}/tasks`
**Purpose**: Per-agent task board with inline task creation and settings.

### Toolbar
- Title: "Tasks" + count
- **Settings gear button** → toggles inline settings card

### Inline Settings Card
- Timeout (minutes) + Max retries inputs
- Save / Cancel buttons

### Kanban Board — 5 columns
Same as global board plus a **Cancelled** column (zinc). Only the To-Do column has a "+" button to create tasks.

### Inline Task Creation (in To-Do column)
- Title input (Enter to create)
- Description textarea (optional)
- Create / Cancel buttons

### Task Card + Detail Panel
Same shared components as global task board.

---

## Page 11: Agent Detail — Task Detail

**URL**: `/dashboard/{agentId}/tasks/{taskId}`
**Purpose**: Full-page view of a single task with complete history and conversation.

### Header
- Back arrow → agent's task list
- Task title + status badge

### Metadata
- Created timestamp + creator
- Updated (relative time)
- Retry count: "{count} / {max}" + remaining or "max reached"
- Timeout: "{n}m timeout"

### Action Buttons
| Button | Shown When | Style |
|--------|-----------|-------|
| Check In | Running | Outline |
| Mark Complete | Queued/Running | Outline, prompts for completion note |
| Cancel | Queued/Running | Red outline, confirm dialog |
| Retry | Failed/Completed/Cancelled | Outline |
| Delete | Failed/Completed/Cancelled | Red ghost, confirm dialog |

### Description Card
Full task description.

### Result Card (if completed with response)
Agent's completion response.

### Captain's Log Card
Timeline with vertical line, colored event dots:
- created (zinc), dispatched (sky), progress (sky), timeout_retry (amber), completed (emerald), failed (red), cancelled (zinc), retried (violet), resumed (sky), check_in (sky)
- Each: event name + actor + timestamp + message

### Conversation Card
Chat messages between Bridge Command and the agent:
- **User messages** (Bridge Command): sky background
- **Assistant messages** (Agent): muted background
- **Tool results**: zinc or red background (if error), with tool name badge
- Timestamps on each message
- Empty: "No comms yet — awaiting dispatch"

Auto-refreshes every 5s while task is active.

---

## Page 12: Agent Detail — Files

**URL**: `/dashboard/{agentId}/files?path={dir}&open={file}`
**Purpose**: File browser with inline code editor. View and edit agent workspace files.

### Breadcrumb
Workspace label → path segments (clickable) → current file

### Left Panel (272px, File Tree)
- "FILES" header + **New File button** (+ icon)
- Inline create: text input for filename, Enter to create
- Per entry: icon (folder/file) + name + size. Delete button on hover (red X)
- Empty: "Empty directory"

### Right Panel (Code/Image Viewer)

**Code file (read-only)**:
- Filename + Edit button (pencil) + size + language
- CodeMirror editor (read-only, syntax highlighted, dark/light theme)

**Code file (editing)**:
- CodeMirror editor (editable)
- Save (blue) + Cancel buttons
- "Ctrl+S to save · Esc to cancel"

**Image file**:
- Centered image with border

**No file selected**:
"Select a file to view its contents"

---

## Page 13: Agent Detail — Settings

**URL**: `/dashboard/{agentId}/settings`
**Purpose**: Per-agent task execution overrides. Falls back to global defaults.

### Task Settings Card
- Badge: "using global defaults" (outline) or "custom override" (sky)
- Timeout, max retries, max concurrent inputs
- Each shows global default value for comparison
- Save / Cancel + **"Reset to global defaults"** button (if custom)
- Footer: "Global defaults: {timeout}m timeout, {retries} retries, {concurrent} concurrent"

---

## Page 14: 404

**URL**: Any undefined route
- Large "404" heading
- "This sector has not been charted."
- "Return to The Bridge" link → `/dashboard`

---

## Design Constants

### Agent Colors
Deterministic per agent ID — 10-color palette: amber, teal, violet, rose, cyan, orange, sky, emerald, fuchsia, indigo. Same agent always gets the same color. Used for: hierarchy accent bars, list dots, detail header accent, task card accent bars, filter buttons.

### Status Colors
| Status | Color |
|--------|-------|
| Queued | zinc (neutral) |
| Running | sky (blue) |
| Completed | emerald (green) |
| Failed | red |
| Cancelled | zinc (neutral) |

### Theme
Dark by default. Uses Tailwind CSS `bg-background`, `text-foreground`, `border-border`, `bg-card`, `bg-muted` semantic tokens. shadcn/ui components.

### Typography
- Body: system sans-serif
- Code/IDs/models: monospace
- Uppercase tracking-wider for section labels (column headers, field group labels)

### Keyboard Shortcuts
| Shortcut | Context | Action |
|----------|---------|--------|
| Ctrl+Enter | Description edit, task create | Save / Submit |
| Ctrl+S | File editor | Save file |
| Esc | Any edit mode, modals | Cancel / Close |
| Space+Drag | Hierarchy canvas | Pan |
| Enter | Task title input | Create task |
