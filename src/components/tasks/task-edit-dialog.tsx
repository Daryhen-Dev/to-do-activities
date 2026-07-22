"use client";

import type {
  Category,
  ItemType,
  List,
  PlanningItem,
  Priority,
} from "@prisma/client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useId, useState, type ReactElement } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Label } from "@/components/ui/label";
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
import { hmToMinutes, minutesToHm } from "@/lib/habits";

/** Sentinel select value for "no priority" (maps to `null` on submit). */
const NO_PRIORITY = "none";

/** Item-type key whose reminders can recur. */
const REMINDER_KEY = "recordatorio";

/** Monday-first ISO weekday buttons (value 1..7) for the repeat control. */
const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 7, label: "Sunday" },
];

/** minutes-since-midnight -> "HH:mm" for a time input ("" when null). */
function minutesToTimeValue(min: number | null): string {
  if (min == null) return "";
  const { hours, minutes } = minutesToHm(min);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** "HH:mm" -> minutes-since-midnight; "" -> null. */
function timeValueToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  return hmToMinutes(Number(match[1]), Number(match[2]));
}

const editTaskSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Title is required")
      .max(500, "Title must be at most 500 characters"),
    description: z
      .string()
      .trim()
      .max(2000, "Description must be at most 2000 characters"),
    priorityId: z.string(),
    itemTypeId: z.string(),
    listId: z.string(),
    dueAt: z.string(),
    allDay: z.boolean(),
    // Empty string means "unset". Format matches `allDay` (date vs datetime-local).
    startAt: z.string(),
    endAt: z.string(),
    // Reminder datetime-local. Empty string means "no reminder". Independent of
    // the schedule, so it is not part of the start/end refines below.
    remindAt: z.string(),
    // Optional recurrence for a reminder (ignored for other item types). A rule
    // is "present" when a weekday is selected or an interval is set; then the
    // reminder recurs and `remindAt` is cleared. Interval/time kept as strings
    // (the repo's z.coerce.number()/react-hook-form gotcha), parsed on submit.
    recurrenceDays: z.array(z.number().int().min(1).max(7)),
    recurrenceTime: z.string(),
    recurrenceInterval: z.string(),
  })
  // A provided interval must be a whole number 1..365.
  .refine(
    (data) => {
      if (data.recurrenceInterval.trim() === "") return true;
      const n = Number(data.recurrenceInterval);
      return Number.isInteger(n) && n >= 1 && n <= 365;
    },
    { message: "Interval must be a whole number 1–365", path: ["recurrenceInterval"] },
  )
  // An end requires a start.
  .refine((data) => !(data.endAt !== "" && data.startAt === ""), {
    message: "Set a start before an end",
    path: ["endAt"],
  })
  // End must be on or after start when both are set.
  .refine(
    (data) => {
      if (data.startAt === "" || data.endAt === "") return true;
      const start = new Date(data.startAt).getTime();
      const end = new Date(data.endAt).getTime();
      if (Number.isNaN(start) || Number.isNaN(end)) return true;
      return end >= start;
    },
    { message: "End must be on or after start", path: ["endAt"] },
  );

type EditTaskValues = z.infer<typeof editTaskSchema>;

export interface TaskEditPayload {
  title: string;
  description: string | null;
  priorityId: string | null;
  itemTypeId: string;
  listId: string;
  dueAt: string | null;
  startAt?: string | null;
  endAt?: string | null;
  allDay?: boolean;
  remindAt?: string | null;
  recurrenceDays?: number[];
  recurrenceTimeMinutes?: number | null;
  recurrenceInterval?: number | null;
}

interface TaskEditDialogProps {
  item: PlanningItem;
  priorities: Priority[];
  itemTypes: ItemType[];
  categories: Category[];
  lists: List[];
  trigger: ReactElement;
  /** Persists the patch. Resolves `true` on success so the dialog closes. */
  onSubmit: (payload: TaskEditPayload) => Promise<boolean>;
}

/** ISO/Date value -> `YYYY-MM-DD` for a native date input (empty when unset). */
function toDateInputValue(value: Date | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

/** Zero-pads a number to two digits (e.g. 3 -> "03"). */
function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Parses a value into a local `Date`, or `null` when empty/invalid.
 * Date-only strings (`YYYY-MM-DD`) are parsed as UTC by the `Date` constructor,
 * so they are normalized to local wall-clock time before parsing to avoid drift.
 */
function toLocalDate(value: Date | string | null): Date | null {
  if (value === null || value === "") return null;
  let input: Date | string = value;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    input = `${value}T00:00:00`;
  }
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Value -> local `YYYY-MM-DDTHH:mm` for a datetime-local input ("" when unset). */
function toDateTimeLocalValue(value: Date | string | null): string {
  const date = toLocalDate(value);
  if (!date) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Value -> local `YYYY-MM-DD` for a date input ("" when unset). */
function toDateValue(value: Date | string | null): string {
  const date = toLocalDate(value);
  if (!date) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Converts a form string (local date or datetime-local) to an ISO UTC string.
 * "" -> null. For all-day values the local midnight is used.
 */
function toIsoUtc(value: string, allDay: boolean): string | null {
  if (value === "") return null;
  const date = new Date(allDay ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function TaskEditDialog({
  item,
  priorities,
  itemTypes,
  categories,
  lists,
  trigger,
  onSubmit,
}: TaskEditDialogProps) {
  const [open, setOpen] = useState(false);
  // Unique id so the pinned footer's submit button can target this form even
  // though it renders outside the <form>.
  const formId = useId();

  const defaults = (): EditTaskValues => ({
    title: item.title,
    description: item.description ?? "",
    priorityId: item.priorityId ?? NO_PRIORITY,
    itemTypeId: item.itemTypeId,
    listId: item.listId,
    dueAt: toDateInputValue(item.dueAt),
    allDay: item.allDay,
    startAt: item.allDay
      ? toDateValue(item.startAt)
      : toDateTimeLocalValue(item.startAt),
    endAt: item.allDay
      ? toDateValue(item.endAt)
      : toDateTimeLocalValue(item.endAt),
    remindAt: toDateTimeLocalValue(item.remindAt),
    recurrenceDays: [...(item.recurrenceDays ?? [])].sort((a, b) => a - b),
    recurrenceTime: minutesToTimeValue(item.recurrenceTimeMinutes),
    recurrenceInterval:
      item.recurrenceInterval != null ? String(item.recurrenceInterval) : "",
  });

  const form = useForm<EditTaskValues>({
    resolver: zodResolver(editTaskSchema),
    defaultValues: defaults(),
  });

  // Re-sync with the latest item each time the dialog opens.
  useEffect(() => {
    if (open) {
      form.reset(defaults());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item]);

  const allDay = useWatch({ control: form.control, name: "allDay" });
  const selectedTypeId = useWatch({ control: form.control, name: "itemTypeId" });
  const isReminderType =
    itemTypes.find((type) => type.id === selectedTypeId)?.key === REMINDER_KEY;
  const watchedDays = useWatch({ control: form.control, name: "recurrenceDays" });
  const watchedInterval = useWatch({
    control: form.control,
    name: "recurrenceInterval",
  });
  // A recurring reminder rule is active → its `remindAt` one-shot field is moot.
  const recurrenceActive =
    isReminderType &&
    ((watchedDays?.length ?? 0) > 0 || (watchedInterval?.trim() ?? "") !== "");

  /**
   * Reformats the current start/end values between date and datetime-local
   * formats so the inputs stay valid. Runs from the checkbox event handler
   * (not an effect) because `setState` in effects is disallowed by lint.
   */
  function handleAllDayChange(checked: boolean) {
    const currentStart = form.getValues("startAt");
    const currentEnd = form.getValues("endAt");
    form.setValue("allDay", checked);
    if (checked) {
      form.setValue("startAt", toDateValue(currentStart || null));
      form.setValue("endAt", toDateValue(currentEnd || null));
    } else {
      form.setValue("startAt", toDateTimeLocalValue(currentStart || null));
      form.setValue("endAt", toDateTimeLocalValue(currentEnd || null));
    }
  }

  async function handleSubmit(values: EditTaskValues) {
    const startAt = toIsoUtc(values.startAt, values.allDay);
    // Clearing the start clears the whole schedule.
    const endAt = startAt === null ? null : toIsoUtc(values.endAt, values.allDay);
    const isReminder =
      itemTypes.find((type) => type.id === values.itemTypeId)?.key ===
      REMINDER_KEY;
    const rulePresent =
      isReminder &&
      (values.recurrenceDays.length > 0 ||
        values.recurrenceInterval.trim() !== "");

    const payload: TaskEditPayload = {
      title: values.title,
      description: values.description.trim() ? values.description.trim() : null,
      priorityId:
        values.priorityId === NO_PRIORITY ? null : values.priorityId,
      itemTypeId: values.itemTypeId,
      listId: values.listId,
      dueAt: values.dueAt ? values.dueAt : null,
      startAt,
      endAt,
      allDay: values.allDay,
      // A recurring reminder derives its instants from the rule, so `remindAt`
      // is cleared; otherwise a reminder keeps its one-shot instant.
      remindAt: rulePresent ? null : toIsoUtc(values.remindAt, false),
    };

    // Only reminders carry recurrence. When a rule is present, send it; when a
    // reminder has no rule, clear any prior recurrence so it reverts to one-shot.
    if (isReminder) {
      const interval = values.recurrenceInterval.trim();
      payload.recurrenceDays = rulePresent
        ? [...values.recurrenceDays].sort((a, b) => a - b)
        : [];
      payload.recurrenceTimeMinutes = rulePresent
        ? timeValueToMinutes(values.recurrenceTime)
        : null;
      payload.recurrenceInterval =
        rulePresent && interval !== "" ? Number(interval) : null;
    }

    const succeeded = await onSubmit(payload);
    if (succeeded) {
      setOpen(false);
    }
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title="Edit task"
      description="Update the details of this task."
      footer={
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
          >
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
                    <Input autoFocus {...field} />
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
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder="Optional details…"
                      {...field}
                    />
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
                  <FormLabel>List</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue>
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
              name="priorityId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Priority</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue>
                          {(value) =>
                            value === NO_PRIORITY
                              ? "No priority"
                              : (priorities.find(
                                  (priority) => priority.id === value,
                                )?.name ?? "No priority")
                          }
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NO_PRIORITY}>No priority</SelectItem>
                      {priorities.map((priority) => (
                        <SelectItem key={priority.id} value={priority.id}>
                          {priority.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="itemTypeId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue>
                          {(value) =>
                            itemTypes.find((type) => type.id === value)?.name ??
                            ""
                          }
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {itemTypes.map((type) => (
                        <SelectItem key={type.id} value={type.id}>
                          {type.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="dueAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Due date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-3 rounded-md border p-3">
              <p className="text-sm font-medium">Schedule</p>
              <FormField
                control={form.control}
                name="allDay"
                render={({ field }) => (
                  <FormItem>
                    <Label className="flex items-center gap-2 text-sm font-normal">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={(checked) =>
                            handleAllDayChange(checked === true)
                          }
                        />
                      </FormControl>
                      All day
                    </Label>
                  </FormItem>
                )}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="startAt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start</FormLabel>
                      <FormControl>
                        <Input
                          type={allDay ? "date" : "datetime-local"}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="endAt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>End</FormLabel>
                      <FormControl>
                        <Input
                          type={allDay ? "date" : "datetime-local"}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="remindAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reminder</FormLabel>
                    <FormControl>
                      <Input
                        type="datetime-local"
                        disabled={recurrenceActive}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Recurrence — only for reminders. Empty rule = one-shot reminder. */}
            {isReminderType ? (
              <div className="grid gap-3 rounded-md border p-3">
                <p className="text-sm font-medium">Repeat</p>
                <p className="text-xs text-muted-foreground">
                  Pick days or set an interval to make this reminder recur. Leave
                  empty for a one-time reminder.
                </p>
                <FormField
                  control={form.control}
                  name="recurrenceDays"
                  render={({ field }) => {
                    const selected = field.value;
                    const toggleDay = (value: number) =>
                      field.onChange(
                        selected.includes(value)
                          ? selected.filter((d) => d !== value)
                          : [...selected, value],
                      );
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
                                onClick={() => toggleDay(day.value)}
                                className={cn(
                                  "inline-flex size-11 touch-manipulation items-center justify-center rounded-md border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                  active
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-border bg-background hover:bg-accent",
                                )}
                              >
                                {day.label.charAt(0)}
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
                    name="recurrenceTime"
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
                    name="recurrenceInterval"
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
              </div>
            ) : null}

          </form>
        </Form>
      </FormSheet>
  );
}
