"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import type {
  AgentHierarchyNode,
  AgentSummary,
  ApiResponse,
  HierarchyUpdate,
} from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

function DraggableCard({
  agent,
  children,
  onDescriptionChange,
}: {
  agent: AgentSummary;
  children?: React.ReactNode;
  onDescriptionChange?: (agentId: string, description: string | null) => Promise<void>;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: agent.id });
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(agent.description || "");
  const [isSaving, setIsSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.3 : 1,
  };

  const handleDescriptionClick = () => {
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!onDescriptionChange) return;
    setIsSaving(true);
    try {
      await onDescriptionChange(agent.id, editValue || null);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditValue(agent.description || "");
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && e.ctrlKey) {
      handleSave();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  };

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isEditing]);

  return (
    <div ref={setNodeRef} style={style} className="flex flex-col items-center">
      <div
        {...attributes}
        {...listeners}
        className={[
          "relative cursor-grab rounded-xl border px-5 py-3.5 select-none",
          "min-w-[200px] max-w-[280px] transition-colors",
          agent.isDefault
            ? "border-emerald-700/60 bg-card ring-1 ring-emerald-600/20"
            : "border-border bg-card hover:bg-muted",
        ].join(" ")}
      >
        {agent.isDefault && (
          <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
            <span className="rounded-full bg-emerald-900/80 px-2 py-0.5 text-xs font-medium text-emerald-300 ring-1 ring-emerald-700/50">
              root
            </span>
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Link
            href={`/dashboard/${agent.id}`}
            onPointerDown={(e) => e.stopPropagation()}
            className={[
              "font-semibold leading-tight hover:underline",
              agent.isDefault ? "text-base text-foreground" : "text-sm text-foreground",
            ].join(" ")}
          >
            {agent.name}
          </Link>
          <Badge variant="outline" className="w-fit font-mono text-xs">
            {agent.model}
          </Badge>
          {agent.channels.length > 0 && (
            <div className="mt-0.5 flex flex-wrap gap-1">
              {agent.channels.map((ch, idx) => (
                <Badge key={idx} variant="secondary" className="text-xs">
                  {ch.platform}{ch.target ? ` \u2192 ${ch.target}` : ""}
                </Badge>
              ))}
            </div>
          )}
          {isEditing ? (
            <div className="mt-1 flex flex-col gap-1">
              <textarea
                ref={textareaRef}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onPointerDown={(e) => e.stopPropagation()}
                rows={2}
                className="rounded bg-muted px-2 py-1 text-xs text-foreground border border-border focus:outline-none focus:ring-1 focus:ring-sky-500"
                placeholder="Add description..."
              />
              <div className="flex gap-1">
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="flex-1 rounded bg-sky-600 px-2 py-1 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50"
                >
                  {isSaving ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={handleCancel}
                  disabled={isSaving}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="flex-1 rounded bg-muted px-2 py-1 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div
              onClick={handleDescriptionClick}
              className="mt-1 cursor-pointer"
            >
              {agent.description ? (
                <p className="text-xs text-muted-foreground break-words">{agent.description}</p>
              ) : (
                <p className="text-xs text-muted-foreground/50 italic">Add description...</p>
              )}
            </div>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

function DropSlot({
  id,
  label,
  activeId,
  orientation,
}: {
  id: string;
  label?: string;
  activeId: string | null;
  orientation: "vertical" | "horizontal";
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  if (!activeId) return null;

  return (
    <div
      ref={setNodeRef}
      className={[
        "flex items-center justify-center rounded-lg border-2 border-dashed transition-all duration-150",
        orientation === "vertical" ? "w-14 self-stretch min-h-[60px]" : "h-12 w-full",
        isOver
          ? "border-sky-500 bg-sky-950/30"
          : "border-border",
      ].join(" ")}
    >
      {label && (
        <span className={`text-xs ${isOver ? "text-sky-400" : "text-muted-foreground/50"}`}>
          {isOver ? "release" : label}
        </span>
      )}
    </div>
  );
}

function NestSlot({
  parentId,
  activeId,
  hasChildren,
}: {
  parentId: string;
  activeId: string | null;
  hasChildren: boolean;
}) {
  const dropId = `nest:${parentId}`;
  const { setNodeRef, isOver } = useDroppable({ id: dropId });

  if (!activeId || hasChildren) return null;

  return (
    <div className="flex flex-col items-center">
      <div className="h-3 w-px bg-border" />
      <div
        ref={setNodeRef}
        className={[
          "flex items-center justify-center rounded-lg border-2 border-dashed px-4 py-2 transition-all duration-150 min-w-[140px]",
          isOver
            ? "border-sky-500 bg-sky-950/30"
            : "border-border",
        ].join(" ")}
      >
        <span className={`text-xs ${isOver ? "text-sky-400" : "text-muted-foreground/50"}`}>
          {isOver ? "release to nest" : "drop as child"}
        </span>
      </div>
    </div>
  );
}

function TreeNode({
  node,
  activeId,
  onDescriptionChange,
}: {
  node: AgentHierarchyNode;
  activeId: string | null;
  onDescriptionChange?: (agentId: string, description: string | null) => Promise<void>;
}) {
  return (
    <DraggableCard agent={node.agent} onDescriptionChange={onDescriptionChange}>
      <NestSlot
        parentId={node.agent.id}
        activeId={activeId}
        hasChildren={node.children.length > 0}
      />

      {node.children.length > 0 && (
        <div className="flex flex-col items-center">
          <div className="h-6 w-px bg-border" />
          <div className="flex items-start">
            <DropSlot
              id={`before:${node.agent.id}:0`}
              activeId={activeId}
              orientation="vertical"
            />

            {node.children.map((child, i) => (
              <div key={child.agent.id} className="flex items-start">
                <div className="relative flex flex-col items-center px-3">
                  {node.children.length > 1 && (
                    <div
                      className={[
                        "absolute top-0 h-px bg-border",
                        i === 0
                          ? "left-1/2 right-0"
                          : i === node.children.length - 1
                            ? "left-0 right-1/2"
                            : "inset-x-0",
                      ].join(" ")}
                    />
                  )}
                  <div className="h-6 w-px bg-border" />
                  <TreeNode node={child} activeId={activeId} onDescriptionChange={onDescriptionChange} />
                </div>

                <DropSlot
                  id={`before:${node.agent.id}:${i + 1}`}
                  activeId={activeId}
                  orientation="vertical"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </DraggableCard>
  );
}

function OverlayCard({ agent }: { agent: AgentSummary }) {
  return (
    <div className="rounded-xl border border-sky-500/70 bg-card px-5 py-3.5 shadow-2xl shadow-sky-500/10 ring-2 ring-sky-500/30 min-w-[200px] max-w-[280px]">
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-foreground">{agent.name}</span>
        <Badge variant="outline" className="w-fit font-mono text-xs">
          {agent.model}
        </Badge>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col items-center gap-6 p-12">
      <Skeleton className="h-20 w-56 rounded-xl bg-muted" />
      <div className="flex gap-12 mt-6">
        <Skeleton className="h-16 w-48 rounded-xl bg-muted" />
        <Skeleton className="h-16 w-48 rounded-xl bg-muted" />
        <Skeleton className="h-16 w-48 rounded-xl bg-muted" />
      </div>
    </div>
  );
}

function isDescendant(
  nodes: AgentHierarchyNode[],
  ancestorId: string,
  targetId: string
): boolean {
  function find(list: AgentHierarchyNode[], id: string): AgentHierarchyNode | null {
    for (const n of list) {
      if (n.agent.id === id) return n;
      const f = find(n.children, id);
      if (f) return f;
    }
    return null;
  }
  function contains(list: AgentHierarchyNode[], id: string): boolean {
    for (const n of list) {
      if (n.agent.id === id) return true;
      if (contains(n.children, id)) return true;
    }
    return false;
  }
  const a = find(nodes, ancestorId);
  return a ? contains(a.children, targetId) : false;
}

function collectAgents(tree: AgentHierarchyNode[]): Map<string, AgentSummary> {
  const map = new Map<string, AgentSummary>();
  function walk(nodes: AgentHierarchyNode[]) {
    for (const n of nodes) {
      map.set(n.agent.id, n.agent);
      walk(n.children);
    }
  }
  walk(tree);
  return map;
}

function parseDropId(overId: string): { parentId: string | null; position: number } | null {
  if (overId.startsWith("nest:")) {
    return { parentId: overId.slice(5), position: 0 };
  }
  if (overId.startsWith("before:")) {
    const rest = overId.slice(7);
    const lastColon = rest.lastIndexOf(":");
    const parentId = rest.slice(0, lastColon);
    const position = parseInt(rest.slice(lastColon + 1), 10);
    return { parentId: parentId === "__root__" ? null : parentId, position };
  }
  if (overId === "root-top") {
    return { parentId: null, position: 0 };
  }
  return null;
}

export default function HierarchyPage() {
  const [hierarchy, setHierarchy] = useState<AgentHierarchyNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const agentsRef = useRef<Map<string, AgentSummary>>(new Map());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const fetchHierarchy = useCallback(async () => {
    try {
      const res = await fetch("/api/agents/hierarchy");
      const json = (await res.json()) as ApiResponse<AgentHierarchyNode[]>;
      if (json.error) {
        setError(json.error.message);
        return;
      }
      setHierarchy(json.data);
      agentsRef.current = collectAgents(json.data);
    } catch {
      setError("Failed to load hierarchy");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHierarchy();
  }, [fetchHierarchy]);

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  async function handleDragEnd(event: DragEndEvent) {
    const agentId = String(event.active.id);
    setActiveId(null);

    if (!event.over) return;

    const overId = String(event.over.id);
    const target = parseDropId(overId);
    if (!target) return;

    if (agentId === target.parentId) return;
    if (target.parentId && isDescendant(hierarchy, agentId, target.parentId)) return;

    setIsUpdating(true);
    try {
      const body: HierarchyUpdate = {
        agentId,
        parentId: target.parentId,
        position: target.position,
      };
      const res = await fetch("/api/agents/hierarchy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) setError("Failed to update");
      await fetchHierarchy();
    } catch {
      setError("Failed to update hierarchy");
    } finally {
      setIsUpdating(false);
    }
  }

  function handleDragCancel() {
    setActiveId(null);
  }

  const handleDescriptionChange = useCallback(
    async (agentId: string, description: string | null) => {
      try {
        const res = await fetch("/api/agents/hierarchy", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId, description }),
        });
        if (!res.ok) {
          setError("Failed to update description");
          return;
        }
        await fetchHierarchy();
      } catch {
        setError("Failed to update description");
      }
    },
    [fetchHierarchy]
  );

  const activeAgent = activeId ? agentsRef.current.get(activeId) ?? null : null;

  const toolbar = (
    <div className="flex items-center gap-4 border-b border-border px-6 py-3">
      <h2 className="text-sm font-medium text-muted-foreground">Agent Hierarchy</h2>
      {isUpdating && <span className="ml-auto text-xs text-muted-foreground">Saving&hellip;</span>}
      {error && !isUpdating && <span className="ml-auto text-xs text-red-400">{error}</span>}
    </div>
  );

  if (loading) {
    return (
      <div className="flex flex-1 flex-col">
        {toolbar}
        <LoadingSkeleton />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      {toolbar}
      <div className="flex flex-1 overflow-auto">
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div className="mx-auto px-12 py-10">
            <DropSlot
              id="root-top"
              label="make root"
              activeId={activeId}
              orientation="horizontal"
            />

            <div className="mt-4 flex items-start">
              <DropSlot
                id="before:__root__:0"
                activeId={activeId}
                orientation="vertical"
              />

               {hierarchy.map((rootNode, i) => (
                 <div key={rootNode.agent.id} className="flex items-start">
                   <div className="px-3">
                     <TreeNode node={rootNode} activeId={activeId} onDescriptionChange={handleDescriptionChange} />
                  </div>
                  <DropSlot
                    id={`before:__root__:${i + 1}`}
                    activeId={activeId}
                    orientation="vertical"
                  />
                </div>
              ))}
            </div>
          </div>

          <DragOverlay dropAnimation={null}>
            {activeAgent ? <OverlayCard agent={activeAgent} /> : null}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}
