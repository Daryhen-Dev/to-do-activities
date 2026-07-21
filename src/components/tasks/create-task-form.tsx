"use client";

import type { ItemType } from "@prisma/client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
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

const createTaskSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(500, "Title must be at most 500 characters"),
  itemTypeId: z.string(),
});

type CreateTaskValues = z.infer<typeof createTaskSchema>;

interface CreateTaskFormProps {
  /** Active item types offered in the type selector. */
  itemTypes: ItemType[];
  /** Persists the new task. Resolves once created so the field can reset. */
  onCreate: (title: string, itemTypeId: string) => Promise<void>;
}

/** The default type id: the one flagged `isDefault`, else the first available. */
function defaultTypeId(itemTypes: ItemType[]): string {
  return itemTypes.find((type) => type.isDefault)?.id ?? itemTypes[0]?.id ?? "";
}

export function CreateTaskForm({ itemTypes, onCreate }: CreateTaskFormProps) {
  const fallbackTypeId = useMemo(() => defaultTypeId(itemTypes), [itemTypes]);

  const form = useForm<CreateTaskValues>({
    resolver: zodResolver(createTaskSchema),
    defaultValues: { title: "", itemTypeId: "" },
  });

  async function onSubmit(values: CreateTaskValues) {
    // The catalog may load after mount; fall back to the default type id.
    const itemTypeId = values.itemTypeId || fallbackTypeId;
    await onCreate(values.title, itemTypeId);
    form.reset({ title: "", itemTypeId: "" });
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex items-start gap-2"
      >
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem className="flex-1">
              <FormControl>
                <Input placeholder="Add a task…" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="itemTypeId"
          render={({ field }) => (
            <FormItem>
              <Select
                value={field.value || fallbackTypeId}
                onValueChange={field.onChange}
                disabled={itemTypes.length === 0}
              >
                <FormControl>
                  <SelectTrigger className="w-36" aria-label="Type">
                    <SelectValue placeholder="Type">
                      {(value) =>
                        itemTypes.find((type) => type.id === value)?.name ??
                        "Type"
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
            </FormItem>
          )}
        />
        <Button type="submit" disabled={form.formState.isSubmitting}>
          Add
        </Button>
      </form>
    </Form>
  );
}
