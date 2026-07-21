import type { PlanningItem } from "@prisma/client";

/**
 * Pure reminder helpers. No clock reads and no side effects: callers inject
 * "now" so the same inputs always produce the same output (unit-testable).
 * The authoritative "due" predicate lives in the repository (SQL, server
 * time); these helpers only support the client bell's toast-once bookkeeping
 * and relative-time labels.
 */

/**
 * Ids present in `due` that are NOT already in `knownIds` — i.e. reminders that
 * became due since the last poll and should be toasted exactly once. Duplicate
 * ids inside `due` are collapsed, so the same id is never returned twice.
 */
export function selectNewlyDueIds(
  knownIds: ReadonlySet<string>,
  due: readonly Pick<PlanningItem, "id">[],
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const { id } of due) {
    if (knownIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * Human-friendly label for a reminder time relative to `now`:
 * - within a minute → "just now"
 * - under an hour   → "N min ago" / "in N min"
 * - under a day     → "N h ago" / "in N h"
 * - otherwise       → an absolute short date-time (locale-formatted)
 *
 * `now` is injected so the label is deterministic for a given pair.
 */
export function formatReminderTime(remindAt: Date, now: Date): string {
  const diffMs = remindAt.getTime() - now.getTime();
  const past = diffMs < 0;
  const abs = Math.abs(diffMs);

  if (abs < MINUTE_MS) {
    return "just now";
  }
  if (abs < HOUR_MS) {
    const mins = Math.round(abs / MINUTE_MS);
    return past ? `${mins} min ago` : `in ${mins} min`;
  }
  if (abs < DAY_MS) {
    const hours = Math.round(abs / HOUR_MS);
    return past ? `${hours} h ago` : `in ${hours} h`;
  }
  return remindAt.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
