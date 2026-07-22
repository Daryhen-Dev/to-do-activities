"use client";

import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { HabitViewModel } from "@/lib/habits";
import { useItemTypeStore } from "@/stores/item-type-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { HabitCard } from "./habit-card";
import { HabitFormDialog, type HabitFormPayload } from "./habit-form-dialog";

const JSON_HEADERS = { "content-type": "application/json" };

/** Extracts the API's `{ error }` message, falling back to a default. */
async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

/** Today's local calendar date as "YYYY-MM-DD". */
function todayKey(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * The Habits view: a stack of habit cards, each with its streak, weekly
 * adherence, and a mark-today control. Reads from `GET /api/habits`;
 * create/edit/archive reuse `/api/planning-items`, and marking an occurrence
 * uses `POST`/`DELETE /api/habits/[id]/completions`. Marking today is optimistic
 * (instant feedback) then reconciled from the server so streak/weekly stay
 * authoritative. Mirrors the objectives/notes views.
 */
export function HabitsView() {
  const categories = useWorkspaceStore((state) => state.categories);
  const lists = useWorkspaceStore((state) => state.lists);
  const ensureWorkspaceLoaded = useWorkspaceStore((state) => state.ensureLoaded);
  const ensureItemTypesLoaded = useItemTypeStore((state) => state.ensureLoaded);
  const itemTypes = useItemTypeStore((state) => state.itemTypes);

  const [habits, setHabits] = useState<HabitViewModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const habitoTypeId = useMemo(
    () => itemTypes.find((type) => type.key === "habito")?.id ?? "",
    [itemTypes],
  );

  useEffect(() => {
    void ensureWorkspaceLoaded();
    void ensureItemTypesLoaded();
  }, [ensureWorkspaceLoaded, ensureItemTypesLoaded]);

  /**
   * Silently re-fetches the habits (no loading flag), keeping the prior list on
   * error (Requirement 7.8). Used to reconcile after a mutation.
   */
  async function reload(): Promise<void> {
    try {
      const res = await fetch("/api/habits");
      if (!res.ok) throw new Error("request failed");
      setHabits((await res.json()) as HabitViewModel[]);
      setLoadError(false);
    } catch {
      // Keep the current list; a transient reconcile failure is non-fatal.
    }
  }

  useEffect(() => {
    let active = true;
    async function initialLoad() {
      try {
        const res = await fetch("/api/habits");
        if (!res.ok) throw new Error("request failed");
        const data = (await res.json()) as HabitViewModel[];
        if (active) {
          setHabits(data);
          setLoadError(false);
        }
      } catch {
        if (active) {
          setLoadError(true);
          toast.error("Failed to load your habits");
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void initialLoad();
    return () => {
      active = false;
    };
  }, []);

  async function handleCreate(payload: HabitFormPayload): Promise<boolean> {
    const res = await fetch("/api/planning-items", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        title: payload.title,
        listId: payload.listId,
        itemTypeId: habitoTypeId,
        recurrenceDays: payload.recurrenceDays,
        ...(payload.description ? { description: payload.description } : {}),
        ...(payload.recurrenceTimeMinutes != null
          ? { recurrenceTimeMinutes: payload.recurrenceTimeMinutes }
          : {}),
        ...(payload.recurrenceInterval != null
          ? { recurrenceInterval: payload.recurrenceInterval }
          : {}),
      }),
    });
    if (!res.ok) {
      toast.error(await errorMessage(res, "Failed to create habit"));
      return false;
    }
    await reload();
    return true;
  }

  async function handleUpdate(
    id: string,
    payload: HabitFormPayload,
  ): Promise<boolean> {
    const res = await fetch(`/api/planning-items/${id}`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        title: payload.title,
        description: payload.description,
        listId: payload.listId,
        recurrenceDays: payload.recurrenceDays,
        recurrenceTimeMinutes: payload.recurrenceTimeMinutes,
        recurrenceInterval: payload.recurrenceInterval,
      }),
    });
    if (!res.ok) {
      toast.error(await errorMessage(res, "Failed to update habit"));
      return false;
    }
    await reload();
    return true;
  }

  async function handleDelete(habit: HabitViewModel): Promise<void> {
    const snapshot = habits;
    setHabits((prev) => prev.filter((h) => h.id !== habit.id));
    const res = await fetch(`/api/planning-items/${habit.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("Failed to delete habit");
      setHabits(snapshot);
    }
  }

  async function handleToggleToday(habit: HabitViewModel): Promise<void> {
    const snapshot = habits;
    const nextDone = !habit.completedToday;
    // Optimistic: flip today's completion and nudge streak/weekly for instant
    // feedback; the server response reconciles the exact values.
    setHabits((prev) =>
      prev.map((h) =>
        h.id === habit.id
          ? {
              ...h,
              completedToday: nextDone,
              streak: Math.max(0, h.streak + (nextDone ? 1 : -1)),
              weekly: {
                ...h.weekly,
                completed: Math.max(
                  0,
                  Math.min(
                    h.weekly.total,
                    h.weekly.completed + (nextDone ? 1 : -1),
                  ),
                ),
              },
            }
          : h,
      ),
    );

    const res = await fetch(`/api/habits/${habit.id}/completions`, {
      method: nextDone ? "POST" : "DELETE",
      headers: JSON_HEADERS,
      body: JSON.stringify({ date: todayKey() }),
    });
    if (!res.ok) {
      toast.error("Failed to update today's completion");
      setHabits(snapshot);
      return;
    }
    // Reconcile the exact streak/weekly from the server.
    await reload();
  }

  const hasLists = lists.length > 0;

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-end">
        <HabitFormDialog
          mode="create"
          categories={categories}
          lists={lists}
          onSubmit={handleCreate}
          trigger={
            <Button disabled={!hasLists}>
              <Plus />
              New habit
            </Button>
          }
        />
      </div>

      {!hasLists ? (
        <p className="text-sm text-muted-foreground">
          Create a list first — habits live in a section (a list within a
          category).
        </p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : loadError && habits.length === 0 ? (
        <p className="text-sm text-destructive">
          Couldn&rsquo;t load your habits. Please try again.
        </p>
      ) : habits.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No habits yet. Create your first one.
        </p>
      ) : (
        <div className="grid gap-3">
          {habits.map((habit) => (
            <HabitCard
              key={habit.id}
              habit={habit}
              categories={categories}
              lists={lists}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              onToggleToday={handleToggleToday}
            />
          ))}
        </div>
      )}
    </div>
  );
}
