"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState, type ReactElement } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

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
import { createListSchema } from "@/validators/list.schema";

// Reuse the server contract's name rule (single source of truth); the parent
// category id is supplied by the manager, not the form.
const listFormSchema = createListSchema.pick({ name: true });
type ListFormValues = z.infer<typeof listFormSchema>;

interface ListFormDialogProps {
  mode: "create" | "edit";
  /** Element that opens the dialog (rendered as the Base UI trigger). */
  trigger: ReactElement;
  defaultName?: string;
  /** Persists the value. Resolves `true` on success so the dialog closes. */
  onSubmit: (name: string) => Promise<boolean>;
}

export function ListFormDialog({
  mode,
  trigger,
  defaultName = "",
  onSubmit,
}: ListFormDialogProps) {
  const [open, setOpen] = useState(false);

  const form = useForm<ListFormValues>({
    resolver: zodResolver(listFormSchema),
    defaultValues: { name: defaultName },
  });

  useEffect(() => {
    if (open) {
      form.reset({ name: defaultName });
    }
  }, [open, defaultName, form]);

  async function handleSubmit(values: ListFormValues) {
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
            {mode === "create" ? "New list" : "Rename list"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Add a list to organise tasks within this category."
              : "Update the list name."}
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
                    <Input placeholder="e.g. Groceries" autoFocus {...field} />
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
