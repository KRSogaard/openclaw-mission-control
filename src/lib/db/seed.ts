import { eq, inArray } from "drizzle-orm";
import { getDb } from "./index";
import { agentHierarchy } from "./schema";
import { getAgents } from "../openclaw";
import { syncToolsToWorkspace } from "../mc-tools";

const SKIP_PREFIXES = ["mc-gateway-"];

function getVisibleAgentIds(agents: Awaited<ReturnType<typeof getAgents>>): string[] {
  return agents
    .filter((a) => !SKIP_PREFIXES.some((p) => a.id.startsWith(p)))
    .map((a) => a.id);
}

export async function syncHierarchy() {
  const db = getDb();
  const agents = await getAgents();
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

export async function getHierarchy() {
  const db = getDb();
  await syncHierarchy();
  return db.select().from(agentHierarchy).all();
}

export async function updateParent(
  agentId: string,
  parentId: string | null,
  position: number
) {
  const db = getDb();
  db.update(agentHierarchy)
    .set({ parentId, position })
    .where(eq(agentHierarchy.agentId, agentId))
    .run();
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
}
