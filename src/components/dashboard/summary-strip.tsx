import type { DashboardSummary } from "@/lib/dashboard-metrics";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface SummaryStripProps {
  /** The global, cross-category totals to display. */
  summary: DashboardSummary;
}

interface Metric {
  label: string;
  value: number;
  /** Emphasize this metric (e.g. overdue) with destructive styling. */
  emphasized?: boolean;
}

/**
 * Presentational strip of the four global totals. Every metric is always
 * rendered, even when its value is zero (Requirement 2.5), so the layout stays
 * stable and the user can see they have nothing overdue rather than nothing at
 * all. Overdue is visually emphasized.
 */
export function SummaryStrip({ summary }: SummaryStripProps) {
  const metrics: Metric[] = [
    { label: "Open", value: summary.open },
    { label: "Overdue", value: summary.overdue, emphasized: true },
    { label: "Due today", value: summary.dueToday },
    { label: "Upcoming", value: summary.upcoming },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {metrics.map((metric) => (
        <Card key={metric.label} size="sm">
          <CardContent className="grid gap-1">
            <span className="text-sm text-muted-foreground">
              {metric.label}
            </span>
            <span
              className={cn(
                "text-2xl font-semibold tabular-nums",
                metric.emphasized && metric.value > 0 && "text-destructive",
              )}
            >
              {metric.value}
            </span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
