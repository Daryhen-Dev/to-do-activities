import type { PlanningItem } from "@prisma/client";
import { generateOccurrences, normalizeDate, type RecurrenceRule } from "./habits";

/**
 * Pure reminder helpers. No clock reads and no side effects: callers inject
 * "now" so the same inputs always produce the same output (unit-testable).
 * The one-shot "due" predicate lives in the repository (SQL, server time);
 * the recurring-reminder due predicate is computed here from the recurrence
 * rule + the `reminderSeenAt` watermark. These helpers also support the client
 * bell's toast-once bookkeeping and relative-time labels.
 */

/**
 * One expanded recurring-reminder occurrence, serializable for the calendar's
 * reminder layer (`GET /api/calendar/reminder-occurrences`). The `date` is a
 * calendar-date string (`"YYYY-MM-DD"`, local); the client builds the anchored
 * `Date`. `timeMinutes === null` means an all-day (00:00) occurrence.
 */
export interface ReminderOccurrenceDTO {
  reminderId: string;
  title: string;
  description: string | null;
  itemTypeId: string;
  date: string;
  timeMinutes: number | null;
  categoryId: string;
  categoryName: string;
  categoryColor: string | null;
}

/** Bounded lookback for "current occurrence" (covers interval ≤ 365 + weekday). */
const OCCURRENCE_LOOKBACK_DAYS = 400;

/** A new date `days` after `date` (local, DST-safe via setDate). */
function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** True when the rule schedules a recurrence (at least one weekday or interval). */
export function hasRecurrenceRule(rule: RecurrenceRule): boolean {
  return rule.days.length > 0 || rule.interval != null;
}

/**
 * The LOCAL instant of an occurrence: its normalized date at `timeMinutes`
 * (or 00:00 when null).
 */
export function reminderOccurrenceInstant(
  date: Date,
  timeMinutes: number | null,
): Date {
  const day = normalizeDate(date);
  const minutes = timeMinutes ?? 0;
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    Math.floor(minutes / 60),
    minutes % 60,
  );
}

/**
 * The instant of the most recent occurrence at or before `now`, or null when the
 * rule schedules none within a bounded lookback. Pure — bounded window, no clock
 * read.
 */
export function currentReminderOccurrence(
  rule: RecurrenceRule,
  now: Date,
): Date | null {
  const today = normalizeDate(now);
  const from = addDays(today, -OCCURRENCE_LOOKBACK_DAYS);
  const to = addDays(today, 1); // half-open; includes today
  let latest: Date | null = null;
  for (const occurrence of generateOccurrences(rule, from, to)) {
    const instant = reminderOccurrenceInstant(occurrence, rule.timeMinutes);
    if (
      instant.getTime() <= now.getTime() &&
      (latest === null || instant.getTime() > latest.getTime())
    ) {
      latest = instant;
    }
  }
  return latest;
}

/**
 * True when a recurring reminder is due: its current occurrence exists and the
 * `reminderSeenAt` watermark is null or strictly earlier than that occurrence's
 * instant.
 */
export function isRecurringReminderDue(
  rule: RecurrenceRule,
  reminderSeenAt: Date | null,
  now: Date,
): boolean {
  const occurrence = currentReminderOccurrence(rule, now);
  if (occurrence === null) return false;
  return (
    reminderSeenAt === null ||
    reminderSeenAt.getTime() < occurrence.getTime()
  );
}

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
