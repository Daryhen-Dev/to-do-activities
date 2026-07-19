"use client";

import type { PlanningItem } from "@prisma/client";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface TaskItemProps {
  item: PlanningItem;
  completed: boolean;
  statusName: string | undefined;
  onToggleComplete: (item: PlanningItem, completed: boolean) => void;
  onDelete: (item: PlanningItem) => void;
}

export function TaskItem({
  item,
  completed,
  statusName,
  onToggleComplete,
  onDelete,
}: TaskItemProps) {
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
        {statusName ? (
          <p className="text-xs text-muted-foreground">{statusName}</p>
        ) : null}
      </div>
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
