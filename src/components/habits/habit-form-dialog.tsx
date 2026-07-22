"use client";

import type { Category, List } from "@prisma/client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useId, useState, type ReactElement } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { FormSheet } from "@/components/ui/form-sheet";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  hmToMinutes,
  minutesToHm,
  type HabitViewModel,
} from "@/lib/habits";

/** Monday-first ISO weekday buttons (value 1..7). */
const WEEKDAYS: { value: number; short: string; label: string }[] = [
  { value: 1, short: "Mon", label: "Monday" },
  { value: 2, short: "Tue", label: "Tuesday" },
  { value: 3, short: "Wed", label: "Wednesday" },
  { value: 4, short: "Thu", label: "Thursday" },
  { value: 5, short: "Fri", label: "Friday" },
  { value: 6, short: "Sat", label: "Saturday" },
  { value: 7, short: "Sun", label: "Sunday" },
];

const habitFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Title is required")
      .max(200, "Title must be at most 200 characters"),
    description: z
      .string()
      .trim()
      .max(2000, "Body must be at most 2000 characters"),
    listId: z.string().min(1, "Pick a section"),
    // ISO weekdays 1..7; may be empty when an interval is used instead.
    days: z.array(z.number().int().min(1).max(7)),
    // "HH:mm" from a native time input; "" when unset.
    time: z.string(),
    // Kept as a string (the number input's value); parsed/clamped on submit.
    interval: z.string(),
  })
  // At least one weekday OR an interval must be present (Requirement 2.1).
  .refine((data) => data.days.length > 0 || data.interval.trim() !== "", {
    message: "Pick at least one day or set an interval",
    path: ["days"],
  })
  // A provided interval must be an integer 1..365 (Requirement 2.2).
  .refine(
    (data) => {
      if (data.interval.trim() === "") return true;
      const n = Number(data.interval);
      return Number.isInteger(n) && n >= 1 && n <= 365;
    },
    { message: "Interval must be a whole number 1–365", path: ["interval"] },
  );

type HabitFormValues = z.infer<typeof habitFormSchema>;

/** The persisted habit fields — the section is carried by `listId`. */
export interface HabitFormPayload {
  title: string;
  description: string | null;
  listId: string;
  recurrenceDays: number[];
  recurrenceTimeMinutes: number | null;
  recurrenceInterval: number | null;
}

interface HabitFormDialogProps {
  mode: "create" | "edit";
  habit?: HabitViewModel;
  categories: Category[];
  lists: List[];
  trigger: ReactElement;
  onSubmit: (payload: HabitFormPayload) => Promise<boolean>;
}

/** minutes-since-midnight -> "HH:mm" for a time input ("" when null). */
function minutesToTimeValue(min: number | null): string {
  if (min == null) return "";
  const { hours, minutes } = minutesToHm(min);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}`;
}

/** "HH:mm" -> minutes-since-midnight; "" -> null. */
function timeValueToMinutes(value: string): number | null {
  if (value === "") return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  return hmToMinutes(Number(match[1]), Number(match[2]));
}

/**
 * Create/edit form for a habit: title + body + section (list grouped by
 * category) + a weekday multi-select + a time-of-day + an optional "every N
 * days" interval. Mobile-first: the weekday toggles are an accessible, keyboard-
 * operable group with ≥44px targets and wrap without horizontal overflow. The
 * interval/time fields are kept as strings and converted on submit (the repo's
 * `z.coerce.number()`/react-hook-form gotcha).
 */
export function HabitFormDialog({
  mode,
  habit,
  categories,
  lists,
  trigger,
  onSubmit,
}: HabitFormDialogProps) {
  const [open, setOpen] = useState(false);
  const formId = useId();

  const defaults = (): HabitFormValues => ({
    title: habit?.title ?? "",
    description: habit?.description ?? "",
    listId: habit?.listId ?? lists[0]?.id ?? "",
    days: habit?.rule.days ?? [],
    time: minutesToTimeValue(habit?.rule.timeMinutes ?? null),
    interval:
      habit?.rule.interval != null ? String(habit.rule.interval) : "",
  });

  const form = useForm<HabitFormValues>({
    resolver: zodResolver(habitFormSchema),
    defaultValues: defaults(),
  });

  useEffect(() => {
    if (open) form.reset(defaults());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, habit, lists]);

  async function handleSubmit(values: HabitFormValues) {
    const interval = values.interval.trim();
    const succeeded = await onSubmit({
      title: values.title,
      description: values.description.trim() ? values.description.trim() : null,
      listId: values.listId,
      recurrenceDays: [...values.days].sort((a, b) => a - b),
      recurrenceTimeMinutes: timeValueToMinutes(values.time),
      recurrenceInterval: interval === "" ? null : Number(interval),
    });
    if (succeeded) setOpen(false);
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title={mode === "create" ? "New habit" : "Edit habit"}
      description={
        mode === "create"
          ? "Set a repeating schedule and build a streak."
          : "Update this habit."
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            disabled={form.formState.isSubmitting}
          >
            Save
          </Button>
        </div>
      }
    >
      <Form {...form}>
        <form
          id={formId}
          onSubmit={form.handleSubmit(handleSubmit)}
          className="grid gap-4"
        >
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Title</FormLabel>
                <FormControl>
                  <Input autoFocus placeholder="Habit title" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Body</FormLabel>
                <FormControl>
                  <Textarea rows={2} placeholder="Optional details…" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="listId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Section</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Pick a section">
                        {(value) =>
                          lists.find((list) => list.id === value)?.name ?? ""
                        }
                      </SelectValue>
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {categories.map((category) => {
                      const categoryLists = lists.filter(
                        (list) => list.categoryId === category.id,
                      );
                      if (categoryLists.length === 0) return null;
                      return (
                        <SelectGroup key={category.id}>
                          <SelectLabel>{category.name}</SelectLabel>
                          {categoryLists.map((list) => (
                            <SelectItem key={list.id} value={list.id}>
                              {list.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      );
                    })}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="days"
            render={({ field }) => {
              const selected = field.value;
              const toggle = (value: number) => {
                field.onChange(
                  selected.includes(value)
                    ? selected.filter((d) => d !== value)
                    : [...selected, value],
                );
              };
              return (
                <FormItem>
                  <FormLabel>Days of the week</FormLabel>
                  <div
                    role="group"
                    aria-label="Days of the week"
                    className="flex flex-wrap gap-2"
                  >
                    {WEEKDAYS.map((day) => {
                      const active = selected.includes(day.value);
                      return (
                        <button
                          key={day.value}
                          type="button"
                          aria-pressed={active}
                          aria-label={day.label}
                          onClick={() => toggle(day.value)}
                          className={cn(
                            "inline-flex size-11 items-center justify-center rounded-md border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            active
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background hover:bg-accent",
                          )}
                        >
                          {day.short.charAt(0)}
                        </button>
                      );
                    })}
                  </div>
                  <FormMessage />
                </FormItem>
              );
            }}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="time"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Time of day</FormLabel>
                  <FormControl>
                    <Input type="time" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="interval"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Every N days (optional)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      max={365}
                      placeholder="e.g. 3"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </form>
      </Form>
    </FormSheet>
  );
}
