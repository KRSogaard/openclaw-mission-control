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
export function toStardate(input?: Date | number): string {
  const d = input instanceof Date ? input : new Date(input ?? Date.now());
  const year = d.getFullYear() % 100;
  const start = new Date(d.getFullYear(), 0, 1);
  const dayOfYear = (d.getTime() - start.getTime()) / 86_400_000;
  return `${year}${dayOfYear.toFixed(1).padStart(5, "0")}`;
}
