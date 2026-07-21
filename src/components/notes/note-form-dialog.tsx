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
import type { NoteWithCategory } from "@/lib/notes";

const noteFormSchema = z.object({
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
});

type NoteFormValues = z.infer<typeof noteFormSchema>;

/** The persisted note fields — the section is carried by `listId`. */
export interface NoteFormPayload {
  title: string;
  description: string | null;
  listId: string;
}

interface NoteFormDialogProps {
  mode: "create" | "edit";
  /** The note being edited (edit mode only) — seeds the form defaults. */
  note?: NoteWithCategory;
  categories: Category[];
  lists: List[];
  trigger: ReactElement;
  /** Persists the note. Resolves `true` on success so the dialog closes. */
  onSubmit: (payload: NoteFormPayload) => Promise<boolean>;
}

/**
 * Create/edit form for a note. Title + body + a "section" select — a list
 * picker grouped by category (the category is the section), reusing the same
 * grouped-Select pattern as the task edit dialog. Only categories that have at
 * least one list are offered, since a note must live in a list.
 */
export function NoteFormDialog({
  mode,
  note,
  categories,
  lists,
  trigger,
  onSubmit,
}: NoteFormDialogProps) {
  const [open, setOpen] = useState(false);
  const formId = useId();

  const defaults = (): NoteFormValues => ({
    title: note?.title ?? "",
    description: note?.description ?? "",
    listId: note?.listId ?? lists[0]?.id ?? "",
  });

  const form = useForm<NoteFormValues>({
    resolver: zodResolver(noteFormSchema),
    defaultValues: defaults(),
  });

  // Re-seed each time the sheet opens so it reflects the latest note/lists.
  useEffect(() => {
    if (open) form.reset(defaults());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, note, lists]);

  async function handleSubmit(values: NoteFormValues) {
    const succeeded = await onSubmit({
      title: values.title,
      description: values.description.trim() ? values.description.trim() : null,
      listId: values.listId,
    });
    if (succeeded) setOpen(false);
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title={mode === "create" ? "New note" : "Edit note"}
      description={
        mode === "create"
          ? "Capture a note in one of your sections."
          : "Update this note."
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
                  <Input autoFocus placeholder="Note title" {...field} />
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
                  <Textarea rows={6} placeholder="Write your note…" {...field} />
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
        </form>
      </Form>
    </FormSheet>
  );
}
