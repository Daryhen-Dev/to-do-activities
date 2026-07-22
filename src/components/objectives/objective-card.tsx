"use client";

import type { Category, List } from "@prisma/client";
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { resolveCategoryColor } from "@/lib/category-color";
import {
  clampProgress,
  daysRemaining,
  objectiveStatus,
  type ObjectiveStatus,
  type ObjectiveWithCategory,
} from "@/lib/objectives";
import { cn } from "@/lib/utils";
import {
  ObjectiveFormDialog,
  type ObjectiveFormPayload,
} from "./objective-form-dialog";

interface ObjectiveCardProps {
  objective: ObjectiveWithCategory;
  categories: Category[];
  lists: List[];
  onUpdate: (id: string, payload: ObjectiveFormPayload) => Promise<boolean>;
  onDelete: (objective: ObjectiveWithCategory) => void;
  /** Commits an inline progress change (called on release, not per tick). */
  onProgressCommit: (id: string, progress: number) => void;
}

const STATUS_LABEL: Record<ObjectiveStatus, string> = {
  completed: "Completed",
  overdue: "Overdue",
  "no-deadline": "No deadline",
  active: "Active",
};

const STATUS_CLASS: Record<ObjectiveStatus, string> = {
  completed: "bg-green-500/15 text-green-700 dark:text-green-400",
  overdue: "bg-destructive/15 text-destructive",
  "no-deadline": "bg-muted text-muted-foreground",
  active: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
};

/** Human "time left" line derived from the deadline + status. */
function timeLabel(
  status: ObjectiveStatus,
  endAt: Date | null,
  now: Date,
): string {
  if (status === "completed") return "Completed";
  if (status === "no-deadline") return "No deadline";
  const remaining = daysRemaining(endAt, now) ?? 0;
  if (remaining > 0) return `${remaining} day${remaining === 1 ? "" : "s"} left`;
  if (remaining === 0) return "Due today";
  const over = -remaining;
  return `Overdue by ${over} day${over === 1 ? "" : "s"}`;
}

/**
 * A single objective in the stack: title + section swatch + status badge, a
 * progress bar, a time-remaining line, and an inline progress slider that
 * commits on release. Edit opens the shared form dialog; delete confirms.
 */
export function ObjectiveCard({
  objective,
  categories,
  lists,
  onUpdate,
  onDelete,
  onProgressCommit,
}: ObjectiveCardProps) {
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  // Local progress for a responsive slider; commits to the server on release.
  const [localProgress, setLocalProgress] = useState(objective.progress ?? 0);

  const now = new Date();
  const endAt = objective.objectiveEndAt
    ? new Date(objective.objectiveEndAt)
    : null;
  const status = objectiveStatus(endAt, localProgress, now);
  const swatch = resolveCategoryColor(
    objective.categoryColor,
    objective.categoryId,
  );

  function commit(value: number) {
    const clamped = clampProgress(value);
    setLocalProgress(clamped);
    onProgressCommit(objective.id, clamped);
  }

  return (
    <div className="grid gap-2 rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{objective.title}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              aria-hidden
              style={{ backgroundColor: swatch }}
              className="size-2 rounded-full"
            />
            {objective.categoryName}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
            STATUS_CLASS[status],
          )}
        >
          {STATUS_LABEL[status]}
        </span>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{timeLabel(status, endAt, now)}</span>
        <span className="tabular-nums">{localProgress}%</span>
      </div>

      {/* Progress bar */}
      <div
        role="progressbar"
        aria-valuenow={localProgress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${objective.title} progress`}
        className="h-2 w-full overflow-hidden rounded-full bg-secondary"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${localProgress}%` }}
        />
      </div>

      <div className="flex items-center gap-2">
        {/* Inline progress control — commits on release, not per tick. */}
        <input
          type="range"
          min={0}
          max={100}
          value={localProgress}
          aria-label="Set progress"
          onChange={(e) => setLocalProgress(Number(e.target.value))}
          onPointerUp={(e) => commit(Number(e.currentTarget.value))}
          onKeyUp={(e) => commit(Number(e.currentTarget.value))}
          onBlur={(e) => commit(Number(e.currentTarget.value))}
          className="flex-1 accent-primary"
        />

        <ObjectiveFormDialog
          mode="edit"
          objective={objective}
          categories={categories}
          lists={lists}
          onSubmit={(payload) => onUpdate(objective.id, payload)}
          trigger={
            <Button variant="ghost" size="icon-sm" aria-label="Edit objective">
              <Pencil />
            </Button>
          }
        />

        <AlertDialog
          open={confirmDeleteOpen}
          onOpenChange={setConfirmDeleteOpen}
        >
          <AlertDialogTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Delete objective"
              >
                <Trash2 />
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this objective?</AlertDialogTitle>
              <AlertDialogDescription>
                This archives &ldquo;{objective.title}&rdquo;.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => {
                  onDelete(objective);
                  setConfirmDeleteOpen(false);
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
