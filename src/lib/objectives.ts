import type { PlanningItem } from "@prisma/client";

/**
 * Pure helpers for the Objectives view. An objective is an `objetivo`-type
 * `PlanningItem` with a dedicated timeframe (`objectiveStartAt` →
 * `objectiveEndAt`) and a manual `progress` (0–100). These helpers are free of
 * React and I/O so they are fully unit-testable; `now` is always injected.
 */

export type ObjectiveStatus = "completed" | "overdue" | "no-deadline" | "active";

/** An objective enriched with its owning category (the section). */
export interface ObjectiveWithCategory extends PlanningItem {
  categoryId: string;
  categoryName: string;
  categoryColor: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Local midnight at the start of `date`'s day. */
function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Signed whole number of local calendar days from `now` to `endAt` (both
 * reduced to start-of-day): 0 on the deadline day, positive when the deadline is
 * ahead, negative once it has passed. Returns null when there is no deadline.
 */
export function daysRemaining(endAt: Date | null, now: Date): number | null {
  if (!endAt) return null;
  const diff = startOfDay(endAt).getTime() - startOfDay(now).getTime();
  return Math.round(diff / DAY_MS);
}

/** Rounds and clamps an arbitrary number into the 0–100 progress range. */
export function clampProgress(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Objective status from progress + deadline relative to `now`:
 * progress ≥ 100 → "completed" (regardless of deadline); else no deadline →
 * "no-deadline"; else deadline before today → "overdue"; else "active".
 * A null progress is treated as 0.
 */
export function objectiveStatus(
  endAt: Date | null,
  progress: number | null,
  now: Date,
): ObjectiveStatus {
  if ((progress ?? 0) >= 100) return "completed";
  if (!endAt) return "no-deadline";
  const remaining = daysRemaining(endAt, now);
  if (remaining !== null && remaining < 0) return "overdue";
  return "active";
}
