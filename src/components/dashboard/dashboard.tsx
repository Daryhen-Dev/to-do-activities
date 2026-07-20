"use client";

import type { PlanningItem, Status } from "@prisma/client";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { computeDashboard } from "@/lib/dashboard-metrics";
import { useWorkspaceStore } from "@/stores/workspace-store";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoryCard } from "./category-card";
import { SummaryStrip } from "./summary-strip";

/**
 * Global dashboard. Reads the categories/lists tree from the shared workspace
 * store and fetches tasks + statuses locally, then delegates all number
 * crunching to `computeDashboard` (the single source of truth for metrics) and
 * renders a thin view over the result.
 */
export function Dashboard() {
  const categories = useWorkspaceStore((state) => state.categories);
  const lists = useWorkspaceStore((state) => state.lists);
  const workspaceStatus = useWorkspaceStore((state) => state.status);
  const ensureLoaded = useWorkspaceStore((state) => state.ensureLoaded);

  const [tasks, setTasks] = useState<PlanningItem[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void ensureLoaded();
  }, [ensureLoaded]);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const responses = await Promise.all([
          fetch("/api/planning-items"),
          fetch("/api/statuses"),
        ]);
        if (responses.some((res) => !res.ok)) {
          throw new Error("request failed");
        }
        const [tasksData, statusesData] = (await Promise.all(
          responses.map((res) => res.json()),
        )) as [PlanningItem[], Status[]];
        if (!active) return;
        setTasks(tasksData);
        setStatuses(statusesData);
      } catch {
        if (active) toast.error("Failed to load your dashboard");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  const data = useMemo(
    () => computeDashboard(tasks, categories, lists, statuses, new Date()),
    [tasks, categories, lists, statuses],
  );

  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  const storeReady = workspaceStatus === "ready" || workspaceStatus === "error";
  const isLoading = loading || !storeReady;

  return (
    <div className="grid gap-6">
      <h1 className="font-heading text-2xl font-semibold">Dashboard</h1>

      {isLoading ? (
        <DashboardSkeleton />
      ) : categories.length === 0 ? (
        <Card>
          <CardContent className="grid gap-2 py-8 text-center">
            <p className="text-base font-medium">No categories yet</p>
            <p className="text-sm text-muted-foreground">
              Create a category and a list from the sidebar to start tracking
              your tasks. Your dashboard will fill in as you go.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <SummaryStrip summary={data.summary} />
          <div className="grid gap-4">
            {data.categories.map((stats) => {
              const category = categoryById.get(stats.categoryId);
              if (!category) return null;
              return (
                <CategoryCard
                  key={stats.categoryId}
                  category={category}
                  stats={stats}
                  statuses={statuses}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/** Placeholder shown while the store hydrates or tasks/statuses are loading. */
function DashboardSkeleton() {
  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} size="sm">
            <CardContent className="grid gap-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-7 w-10" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4">
        {Array.from({ length: 2 }).map((_, index) => (
          <Card key={index}>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent className="grid gap-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
