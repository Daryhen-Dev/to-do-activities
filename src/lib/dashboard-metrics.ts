import type { Category, List, PlanningItem, Status } from "@prisma/client";

/**
 * Pure dashboard read-model. All dashboard numbers are derived here from a
 * snapshot of tasks + categories + lists + statuses, so the behavior is fully
 * unit-testable independent of React. The dashboard component is a thin
 * renderer over `computeDashboard`.
 *
 * Time buckets (overdue / due today / upcoming) are computed against the local
 * day boundaries derived from `now`, consistent with how the editor stores UTC
 * and renders in the browser timezone.
 */

/** Status keys that take a task out of the "open" set. */
const COMPLETED_KEY = "completado";
const CANCELLED_KEY = "cancelado";

/** How many days ahead "upcoming" looks (from the start of tomorrow). */
const UPCOMING_DAYS = 7;

export interface DashboardSummary {
  /** Open tasks (not completed, not cancelled). */
  open: number;
  /** Open tasks whose dueAt is before now. */
  overdue: number;
  /** Open tasks due or scheduled within the current local day. */
  dueToday: number;
  /** Open tasks due or scheduled within the next 7 days. */
  upcoming: number;
}

export interface CategoryStats extends DashboardSummary {
  categoryId: string;
  /** Completed tasks (status = completado). */
  completed: number;
  /** Open-task counts keyed by status id, for the per-status breakdown. */
  openByStatusId: Record<string, number>;
  /** This category's non-deleted lists, for navigation links. */
  lists: List[];
}

export interface DashboardData {
  summary: DashboardSummary;
  categories: CategoryStats[];
}

/** Parses a nullable Date | ISO string into a `Date`, or `null` when unset/invalid. */
function toDate(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Local midnight at the start of the day containing `now`. */
function startOfLocalDay(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** True when `value` is in the half-open interval `[start, end)`. */
function inRange(value: Date | null, start: Date, end: Date): boolean {
  if (!value) return false;
  const t = value.getTime();
  return t >= start.getTime() && t < end.getTime();
}

/** A blank per-category accumulator. */
function emptyStats(categoryId: string, lists: List[]): CategoryStats {
  return {
    categoryId,
    open: 0,
    overdue: 0,
    dueToday: 0,
    upcoming: 0,
    completed: 0,
    openByStatusId: {},
    lists,
  };
}

/**
 * Computes the global dashboard data from a snapshot of the user's tasks and
 * structure. Only tasks whose `listId` belongs to a list in `lists` are
 * counted, so a list removed from the caller's state (e.g. after deletion in
 * the sidebar) immediately drops its tasks from every count.
 */
export function computeDashboard(
  tasks: PlanningItem[],
  categories: Category[],
  lists: List[],
  statuses: Status[],
  now: Date,
): DashboardData {
  const completedId = statuses.find((s) => s.key === COMPLETED_KEY)?.id;
  const cancelledId = statuses.find((s) => s.key === CANCELLED_KEY)?.id;

  const startOfToday = startOfLocalDay(now);
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  const upcomingEnd = new Date(startOfTomorrow);
  upcomingEnd.setDate(upcomingEnd.getDate() + UPCOMING_DAYS);

  // categoryId -> its lists, and listId -> categoryId, both scoped to the
  // provided (live) lists so orphaned/deleted lists' tasks are excluded.
  const listsByCategory = new Map<string, List[]>();
  const categoryByListId = new Map<string, string>();
  for (const list of lists) {
    categoryByListId.set(list.id, list.categoryId);
    const bucket = listsByCategory.get(list.categoryId);
    if (bucket) bucket.push(list);
    else listsByCategory.set(list.categoryId, [list]);
  }

  // Seed a stats accumulator per category, preserving input order.
  const statsByCategory = new Map<string, CategoryStats>();
  for (const category of categories) {
    statsByCategory.set(
      category.id,
      emptyStats(category.id, listsByCategory.get(category.id) ?? []),
    );
  }

  for (const task of tasks) {
    const categoryId = categoryByListId.get(task.listId);
    if (!categoryId) continue; // task in a deleted/unknown list — excluded
    const stats = statsByCategory.get(categoryId);
    if (!stats) continue; // list under a category not in the input set

    const isCompleted =
      completedId !== undefined && task.statusId === completedId;
    const isCancelled =
      cancelledId !== undefined && task.statusId === cancelledId;

    if (isCompleted) {
      stats.completed += 1;
      continue;
    }
    if (isCancelled) continue; // cancelled: neither open nor completed

    // Open task from here on.
    stats.open += 1;
    stats.openByStatusId[task.statusId] =
      (stats.openByStatusId[task.statusId] ?? 0) + 1;

    const dueAt = toDate(task.dueAt);
    const startAt = toDate(task.startAt);

    if (dueAt && dueAt.getTime() < now.getTime()) {
      stats.overdue += 1;
    }
    if (
      inRange(dueAt, startOfToday, startOfTomorrow) ||
      inRange(startAt, startOfToday, startOfTomorrow)
    ) {
      stats.dueToday += 1;
    }
    if (
      inRange(dueAt, startOfTomorrow, upcomingEnd) ||
      inRange(startAt, startOfTomorrow, upcomingEnd)
    ) {
      stats.upcoming += 1;
    }
  }

  const categoryStats = categories.map(
    (category) => statsByCategory.get(category.id)!,
  );

  // Summary totals are the sums of the per-category values.
  const summary: DashboardSummary = categoryStats.reduce(
    (acc, s) => ({
      open: acc.open + s.open,
      overdue: acc.overdue + s.overdue,
      dueToday: acc.dueToday + s.dueToday,
      upcoming: acc.upcoming + s.upcoming,
    }),
    { open: 0, overdue: 0, dueToday: 0, upcoming: 0 },
  );

  return { summary, categories: categoryStats };
}
