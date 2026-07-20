"use client";

import type { Category, List, PlanningItem, Priority } from "@prisma/client";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/** Sentinel select values for "none" (map to `null` on submit). */
const NO_PRIORITY = "none";
const NO_LIST = "none";

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
  listId: z.string(),
  dueAt: z.string(),
});

type EditTaskValues = z.infer<typeof editTaskSchema>;

export interface TaskEditPayload {
  title: string;
  description: string | null;
  priorityId: string | null;
  listId: string | null;
  dueAt: string | null;
}

interface TaskEditDialogProps {
  item: PlanningItem;
  priorities: Priority[];
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

export function TaskEditDialog({
  item,
  priorities,
  categories,
  lists,
  trigger,
  onSubmit,
}: TaskEditDialogProps) {
  const [open, setOpen] = useState(false);

  const defaults = (): EditTaskValues => ({
    title: item.title,
    description: item.description ?? "",
    priorityId: item.priorityId ?? NO_PRIORITY,
    listId: item.listId ?? NO_LIST,
    dueAt: toDateInputValue(item.dueAt),
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

  async function handleSubmit(values: EditTaskValues) {
    const succeeded = await onSubmit({
      title: values.title,
      description: values.description.trim() ? values.description.trim() : null,
      priorityId:
        values.priorityId === NO_PRIORITY ? null : values.priorityId,
      listId: values.listId === NO_LIST ? null : values.listId,
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
              name="listId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>List</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NO_LIST}>No list</SelectItem>
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
