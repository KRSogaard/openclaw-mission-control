import { eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "./index";
import { agentHierarchy } from "./schema";
import { getAgents } from "../openclaw";
import { syncToolsToWorkspace } from "../mc-tools";
import { startTaskLoop } from "../task-dispatcher";

const SKIP_PREFIXES = ["mc-gateway-"];
const SYNC_INTERVAL = 10 * 60 * 1000;

type HierarchyRow = {
  agentId: string;
  parentId: string | null;
  position: number;
  description: string | null;
};

let _hierarchyCache: HierarchyRow[] | null = null;
let _syncStarted = false;
let _initialSyncPromise: Promise<void> | null = null;

function getVisibleAgentIds(agents: NonNullable<Awaited<ReturnType<typeof getAgents>>>): string[] {
  return agents
    .filter((a) => !SKIP_PREFIXES.some((p) => a.id.startsWith(p)))
    .map((a) => a.id);
}

function startSyncLoop(): void {
  if (_syncStarted) return;
  _syncStarted = true;
  _initialSyncPromise = runBackgroundSync();
  setInterval(() => { runBackgroundSync(); }, SYNC_INTERVAL);
}

async function runBackgroundSync(): Promise<void> {
  try {
    await syncAgents();
    startTaskLoop();
    const db = getDb();
    _hierarchyCache = db.select().from(agentHierarchy).all();
  } catch (err) {
    console.warn(
      "[bridge-command] Background sync failed:",
      err instanceof Error ? err.message : String(err)
    );
  }
}

async function syncAgents() {
  const db = getDb();
  const agents = await getAgents();
  if (!agents) return; // Config unavailable — skip sync to preserve existing data
  const visibleIds = new Set(getVisibleAgentIds(agents));
  const existing = db.select().from(agentHierarchy).all();
  const existingIds = new Set(existing.map((r) => r.agentId));

  const defaultAgent = agents.find((a) => a.isDefault && visibleIds.has(a.id));
  const rootId = defaultAgent?.id ?? [...visibleIds][0];

  const newIds = [...visibleIds].filter((id) => !existingIds.has(id));
  if (newIds.length > 0) {
    const allVisibleIds = [...visibleIds];
    const subagentParents = inferSubagentRelations(allVisibleIds);
    const maxPosition = existing.reduce((max, r) => Math.max(max, r.position), -1);

    let position = maxPosition + 1;
    for (const id of newIds) {
      const parentId = id === rootId
        ? null
        : subagentParents.get(id) ?? rootId;

      db.insert(agentHierarchy)
        .values({ agentId: id, parentId, position: position++ })
        .run();
    }
  }

  const removedIds = [...existingIds].filter((id) => !visibleIds.has(id));
  if (removedIds.length > 0) {
    db.delete(agentHierarchy)
      .where(inArray(agentHierarchy.agentId, removedIds))
      .run();

    db.update(agentHierarchy)
      .set({ parentId: rootId ?? null })
      .where(inArray(agentHierarchy.parentId, removedIds))
      .run();
  }

  const visibleAgents = agents.filter((a) => visibleIds.has(a.id));
  await Promise.all(
    visibleAgents.map((a) => syncToolsToWorkspace(a.workspacePath))
  );
}

function inferSubagentRelations(agentIds: string[]): Map<string, string> {
  const relations = new Map<string, string>();

  for (const id of agentIds) {
    const dashIdx = id.lastIndexOf("-");
    if (dashIdx === -1) continue;

    const prefix = id.substring(0, dashIdx);
    if (agentIds.includes(prefix)) {
      relations.set(id, prefix);
    }
  }

  return relations;
}

export async function getHierarchy(): Promise<HierarchyRow[]> {
  startSyncLoop();

  if (_initialSyncPromise) {
    await _initialSyncPromise;
    _initialSyncPromise = null;
  }

  return _hierarchyCache ?? getDb().select().from(agentHierarchy).all();
}

export async function updateParent(
  agentId: string,
  parentId: string | null,
  position: number
) {
  const db = getDb();
  const current = db.select().from(agentHierarchy)
    .where(eq(agentHierarchy.agentId, agentId))
    .get();
  if (!current) return;

  const oldParentId = current.parentId;

  db.update(agentHierarchy)
    .set({ parentId })
    .where(eq(agentHierarchy.agentId, agentId))
    .run();

  reorderChildren(db, parentId, agentId, position);

  if (oldParentId !== parentId) {
    reorderChildren(db, oldParentId, null, -1);
  }

  _hierarchyCache = db.select().from(agentHierarchy).all();
}

function parentFilter(parentId: string | null) {
  return parentId === null
    ? isNull(agentHierarchy.parentId)
    : eq(agentHierarchy.parentId, parentId);
}

function reorderChildren(
  db: ReturnType<typeof getDb>,
  parentId: string | null,
  insertAgentId: string | null,
  insertAt: number
) {
  const children = db.select().from(agentHierarchy)
    .where(parentFilter(parentId))
    .all();

  const others = children
    .filter((c) => c.agentId !== insertAgentId)
    .sort((a, b) => a.position - b.position);

  let ordered: typeof children;
  if (insertAgentId) {
    const moved = children.find((c) => c.agentId === insertAgentId);
    if (!moved) return;
    const clamped = Math.max(0, Math.min(insertAt, others.length));
    ordered = [...others];
    ordered.splice(clamped, 0, moved);
  } else {
    ordered = others;
  }

  for (let i = 0; i < ordered.length; i++) {
    if (ordered[i].position !== i) {
      db.update(agentHierarchy)
        .set({ position: i })
        .where(eq(agentHierarchy.agentId, ordered[i].agentId))
        .run();
    }
  }
}

export async function updateDescription(
  agentId: string,
  description: string | null
) {
  const db = getDb();
  db.update(agentHierarchy)
    .set({ description })
    .where(eq(agentHierarchy.agentId, agentId))
    .run();

  if (_hierarchyCache) {
    const row = _hierarchyCache.find((r) => r.agentId === agentId);
    if (row) {
      row.description = description;
    }
  }
}
