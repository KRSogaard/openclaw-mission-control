"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import type { AgentSummary, ApiResponse } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { getAgentColor } from "@/lib/utils";
import { TaskCard } from "@/components/task-card";
import { TaskDetailPanel } from "@/components/task-detail-panel";

type GlobalTask = {
  id: string;
  agentId: string;
  agentName: string;
  agentModel: string;
  title: string;
  description: string | null;
  status: string;
  response: string | null;
  statusMessage: string | null;
  retryCount: number;
  createdBy: string | null;
  createdAt: number;
  updatedAt: number;
};


const COLUMNS = [
  { key: "queued", label: "To-Do", accent: "border-l-zinc-500" },
  { key: "running", label: "Running", accent: "border-l-sky-500" },
  { key: "completed", label: "Done", accent: "border-l-emerald-500" },
  { key: "failed", label: "Failed", accent: "border-l-red-500" },
];




export default function GlobalTasksPage() {
  const [tasks, setTasks] = useState<GlobalTask[]>([]);
  const [allAgents, setAllAgents] = useState<AgentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<GlobalTask | null>(null);
  const [filterAgent, setFilterAgent] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createAgent, setCreateAgent] = useState("");
  const [createTitle, setCreateTitle] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks");
      const json = (await res.json()) as ApiResponse<GlobalTask[]>;
      if (json.data) setTasks(json.data);
    } catch {
      void 0;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    async function fetchAgents() {
      try {
        const res = await fetch("/api/agents");
        const json = (await res.json()) as ApiResponse<AgentSummary[]>;
        if (json.data) {
          setAllAgents(json.data);
          if (json.data.length > 0 && !createAgent) setCreateAgent(json.data[0].id);
        }
      } catch { void 0; }
    }
    fetchAgents();
  }, []);

  useEffect(() => {
    if (showCreate && titleRef.current) titleRef.current.focus();
  }, [showCreate]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    const hasActive = tasks.some((t) => t.status === "queued" || t.status === "running");
    if (!hasActive) return;
    const interval = setInterval(fetchTasks, 5000);
    return () => clearInterval(interval);
  }, [tasks, fetchTasks]);

  async function handleCreate() {
    if (!createAgent || !createTitle.trim() || submitting) return;
    setSubmitting(true);
    try {
      await fetch(`/api/agents/${createAgent}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: createTitle.trim(), description: createDesc.trim() || undefined }),
      });
      setCreateTitle("");
      setCreateDesc("");
      setShowCreate(false);
      await fetchTasks();
    } finally {
      setSubmitting(false);
    }
  }

  const agents = [...new Set(tasks.map((t) => t.agentId))].sort();
  const filtered = filterAgent ? tasks.filter((t) => t.agentId === filterAgent) : tasks;

  const grouped = useMemo(() => {
    const map = new Map<string, GlobalTask[]>();
    for (const col of COLUMNS) map.set(col.key, []);
    for (const task of filtered) {
      const key = task.status === "cancelled" ? "failed" : task.status;
      const arr = map.get(key);
      if (arr) arr.push(task);
    }
    return map;
  }, [filtered]);

  if (loading) {
    return (
      <div className="h-full overflow-y-auto p-6 space-y-4">
        <Skeleton className="h-8 w-48 bg-muted" />
        <div className="flex gap-3 h-[60vh]">
          <Skeleton className="flex-1 bg-muted rounded-lg" />
          <Skeleton className="flex-1 bg-muted rounded-lg" />
          <Skeleton className="flex-1 bg-muted rounded-lg" />
          <Skeleton className="flex-1 bg-muted rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-6 py-3">
        <h3 className="text-sm font-medium text-foreground">All Tasks</h3>
        <span className="text-xs text-muted-foreground">{tasks.length} total</span>

        <Button
          size="sm"
          onClick={() => setShowCreate(!showCreate)}
          className="bg-sky-600 hover:bg-sky-700 text-white text-xs"
        >
          New task
        </Button>

        <div className="ml-auto flex items-center gap-1.5">
          <Button
            variant={filterAgent === null ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setFilterAgent(null)}
            className="text-xs h-7"
          >
            All
          </Button>
          {agents.map((agentId) => {
            const c = getAgentColor(agentId);
            const name = tasks.find((t) => t.agentId === agentId)?.agentName ?? agentId;
            return (
              <Button
                key={agentId}
                variant={filterAgent === agentId ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setFilterAgent(agentId === filterAgent ? null : agentId)}
                className="text-xs h-7 gap-1.5"
              >
                <span className={`size-2 rounded-full ${c.dot}`} />
                {name}
              </Button>
            );
          })}
        </div>
      </div>

      {showCreate && (
        <div className="shrink-0 border-b border-border px-6 py-3 space-y-3">
          <div className="flex items-center gap-3">
            <select
              value={createAgent}
              onChange={(e) => setCreateAgent(e.target.value)}
              className="rounded-md border border-border bg-card px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {allAgents.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <input
              ref={titleRef}
              value={createTitle}
              onChange={(e) => setCreateTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) handleCreate();
                if (e.key === "Escape") setShowCreate(false);
              }}
              placeholder="Task title"
              className="flex-1 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
            />
          </div>
          <textarea
            value={createDesc}
            onChange={(e) => setCreateDesc(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.ctrlKey) handleCreate();
              if (e.key === "Escape") setShowCreate(false);
            }}
            placeholder="Description (optional)"
            rows={2}
            className="w-full rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={submitting || !createTitle.trim() || !createAgent}
              className="bg-sky-600 hover:bg-sky-700 text-white"
            >
              {submitting ? "Creating..." : "Create & dispatch"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setShowCreate(false); setCreateTitle(""); setCreateDesc(""); }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="flex-1 flex min-h-0 overflow-hidden">
        <div className="flex-1 flex gap-3 p-4 overflow-x-auto min-w-0">
          {COLUMNS.map((col) => {
            const colTasks = grouped.get(col.key) ?? [];
            return (
              <div
                key={col.key}
                className="flex-1 min-w-[240px] flex flex-col rounded-lg bg-muted/30 overflow-hidden"
              >
                <div className={`px-3 py-2.5 flex items-center gap-2 border-l-2 ${col.accent} shrink-0`}>
                  <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                    {col.label}
                  </span>
                  {colTasks.length > 0 && (
                    <Badge className="text-xs bg-muted text-muted-foreground h-5 px-1.5 border-transparent">
                      {colTasks.length}
                    </Badge>
                  )}
                </div>

                <ScrollArea className="flex-1 min-h-0">
                  <div className="p-2 space-y-2">
                    {colTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        agentName={task.agentName}
                        isSelected={selectedTask?.id === task.id}
                        onClick={() => setSelectedTask(task)}
                      />
                    ))}
                    {colTasks.length === 0 && (
                      <p className="text-xs text-muted-foreground/40 text-center py-8 italic">
                        All quiet in this sector
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </div>
            );
          })}
        </div>

        {selectedTask && (
          <TaskDetailPanel
            task={selectedTask}
            agentName={selectedTask.agentName}
            onClose={() => setSelectedTask(null)}
            onTaskChanged={fetchTasks}
          />
        )}
      </div>
    </div>
  );
}
