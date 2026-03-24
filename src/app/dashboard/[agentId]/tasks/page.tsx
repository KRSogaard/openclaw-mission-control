"use client";

import { useEffect, useState, useRef, use, useCallback } from "react";
import type {
  AgentTask,
  AgentTaskSettings,
  TaskEvent,
  ApiResponse,
} from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

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
    statuses: ["failed", "cancelled"],
  },
];

const STATUS_BADGE: Record<string, string> = {
  queued: "bg-zinc-600",
  running: "bg-sky-600",
  completed: "bg-emerald-600",
  failed: "bg-red-600",
  cancelled: "bg-muted text-muted-foreground",
};

const STATUS_LABEL: Record<string, string> = {
  queued: "Queued",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

const EVENT_DOT: Record<string, string> = {
  created: "bg-zinc-500",
  dispatched: "bg-sky-500",
  progress: "bg-sky-500",
  timeout_retry: "bg-amber-500",
  completed: "bg-emerald-500",
  failed: "bg-red-500",
  cancelled: "bg-zinc-500",
};

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

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
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
/*  TaskCard                                                          */
/* ------------------------------------------------------------------ */

function TaskCard({
  task,
  isSelected,
  onClick,
}: {
  task: AgentTask;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={[
        "cursor-pointer rounded-lg border p-3 transition-colors",
        isSelected
          ? "bg-muted border-border"
          : "bg-card border-border hover:bg-muted",
      ].join(" ")}
    >
      <h4 className="text-sm font-medium text-foreground truncate">
        {task.title}
      </h4>
      {task.statusMessage && (
        <p className="mt-1 text-xs text-muted-foreground truncate">
          {task.statusMessage}
        </p>
      )}
      <div className="mt-2 flex items-center gap-1.5">
        {task.createdBy && (
          <span className="text-[10px] text-muted-foreground/50 truncate">
            {task.createdBy}
          </span>
        )}
        <span className="text-[10px] text-muted-foreground/50 ml-auto shrink-0">
          {fmtDate(task.createdAt)}
        </span>
        {task.retryCount > 0 && (
          <Badge className="text-[10px] bg-amber-900/40 text-amber-400 border-amber-800/40 h-4 px-1.5">
            ×{task.retryCount}
          </Badge>
        )}
      </div>
    </div>
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
/*  DetailPanel (right side-panel with audit log)                     */
/* ------------------------------------------------------------------ */

function DetailPanel({
  task,
  agentId,
  onClose,
  onCancel,
}: {
  task: AgentTask;
  agentId: string;
  onClose: () => void;
  onCancel: (id: string) => void;
}) {
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);

  /* Fetch audit events */
  useEffect(() => {
    let dead = false;
    async function load() {
      setLoadingEvents(true);
      try {
        const res = await fetch(
          `/api/agents/${agentId}/tasks/${task.id}/events`,
        );
        const json = (await res.json()) as ApiResponse<TaskEvent[]>;
        if (!dead && json.data) setEvents(json.data);
      } catch {
        /* silent */
      } finally {
        if (!dead) setLoadingEvents(false);
      }
    }
    load();
    return () => {
      dead = true;
    };
  }, [agentId, task.id]);

  /* Escape to close */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isActive = task.status === "queued" || task.status === "running";

  return (
    <div className="w-96 shrink-0 border-l border-border bg-background flex flex-col overflow-hidden">
      <ScrollArea className="flex-1 min-h-0">
        {/* ---- Header ---- */}
        <div className="p-4 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-foreground">{task.title}</h3>
            <Badge
              className={`mt-1.5 text-[10px] ${STATUS_BADGE[task.status] ?? "bg-zinc-600"}`}
            >
              {STATUS_LABEL[task.status] ?? task.status}
            </Badge>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-muted"
          >
            <IconX />
          </button>
        </div>

        <Separator className="bg-border" />

        {/* ---- Description ---- */}
        {task.description && (
          <>
            <div className="p-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                Description
              </p>
              <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {task.description}
              </p>
            </div>
            <Separator className="bg-border" />
          </>
        )}

        {/* ---- Metadata ---- */}
        <div className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            Details
          </p>
          <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
            {task.createdBy && (
              <>
                <span className="text-muted-foreground">Created by</span>
                <span className="text-foreground">{task.createdBy}</span>
              </>
            )}
            <span className="text-muted-foreground">Created</span>
            <span className="text-foreground">{fmtDate(task.createdAt)}</span>
            <span className="text-muted-foreground">Updated</span>
            <span className="text-foreground">{fmtDate(task.updatedAt)}</span>
            <span className="text-muted-foreground">Retries</span>
            <span className="text-foreground">{task.retryCount}</span>
          </div>
        </div>

        <Separator className="bg-border" />

        {/* ---- Response ---- */}
        {task.response && (
          <>
            <div className="p-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                Response
              </p>
              <div className="rounded-lg bg-card border border-border p-3">
                <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                  {task.response}
                </p>
              </div>
            </div>
            <Separator className="bg-border" />
          </>
        )}

        {/* ---- Cancel action ---- */}
        {isActive && (
          <>
            <div className="p-4">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (window.confirm("Cancel this task?")) onCancel(task.id);
                }}
                className="text-red-400 hover:text-red-300 hover:bg-red-950/30 text-xs"
              >
                Cancel task
              </Button>
            </div>
            <Separator className="bg-border" />
          </>
        )}

        {/* ---- Audit log ---- */}
        <div className="p-4 pb-6">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">
            Audit Log
          </p>

          {loadingEvents ? (
            <div className="space-y-3">
              <Skeleton className="h-5 w-3/4 bg-muted rounded" />
              <Skeleton className="h-5 w-1/2 bg-muted rounded" />
              <Skeleton className="h-5 w-2/3 bg-muted rounded" />
            </div>
          ) : events.length === 0 ? (
            <p className="text-xs text-muted-foreground/50">No events recorded</p>
          ) : (
            <div>
              {events.map((ev, idx) => (
                <div key={ev.id} className="flex gap-3 pb-4 last:pb-0">
                  {/* Timeline spine */}
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-2 h-2 rounded-full shrink-0 mt-1 ${EVENT_DOT[ev.event] ?? "bg-zinc-500"}`}
                    />
                    {idx < events.length - 1 && (
                      <div className="w-px flex-1 bg-border mt-1" />
                    )}
                  </div>
                  {/* Event content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-medium text-foreground">
                        {ev.event.replace(/_/g, " ")}
                      </span>
                      <span className="text-[10px] text-muted-foreground/50 ml-auto shrink-0">
                        {fmtTime(ev.timestamp)}
                      </span>
                    </div>
                    {ev.message && (
                      <p className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed">
                        {ev.message}
                      </p>
                    )}
                    {ev.actor && (
                      <p className="mt-0.5 text-[10px] text-muted-foreground/50">
                        {ev.actor}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
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
          <span className="text-[10px] text-muted-foreground">min</span>
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

  async function handleCancel(taskId: string) {
    await fetch(`/api/agents/${agentId}/tasks/${taskId}`, { method: "DELETE" });
    if (selectedRef.current?.id === taskId) setSelectedTask(null);
    await fetchTasks();
  }

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
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                    {col.label}
                  </span>
                  {colTasks.length > 0 && (
                    <Badge className="text-[10px] bg-muted text-muted-foreground h-4 px-1.5 border-transparent">
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
                      <p className="text-[11px] text-muted-foreground/40 text-center py-8">
                        No tasks
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </div>
            );
          })}
        </div>

        {/* Detail side-panel */}
        {selectedTask && (
          <DetailPanel
            task={selectedTask}
            agentId={agentId}
            onClose={() => setSelectedTask(null)}
            onCancel={handleCancel}
          />
        )}
      </div>
    </div>
  );
}
