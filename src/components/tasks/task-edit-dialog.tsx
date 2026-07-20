"use client";

import type { PlanningItem, Priority } from "@prisma/client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState, type ReactElement } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/** Sentinel select value for "no priority" (maps to `null` on submit). */
const NO_PRIORITY = "none";

const editTaskSchema = z.object({
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
  dueAt: z.string(),
});

type EditTaskValues = z.infer<typeof editTaskSchema>;

export interface TaskEditPayload {
  title: string;
  description: string | null;
  priorityId: string | null;
  dueAt: string | null;
}

interface TaskEditDialogProps {
  item: PlanningItem;
  priorities: Priority[];
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

export function TaskEditDialog({
  item,
  priorities,
  trigger,
  onSubmit,
}: TaskEditDialogProps) {
  const [open, setOpen] = useState(false);

  const form = useForm<EditTaskValues>({
    resolver: zodResolver(editTaskSchema),
    defaultValues: {
      title: item.title,
      description: item.description ?? "",
      priorityId: item.priorityId ?? NO_PRIORITY,
      dueAt: toDateInputValue(item.dueAt),
    },
  });

  // Re-sync with the latest item each time the dialog opens.
  useEffect(() => {
    if (open) {
      form.reset({
        title: item.title,
        description: item.description ?? "",
        priorityId: item.priorityId ?? NO_PRIORITY,
        dueAt: toDateInputValue(item.dueAt),
      });
    }
  }, [open, item, form]);

  async function handleSubmit(values: EditTaskValues) {
    const succeeded = await onSubmit({
      title: values.title,
      description: values.description.trim() ? values.description.trim() : null,
      priorityId:
        values.priorityId === NO_PRIORITY ? null : values.priorityId,
      dueAt: values.dueAt ? values.dueAt : null,
    });
    if (succeeded) {
      setOpen(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit task</DialogTitle>
          <DialogDescription>
            Update the details of this task.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="grid gap-4">
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
              name="priorityId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Priority</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
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
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
