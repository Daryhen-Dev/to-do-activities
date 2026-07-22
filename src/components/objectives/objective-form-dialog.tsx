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
import { clampProgress, type ObjectiveWithCategory } from "@/lib/objectives";

const objectiveFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Title is required")
      .max(500, "Title must be at most 500 characters"),
    description: z
      .string()
      .trim()
      .max(2000, "Body must be at most 2000 characters"),
    listId: z.string().min(1, "Pick a section"),
    // Empty string means "unset". Date-only (YYYY-MM-DD) and datetime-local.
    objectiveStartAt: z.string(),
    objectiveEndAt: z.string(),
    // Kept as a string (the number input's value); clamped to 0–100 on submit.
    progress: z.string(),
    remindAt: z.string(),
  })
  // End must be on or after start when both are set.
  .refine(
    (data) => {
      if (data.objectiveStartAt === "" || data.objectiveEndAt === "") {
        return true;
      }
      return (
        new Date(data.objectiveEndAt).getTime() >=
        new Date(data.objectiveStartAt).getTime()
      );
    },
    { message: "End must be on or after start", path: ["objectiveEndAt"] },
  );

type ObjectiveFormValues = z.infer<typeof objectiveFormSchema>;

/** The persisted objective fields — the section is carried by `listId`. */
export interface ObjectiveFormPayload {
  title: string;
  description: string | null;
  listId: string;
  objectiveStartAt: string | null;
  objectiveEndAt: string | null;
  progress: number;
  remindAt: string | null;
}

interface ObjectiveFormDialogProps {
  mode: "create" | "edit";
  objective?: ObjectiveWithCategory;
  categories: Category[];
  lists: List[];
  trigger: ReactElement;
  onSubmit: (payload: ObjectiveFormPayload) => Promise<boolean>;
}

/** Value -> `YYYY-MM-DD` for a date input ("" when unset). */
function toDateValue(value: Date | string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Value -> local `YYYY-MM-DDTHH:mm` for a datetime-local input ("" when unset). */
function toDateTimeLocalValue(value: Date | string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Date-only string -> ISO UTC at local midnight; "" -> null. */
function dateToIso(value: string): string | null {
  if (value === "") return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** datetime-local string -> ISO UTC; "" -> null. */
function dateTimeToIso(value: string): string | null {
  if (value === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Create/edit form for an objective: title + body + section (list grouped by
 * category) + start/end dates + progress (0–100) + an optional reminder. The
 * timeframe uses the dedicated objective columns, independent of the calendar.
 */
export function ObjectiveFormDialog({
  mode,
  objective,
  categories,
  lists,
  trigger,
  onSubmit,
}: ObjectiveFormDialogProps) {
  const [open, setOpen] = useState(false);
  const formId = useId();

  const defaults = (): ObjectiveFormValues => ({
    title: objective?.title ?? "",
    description: objective?.description ?? "",
    listId: objective?.listId ?? lists[0]?.id ?? "",
    objectiveStartAt: toDateValue(objective?.objectiveStartAt ?? null),
    objectiveEndAt: toDateValue(objective?.objectiveEndAt ?? null),
    progress: String(objective?.progress ?? 0),
    remindAt: toDateTimeLocalValue(objective?.remindAt ?? null),
  });

  const form = useForm<ObjectiveFormValues>({
    resolver: zodResolver(objectiveFormSchema),
    defaultValues: defaults(),
  });

  useEffect(() => {
    if (open) form.reset(defaults());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, objective, lists]);

  async function handleSubmit(values: ObjectiveFormValues) {
    const succeeded = await onSubmit({
      title: values.title,
      description: values.description.trim() ? values.description.trim() : null,
      listId: values.listId,
      objectiveStartAt: dateToIso(values.objectiveStartAt),
      objectiveEndAt: dateToIso(values.objectiveEndAt),
      progress: clampProgress(Number(values.progress) || 0),
      remindAt: dateTimeToIso(values.remindAt),
    });
    if (succeeded) setOpen(false);
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title={mode === "create" ? "New objective" : "Edit objective"}
      description={
        mode === "create"
          ? "Set a goal with a timeframe and track its progress."
          : "Update this objective."
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
                  <Input autoFocus placeholder="Objective title" {...field} />
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
                  <Textarea rows={3} placeholder="Optional details…" {...field} />
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
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="objectiveStartAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Start</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="objectiveEndAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Deadline</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="progress"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Progress (%)</FormLabel>
                <FormControl>
                  <Input type="number" min={0} max={100} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="remindAt"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Reminder</FormLabel>
                <FormControl>
                  <Input type="datetime-local" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </form>
      </Form>
    </FormSheet>
  );
}
