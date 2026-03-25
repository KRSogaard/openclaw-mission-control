"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { getAgentColor } from "@/lib/utils";

export type TaskCardData = {
  id: string;
  agentId: string;
  title: string;
  statusMessage: string | null;
  retryCount: number;
  createdBy: string | null;
  createdAt: number;
};

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TaskCard({
  task,
  agentName,
  isSelected,
  onClick,
}: {
  task: TaskCardData;
  agentName?: string;
  isSelected: boolean;
  onClick: () => void;
}) {
  const color = getAgentColor(task.agentId);

  return (
    <div
      onClick={onClick}
      className={[
        "cursor-pointer rounded-lg border p-3 pl-4 transition-colors relative overflow-hidden",
        isSelected
          ? "bg-muted border-border ring-1 ring-ring"
          : "bg-card border-border hover:bg-muted/50",
      ].join(" ")}
    >
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${color.dot}`} />

      {agentName && (
        <div className="flex items-center gap-2 mb-1.5">
          <span className={`size-2 rounded-full shrink-0 ${color.dot}`} />
          <Link
            href={`/dashboard/${task.agentId}/tasks`}
            onClick={(e) => e.stopPropagation()}
            className={`text-xs font-medium ${color.text} hover:underline`}
          >
            {agentName}
          </Link>
        </div>
      )}

      <Link
        href={`/dashboard/${task.agentId}/tasks/${task.id}`}
        onClick={(e) => e.stopPropagation()}
        className="text-sm font-medium text-foreground hover:underline truncate block"
      >
        {task.title}
      </Link>

      {task.statusMessage && (
        <p className="mt-1 text-xs text-muted-foreground truncate">
          {task.statusMessage}
        </p>
      )}

      <div className="mt-2 flex items-center gap-1.5">
        {task.createdBy && (
          <span className="text-xs text-muted-foreground/50 truncate">
            by {task.createdBy}
          </span>
        )}
        <span className="text-xs text-muted-foreground/50 ml-auto shrink-0">
          {formatTime(task.createdAt)}
        </span>
        {task.retryCount > 0 && (
          <Badge className="text-xs bg-amber-900/40 text-amber-400 border-amber-800/40 h-4 px-1.5">
            &times;{task.retryCount}
          </Badge>
        )}
      </div>
    </div>
  );
}
