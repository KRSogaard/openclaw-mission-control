export const TASK_STATUS_BADGE: Record<string, string> = {
  queued: "bg-zinc-100 text-zinc-600 border border-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700",
  running: "bg-sky-100 text-sky-700 border border-sky-300 dark:bg-sky-900/50 dark:text-sky-400 dark:border-sky-700/50",
  completed: "bg-emerald-100 text-emerald-700 border border-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-400 dark:border-emerald-700/50",
  failed: "bg-red-100 text-red-700 border border-red-300 dark:bg-red-900/50 dark:text-red-400 dark:border-red-700/50",
  cancelled: "bg-zinc-100 text-zinc-500 border border-zinc-300 dark:bg-zinc-800 dark:text-zinc-500 dark:border-zinc-700",
};

export const TASK_STATUS_LABEL: Record<string, string> = {
  queued: "Queued",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

export const EVENT_DOT: Record<string, string> = {
  created: "bg-zinc-500",
  dispatched: "bg-sky-500",
  progress: "bg-sky-400",
  timeout_retry: "bg-amber-500",
  completed: "bg-emerald-500",
  failed: "bg-red-500",
  cancelled: "bg-zinc-500",
  retried: "bg-violet-500",
  resumed: "bg-sky-400",
  check_in: "bg-sky-400",
};
