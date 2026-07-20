import type { Category, Status } from "@prisma/client";
import Link from "next/link";

import type { CategoryStats } from "@/lib/dashboard-metrics";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface CategoryCardProps {
  /** The category this card summarizes (used for its display name). */
  category: Category;
  /** Precomputed stats for the category (from `computeDashboard`). */
  stats: CategoryStats;
  /** Status catalog, used to resolve human names for the breakdown. */
  statuses: Status[];
}

interface CountEntry {
  label: string;
  value: number;
  emphasized?: boolean;
}

/**
 * Presentational card for a single category. Renders the headline counts, a
 * per-status breakdown of open tasks (statuses with zero are skipped), and
 * navigation links to each of the category's lists. When the category has no
 * tasks at all it shows a neutral message (Requirement 3.5) but still renders
 * the card and its list links.
 */
export function CategoryCard({ category, stats, statuses }: CategoryCardProps) {
  const counts: CountEntry[] = [
    { label: "Open", value: stats.open },
    { label: "Completed", value: stats.completed },
    { label: "Overdue", value: stats.overdue, emphasized: true },
    { label: "Upcoming", value: stats.upcoming },
  ];

  const statusName = new Map(statuses.map((status) => [status.id, status.name]));

  // Only open statuses with a positive count, mapped to human names.
  const breakdown = Object.entries(stats.openByStatusId)
    .filter(([, value]) => value > 0)
    .map(([statusId, value]) => ({
      statusId,
      name: statusName.get(statusId) ?? "Unknown",
      value,
    }));

  const hasTasks =
    stats.open > 0 ||
    stats.completed > 0 ||
    Object.keys(stats.openByStatusId).length > 0;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle>{category.name}</CardTitle>
        <Link
          href={`/categories/${category.id}/calendar`}
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          Calendar
        </Link>
      </CardHeader>
      <CardContent className="grid gap-4">
        {hasTasks ? (
          <>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {counts.map((count) => (
                <div key={count.label} className="grid gap-0.5">
                  <dt className="text-xs text-muted-foreground">
                    {count.label}
                  </dt>
                  <dd
                    className={
                      count.emphasized && count.value > 0
                        ? "text-lg font-semibold tabular-nums text-destructive"
                        : "text-lg font-semibold tabular-nums"
                    }
                  >
                    {count.value}
                  </dd>
                </div>
              ))}
            </dl>

            {breakdown.length > 0 ? (
              <div className="grid gap-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Open by status
                </span>
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {breakdown.map((entry) => (
                    <li key={entry.statusId} className="text-muted-foreground">
                      {entry.name}
                      <span className="ml-1 font-medium text-foreground tabular-nums">
                        {entry.value}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No tasks yet.</p>
        )}

        {stats.lists.length > 0 ? (
          <div className="grid gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              Lists
            </span>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {stats.lists.map((list) => (
                <li key={list.id}>
                  <Link
                    href={`/lists/${list.id}`}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {list.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
