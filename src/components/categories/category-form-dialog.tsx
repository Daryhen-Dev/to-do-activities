"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useId, useState, type ReactElement } from "react";
import { useForm } from "react-hook-form";

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
  createCategorySchema,
  type CreateCategoryInput,
} from "@/validators/category.schema";

interface CategoryFormDialogProps {
  mode: "create" | "edit";
  /** Element that opens the sheet (rendered as the Base UI trigger). */
  trigger: ReactElement;
  defaultName?: string;
  /** Persists the value. Resolves `true` on success so the sheet closes. */
  onSubmit: (name: string) => Promise<boolean>;
}

/** Create/rename a category in the side FormSheet (the app's edit convention). */
export function CategoryFormDialog({
  mode,
  trigger,
  defaultName = "",
  onSubmit,
}: CategoryFormDialogProps) {
  const [open, setOpen] = useState(false);
  // Unique id so the pinned footer's submit button can target this form even
  // though it renders outside the <form> (multiple instances exist at once).
  const formId = useId();

  const form = useForm<CreateCategoryInput>({
    resolver: zodResolver(createCategorySchema),
    defaultValues: { name: defaultName },
  });

  // Reset to the current name each time the sheet opens so edits start from the
  // latest value and a cancelled edit never leaks into the next open.
  useEffect(() => {
    if (open) {
      form.reset({ name: defaultName });
    }
  }, [open, defaultName, form]);

  async function handleSubmit(values: CreateCategoryInput) {
    const succeeded = await onSubmit(values.name);
    if (succeeded) {
      setOpen(false);
    }
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title={mode === "create" ? "New category" : "Rename category"}
      description={
        mode === "create"
          ? "Group your lists and tasks under a category."
          : "Update the category name."
      }
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
            {mode === "create" ? "Create" : "Save"}
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
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Work" autoFocus {...field} />
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
