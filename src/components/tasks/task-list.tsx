"use client";

import type { PlanningItem, Priority, Status } from "@prisma/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { CreateTaskForm } from "./create-task-form";
import { TaskItem } from "./task-item";
import type { TaskEditPayload } from "./task-edit-dialog";

const JSON_HEADERS = { "content-type": "application/json" };

async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

export function TaskList() {
  const [items, setItems] = useState<PlanningItem[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [itemsRes, statusesRes, prioritiesRes] = await Promise.all([
          fetch("/api/planning-items"),
          fetch("/api/statuses"),
          fetch("/api/priorities"),
        ]);
        if (!itemsRes.ok || !statusesRes.ok || !prioritiesRes.ok) {
          throw new Error("request failed");
        }
        const [itemsData, statusesData, prioritiesData] = (await Promise.all([
          itemsRes.json(),
          statusesRes.json(),
          prioritiesRes.json(),
        ])) as [PlanningItem[], Status[], Priority[]];
        if (!active) return;
        setItems(itemsData);
        setStatuses(statusesData);
        setPriorities(prioritiesData);
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

  async function handleCreate(title: string) {
    const res = await fetch("/api/planning-items", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ title }),
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

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No tasks yet. Add your first one above.
        </p>
      ) : (
        <ul className="grid gap-2">
          {items.map((item) => (
            <TaskItem
              key={item.id}
              item={item}
              completed={
                completedStatus !== undefined &&
                item.statusId === completedStatus.id
              }
              statusName={statusById.get(item.statusId)?.name}
              priorityName={
                item.priorityId
                  ? priorityById.get(item.priorityId)?.name
                  : undefined
              }
              priorities={priorities}
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
