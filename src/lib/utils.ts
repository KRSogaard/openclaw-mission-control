import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Convert a JS Date (or timestamp) to a TNG-style stardate string.
 * Format: YYMMM.D  (2-digit year, fractional day-of-year, 1 decimal)
 * e.g. 26084.5 for March 25, 2026 at noon.
 * Purely cosmetic — not canon-accurate, just fun.
 */
export type AgentColor = {
  dot: string;
  text: string;
  border: string;
  bg: string;
  ring: string;
};

const AGENT_PALETTE: AgentColor[] = [
  { dot: "bg-amber-500",   text: "text-amber-400",   border: "border-amber-500/50",   bg: "bg-amber-500/5",   ring: "ring-amber-500/30" },
  { dot: "bg-teal-500",    text: "text-teal-400",    border: "border-teal-500/50",    bg: "bg-teal-500/5",    ring: "ring-teal-500/30" },
  { dot: "bg-violet-500",  text: "text-violet-400",  border: "border-violet-500/50",  bg: "bg-violet-500/5",  ring: "ring-violet-500/30" },
  { dot: "bg-rose-500",    text: "text-rose-400",    border: "border-rose-500/50",    bg: "bg-rose-500/5",    ring: "ring-rose-500/30" },
  { dot: "bg-cyan-500",    text: "text-cyan-400",    border: "border-cyan-500/50",    bg: "bg-cyan-500/5",    ring: "ring-cyan-500/30" },
  { dot: "bg-orange-500",  text: "text-orange-400",  border: "border-orange-500/50",  bg: "bg-orange-500/5",  ring: "ring-orange-500/30" },
  { dot: "bg-sky-500",     text: "text-sky-400",     border: "border-sky-500/50",     bg: "bg-sky-500/5",     ring: "ring-sky-500/30" },
  { dot: "bg-emerald-500", text: "text-emerald-400", border: "border-emerald-500/50", bg: "bg-emerald-500/5", ring: "ring-emerald-500/30" },
  { dot: "bg-fuchsia-500", text: "text-fuchsia-400", border: "border-fuchsia-500/50", bg: "bg-fuchsia-500/5", ring: "ring-fuchsia-500/30" },
  { dot: "bg-indigo-500",  text: "text-indigo-400",  border: "border-indigo-500/50",  bg: "bg-indigo-500/5",  ring: "ring-indigo-500/30" },
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(31, h) + s.charCodeAt(i) | 0;
  }
  return Math.abs(h);
}

export function getAgentColor(agentId: string): AgentColor {
  return AGENT_PALETTE[hashString(agentId) % AGENT_PALETTE.length];
}

export function toStardate(input?: Date | number): string {
  const d = input instanceof Date ? input : new Date(input ?? Date.now());
  const year = d.getFullYear() % 100;
  const start = new Date(d.getFullYear(), 0, 1);
  const dayOfYear = (d.getTime() - start.getTime()) / 86_400_000;
  return `${year}${dayOfYear.toFixed(1).padStart(5, "0")}`;
}
