"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { ApiResponse } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

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

const AGENT_COLORS = [
  { bg: "bg-sky-900/40", border: "border-sky-700/50", text: "text-sky-400", dot: "bg-sky-500" },
  { bg: "bg-violet-900/40", border: "border-violet-700/50", text: "text-violet-400", dot: "bg-violet-500" },
  { bg: "bg-amber-900/40", border: "border-amber-700/50", text: "text-amber-400", dot: "bg-amber-500" },
  { bg: "bg-emerald-900/40", border: "border-emerald-700/50", text: "text-emerald-400", dot: "bg-emerald-500" },
  { bg: "bg-rose-900/40", border: "border-rose-700/50", text: "text-rose-400", dot: "bg-rose-500" },
  { bg: "bg-cyan-900/40", border: "border-cyan-700/50", text: "text-cyan-400", dot: "bg-cyan-500" },
  { bg: "bg-orange-900/40", border: "border-orange-700/50", text: "text-orange-400", dot: "bg-orange-500" },
  { bg: "bg-pink-900/40", border: "border-pink-700/50", text: "text-pink-400", dot: "bg-pink-500" },
  { bg: "bg-teal-900/40", border: "border-teal-700/50", text: "text-teal-400", dot: "bg-teal-500" },
  { bg: "bg-indigo-900/40", border: "border-indigo-700/50", text: "text-indigo-400", dot: "bg-indigo-500" },
];

function getAgentColor(agentId: string, colorMap: Map<string, number>): typeof AGENT_COLORS[0] {
  if (!colorMap.has(agentId)) {
    colorMap.set(agentId, colorMap.size % AGENT_COLORS.length);
  }
  return AGENT_COLORS[colorMap.get(agentId)!];
}

const STATUS_BADGE: Record<string, string> = {
  queued: "bg-zinc-800 text-zinc-300 border border-zinc-700",
  running: "bg-sky-900/50 text-sky-400 border border-sky-700/50",
  completed: "bg-emerald-900/50 text-emerald-400 border border-emerald-700/50",
  failed: "bg-red-900/50 text-red-400 border border-red-700/50",
  cancelled: "bg-zinc-800 text-zinc-500 border border-zinc-700",
};

const STATUS_LABEL: Record<string, string> = {
  queued: "Queued",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

const COLUMNS = [
  { key: "queued", label: "To-Do", accent: "border-l-zinc-500" },
  { key: "running", label: "Running", accent: "border-l-sky-500" },
  { key: "completed", label: "Done", accent: "border-l-emerald-500" },
  { key: "failed", label: "Failed", accent: "border-l-red-500" },
];

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TaskCard({
  task,
  color,
  isSelected,
  onClick,
}: {
  task: GlobalTask;
  color: typeof AGENT_COLORS[0];
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <Card
      className={`cursor-pointer transition-colors ${isSelected ? "ring-1 ring-ring" : "hover:bg-muted/30"}`}
      onClick={onClick}
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className={`size-2 rounded-full shrink-0 ${color.dot}`} />
          <Link
            href={`/dashboard/${task.agentId}/tasks`}
            onClick={(e) => e.stopPropagation()}
            className={`text-xs font-medium ${color.text} hover:underline`}
          >
            {task.agentName}
          </Link>
          {task.retryCount > 0 && (
            <span className="text-xs text-muted-foreground">retry {task.retryCount}</span>
          )}
          <span className="ml-auto text-xs text-muted-foreground shrink-0">
            {formatTime(task.createdAt)}
          </span>
        </div>
        <p className="text-sm font-medium text-foreground">{task.title}</p>
        {task.statusMessage && (
          <p className="text-xs text-muted-foreground truncate">{task.statusMessage}</p>
        )}
        {task.createdBy && (
          <span className="text-xs text-muted-foreground/50">by {task.createdBy}</span>
        )}
      </CardContent>
    </Card>
  );
}

export default function GlobalTasksPage() {
  const [tasks, setTasks] = useState<GlobalTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<GlobalTask | null>(null);
  const [filterAgent, setFilterAgent] = useState<string | null>(null);
  const colorMap = useState(() => new Map<string, number>())[0];

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
    fetchTasks();
    const hasActive = tasks.some((t) => t.status === "queued" || t.status === "running");
    const interval = setInterval(fetchTasks, hasActive ? 5000 : 15000);
    return () => clearInterval(interval);
  }, [fetchTasks, tasks.length]);

  const agents = [...new Set(tasks.map((t) => t.agentId))].sort();
  const filtered = filterAgent ? tasks.filter((t) => t.agentId === filterAgent) : tasks;

  const grouped = new Map<string, GlobalTask[]>();
  for (const col of COLUMNS) grouped.set(col.key, []);
  for (const task of filtered) {
    const key = task.status === "cancelled" ? "failed" : task.status;
    const arr = grouped.get(key);
    if (arr) arr.push(task);
  }

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
            const c = getAgentColor(agentId, colorMap);
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

      <div className="flex flex-1 gap-3 p-4 overflow-x-auto min-h-0">
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
                      color={getAgentColor(task.agentId, colorMap)}
                      isSelected={selectedTask?.id === task.id}
                      onClick={() => setSelectedTask(task)}
                    />
                  ))}
                  {colTasks.length === 0 && (
                    <p className="text-xs text-muted-foreground/40 text-center py-8">
                      No tasks
                    </p>
                  )}
                </div>
              </ScrollArea>
            </div>
          );
        })}
      </div>

      {selectedTask && (
        <div className="shrink-0 border-t border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-2">
                <span className={`size-2.5 rounded-full ${getAgentColor(selectedTask.agentId, colorMap).dot}`} />
                <Link
                  href={`/dashboard/${selectedTask.agentId}/tasks`}
                  className={`text-sm font-medium ${getAgentColor(selectedTask.agentId, colorMap).text} hover:underline`}
                >
                  {selectedTask.agentName}
                </Link>
                <Badge className={STATUS_BADGE[selectedTask.status] ?? STATUS_BADGE.queued}>
                  {STATUS_LABEL[selectedTask.status] ?? selectedTask.status}
                </Badge>
                <span className="text-xs text-muted-foreground">{formatTime(selectedTask.createdAt)}</span>
                {selectedTask.createdBy && (
                  <span className="text-xs text-muted-foreground/50">by {selectedTask.createdBy}</span>
                )}
              </div>
              <p className="text-sm font-medium text-foreground">{selectedTask.title}</p>
              {selectedTask.description && (
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">{selectedTask.description}</p>
              )}
              {selectedTask.response && (
                <div className="rounded bg-muted/50 p-2">
                  <p className="text-xs text-muted-foreground mb-1">Response</p>
                  <p className="text-xs text-foreground whitespace-pre-wrap">{selectedTask.response}</p>
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedTask(null)}
              className="shrink-0 text-muted-foreground"
            >
              &times;
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
