"use client";

import type { PlanningItem, Priority } from "@prisma/client";
import { CalendarDays, Flag, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  TaskEditDialog,
  type TaskEditPayload,
} from "@/components/tasks/task-edit-dialog";
import { cn } from "@/lib/utils";

interface TaskItemProps {
  item: PlanningItem;
  completed: boolean;
  statusName: string | undefined;
  priorityName: string | undefined;
  priorities: Priority[];
  onToggleComplete: (item: PlanningItem, completed: boolean) => void;
  onUpdate: (id: string, payload: TaskEditPayload) => Promise<boolean>;
  onDelete: (item: PlanningItem) => void;
}

function formatDueDate(value: Date | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

export function TaskItem({
  item,
  completed,
  statusName,
  priorityName,
  priorities,
  onToggleComplete,
  onUpdate,
  onDelete,
}: TaskItemProps) {
  const dueLabel = formatDueDate(item.dueAt);

  return (
    <li className="flex items-center gap-3 rounded-lg px-3 py-2 ring-1 ring-foreground/10">
      <Checkbox
        checked={completed}
        onCheckedChange={(value) => onToggleComplete(item, value === true)}
        aria-label={completed ? "Mark as pending" : "Mark as completed"}
      />
      <div className="flex-1 overflow-hidden">
        <p
          className={cn(
            "truncate",
            completed && "text-muted-foreground line-through",
          )}
        >
          {item.title}
        </p>
        {item.description ? (
          <p className="truncate text-xs text-muted-foreground">
            {item.description}
          </p>
        ) : null}
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {statusName ? <span>{statusName}</span> : null}
          {priorityName ? (
            <span className="inline-flex items-center gap-1">
              <Flag className="size-3" />
              {priorityName}
            </span>
          ) : null}
          {dueLabel ? (
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3" />
              {dueLabel}
            </span>
          ) : null}
        </div>
      </div>

      <TaskEditDialog
        item={item}
        priorities={priorities}
        onSubmit={(payload) => onUpdate(item.id, payload)}
        trigger={
          <Button variant="ghost" size="icon-sm" aria-label="Edit task">
            <Pencil />
          </Button>
        }
      />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Delete task"
        onClick={() => onDelete(item)}
      >
        <Trash2 />
      </Button>
    </li>
  );
}
