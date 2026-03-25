"use client";

import { useEffect, useState, useRef, use, useCallback } from "react";
import Link from "next/link";
import type {
  AgentTask,
  AgentTaskSettings,
  ApiResponse,
} from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TaskCard } from "@/components/task-card";
import { TaskDetailPanel } from "@/components/task-detail-panel";

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const COLUMNS: {
  key: string;
  label: string;
  accent: string;
  dot: string;
  statuses: string[];
}[] = [
  {
    key: "queued",
    label: "To-Do",
    accent: "border-l-muted-foreground",
    dot: "bg-muted-foreground",
    statuses: ["queued"],
  },
  {
    key: "running",
    label: "Running",
    accent: "border-l-sky-500",
    dot: "bg-sky-500",
    statuses: ["running"],
  },
  {
    key: "completed",
    label: "Done",
    accent: "border-l-emerald-500",
    dot: "bg-emerald-500",
    statuses: ["completed"],
  },
  {
    key: "failed",
    label: "Failed",
    accent: "border-l-red-500",
    dot: "bg-red-500",
    statuses: ["failed"],
  },
  {
    key: "cancelled",
    label: "Cancelled",
    accent: "border-l-zinc-500",
    dot: "bg-zinc-500",
    statuses: ["cancelled"],
  },
];



/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}



/* ------------------------------------------------------------------ */
/*  Inline SVG icons                                                  */
/* ------------------------------------------------------------------ */

function IconPlus() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <path d="M7 2v10M2 7h10" />
    </svg>
  );
}

function IconGear() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="7" cy="7" r="2.2" />
      <path d="M6.1 1.2h1.8l.4 1.3a4.5 4.5 0 0 1 1.1.6l1.3-.4 .9 1.6-1 .9a4.5 4.5 0 0 1 0 1.2l1 .9-.9 1.6-1.3-.4a4.5 4.5 0 0 1-1.1.6l-.4 1.3H6.1l-.4-1.3a4.5 4.5 0 0 1-1.1-.6l-1.3.4-.9-1.6 1-.9a4.5 4.5 0 0 1 0-1.2l-1-.9.9-1.6 1.3.4a4.5 4.5 0 0 1 1.1-.6z" />
    </svg>
  );
}

function IconX() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <path d="M2 2l10 10M12 2L2 12" />
    </svg>
  );
}

function IconBoard() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect
        x="2"
        y="4"
        width="14"
        height="10"
        rx="2"
        stroke="#52525b"
        strokeWidth="1.5"
      />
      <path
        d="M6 8h6M6 11h4"
        stroke="#52525b"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}



/* ------------------------------------------------------------------ */
/*  InlineCreateForm                                                  */
/* ------------------------------------------------------------------ */

function InlineCreateForm({
  agentId,
  onCreated,
  onCancel,
}: {
  agentId: string;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleCreate() {
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: desc.trim() || undefined,
        }),
      });
      if (res.ok) {
        setTitle("");
        setDesc("");
        onCreated();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-lg border border-sky-800/40 bg-card p-3 space-y-2">
      <input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) handleCreate();
          if (e.key === "Escape") onCancel();
        }}
        placeholder="Task title"
        className="w-full rounded bg-muted border border-border px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-sky-500"
      />
      <textarea
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && e.ctrlKey) handleCreate();
          if (e.key === "Escape") onCancel();
        }}
        placeholder="Description (optional)"
        rows={2}
        className="w-full rounded bg-muted border border-border px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-sky-500 resize-none"
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={handleCreate}
          disabled={submitting || !title.trim()}
          className="bg-sky-600 hover:bg-sky-700 text-white text-xs h-7"
        >
          {submitting ? "Creating\u2026" : "Create"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onCancel}
          className="text-xs h-7"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}



/* ------------------------------------------------------------------ */
/*  SettingsCard                                                      */
/* ------------------------------------------------------------------ */

function SettingsCard({
  agentId,
  settings,
  onSaved,
  onClose,
}: {
  agentId: string;
  settings: AgentTaskSettings;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [timeout, setTimeoutVal] = useState(settings.timeoutMinutes);
  const [retries, setRetries] = useState(settings.maxRetries);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await fetch(`/api/agents/${agentId}/task-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timeoutMinutes: timeout,
          maxRetries: retries,
        }),
      });
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4 space-y-3">
        <p className="text-xs font-medium text-foreground">Task Settings</p>
        <div className="flex items-center gap-3">
          <label className="text-xs text-muted-foreground w-24">Timeout</label>
          <input
            type="number"
            value={timeout}
            onChange={(e) => setTimeoutVal(parseInt(e.target.value) || 30)}
            min={1}
            className="w-20 rounded bg-muted border border-border px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
          <span className="text-xs text-muted-foreground">min</span>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs text-muted-foreground w-24">Max retries</label>
          <input
            type="number"
            value={retries}
            onChange={(e) => setRetries(parseInt(e.target.value) || 3)}
            min={0}
            max={10}
            className="w-20 rounded bg-muted border border-border px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="bg-sky-600 hover:bg-sky-700 text-white text-xs h-7"
          >
            {saving ? "Saving\u2026" : "Save"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onClose}
            className="text-xs h-7"
          >
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                              */
/* ------------------------------------------------------------------ */

export default function TasksPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = use(params);
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [settings, setSettings] = useState<AgentTaskSettings>({
    timeoutMinutes: 30,
    maxRetries: 3,
    maxConcurrent: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<AgentTask | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  /* Ref avoids stale closure in fetchTasks polling */
  const selectedRef = useRef(selectedTask);
  selectedRef.current = selectedTask;

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${agentId}/tasks`);
      const json = (await res.json()) as ApiResponse<AgentTask[]>;
      if (json.data) {
        setTasks(json.data);
        const sel = selectedRef.current;
        if (sel) {
          const updated = json.data.find((t) => t.id === sel.id);
          if (updated) setSelectedTask(updated);
          else setSelectedTask(null);
        }
      }
    } catch {
      setError("Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${agentId}/task-settings`);
      const json = (await res.json()) as ApiResponse<AgentTaskSettings>;
      if (json.data) setSettings(json.data);
    } catch {
      /* silent */
    }
  }, [agentId]);

  useEffect(() => {
    fetchTasks();
    fetchSettings();
  }, [fetchTasks, fetchSettings]);

  /* Auto-refresh when queued or running tasks exist */
  useEffect(() => {
    const hasActive = tasks.some(
      (t) => t.status === "queued" || t.status === "running",
    );
    if (!hasActive) return;
    const iv = setInterval(fetchTasks, 5000);
    return () => clearInterval(iv);
  }, [tasks, fetchTasks]);

  /* Group tasks into columns */
  const grouped = new Map<string, AgentTask[]>();
  for (const col of COLUMNS) {
    grouped.set(
      col.key,
      tasks.filter((t) => col.statuses.includes(t.status)),
    );
  }

  /* ---- Loading skeleton ---- */
  if (loading) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden p-6 gap-4">
        <Skeleton className="h-8 w-48 bg-muted rounded-lg shrink-0" />
        <div className="flex-1 flex gap-3 min-h-0">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex-1 space-y-3">
              <Skeleton className="h-9 w-full bg-muted/60 rounded-lg" />
              <Skeleton className="h-20 w-full bg-muted/40 rounded-lg" />
              <Skeleton className="h-20 w-full bg-muted/40 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ---- Empty state ---- */
  /* ---- Main board layout ---- */
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="px-5 py-2.5 flex items-center justify-between shrink-0 border-b border-border">
        <h3 className="text-sm font-medium text-muted-foreground">
          Tasks
          {tasks.length > 0 && (
            <span className="ml-2 text-xs text-muted-foreground/50">{tasks.length}</span>
          )}
        </h3>
        <button
          onClick={() => setShowSettings((v) => !v)}
          className={[
            "p-1.5 rounded transition-colors",
            showSettings
              ? "text-foreground bg-muted"
              : "text-muted-foreground hover:text-foreground hover:bg-muted",
          ].join(" ")}
          title="Task settings"
        >
          <IconGear />
        </button>
      </div>

      {/* Settings (conditionally above board) */}
      {showSettings && (
        <div className="px-4 pt-3 shrink-0">
          <SettingsCard
            agentId={agentId}
            settings={settings}
            onSaved={fetchSettings}
            onClose={() => setShowSettings(false)}
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-5 pt-2 shrink-0">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Board + optional detail panel */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Kanban columns */}
        <div className="flex-1 flex gap-3 p-4 overflow-x-auto min-w-0">
          {COLUMNS.map((col) => {
            const colTasks = grouped.get(col.key) ?? [];
            const isTodo = col.key === "queued";

            return (
              <div
                key={col.key}
                className="flex-1 min-w-[220px] flex flex-col rounded-lg bg-muted/30 overflow-hidden"
              >
                {/* Column header */}
                <div
                  className={`px-3 py-2.5 flex items-center gap-2 border-l-2 ${col.accent} shrink-0`}
                >
                  <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                    {col.label}
                  </span>
                  {colTasks.length > 0 && (
                    <Badge className="text-xs bg-muted text-muted-foreground h-4 px-1.5 border-transparent">
                      {colTasks.length}
                    </Badge>
                  )}
                  {isTodo && (
                    <button
                      onClick={() => setShowCreate((v) => !v)}
                      className="ml-auto text-muted-foreground/50 hover:text-foreground transition-colors p-0.5 rounded hover:bg-muted"
                      title="New task"
                    >
                      <IconPlus />
                    </button>
                  )}
                </div>

                {/* Column body — scrollable */}
                <ScrollArea className="flex-1 min-h-0">
                  <div className="p-2 space-y-2">
                    {/* Inline create form (only in To-Do column) */}
                    {isTodo && showCreate && (
                      <InlineCreateForm
                        agentId={agentId}
                        onCreated={() => {
                          setShowCreate(false);
                          fetchTasks();
                        }}
                        onCancel={() => setShowCreate(false)}
                      />
                    )}

                    {colTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        isSelected={selectedTask?.id === task.id}
                        onClick={() => setSelectedTask(task)}
                      />
                    ))}

                    {colTasks.length === 0 && !(isTodo && showCreate) && (
                      <div className="flex flex-col items-center gap-2 py-8">
                        <p className="text-xs text-muted-foreground/40">
                          {isTodo ? "Standing by for orders" : "All quiet in this sector"}
                        </p>
                        {isTodo && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowCreate(true)}
                            className="text-xs"
                          >
                            <IconPlus />
                            New task
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            );
          })}
        </div>

        {/* Detail side-panel */}
        {selectedTask && (
          <TaskDetailPanel
            task={selectedTask}
            onClose={() => setSelectedTask(null)}
            onTaskChanged={fetchTasks}
          />
        )}
      </div>
    </div>
  );
}
