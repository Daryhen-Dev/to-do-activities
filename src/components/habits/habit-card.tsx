"use client";

import type { Category, List } from "@prisma/client";
import { Check, Flame, Pencil, Trash2 } from "lucide-react";
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
import type { HabitViewModel } from "@/lib/habits";
import { cn } from "@/lib/utils";
import { HabitFormDialog, type HabitFormPayload } from "./habit-form-dialog";

interface HabitCardProps {
  habit: HabitViewModel;
  categories: Category[];
  lists: List[];
  onUpdate: (id: string, payload: HabitFormPayload) => Promise<boolean>;
  onDelete: (habit: HabitViewModel) => void;
  /** Toggles today's occurrence complete/incomplete. */
  onToggleToday: (habit: HabitViewModel) => void;
}

/**
 * A single habit in the stack: title + section, a streak and weekly-adherence
 * summary, and — when today is a scheduled occurrence — a mark-today control
 * (≥44px touch target, `aria-pressed` reflecting completion). When today is not
 * scheduled it shows "Not scheduled today" and renders no toggle. Mobile-first:
 * the layout stacks on narrow screens and never overflows horizontally.
 */
export function HabitCard({
  habit,
  categories,
  lists,
  onUpdate,
  onDelete,
  onToggleToday,
}: HabitCardProps) {
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const swatch = resolveCategoryColor(habit.categoryColor, habit.categoryId);

  return (
    <div className="grid gap-3 rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{habit.title}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              aria-hidden
              style={{ backgroundColor: swatch }}
              className="size-2 rounded-full"
            />
            {habit.categoryName}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <HabitFormDialog
            mode="edit"
            habit={habit}
            categories={categories}
            lists={lists}
            onSubmit={(payload) => onUpdate(habit.id, payload)}
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label="Edit habit">
                <Pencil />
              </Button>
            }
          />
          <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
            <AlertDialogTrigger
              render={
                <Button variant="ghost" size="icon-sm" aria-label="Delete habit">
                  <Trash2 />
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this habit?</AlertDialogTitle>
                <AlertDialogDescription>
                  This archives &ldquo;{habit.title}&rdquo; and its completion
                  history.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={() => {
                    onDelete(habit);
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

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Flame
            aria-hidden
            className={cn("size-3.5", habit.streak > 0 && "text-orange-500")}
          />
          <span className="tabular-nums">{habit.streak}</span>
          day streak
        </span>
        <span className="tabular-nums">
          {habit.weekly.completed} of {habit.weekly.total} this week
        </span>
      </div>

      {habit.scheduledToday ? (
        <Button
          variant={habit.completedToday ? "default" : "outline"}
          aria-pressed={habit.completedToday}
          aria-label={
            habit.completedToday ? "Undo today's completion" : "Mark today done"
          }
          onClick={() => onToggleToday(habit)}
          className="min-h-11 w-full justify-center sm:w-auto sm:self-start"
        >
          <Check aria-hidden />
          {habit.completedToday ? "Done today" : "Mark today done"}
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">Not scheduled today</p>
      )}
    </div>
  );
}
