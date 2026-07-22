"use client";

import type { Category, List } from "@prisma/client";
import { Check, Pencil, SlidersHorizontal, Trash2, X } from "lucide-react";
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
  /** Commits a progress change (called when the user confirms the edit). */
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
 * A single objective in the stack. By default the progress bar is READ-ONLY
 * (title + section + status badge + bar + time-remaining). Progress editing is
 * an explicit, separate mode: the "Update progress" button reveals a slider
 * (with Save/Cancel); confirming commits and returns to read-only. A `draft`
 * value is used only while editing, so outside edit mode the card always
 * reflects the objective's real progress (never stale after a dialog edit).
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
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(0);

  const saved = objective.progress ?? 0;
  // Read-only shows the saved value; edit mode shows the live draft.
  const displayProgress = editing ? draft : saved;

  const now = new Date();
  const endAt = objective.objectiveEndAt
    ? new Date(objective.objectiveEndAt)
    : null;
  const status = objectiveStatus(endAt, displayProgress, now);
  const swatch = resolveCategoryColor(
    objective.categoryColor,
    objective.categoryId,
  );

  function startEditing() {
    setDraft(saved);
    setEditing(true);
  }

  function save() {
    setEditing(false);
    onProgressCommit(objective.id, draft);
  }

  function cancel() {
    setEditing(false);
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
        <span className="tabular-nums">{displayProgress}%</span>
      </div>

      {/* Progress bar (reflects the draft while editing, the saved value otherwise) */}
      <div
        role="progressbar"
        aria-valuenow={displayProgress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${objective.title} progress`}
        className="h-2 w-full overflow-hidden rounded-full bg-secondary"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${displayProgress}%` }}
        />
      </div>

      {editing ? (
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={100}
            value={draft}
            autoFocus
            aria-label="Set progress"
            onChange={(e) => setDraft(Number(e.target.value))}
            className="flex-1 accent-primary"
          />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Save progress"
            onClick={save}
          >
            <Check />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Cancel"
            onClick={cancel}
          >
            <X />
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="outline"
            size="sm"
            className="mr-auto"
            onClick={startEditing}
          >
            <SlidersHorizontal />
            Update progress
          </Button>

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
      )}
    </div>
  );
}
