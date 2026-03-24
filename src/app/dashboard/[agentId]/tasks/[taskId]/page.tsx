"use client";

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import type { AgentTask, AgentTaskSettings, TaskEvent, ApiResponse } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type ChatMessage = {
  role: "user" | "assistant" | "toolResult";
  text: string;
  toolUse?: Array<{ tool: string; input: string }>;
  toolError?: string;
  timestamp?: number;
};

const STATUS_BADGE: Record<string, string> = {
  queued: "bg-zinc-800 text-zinc-300 border border-zinc-700",
  running: "bg-sky-900/50 text-sky-400 border border-sky-700/50",
  completed: "bg-emerald-900/50 text-emerald-400 border border-emerald-700/50",
  failed: "bg-red-900/50 text-red-400 border border-red-700/50",
  cancelled: "bg-zinc-800 text-zinc-500 border border-zinc-700",
};

const EVENT_DOT: Record<string, string> = {
  created: "bg-zinc-500",
  dispatched: "bg-sky-500",
  progress: "bg-sky-400",
  timeout_retry: "bg-amber-500",
  completed: "bg-emerald-500",
  failed: "bg-red-500",
  cancelled: "bg-zinc-500",
  retried: "bg-violet-500",
  resumed: "bg-sky-400",
};

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return `${Math.floor(diff / 86400_000)}d ago`;
}

export default function TaskDetailPage({
  params,
}: {
  params: Promise<{ agentId: string; taskId: string }>;
}) {
  const { agentId, taskId } = use(params);
  const [task, setTask] = useState<AgentTask | null>(null);
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [settings, setSettings] = useState<AgentTaskSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [chatLoading, setChatLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const fetchTask = useCallback(async () => {
    try {
      const [taskRes, eventsRes, settingsRes] = await Promise.all([
        fetch(`/api/agents/${agentId}/tasks/${taskId}`),
        fetch(`/api/agents/${agentId}/tasks/${taskId}/events`),
        fetch(`/api/agents/${agentId}/task-settings`),
      ]);
      const taskJson = (await taskRes.json()) as ApiResponse<AgentTask>;
      const eventsJson = (await eventsRes.json()) as ApiResponse<TaskEvent[]>;
      const settingsJson = (await settingsRes.json()) as ApiResponse<AgentTaskSettings>;
      if (taskJson.data) setTask(taskJson.data);
      if (eventsJson.data) setEvents(eventsJson.data);
      if (settingsJson.data) setSettings(settingsJson.data);
    } finally {
      setLoading(false);
    }
  }, [agentId, taskId]);

  const fetchChat = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${agentId}/tasks/${taskId}/chat`);
      const json = (await res.json()) as ApiResponse<ChatMessage[]>;
      if (json.data) setChat(json.data);
    } finally {
      setChatLoading(false);
    }
  }, [agentId, taskId]);

  useEffect(() => {
    fetchTask();
    fetchChat();
  }, [fetchTask, fetchChat]);

  useEffect(() => {
    if (!task) return;
    if (task.status !== "queued" && task.status !== "running") return;
    const interval = setInterval(() => { fetchTask(); fetchChat(); }, 5000);
    return () => clearInterval(interval);
  }, [task?.status, fetchTask, fetchChat]);

  async function handleCheckIn() {
    setActing(true);
    try {
      await fetch(`/api/agents/${agentId}/tasks/${taskId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "check-in" }),
      });
      await fetchTask();
      await fetchChat();
    } finally {
      setActing(false);
    }
  }

  async function handleRetry() {
    setActing(true);
    try {
      await fetch(`/api/agents/${agentId}/tasks/${taskId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry" }),
      });
      await fetchTask();
      await fetchChat();
    } finally {
      setActing(false);
    }
  }

  async function handleComplete() {
    const result = window.prompt("Completion note (optional):");
    if (result === null) return;
    setActing(true);
    try {
      await fetch(`/api/agents/${agentId}/tasks/${taskId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete", result: result || "Manually completed by operator" }),
      });
      await fetchTask();
    } finally {
      setActing(false);
    }
  }

  async function handleCancel() {
    if (!window.confirm("Cancel this task?")) return;
    setActing(true);
    try {
      await fetch(`/api/agents/${agentId}/tasks/${taskId}`, { method: "DELETE" });
      await fetchTask();
    } finally {
      setActing(false);
    }
  }

  if (loading) {
    return (
      <div className="h-full overflow-y-auto p-6 space-y-4">
        <Skeleton className="h-8 w-64 bg-muted" />
        <Skeleton className="h-40 w-full bg-muted rounded-xl" />
        <Skeleton className="h-60 w-full bg-muted rounded-xl" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Task not found</p>
      </div>
    );
  }

  const isActive = task.status === "queued" || task.status === "running";
  const isDone = task.status === "completed" || task.status === "failed" || task.status === "cancelled";

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/dashboard/${agentId}/tasks`}>
          <Button variant="ghost" size="sm">
            <svg className="size-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
            Tasks
          </Button>
        </Link>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-foreground">{task.title}</h1>
          <Badge className={STATUS_BADGE[task.status] ?? STATUS_BADGE.queued}>
            {task.status}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>Created {formatTime(task.createdAt)}</span>
          {task.createdBy && <span>by {task.createdBy}</span>}
          <span>Updated {formatRelative(task.updatedAt)}</span>
          {task.retryCount > 0 && settings && (
            <Badge variant="outline" className="text-xs">
              {task.retryCount} / {settings.maxRetries} retries
              {task.retryCount >= settings.maxRetries ? " (max reached)" : ` (${settings.maxRetries - task.retryCount} left)`}
            </Badge>
          )}
          {task.retryCount === 0 && settings && isActive && (
            <span className="text-muted-foreground/50">{settings.maxRetries} retries available &middot; {settings.timeoutMinutes}m timeout</span>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        {task.status === "running" && (
          <Button size="sm" variant="outline" onClick={handleCheckIn} disabled={acting}>
            Check in
          </Button>
        )}
        {isDone && (
          <Button size="sm" variant="outline" onClick={handleRetry} disabled={acting}>
            Retry
          </Button>
        )}
        {isActive && (
          <Button size="sm" variant="outline" onClick={handleComplete} disabled={acting}>
            Mark complete
          </Button>
        )}
        {isActive && (
          <Button size="sm" variant="outline" onClick={handleCancel} disabled={acting}
            className="text-red-400 border-red-700/50 hover:bg-red-900/30"
          >
            Cancel
          </Button>
        )}
      </div>

      {task.description && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm text-foreground">Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{task.description}</p>
          </CardContent>
        </Card>
      )}

      {task.response && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm text-foreground">Result</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-foreground whitespace-pre-wrap">{task.response}</p>
          </CardContent>
        </Card>
      )}

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-sm text-foreground">Audit Log</CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events recorded</p>
          ) : (
            <div className="relative pl-6 space-y-3">
              <div className="absolute left-[9px] top-1 bottom-1 w-px bg-border" />
              {events.map((event) => (
                <div key={event.id} className="relative flex items-start gap-3">
                  <div className={`absolute left-[-15px] top-1.5 size-2.5 rounded-full ${EVENT_DOT[event.event] ?? "bg-zinc-500"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{event.event}</span>
                      {event.actor && <span className="text-xs text-muted-foreground">{event.actor}</span>}
                      <span className="ml-auto text-xs text-muted-foreground shrink-0">{formatTime(event.timestamp)}</span>
                    </div>
                    {event.message && (
                      <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{event.message}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-sm text-foreground">Conversation</CardTitle>
        </CardHeader>
        <CardContent>
          {chatLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 bg-muted rounded-md" />
              <Skeleton className="h-24 bg-muted rounded-md" />
            </div>
          ) : chat.length === 0 ? (
            <p className="text-sm text-muted-foreground">No conversation yet — task hasn&apos;t been dispatched</p>
          ) : (
            <div className="space-y-3">
              {chat.map((msg, i) => (
                <div key={i} className={`rounded-lg p-3 ${
                  msg.role === "user"
                    ? "bg-sky-900/20 border border-sky-800/30"
                    : msg.role === "toolResult"
                      ? msg.toolError
                        ? "bg-red-900/20 border border-red-800/30"
                        : "bg-zinc-800/50 border border-zinc-700/30"
                      : "bg-muted/50 border border-border"
                }`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-xs">
                      {msg.role === "user" ? "Control Center" : msg.role === "assistant" ? "Agent" : "Tool Result"}
                    </Badge>
                    {msg.toolError && (
                      <Badge className="bg-red-900/50 text-red-400 border border-red-700/50 text-xs">error</Badge>
                    )}
                    {msg.timestamp && (
                      <span className="ml-auto text-xs text-muted-foreground shrink-0">{formatTime(msg.timestamp)}</span>
                    )}
                  </div>
                  {msg.text && (
                    <p className="text-sm text-foreground whitespace-pre-wrap">{msg.text}</p>
                  )}
                  {msg.toolUse && msg.toolUse.map((tu, j) => (
                    <div key={j} className="mt-2 rounded bg-background/50 p-2 border border-border">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs font-mono">{tu.tool}</Badge>
                      </div>
                      <pre className="text-xs text-muted-foreground overflow-x-auto whitespace-pre-wrap">{tu.input}</pre>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
