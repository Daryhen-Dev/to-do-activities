"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState, type ReactElement } from "react";
import { useForm } from "react-hook-form";

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
  createCategorySchema,
  type CreateCategoryInput,
} from "@/validators/category.schema";

interface CategoryFormDialogProps {
  mode: "create" | "edit";
  /** Element that opens the dialog (rendered as the Base UI trigger). */
  trigger: ReactElement;
  defaultName?: string;
  /** Persists the value. Resolves `true` on success so the dialog closes. */
  onSubmit: (name: string) => Promise<boolean>;
}

export function CategoryFormDialog({
  mode,
  trigger,
  defaultName = "",
  onSubmit,
}: CategoryFormDialogProps) {
  const [open, setOpen] = useState(false);

  const form = useForm<CreateCategoryInput>({
    resolver: zodResolver(createCategorySchema),
    defaultValues: { name: defaultName },
  });

  // Reset to the current name each time the dialog opens so edits start from
  // the latest value and a cancelled edit never leaks into the next open.
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "New category" : "Rename category"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Group your lists and tasks under a category."
              : "Update the category name."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="grid gap-4">
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
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {mode === "create" ? "Create" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
