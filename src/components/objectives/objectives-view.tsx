"use client";

import type { PlanningItem } from "@prisma/client";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { clampProgress, type ObjectiveWithCategory } from "@/lib/objectives";
import { useItemTypeStore } from "@/stores/item-type-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { ObjectiveCard } from "./objective-card";
import {
  ObjectiveFormDialog,
  type ObjectiveFormPayload,
} from "./objective-form-dialog";

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

/** Deadline ascending, with no-deadline objectives last. */
function byDeadline(a: ObjectiveWithCategory, b: ObjectiveWithCategory): number {
  const ae = a.objectiveEndAt
    ? new Date(a.objectiveEndAt).getTime()
    : Number.POSITIVE_INFINITY;
  const be = b.objectiveEndAt
    ? new Date(b.objectiveEndAt).getTime()
    : Number.POSITIVE_INFINITY;
  return ae - be;
}

/**
 * The Objectives view: a stack of progress-bar cards ordered by deadline.
 * Objectives are `objetivo`-type planning items with a dedicated timeframe +
 * progress. Reads from `GET /api/objectives`; create/edit/delete/progress reuse
 * `/api/planning-items`. Local state + optimistic mutations, mirroring notes.
 */
export function ObjectivesView() {
  const categories = useWorkspaceStore((state) => state.categories);
  const lists = useWorkspaceStore((state) => state.lists);
  const ensureWorkspaceLoaded = useWorkspaceStore((state) => state.ensureLoaded);
  const ensureItemTypesLoaded = useItemTypeStore((state) => state.ensureLoaded);
  const itemTypes = useItemTypeStore((state) => state.itemTypes);

  const [objectives, setObjectives] = useState<ObjectiveWithCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const objetivoTypeId = useMemo(
    () => itemTypes.find((type) => type.key === "objetivo")?.id ?? "",
    [itemTypes],
  );

  useEffect(() => {
    void ensureWorkspaceLoaded();
    void ensureItemTypesLoaded();
  }, [ensureWorkspaceLoaded, ensureItemTypesLoaded]);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await fetch("/api/objectives");
        if (!res.ok) throw new Error("request failed");
        const data = (await res.json()) as ObjectiveWithCategory[];
        if (active) setObjectives(data);
      } catch {
        if (active) toast.error("Failed to load your objectives");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  /** Attaches the owning category and re-sorts the stack by deadline. */
  function upsert(item: PlanningItem): void {
    const list = lists.find((l) => l.id === item.listId);
    const category = list
      ? categories.find((c) => c.id === list.categoryId)
      : undefined;
    if (!category) return;
    const objective: ObjectiveWithCategory = {
      ...item,
      categoryId: category.id,
      categoryName: category.name,
      categoryColor: category.color,
    };
    setObjectives((prev) => {
      const without = prev.filter((o) => o.id !== objective.id);
      return [...without, objective].sort(byDeadline);
    });
  }

  async function handleCreate(payload: ObjectiveFormPayload): Promise<boolean> {
    const res = await fetch("/api/planning-items", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        title: payload.title,
        listId: payload.listId,
        itemTypeId: objetivoTypeId,
        progress: payload.progress,
        ...(payload.description ? { description: payload.description } : {}),
        ...(payload.objectiveStartAt
          ? { objectiveStartAt: payload.objectiveStartAt }
          : {}),
        ...(payload.objectiveEndAt
          ? { objectiveEndAt: payload.objectiveEndAt }
          : {}),
        ...(payload.remindAt ? { remindAt: payload.remindAt } : {}),
      }),
    });
    if (!res.ok) {
      toast.error(await errorMessage(res, "Failed to create objective"));
      return false;
    }
    upsert((await res.json()) as PlanningItem);
    return true;
  }

  async function handleUpdate(
    id: string,
    payload: ObjectiveFormPayload,
  ): Promise<boolean> {
    const res = await fetch(`/api/planning-items/${id}`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        title: payload.title,
        description: payload.description,
        listId: payload.listId,
        objectiveStartAt: payload.objectiveStartAt,
        objectiveEndAt: payload.objectiveEndAt,
        progress: payload.progress,
        remindAt: payload.remindAt,
      }),
    });
    if (!res.ok) {
      toast.error(await errorMessage(res, "Failed to update objective"));
      return false;
    }
    upsert((await res.json()) as PlanningItem);
    return true;
  }

  async function handleDelete(objective: ObjectiveWithCategory): Promise<void> {
    const snapshot = objectives;
    setObjectives((prev) => prev.filter((o) => o.id !== objective.id));
    const res = await fetch(`/api/planning-items/${objective.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("Failed to delete objective");
      setObjectives(snapshot);
    }
  }

  async function handleProgressCommit(
    id: string,
    progress: number,
  ): Promise<void> {
    const snapshot = objectives;
    const value = clampProgress(progress);
    setObjectives((prev) =>
      prev.map((o) => (o.id === id ? { ...o, progress: value } : o)),
    );
    const res = await fetch(`/api/planning-items/${id}`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ progress: value }),
    });
    if (!res.ok) {
      toast.error("Failed to update progress");
      setObjectives(snapshot);
    }
  }

  const hasLists = lists.length > 0;

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-end">
        <ObjectiveFormDialog
          mode="create"
          categories={categories}
          lists={lists}
          onSubmit={handleCreate}
          trigger={
            <Button disabled={!hasLists}>
              <Plus />
              New objective
            </Button>
          }
        />
      </div>

      {!hasLists ? (
        <p className="text-sm text-muted-foreground">
          Create a list first — objectives live in a section (a list within a
          category).
        </p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : objectives.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No objectives yet. Create your first one.
        </p>
      ) : (
        <div className="grid gap-3">
          {objectives.map((objective) => (
            <ObjectiveCard
              key={objective.id}
              objective={objective}
              categories={categories}
              lists={lists}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              onProgressCommit={handleProgressCommit}
            />
          ))}
        </div>
      )}
    </div>
  );
}
