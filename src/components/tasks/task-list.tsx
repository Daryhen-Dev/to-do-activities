"use client";

import type {
  Category,
  List,
  PlanningItem,
  Priority,
  Status,
} from "@prisma/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { CreateTaskForm } from "./create-task-form";
import { TaskItem } from "./task-item";
import type { TaskEditPayload } from "./task-edit-dialog";

const JSON_HEADERS = { "content-type": "application/json" };

interface TaskListProps {
  /** The list whose tasks are shown and to which new tasks are added. */
  listId: string;
}

async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

export function TaskList({ listId }: TaskListProps) {
  const [items, setItems] = useState<PlanningItem[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [loading, setLoading] = useState(true);
  const [hideCompleted, setHideCompleted] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const responses = await Promise.all([
          fetch("/api/planning-items"),
          fetch("/api/statuses"),
          fetch("/api/priorities"),
          fetch("/api/categories"),
          fetch("/api/lists"),
        ]);
        if (responses.some((res) => !res.ok)) {
          throw new Error("request failed");
        }
        const [itemsData, statusesData, prioritiesData, categoriesData, listsData] =
          (await Promise.all(responses.map((res) => res.json()))) as [
            PlanningItem[],
            Status[],
            Priority[],
            Category[],
            List[],
          ];
        if (!active) return;
        setItems(itemsData);
        setStatuses(statusesData);
        setPriorities(prioritiesData);
        setCategories(categoriesData);
        setLists(listsData);
      } catch {
        if (active) toast.error("Failed to load your tasks");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  const completedStatus = statuses.find((status) => status.key === "completado");
  const defaultStatus = statuses.find((status) => status.isDefault);
  const statusById = new Map(statuses.map((status) => [status.id, status]));
  const priorityById = new Map(
    priorities.map((priority) => [priority.id, priority]),
  );
  const listById = new Map(lists.map((list) => [list.id, list]));

  const isCompleted = (item: PlanningItem): boolean =>
    completedStatus !== undefined && item.statusId === completedStatus.id;

  const listItems = items.filter((item) => item.listId === listId);
  const visibleItems = listItems.filter(
    (item) => !(hideCompleted && isCompleted(item)),
  );

  async function handleCreate(title: string) {
    const res = await fetch("/api/planning-items", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ title, listId }),
    });
    if (!res.ok) {
      toast.error("Failed to add task");
      return;
    }
    const created = (await res.json()) as PlanningItem;
    setItems((prev) => [created, ...prev]);
  }

  async function handleToggleComplete(item: PlanningItem, completed: boolean) {
    const targetStatusId = completed ? completedStatus?.id : defaultStatus?.id;
    if (!targetStatusId) {
      toast.error("Status catalog is unavailable");
      return;
    }

    const previousStatusId = item.statusId;
    setItems((prev) =>
      prev.map((current) =>
        current.id === item.id
          ? { ...current, statusId: targetStatusId }
          : current,
      ),
    );

    const res = await fetch(`/api/planning-items/${item.id}`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ statusId: targetStatusId }),
    });
    if (!res.ok) {
      toast.error("Failed to update task");
      setItems((prev) =>
        prev.map((current) =>
          current.id === item.id
            ? { ...current, statusId: previousStatusId }
            : current,
        ),
      );
    }
  }

  async function handleUpdate(
    id: string,
    payload: TaskEditPayload,
  ): Promise<boolean> {
    const res = await fetch(`/api/planning-items/${id}`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      toast.error(await errorMessage(res, "Failed to update task"));
      return false;
    }
    const updated = (await res.json()) as PlanningItem;
    setItems((prev) =>
      prev.map((current) => (current.id === id ? updated : current)),
    );
    return true;
  }

  async function handleDelete(item: PlanningItem) {
    const snapshot = items;
    setItems((prev) => prev.filter((current) => current.id !== item.id));

    const res = await fetch(`/api/planning-items/${item.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("Failed to delete task");
      setItems(snapshot);
    }
  }

  return (
    <div className="grid gap-4">
      <CreateTaskForm onCreate={handleCreate} />

      {!loading && listItems.length > 0 ? (
        <div className="flex items-center justify-end">
          <Label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox
              checked={hideCompleted}
              onCheckedChange={(value) => setHideCompleted(value === true)}
            />
            Hide completed
          </Label>
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : listItems.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No tasks in this list yet. Add your first one above.
        </p>
      ) : visibleItems.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No tasks match the current filters.
        </p>
      ) : (
        <ul className="grid gap-2">
          {visibleItems.map((item) => (
            <TaskItem
              key={item.id}
              item={item}
              completed={isCompleted(item)}
              statusName={statusById.get(item.statusId)?.name}
              priorityName={
                item.priorityId
                  ? priorityById.get(item.priorityId)?.name
                  : undefined
              }
              listName={
                item.listId ? listById.get(item.listId)?.name : undefined
              }
              priorities={priorities}
              categories={categories}
              lists={lists}
              onToggleComplete={handleToggleComplete}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
