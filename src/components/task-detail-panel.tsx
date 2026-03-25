"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { TaskEvent, ApiResponse } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getAgentColor } from "@/lib/utils";
import { formatDateTime, formatTimeOnly } from "@/lib/format";
import { TASK_STATUS_BADGE, TASK_STATUS_LABEL, EVENT_DOT } from "@/lib/constants";
import { IconX } from "@/components/icons";

export type DetailPanelTask = {
  id: string;
  agentId: string;
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

export function TaskDetailPanel({
  task,
  agentName,
  onClose,
  onTaskChanged,
}: {
  task: DetailPanelTask;
  agentName?: string;
  onClose: () => void;
  onTaskChanged?: () => void;
}) {
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const color = getAgentColor(task.agentId);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/agents/${task.agentId}/tasks/${task.id}/events`,
      );
      const json = (await res.json()) as ApiResponse<TaskEvent[]>;
      if (json.data) setEvents(json.data);
    } catch {
      /* silent */
    } finally {
      setLoadingEvents(false);
    }
  }, [task.agentId, task.id]);

  useEffect(() => {
    setLoadingEvents(true);
    fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isActive = task.status === "queued" || task.status === "running";
  const isTerminal = task.status === "completed" || task.status === "failed" || task.status === "cancelled";

  async function handleAction(action: string, body?: Record<string, string>) {
    await fetch(`/api/agents/${task.agentId}/tasks/${task.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...body }),
    });
    await fetchEvents();
    onTaskChanged?.();
  }

  async function handleDelete() {
    await fetch(`/api/agents/${task.agentId}/tasks/${task.id}`, {
      method: "DELETE",
    });
    onClose();
    onTaskChanged?.();
  }

  return (
    <div className="w-96 shrink-0 border-l border-border bg-background flex flex-col overflow-hidden">
      <ScrollArea className="flex-1 min-h-0">
        {/* Header */}
        <div className="p-4 flex items-start gap-3">
          <div className="flex-1 min-w-0 space-y-1">
            {agentName && (
              <div className="flex items-center gap-2">
                <span className={`size-2 rounded-full shrink-0 ${color.dot}`} />
                <Link
                  href={`/dashboard/${task.agentId}/tasks`}
                  className={`text-xs font-medium ${color.text} hover:underline`}
                >
                  {agentName}
                </Link>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground truncate">
                {task.title}
              </span>
              <Badge
                className={`text-xs shrink-0 ml-auto $                {TASK_STATUS_BADGE[task.status] ?? "bg-zinc-600"}`}
              >
                {TASK_STATUS_LABEL[task.status] ?? task.status}
              </Badge>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-muted"
          >
            <IconX />
          </button>
        </div>

        {/* View details link */}
        <div className="px-4 pb-3">
          <Link
            href={`/dashboard/${task.agentId}/tasks/${task.id}`}
            className="inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 transition-colors"
          >
            View details
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4.5 2.5l4 3.5-4 3.5" />
            </svg>
          </Link>
        </div>

        <Separator className="bg-border" />

        {/* Description */}
        {task.description && (
          <>
            <div className="p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                Description
              </p>
              <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {task.description}
              </p>
            </div>
            <Separator className="bg-border" />
          </>
        )}

        {/* Metadata */}
        <div className="p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
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
            <span className="text-foreground">{formatDateTime(task.createdAt)}</span>
            <span className="text-muted-foreground">Updated</span>
            <span className="text-foreground">{formatDateTime(task.updatedAt)}</span>
            <span className="text-muted-foreground">Retries</span>
            <span className="text-foreground">{task.retryCount}</span>
          </div>
        </div>

        <Separator className="bg-border" />

        {/* Response */}
        {task.response && (
          <>
            <div className="p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
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

        {isActive && (
          <>
            <div className="p-4 flex flex-wrap gap-2">
              {task.status === "running" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleAction("check-in")}
                  className="text-xs"
                >
                  Check in
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleAction("complete", { result: "Manually completed by operator" })}
                className="text-xs"
              >
                Mark complete
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (window.confirm("Cancel this task?")) handleAction("cancel");
                }}
                className="text-red-400 hover:text-red-300 hover:bg-red-950/30 text-xs"
              >
                Cancel
              </Button>
            </div>
            <Separator className="bg-border" />
          </>
        )}

        {isTerminal && (
          <>
            <div className="p-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleAction("retry")}
                className="text-xs"
              >
                Retry
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (window.confirm("Permanently delete this task and its log?")) handleDelete();
                }}
                className="text-red-400 hover:text-red-300 hover:bg-red-950/30 text-xs"
              >
                Delete
              </Button>
            </div>
            <Separator className="bg-border" />
          </>
        )}

        {/* Captain's Log */}
        <div className="p-4 pb-6">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
            Captain&apos;s Log
          </p>

          {loadingEvents ? (
            <div className="space-y-3">
              <Skeleton className="h-5 w-3/4 bg-muted rounded" />
              <Skeleton className="h-5 w-1/2 bg-muted rounded" />
              <Skeleton className="h-5 w-2/3 bg-muted rounded" />
            </div>
          ) : events.length === 0 ? (
            <p className="text-xs text-muted-foreground/50 italic">No log entries recorded</p>
          ) : (
            <div>
              {events.map((ev, idx) => (
                <div key={ev.id} className="flex gap-3 pb-4 last:pb-0">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-2 h-2 rounded-full shrink-0 mt-1 ${EVENT_DOT[ev.event] ?? "bg-zinc-500"}`}
                    />
                    {idx < events.length - 1 && (
                      <div className="w-px flex-1 bg-border mt-1" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-medium text-foreground">
                        {ev.event.replace(/_/g, " ")}
                      </span>
                      <span className="text-xs text-muted-foreground/50 ml-auto shrink-0">
                        {formatTimeOnly(ev.timestamp)}
                      </span>
                    </div>
                    {ev.message && (
                      <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                        {ev.message}
                      </p>
                    )}
                    {ev.actor && (
                      <p className="mt-0.5 text-xs text-muted-foreground/50">
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
