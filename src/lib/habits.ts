import type { PlanningItem } from "@prisma/client";

/**
 * Pure recurrence logic for the Habits feature. A habit is a `habito`-type
 * `PlanningItem` carrying a structured recurrence rule (days-of-week +
 * time-of-day + optional "every N days" interval) in dedicated columns.
 * Occurrences are computed from the rule over a half-open date window and are
 * NEVER materialized as rows. Adherence (a streak and a weekly ratio) is
 * computed from the completion set versus the schedule.
 *
 * Everything here is free of React and I/O and fully deterministic: `now` and
 * `today` are always injected. All date math is LOCAL (mirrors calendar.ts /
 * objectives.ts).
 */

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** The structured recurrence rule, read off a habit's dedicated columns. */
export interface RecurrenceRule {
  /** Distinct, ascending ISO weekdays (1..7); empty when the rule is interval-only. */
  days: IsoWeekday[];
  /** "Every N days" from the anchor; null when the rule is weekday-only. */
  interval: number | null;
  /** Local date the interval counts from (already normalized to midnight). */
  anchor: Date;
  /** Minutes since local midnight (0..1439); null when unset. */
  timeMinutes: number | null;
}

export interface WeeklyAdherence {
  completed: number; // numerator
  total: number; // denominator
}

/** A habit enriched with its owning category + computed adherence (view model). */
export interface HabitWithAdherence extends PlanningItem {
  categoryId: string;
  categoryName: string;
  categoryColor: string | null;
  rule: RecurrenceRule;
  streak: number;
  weekly: WeeklyAdherence;
  /** Whether today is a scheduled occurrence (drives the mark-today control). */
  scheduledToday: boolean;
  /** Whether today's occurrence has a completion. */
  completedToday: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Bounded lookback for streak computation (defensive perf cap): 10 years. */
const STREAK_LOOKBACK_DAYS = 365 * 10;

/** Local midnight at the start of `date`'s day. */
export function normalizeDate(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Reads a Postgres `@db.Date` value (Prisma returns it as UTC midnight) as a
 * LOCAL-midnight `Date` of the same calendar day. Keeps all recurrence math in
 * local terms regardless of the server timezone.
 */
export function fromDbDate(date: Date): Date {
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * Converts a LOCAL-midnight (or any local) `Date` into the UTC-midnight `Date`
 * of the same calendar day, suitable for persisting into a `@db.Date` column so
 * it round-trips through `fromDbDate` unchanged.
 */
export function toDbDate(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

/** Builds the calendar-date key set from stored `@db.Date` completion rows. */
export function completedKeysFromRows(
  completions: readonly { date: Date }[],
): Set<string> {
  return new Set(completions.map((c) => dateKey(fromDbDate(c.date))));
}

/** A new date `days` after `date` (local, DST-safe via setDate). */
function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Whole local calendar days from `a` to `b` (both reduced to start-of-day). */
function wholeDaysBetween(a: Date, b: Date): number {
  const diff = normalizeDate(b).getTime() - normalizeDate(a).getTime();
  return Math.round(diff / DAY_MS);
}

/** JS getDay() (0=Sun..6=Sat) → ISO (1=Mon..7=Sun). Single conversion point. */
export function isoWeekday(date: Date): IsoWeekday {
  const d = date.getDay();
  return (d === 0 ? 7 : d) as IsoWeekday;
}

/** Canonical string key for a normalized date, e.g. "2026-07-20" (local). */
export function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** minutes-since-midnight → { hours, minutes }. */
export function minutesToHm(min: number): { hours: number; minutes: number } {
  return { hours: Math.floor(min / 60), minutes: min % 60 };
}

/** { hours, minutes } → minutes-since-midnight (0..1439). */
export function hmToMinutes(hours: number, minutes: number): number {
  return hours * 60 + minutes;
}

/** Effective anchor: explicit rule anchor, else normalized `createdAt`. */
export function resolveAnchor(anchor: Date | null, createdAt: Date): Date {
  return normalizeDate(anchor ?? createdAt);
}

/** Distinct, ascending subset of ISO weekdays. */
export function normalizeDays(days: readonly number[]): IsoWeekday[] {
  return Array.from(new Set(days))
    .filter((d) => d >= 1 && d <= 7)
    .sort((a, b) => a - b) as IsoWeekday[];
}

/**
 * Reads the rule off a habit row; normalizes days (distinct, ascending) and
 * resolves the interval anchor. `recurrenceAnchor` is a `@db.Date` (UTC
 * midnight), so it is read through `fromDbDate`; `createdAt` is a timestamp and
 * is normalized locally.
 */
export function ruleFromItem(item: PlanningItem): RecurrenceRule {
  return {
    days: normalizeDays(item.recurrenceDays ?? []),
    interval: item.recurrenceInterval ?? null,
    anchor: item.recurrenceAnchor
      ? fromDbDate(item.recurrenceAnchor)
      : normalizeDate(item.createdAt),
    timeMinutes: item.recurrenceTimeMinutes ?? null,
  };
}

/** A habit row enriched with its owning category + its completions (repo shape). */
export interface HabitWithCompletions extends PlanningItem {
  categoryId: string;
  categoryName: string;
  categoryColor: string | null;
  completions: { date: Date }[];
}

/**
 * Client-facing, JSON-serializable view of a habit (the shape the Habits view
 * consumes from `GET /api/habits`). Only the fields the UI needs; `rule` carries
 * just the parts the edit form and schedule display require.
 */
export interface HabitViewModel {
  id: string;
  title: string;
  description: string | null;
  listId: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string | null;
  streak: number;
  weekly: WeeklyAdherence;
  scheduledToday: boolean;
  completedToday: boolean;
  rule: {
    days: number[];
    interval: number | null;
    timeMinutes: number | null;
  };
}

/**
 * True when `date` (reduced to its local day) is scheduled by `rule`.
 * Weekday-only, interval-only, and combined (AND) rules are all supported.
 * A rule with neither a weekday nor a valid interval schedules nothing.
 */
export function isScheduledOn(rule: RecurrenceRule, date: Date): boolean {
  const hasDays = rule.days.length > 0;
  const hasInterval = rule.interval != null && rule.interval >= 1;
  if (!hasDays && !hasInterval) return false;

  const day = normalizeDate(date);

  const dayOk = !hasDays || rule.days.includes(isoWeekday(day));
  if (!dayOk) return false;

  if (hasInterval) {
    const delta = wholeDaysBetween(rule.anchor, day);
    if (delta < 0 || delta % (rule.interval as number) !== 0) return false;
  }
  return true;
}

/**
 * Ordered, de-duplicated normalized dates the rule schedules in `[from, to)`.
 * Pure: identical inputs → identical output; never touches the DB. Returns []
 * when `from >= to`, when no date in the window qualifies, or when an interval
 * `< 1` is supplied (defensive; validation already forbids it).
 */
export function generateOccurrences(
  rule: RecurrenceRule,
  from: Date,
  to: Date,
): Date[] {
  const occurrences: Date[] = [];
  if (from.getTime() >= to.getTime()) return occurrences;
  if (rule.interval != null && rule.interval < 1) return occurrences;

  let cursor = normalizeDate(from);
  const toTime = to.getTime();
  const fromTime = from.getTime();
  while (cursor.getTime() < toTime) {
    if (cursor.getTime() >= fromTime && isScheduledOn(rule, cursor)) {
      occurrences.push(cursor);
    }
    cursor = addDays(cursor, 1);
  }
  return occurrences;
}

/**
 * Consecutive completed scheduled occurrences ending at the most recent
 * scheduled occurrence dated on/before `today`. 0 when there is no such
 * occurrence or the most recent one is not completed. `completedKeys` is the
 * set of `dateKey` values that have a completion.
 */
export function computeStreak(
  rule: RecurrenceRule,
  completedKeys: ReadonlySet<string>,
  today: Date,
): number {
  const todayStart = normalizeDate(today);
  const lowerBound = addDays(todayStart, -STREAK_LOOKBACK_DAYS);
  // Include today: window upper bound is exclusive, so add one day.
  const scheduled = generateOccurrences(
    rule,
    lowerBound,
    addDays(todayStart, 1),
  );
  if (scheduled.length === 0) return 0;

  let streak = 0;
  for (let i = scheduled.length - 1; i >= 0; i -= 1) {
    if (completedKeys.has(dateKey(scheduled[i]))) {
      streak += 1;
    } else {
      break;
    }
  }
  return streak;
}

/** Local Monday 00:00 that starts the week containing `date`. */
function startOfIsoWeek(date: Date): Date {
  const start = normalizeDate(date);
  const offset = (start.getDay() - 1 + 7) % 7; // days since Monday
  return addDays(start, -offset);
}

/**
 * "X of Y" for the current week (Mon 00:00 inclusive → next Mon 00:00
 * exclusive, local). `completed ≤ total` always; both 0 when the week has no
 * scheduled occurrence.
 */
export function computeWeeklyAdherence(
  rule: RecurrenceRule,
  completedKeys: ReadonlySet<string>,
  now: Date,
): WeeklyAdherence {
  const weekStart = startOfIsoWeek(now);
  const weekEnd = addDays(weekStart, 7);
  const scheduled = generateOccurrences(rule, weekStart, weekEnd);
  let completed = 0;
  for (const occ of scheduled) {
    if (completedKeys.has(dateKey(occ))) completed += 1;
  }
  return { completed, total: scheduled.length };
}
